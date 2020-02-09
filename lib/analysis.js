//const Buffer = require('safe-buffer').Buffer;
//const loki = require('lokijs');

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


function analyzeHeader(data, settings) {
  let result = null;

  if (settings.verbose) {
    result = {
      //target  : data.slice(0,6),
      //trgPort : data.readUInt16LE(6),
      //source  : data.slice(8,14),
      //srcPort : data.readUInt16LE(14),
      command : getNameFromValue(ADSCMD, data.readUInt16LE(16)),  //  data.readUInt16LE(16),
      state   : data.readUInt16LE(18),
      length  : data.readUInt32LE(20),
      error   : data.readUInt32LE(24).toString() + " - " + getValueFromName(ERRORS, data.readUInt32LE(24)),
      invoke  : data.readUInt32LE(28)
    }
  } else {
    result = {
      command : data.readUInt16LE(16), // getNameFromValue(ADSCMD, data.readUInt16LE(16)),
      state   : data.readUInt16LE(18),
      length  : data.readUInt32LE(20),
      error   : data.readUInt32LE(24), // getValueFromName(ERRORS, data.readUInt32LE(24)),
      invoke  : data.readUInt32LE(28)
    }

    if (result.error > 0) {
      result.error = data.readUInt32LE(24).toString() + " - " + getValueFromName(ERRORS, data.readUInt32LE(24));
    } 
  }
  

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {*} settings 
 */
function analyzePlcInfo(data, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header   : analyzeHeader(header, settings),
    error    : getValueFromName(ERRORS, message.readUInt32LE(0)),
    major    : message.readUInt8(4),
    minor    : message.readUInt8(5),
    build    : message.readUInt16LE(6),
    device   : message.toString('binary',8, getStringEnd(8, data.slice(8, 23)))
  }

  if (settings.verbose) console.log('plcInfo: ' + JSON.stringify(result));

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcState(data, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header   : analyzeHeader(header, settings),
    error    : getValueFromName(ERRORS, message.readUInt32LE(0)),
    adsState : getNameFromValue(ADSSTATE, message.readUInt16LE(4)), //,message.readUInt16LE(4)
    devState : message.readUInt16LE(6)
  }

  if (settings.verbose) console.log('plcState: ' + JSON.stringify(result));

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcSymbols(data, symbols, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  }

  if (settings.verbose)  {
    result.error = getValueFromName(ERRORS, message.readUInt32LE(0));

    result.data = message.slice(8, 88);
    console.log('PlcSymbols: ' + JSON.stringify(result));
    result.data = message.slice(8);
  }

  let symPos = 0;

  while (symPos < result.data.length) {
    let curLen = result.data.readUInt32LE(symPos);

    let curSym = {
      //symPos : symPos,
      //curLen : curLen,
      idxGroup  : result.data.readUInt32LE(symPos + 4),
      idxOffset : result.data.readUInt32LE(symPos + 8),
      size      : result.data.readUInt32LE(symPos + 12),
      name      : result.data.readUInt16LE(symPos + 24) + 1,
      kind      : result.data.readUInt16LE(symPos + 26) + 1,
      comment   : result.data.readUInt16LE(symPos + 28) + 1,
      handle    : -1
    }

    let tmpPos = symPos + 30;
    let value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.name)));
    tmpPos += curSym.name;
    curSym.name = value.toUpperCase();

    value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.kind)));
    tmpPos += curSym.kind;
    curSym.kind = value;

    value = result.data.toString('binary', tmpPos, getStringEnd(tmpPos, result.data.slice(tmpPos, tmpPos + curSym.comment)));
    tmpPos += curSym.comment;
    curSym.comment = value;

    if ((!curSym.name.startsWith('Global_Variables')) &&
        (!curSym.name.startsWith('Constants')) &&
        (!curSym.name.startsWith('TwinCAT_')) && 
        (curSym.kind != 'OTCID')) {
      symbols.insertOne(curSym);
    }
    
    symPos += curLen;
  }

  return symbols.data;

}

/**
 * 
 * @param {Buffer} data 
 * @param {*} symbols 
 * @param {*} settings 
 */
function analyzePlcRead(data, symbols, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  }

  if (settings.verbose) {
    
    result.error = getValueFromName(ERRORS, message.readUInt32LE(0));

    console.log('PlcRead: ' + JSON.stringify(result));
  
  };

  if (symbols !== null) {
    result.symbols = [];

    let offset = 0;
    let dataOffset = symbols.length * 4;
    for (let i=0; i< symbols.length; i++) {
      //let offset = i*4;

      let tmpSymbol = {
        name  : symbols[i].name,
        kind  : symbols[i].kind
      }

      if (settings.verbose) {
        tmpSymbol.idxGroup = symbols[i].idxGroup;
        tmpSymbol.idxOffset = symbols[i].idxOffset;
        tmpSymbol.handle = symbols[i].handle;
        tmpSymbol.size = symbols[i].size;
      }
      
      if (symbols.length == 1) {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.data.slice(offset, offset + 4));
      } else {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.data.slice(dataOffset, dataOffset + symbols[i].size));
        dataOffset += symbols[i].size;
      }

      result.symbols.push(tmpSymbol);
    }
    /*
    result.symbols = [{
      name  : symbols[0].name,
      kind  : symbols[0].kind,
      value : analyzePlcValue(symbols[0], result.data)
    }];
    */
   
  }

  return result;
}

/**
 * 
 * @param {*} data 
 * @param {*} settings 
 */
function analyzePlcReadWrite(data, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  }

  if (settings.verbose) {
    result.error = getValueFromName(ERRORS, message.readUInt32LE(0));
    console.log('PlcReadWrite: ' + JSON.stringify(result));
  }

  return result;
}

/**
 * 
 * @param {*} data 
 * @param {*} symbols 
 * @param {*} settings 
 */
function analyzePlcWrite(data, symbols, settings) {
  let header = data.slice(0,32)
  let message = data.slice(32);

  let result = {
    header : analyzeHeader(header, settings),
    error  : getNameFromValue(ERRORS, message.readUInt32LE(0)) //message.readUInt32LE(0),
    //length : message.readUInt32LE(4),
    //data   : message.slice(8)
  }

  if (symbols !== null) {
    result.symbols = {
      name  : symbols[0].name,
      kind  : symbols[0].kind,
      value : symbols[0].value
    }
  }

  return result;
}

/*
 * HELPER ROUTINES
 */
function getStringEnd(start, data) {
  return data.indexOf(0) + start;
}
function getNameFromValue(object, value) {
  let allNames = Object.getOwnPropertyNames(object);
  let result = null;

  try {
    result =  allNames[value]
  }
  catch (exc) {
    console.log(exc)
  }
  finally {
    return result;
  }

}
function getValueFromName(object, name) {
  let allValues = Object.getOwnPropertyDescriptors(object);
  let result = null;

  try {
    result =  allValues[name].value
  }
  catch (exc) {
    console.log(exc)
  }
  finally {
    return result;
  }
}
function analyzePlcValue(symbol, data) {
  let result = null;
  switch (symbol.kind) {
    case "BOOL" :
      result = data.readUInt8(0) != 0;
      break;
    case 'BYTE':
    case 'USINT':
      result = data.readUInt8(0);
      break;
    case 'SINT':
      result = data.readInt8(0);
      break;
    case 'UINT':
    case 'WORD':
      result = data.readUInt16LE(0);
      break;
    case 'INT':
      result = data.readInt16LE(0);
      break;  
    case 'DWORD':
    case 'UDINT':
      result = data.readUInt32LE(0);
      break;
    case 'DINT':
      result = data.readInt32LE(0);
      break;
    case 'REAL':
      result = data.readFloatLE(0);
      break;
    case 'LREAL':
      result = data.readDoubleLE(0);
      break;
    case 'STRING':
      result = data.toString('binary', 0, getStringEnd(data, 0));
      break;
  }

  return result;
}

module.exports = {
  analyzePlcInfo,
  analyzePlcState,
  analyzePlcSymbols,

  analyzePlcRead,
  analyzePlcReadWrite,
  analyzePlcWrite
}