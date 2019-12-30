'use strict'

const debug = require('debug')('node-beckhoff')
const loki = require('lokijs');
const Buffer = require('safe-buffer').Buffer;
const net = require('net');
//const events = require('events')

const before = require('./preparation');
const after = require('./analysis')

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
    local  : [],                     // prepared buffer of local address
    remote : []                      // prepared buffer of remote address
  },
  develop : {
    verbose : true,                  // be verbose
    debug : false,                   // be EXTRA verbose
    save : false                     // keep database on disk
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

/* 
 * -- DEFINITIONS --
 */ 
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

/*
 *
 */
class beckhoffClient {
  constructor (ip, port) {
    this.sock = new net.Socket();
    this.sock.setNoDelay(true);

    this.address = ip;
    this.port = port;

  }

  async sendBuffer (txdata, kind) {
    let plc = this;
    let rxdata = [];
    let expLen = -1;
    let rxOffset = plc.sock.bytesRead;

    if (settings.develop.debug) {
      console.log('BKHF TX  : ' + txdata.toString('hex') + '\n');
    }

    return new Promise((resolve, reject) => {

      if (plc.sock.bytesWritten > 0) {
        
        plc.sock.write(txdata, (err) => {
          if (settings.develop.verbose) {
            console.log('TX : %i bytes sent - %s', plc.sock.bytesWritten, kind);
          }
        });
      } else {
        plc.sock.connect(plc.port, plc.address, () => {
          console.log("connected to beckhoff plc : " + plc.address + ":" + plc.port );
          
          plc.sock.write(txdata, (err) => {
            if (settings.develop.verbose) {
              console.log('TX : %i bytes sent - %s', plc.sock.bytesWritten, kind);
            }
          });
          
        });
      }

      function checkRxData(rxlen) {

        let result = Buffer.alloc(rxlen).fill(0);
        let offset = 0;
        for (let i = 0; i < rxdata.length; i++) {
          rxdata[i].copy(result, offset);

          offset += rxdata[i].length;
        }

        if (settings.develop.save) {
          let dbdata = lokiDB.getCollection('trx');
          let dbsave = {
            kind : kind,
            tx   : txdata,
            rx   : result
          }
          dbdata.insertOne(dbsave);

          lokiDB.saveDatabase();
        }
        if (settings.develop.debug) {
          console.log('BKHF RX  : ' + result.toString('hex') + '\n');
        }

        resolve(result);

      }

      plc.sock.on('data', (data) => {
        let rxLen = plc.sock.bytesRead - rxOffset;
 
        rxdata.push(data);

        if (settings.develop.verbose) {
          console.log('RX : len = ' + rxLen);
        }

        if ((rxLen > 6) && (expLen == -1)) {
          expLen = data.readUInt32LE(2);
        }
        if (rxLen > expLen) {
          checkRxData(rxLen);
        }

      });

      plc.sock.on('error', (err) => {
        reject(err);
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
 *  REQUESTS to be made
 */ 

 /**
  * fetch general PLC info
  * @param {function} callback 
  */
async function getPlcInfo(callback) {
  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  let options = {
    cmd     : ADSCMD.ReadDeviceInfo,
    len     : 0,
    invoke  : ++invokeId,
    request : null
  }
  let txHeader = before.prepareHeader(options, settings);

  try {
    let data = await plc.sendBuffer(txHeader, 'info');

    rxInfo = after.analyzePlcInfo(data.slice(6), settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
    
}

/**
 * fetch PLC running state
 * 
 * @param {function} callback 
 */
async function getPlcState(callback) {
  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  let options = {
    cmd     : ADSCMD.ReadState,
    len     : 0,
    invoke  : ++invokeId,
    request : null
  }
  let txHeader = before.prepareHeader(options, settings);

  try {
    let data = await plc.sendBuffer(txHeader, 'state');

    rxInfo = after.analyzePlcState(data.slice(6), settings.develop);
  }
  catch (exc) {
    
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
}

/**
 * fetch all known symbols from the PLC
 * cache them in an in-memory LokiJS database 
 * 
 * @param {function} callback 
 */
async function getPlcSymbols(callback) {
  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  let options = {
    cmd     : ADSCMD.Read,
    len     : -1,
    invoke  : ++invokeId,
    request : [{
      idxGroup  : ADSIGRP.SYM_UPLOADINFO2,
      idxOffset : 0x00000000,
      length    : 0x30
    }]
  }
  let txData = before.preparePlcRead(options, settings);

  try {
    // first command
    let data = await plc.sendBuffer(txData, 'read');
    
    rxInfo = after.analyzePlcRead(data.slice(6), null, settings.develop);

    // prepare symbols request with data from first response
    options = {
      cmd     : ADSCMD.Read,
      len     : -1,
      invoke  : ++invokeId,
      request : [{
        idxGroup  : ADSIGRP.SYM_UPLOAD,
        idxOffset : 0x00000000,
        length    : rxInfo.data.readUInt32LE(4)
      }]
    }
    txData = before.preparePlcRead(options, settings);
    
    data = await plc.sendBuffer(txData, 'symbols');

    // clear local database with PLC symbols
    let symbols = lokiDB.getCollection('symbols');
    symbols.clear();

    // process PLC symbol info
    rxInfo = after.analyzePlcSymbols(data.slice(6), symbols, settings.develop);

  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
}

/**
 * 
 * @param {object} symbols 
 * @param {*} options 
 * @param {Buffer} txData 
 * @param {object} plc 
 */
function readPlcSymbolHandle (symbols, options, txData, plc) {
  let rxInfo = {};

  return new Promise(async (resolve, reject) => {
    try {
      let data = await plc.sendBuffer(txData, 'handle');
      rxInfo = after.analyzePlcReadWrite(data.slice(6), settings.develop);
      let offset = 0;
      for (let i=0; i<options.request.length; i++) {
        let element = options.request[i];
        let dbSym = symbols.find({ 'name' : { '$eq' : element.name.toUpperCase() }});
  
        dbSym[0].handle = rxInfo.data.readUInt32LE(offset);
  
        offset += 4;
        symbols.update(dbSym);
      } 
      resolve(rxInfo);
    }
    catch (exc) {
      //console.log(exc);
      reject(exc);
    }
    finally {
    //  return rxInfo;
      
    }
  });
}


/**
 * read the value of all items passed on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {object} symData 
 * @param {function} callback 
 */
async function readPlcData(symData, callback) {
  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  let options = {
    cmd     : ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : symData
  };

  let symbols = lokiDB.getCollection('symbols');
  let txData = null;
  do {
    options.invoke = ++invokeId;
    txData = before.preparePlcSymbolHandle(symbols, options, settings);
    
    if (txData !== null) {
      rxInfo = await readPlcSymbolHandle(symbols, options, txData, plc);   
    } else {
      invokeId--;
    }

  } while (txData !== null)


  options.invoke = ++invokeId;
  if (options.request.length == 1) {
    options.cmd = ADSCMD.Read;
    txData = before.preparePlcRead(options, settings);
  } else {
    options.cmd = ADSCMD.ReadWrite;
    // TODO
    txData = before.preparePlcRead(options, settings);
  }

  try {
    let data = await plc.sendBuffer(txData, 'read');

    rxInfo = after.analyzePlcRead(data.slice(6), options.request, settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
  
}

/**
 * write the value of all items passode on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {object} symData 
 * @param {function} callback 
 */
async function writePlcData(symData, callback) {
  let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  let options = {
    cmd     : ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : symData
  };

  let symbols = lokiDB.getCollection('symbols');
  let txData = null;
  do {
    options.invoke = ++invokeId;
    txData = before.preparePlcSymbolHandle(symbols, options, settings);
    
    if (txData !== null) {
      rxInfo = await readPlcSymbolHandle(symbols, options, txData, plc);   
    } else {
      invokeId--;
    }

  } while (txData !== null)


  options.invoke = ++invokeId;
  if (options.request.length == 1) {
    options.cmd = ADSCMD.Write;
    txData = before.preparePlcWrite(options, settings);
  } else {
    options.cmd = ADSCMD.ReadWrite;
    // TODO
    //txData = before.preparePlcWriteRead(options, settings);
  }

  try {
    let data = await plc.sendBuffer(txData, 'write');

    rxInfo = after.analyzePlcWrite(data.slice(6), options.request, settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
}

// --------------------- 
// -- HELPER ROUTINES --
// ---------------------
/*
function zeroPad(num, places) {
  return String(num).padStart(places, '0')
}
*/

module.exports = {
  settings,

  getPlcInfo,
  getPlcState,
  getPlcSymbols,

  readPlcData,
  writePlcData

}