'use strict'

const debug = require('debug')('node-beckhoff')
const loki = require('lokijs');
//const protobuf = require('protocol-buffers');

const net = require('net')
//const events = require('events')
const Buffer = require('safe-buffer').Buffer

var settings = {
  plc : {
    ip     : '10.0.0.1',
    port   : 48898
  },
  remote : {  
    netid  : '10.0.0.1.1.1',
    port   : 851
  },
  local : {
    netid  : '10.0.0.2.1.1',
    port   : 32905
  },
  bytes : {
    local  : [],
    remote : []
  },
  develop : {
    verbose : true,
    debug : false,
    save : true
  }
}

let lokiDB = null; 
if (settings.develop.save) {
  lokiDB = new loki(__dirname + '/beckhoff_data.db', {
    autoload: true,
    autoloadCallback : () => {
      let tmp = lokiDB.getCollection('trx');
      if (tmp === null) {
        lokiDB.addCollection('trx');
        lokiDB.addCollection('symbols',  { indices : ['name'] });
      }
    },
    autosave: false
  });
  
} else {
  lokiDB = new loki();
  //lokiDB.addCollection('trx');
  lokiDB.addCollection('symbols',  { indices : ['name'] });
}

let invokeId = 0;

// -----------------
// -- DEFINITIONS --
// -----------------
const ADSCMD = {
  INVALID         : 0,
  ReadDeviceInfo  : 1,
  Read            : 2,
  Write           : 3,
  ReadState       : 4,
  WriteControl    : 5,
  NotificationAdd : 6,
  NotificationDel : 7,
  Notification    : 8,
  ReadWrite       : 9
}

const ADSSTATE = {
  INVALID:      0,
  IDLE:         1,
  RESET:        2,
  INIT:         3,
  START:        4,
  RUN:          5,
  STOP:         6,
  SAVECFG:      7,
  LOADCFG:      8,
  POWERFAILURE: 9,
  POWERGOOD:    10,
  ERROR:        11,
  SHUTDOWN:     12,
  SUSPEND:      13,
  RESUME:       14,
  CONFIG:       15,
  RECONFIG:     16,
  STOPPING:     17
}

// ADS reserved index groups
const ADSIGRP = {
    SYMTAB:               0xF000,
    SYMNAME:              0xF001,
    SYMVAL:               0xF002,
    GET_SYMHANDLE_BYNAME: 0xF003, // {TcAdsDef.h: ADSIGRP_SYM_HNDBYNAME}
    READ_SYMVAL_BYNAME:   0xF004, // {TcAdsDef.h: ADSIGRP_SYM_VALBYNAME}
    RW_SYMVAL_BYHANDLE:   0xF005, // {TcAdsDef.h: ADSIGRP_SYM_VALBYHND}
    RELEASE_SYMHANDLE:    0xF006, // {TcAdsDef.h: ADSIGRP_SYM_RELEASEHND}
    SYM_INFOBYNAME:       0xF007,
    SYM_VERSION:          0xF008,
    SYM_INFOBYNAMEEX:     0xF009,
    SYM_DOWNLOAD:         0xF00A,
    SYM_UPLOAD:           0xF00B,
    SYM_UPLOADINFO:       0xF00C,
    SYM_DOWNLOAD2:        0xF00D,
    SYM_DT_UPLOAD:        0xF00E,
    SYM_UPLOADINFO2:      0xF00F,
    SYMNOTE:              0xF010,    // notification of named handle
    SUMUP_READ:           0xF080,    // AdsRW  IOffs list size or 0 (=0 -> list size == WLength/3*sizeof(ULONG))
                        // W: {list of IGrp, IOffs, Length}
                        // if IOffs != 0 then R: {list of results} and {list of data}
                        // if IOffs == 0 then R: only data (sum result)
    SUMUP_WRITE:          0xF081,    // AdsRW  IOffs list size
                        // W: {list of IGrp, IOffs, Length} followed by {list of data}
                        // R: list of results
    SUMUP_READWRITE:      0xF082,    // AdsRW  IOffs list size
                        // W: {list of IGrp, IOffs, RLength, WLength} followed by {list of data}
                        // R: {list of results, RLength} followed by {list of data}
    SUMUP_READEX:         0xF083,    // AdsRW  IOffs list size
                        // W: {list of IGrp, IOffs, Length}
    SUMUP_READEX2:        0xF084,    // AdsRW  IOffs list size
                        // W: {list of IGrp, IOffs, Length}
                        // R: {list of results, Length} followed by {list of data (returned lengths)}
    SUMUP_ADDDEVNOTE:     0xF085,    // AdsRW  IOffs list size
                        // W: {list of IGrp, IOffs, Attrib}
                        // R: {list of results, handles}
    SUMUP_DELDEVNOTE:     0xF086,    // AdsRW  IOffs list size
                        // W: {list of handles}
                        // R: {list of results, Length} followed by {list of data}
    IOIMAGE_RWIB:         0xF020,    // read/write input byte(s)
    IOIMAGE_RWIX:         0xF021,    // read/write input bit
    IOIMAGE_RISIZE:       0xF025,    // read input size (in byte)
    IOIMAGE_RWOB:         0xF030,    // read/write output byte(s)
    IOIMAGE_RWOX:         0xF031,    // read/write output bit
    IOIMAGE_CLEARI:       0xF040,    // write inputs to null
    IOIMAGE_CLEARO:       0xF050,    // write outputs to null
    IOIMAGE_RWIOB:        0xF060,    // read input and write output byte(s)
    DEVICE_DATA:          0xF100,    // state, name, etc...
}

const ERRORS = {
  0: 'OK',
  1: 'Internal error',
  2: 'No Rtime',
  3: 'Allocation locked memory error',
  4: 'Insert mailbox error',
  5: 'Wrong receive HMSG',
  6: 'target port not found',
  7: 'target machine not found',
  8: 'Unknown command ID',
  9: 'Bad task ID',
  10: 'No IO',
  11: 'Unknown AMS command',
  12: 'Win 32 error',
  13: 'Port not connected',
  14: 'Invalid AMS length',
  15: 'Invalid AMS Net ID',
  16: 'Low Installation level',
  17: 'No debug available',
  18: 'Port disabled',
  19: 'Port already connected',
  20: 'AMS Sync Win32 error',
  21: 'AMS Sync Timeout',
  22: 'AMS Sync AMS error',
  23: 'AMS Sync no index map',
  24: 'Invalid AMS port',
  25: 'No memory',
  26: 'TCP send error',
  27: 'Host unreachable',
  1792: 'error class <device error>',
  1793: 'Service is not supported by server',
  1794: 'invalid index group',
  1795: 'invalid index offset',
  1796: 'reading/writing not permitted',
  1797: 'parameter size not correct',
  1798: 'invalid parameter value(s)',
  1799: 'device is not in a ready state',
  1800: 'device is busy',
  1801: 'invalid context (must be in Windows)',
  1802: 'out of memory',
  1803: 'invalid parameter value(s)',
  1804: 'not found (files, ...)',
  1805: 'syntax error in command or file',
  1806: 'objects do not match',
  1807: 'object already exists',
  1808: 'symbol not found',
  1809: 'symbol version invalid',
  1810: 'server is in invalid state',
  1811: 'AdsTransMode not supported',
  1812: 'Notification handle is invalid',
  1813: 'Notification client not registered',
  1814: 'no more notification handles',
  1815: 'size for watch too big',
  1816: 'device not initialized',
  1817: 'device has a timeout',
  1818: 'query interface failed',
  1819: 'wrong interface required',
  1820: 'class ID is invalid',
  1821: 'object ID is invalid',
  1822: 'request is pending',
  1823: 'request is aborted',
  1824: 'signal warning',
  1825: 'invalid array index',
  1826: 'symbol not active -> release handle and try again',
  1827: 'access denied',
  1856: 'Error class <client error>',
  1857: 'invalid parameter at service',
  1858: 'polling list is empty',
  1859: 'var connection already in use',
  1860: 'invoke ID in use',
  1861: 'timeout elapsed',
  1862: 'error in win32 subsystem',
  1863: 'Invalid client timeout value',
  1864: 'ads-port not opened',
  1872: 'internal error in ads sync',
  1873: 'hash table overflow',
  1874: 'key not found in hash',
  1875: 'no more symbols in cache',
  1876: 'invalid response received',
  1877: 'sync port is locked',
}

class beckhoffClient {
  constructor (ip, port) {
    this.sock = new net.Socket();
    this.sock.setNoDelay(true);

    this.address = ip;
    this.port = port;
    
    this.rxdata = [];

  }

  async sendBuffer (txdata, kind, expected = 0) {
    let plc = this;
    plc.expected = expected;

    if (settings.develop.debug) {
      console.log('BKHF TX  : ' + txdata.toString('hex') + '\n');
    }

    

    return new Promise((resolve, reject) => {
      
      if (plc.sock.bytesWritten > 0) {
        this.rxdata = [];
  
        plc.sock.write(txdata, (err) => {
          if (settings.develop.verbose) {
            console.log('TX : %i bytes sent - %s - expected: %i bytes', plc.sock.bytesWritten, kind, expected);
          }
        });
      } else {
        plc.sock.connect(plc.port, plc.address, () => {
          console.log("connected to beckhoff plc : " + plc.address + ":" + plc.port );
          
          plc.sock.write(txdata, (err) => {
            if (settings.develop.verbose) {
              console.log('TX : %i bytes sent - %s - expected: %i bytes', plc.sock.bytesWritten, kind, expected);
            }
          });
          
        });
      }

      var checkRxData = function () {

        let rxlen = 0;
        for (let i = 0; i < plc.rxdata.length; i++) {
          rxlen += plc.rxdata[i].length;
        }

        if (rxlen > plc.expected) {
          if (settings.develop.debug) {
            console.log('BKHF RX  : ' + plc.rxdata.toString('hex') + '\n');
          }
          console.log('  RX-ed len = ' + rxlen);
          
          let result = Buffer.alloc(rxlen).fill(0);
          let offset = 0;
          for (let i = 0; i < plc.rxdata.length; i++) {
            plc.rxdata[i].copy(result, offset);
            if (offset > 0) {
              let analyse = plc.rxdata[i -1].slice(plc.rxdata[i -1].length - 20);
              console.log(zeroPad(i, 2) + ' <-- ' + analyse.toString('hex'));
              analyse = plc.rxdata[i].slice(0,20);
              console.log(zeroPad(i, 2) + ' -->                                         ' + analyse.toString('hex'));
              analyse = result.slice(offset - 20, offset + 20);
              console.log(zeroPad(i, 2) + ' <-> ' + analyse.toString('hex') + '\n\n');
            } else {
              let analyse = result.slice(result.length - 20);
              console.log(zeroPad(i, 2) + ' --> ' + analyse.toString('hex'));
            }
            offset += plc.rxdata[i].length;
          }

          if (settings.develop.save) {
            let dbdata = lokiDB.getCollection('trx');
            let dbsave = {
              kind : kind,
              tx   : txdata,
              rx   : result//Buffer.from(plc.rxdata)
            }
            dbdata.insertOne(dbsave);

            lokiDB.saveDatabase();
          }
          resolve(result);  //Buffer.from(plc.rxdata)
          //return result;
        }
      }

      plc.sock.on('data', (data) => {
  
        this.rxdata.push(data);

        checkRxData.call();

      });

 //     plc.sock.on('end', (had_error) => {
 //       checkRxData.call();
 //     })

      plc.sock.on('error', (err) => {
        reject(err);
        //throw new Error(err);
      });
      plc.sock.on('close', (had_error) => {
        if (had_error) {
          console.error("connection closed after error");
          reject('error detected');
        } else {
          console.log("connection closed");
        }
      });

    });
  }
}

/*
 * PREPARE message requests
 */

function _prepareHeader(options) {
  
  if (settings.bytes.remote.length == 0) {
    settings.bytes.remote = Buffer.alloc(8).fill(0);
    let splitVal = settings.remote.netid.split('.');
    for (let i = 0; i < 6; i++) {
      settings.bytes.remote.writeUInt8(splitVal[i], i);
    }
    settings.bytes.remote.writeUInt16LE(settings.remote.port, 6);

    settings.bytes.local = Buffer.alloc(8).fill(0);
    splitVal = settings.local.netid.split('.');
    for (let i = 0; i < 6; i++) {
      settings.bytes.local.writeUInt8(splitVal[i], i);
    }
    settings.bytes.local.writeUInt16LE(settings.local.port, 6);

  } 
  let tcpHeader = Buffer.alloc(6).fill(0);
  tcpHeader.writeUInt32LE(32 + options.len, 2);   // TCP header - length

  let amsHeader = Buffer.concat([settings.bytes.remote, settings.bytes.local], 32);

  amsHeader.writeUInt16LE(options.cmd, 16);       // AMS header - command ID
  amsHeader.writeUInt16LE(4, 18);                 // AMS header - flags : Request + ADS command (TCP)
  amsHeader.writeUInt32LE(options.len, 20);       // AMS header - data length
  amsHeader.writeUInt32LE(0, 24);                 // AMS header - error code
  amsHeader.writeUInt32LE(options.invoke, 28);    // AMS header - invoke ID

  return Buffer.concat([tcpHeader, amsHeader]);
}
function _prepareReadData(options) {
  let msgData = Buffer.alloc(12).fill(0);

  msgData.writeUInt32LE(options.idxGroup, 0);
  msgData.writeUInt32LE(options.idxOffset, 4);
  msgData.writeUInt32LE(options.length, 8);
  
  return msgData;
}
function _prepareWriteData(options) {
  let msgData = Buffer.alloc(options.length + 8).fill(0);

  msgData.writeUInt32LE(options.idxGroup, 0);
  msgData.writeUInt32LE(options.idxOffset, 4);
  msgData.writeUInt32LE(options.length, 8);

  // TODO
}


/*
 * ANALYZE message responses
 */

function _analyzeHeader(data) {
  //let header = Buffer.from(data);
  
  let result = {
    //target  : data.slice(0,6),
    //trgPort : data.readUInt16LE(6),
    //source  : data.slice(8,14),
    //srcPort : data.readUInt16LE(14),
    command : data.readUInt16LE(16),
    state   : data.readUInt16LE(18),
    length  : data.readUInt32LE(20),
    error   : getValueFromName(ERRORS, data.readUInt32LE(24)),
    invoke  : data.readUInt32LE(28)
  }

  if (settings.develop.verbose && settings.develop.debug) console.log('amsHead: ' + JSON.stringify(result));

  return result;
}
function _analyzePlcInfo(data) {
  //let message = Buffer.from(data);
  let result = {
    error    : getValueFromName(ERRORS, data.readUInt32LE(0)),
    major    : data.readUInt8(4),
    minor    : data.readUInt8(5),
    build    : data.readUInt16LE(6),
    device   : data.toString('binary',8, getStringEnd(8, data.slice(8, 23)))
  }

  if (settings.develop.verbose) console.log('plcInfo: ' + JSON.stringify(result));

  return result;
}
function _analyzePlcState(data) {
  //let message = Buffer.from(data);
  let result = {
    error    : getValueFromName(ERRORS, data.readUInt32LE(0)),
    adsState : data.readUInt16LE(4), //getNameFromValue(ADSSTATE, data.readUInt16LE(4)),
    devState : data.readUInt16LE(6)
  }

  if (settings.develop.verbose) console.log('plcState: ' + JSON.stringify(result));

  return result;
}
function _analyzePlcRead(data) {
  //let message = Buffer.from(data);
  let result = {
    error  : getValueFromName(ERRORS, data.readUInt32LE(0)),
    length : data.readUInt32LE(4),
    data   : data.slice(8)
  }

  if (settings.develop.verbose) console.log('PlcRead: ' + JSON.stringify(result));

  return result;
}
function _analyzePlcSymbols(data) {
  
  let result = {
    error  : getValueFromName(ERRORS, data.readUInt32LE(0)),
    length : data.readUInt32LE(4),
    data   : data.slice(8)
  }

  if (settings.develop.verbose)  {
    result.data = data.slice(8, 88);
    console.log('PlcSymbols: ' + JSON.stringify(result));
    result.data = data.slice(8);
  }

  let symPos = 0;
  let symbols = lokiDB.getCollection('symbols');

  let cnt = -1;
  while (symPos < result.data.length) {
    let curLen = result.data.readUInt32LE(symPos);

    if (curLen < 10) {
      curLen += 8
      return null
    }
    let curSym = {
      symPos : symPos,
      curLen : curLen,
      idxGroup  : result.data.readUInt32LE(symPos + 4),
      idxOffset : result.data.readUInt32LE(symPos + 8),
      size      : result.data.readUInt32LE(symPos + 12),
      name      : result.data.readUInt16LE(symPos + 24) + 1,
      kind      : result.data.readUInt16LE(symPos + 26) + 1,
      comment   : result.data.readUInt16LE(symPos + 28) + 1
    }
    // DEBUG
    console.log(zeroPad(++cnt, 3) + " : " + JSON.stringify(curSym));

    let tmpPos = symPos + 30;
    let value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.name)));
    tmpPos += curSym.name;
    curSym.name = value;

    value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.kind)));
    tmpPos += curSym.kind;
    curSym.kind = value;

    value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.comment)));
    tmpPos += curSym.comment;
    curSym.comment = value;

    // DEBUG
    console.log(zeroPad(cnt, 3) + " : "  + JSON.stringify(curSym));
    if (curLen < 150) {
      console.log( zeroPad(cnt, 3) + " : " + result.data.slice(symPos, symPos + 29).toString('hex') + " - " + result.data.slice(symPos + 30, symPos + (curLen - 30)).toString());
    } else {
      console.log(zeroPad(cnt, 3)  + " : " + result.data.slice(symPos, symPos + 29).toString('hex') + " - " + result.data.slice(symPos + 30, symPos + 120).toString('hex'));
    }
    //console.log(cnt + " - " + JSON.stringify(result.data.slice(symPos, symPos + curLen + 10)));
    // END DEBUG

    symbols.insertOne(curSym);
    symPos += curLen;
  }

  return symbols.data;

}

/*
 *  REQUESTS to be made
 */ 

async function getPlcInfo(callback) {
  let options = {
    cmd    : ADSCMD.ReadDeviceInfo,
    len    : 0,
    invoke : ++invokeId
  }
  let txHeader = _prepareHeader(options);

  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  try {
    let data = await plc.sendBuffer(txHeader, 'info', 60);
    
    let rxRes = _analyzeHeader(data.slice(6,38));
    rxInfo = _analyzePlcInfo(data.slice(38));
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
    
}

async function getPlcState(callback) {
  let options = {
    cmd    : ADSCMD.ReadState,
    len    : 0,
    invoke : ++invokeId
  }
  let txHeader = _prepareHeader(options);

  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  try {
    let data = await plc.sendBuffer(txHeader, 'state', 40);
    
    let rxRes = _analyzeHeader(data.slice(6,38));
    rxInfo = _analyzePlcState(data.slice(38));
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
}

async function getPlcSymbols(callback) {

  let reqData = {
    idxGroup  : ADSIGRP.SYM_UPLOADINFO2,
    idxOffset : 0x00000000,
    length    : 0x30
  }
  let txData = _prepareReadData(reqData);

  let options = {
    cmd    : ADSCMD.Read,
    len    : txData.length,
    invoke : ++invokeId
  }
  let txHeader = _prepareHeader(options);
  

  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  try {
    // first command
    let data = await plc.sendBuffer(Buffer.concat([txHeader,txData]), 'read', 0x30);
    
    let rxRes = _analyzeHeader(data.slice(6,38));
    rxInfo = _analyzePlcRead(data.slice(38));

    // prepare symbols request with data from first response
    reqData = {
      idxGroup  : ADSIGRP.SYM_UPLOAD,
      idxOffset : 0x00000000,
      length    : rxInfo.data.readUInt32LE(4)
    }
    txData = _prepareReadData(reqData);
    options = {
      cmd    : ADSCMD.Read,
      len    : txData.length,
      invoke : ++invokeId
    }
    txHeader = _prepareHeader(options);
    

    data = await plc.sendBuffer(Buffer.concat([txHeader,txData]), 'symbols', reqData.length);

    rxRes = _analyzeHeader(data.slice(6, 38));

    // clear local database with PLC symbols
    let symbols = lokiDB.getCollection('symbols');
    symbols.clear();

    // process PLC symbol info
    rxInfo = _analyzePlcSymbols(data.slice(38));

  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
}

function testPlcSymbols() {

  let trx = lokiDB.getCollection('trx');
  let data = trx.findOne({ 'kind' : { '$eq' : 'symbols' }});
  let temp = Buffer.from(data.rx);
  let rxHead = _analyzeHeader(temp.slice(6, 38));

  let symbols = lokiDB.getCollection('symbols');
  symbols.clear();
  symbols = _analyzePlcSymbols(temp.slice(38));

  return symbols;
}


// --------------------- 
// -- HELPER ROUTINES --
// ---------------------
function getStringEnd(start, data) {
  return data.indexOf(0) + start;
}
function getNameFromValue(object, value) {
  let allNames = Object.getOwnPropertyNames(object);
  let allValues = Object.getOwnPropertyDescriptors(object);

  let idx = 0;
  //let notok = true;
  allValues.forEach((element) => {
    if (element.value == value) {
      break;
    }
  })
  /*do {
    if (allValues[idx].value == value) {
      notok = false;
    } else {
      idx++;
    }
  } while (notok)*/
  //let index = allValues.indexOf(value);
  return allNames[idx];
}
function getValueFromName(object, name) {
  let allNames = Object.getOwnPropertyNames(object);
  let allValues = Object.getOwnPropertyDescriptors(object);

  let idx = 0; //allNames.indexOf(name);
  let notok = true;
  do {
    if (allNames[idx] == name) {
      notok = false;
    } else {
      if (idx++ > 1000) {
        notok = false;
      }
    }
  } while (notok);

  if (idx < 1000) {
    return allValues[idx].value;
  } else {
    return null;
  }
}

function zeroPad(num, places) {
  return String(num).padStart(places, '0')
}

module.exports = {
  settings,

  getPlcInfo,
  getPlcState,
  getPlcSymbols,
  testPlcSymbols
}