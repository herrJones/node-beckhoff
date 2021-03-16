'use strict';

const config = require('./const'); 

const debugVerbose = require('debug')('bkhf-ana:details');
const debugError = require('debug')('bkhf-ana:error');

/**
 * analyze received command header
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzeCommandHeader(data) {
  let result = null;

  result = {
    target  : data.slice(0,6),
    trgPort : data.readUInt16LE(6),
    source  : data.slice(8,14),
    srcPort : data.readUInt16LE(14), 

    command : data.readUInt16LE(16), 
    state   : data.readUInt16LE(18),
    length  : data.readUInt32LE(20),
    error   : data.readUInt32LE(24), 
    invoke  : data.readUInt32LE(28)
  };

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(24));
  }

  return result;
}

/**
 * analyze data results for command 0x01 - Read Device Info
 * 
 * @param {Buffer} data RX-ed info buffer 
 */
function analyzeCommandInfo(data) {

  const result = {
    error    : config.getValueFromName(config.ERRORS, data.readUInt32LE(0)),
    major    : data.readUInt8(4),
    minor    : data.readUInt8(5),
    build    : data.readUInt16LE(6),
    device   : data.toString('binary',8, config.getStringEnd(8, data.slice(8, 23)))
  };

  return result;
}

/**
 * analyze data results for command 0x02 - Read
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzeCommandRead(data) {
  
  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    buffer : data.slice(8)
  };

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * analyze data results for command 0x03 - Write
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzeCommandWrite(data) {

  const result = {
    error  : data.readUInt32LE(0),
    buffer : data
  };

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * analyze data results for command 0x04 - Read State
 * 
 * @param {Buffer} data RX-ed info buffer
 * @returns {Object} plc state info
 */
function analyzeCommandState(data) {

  const result = {
    error    : config.getValueFromName(config.ERRORS, data.readUInt32LE(0)),
    adsState : config.getValueFromName(config.ADSSTATE, data.readUInt16LE(4)),
    devState : data.readUInt16LE(6)
  };

  return result;
}

/**
 * analyze data results for command 0x05 - Write Control
 * 
 * @param {Buffer} data RX-ed info buffer
 * @returns {Object} plc state info
 */
function analyzeCommandWriteControl(data) {

  const result = {
    error    : config.getValueFromName(config.ERRORS, data.readUInt32LE(0))
  };

  return result;
}

/**
 * analyze data results for command 0x06 - Add Device Notification
 * 
 * @param {Buffer} data RX-ed info buffer
 * @returns {Object} release succeeded or not
 */
function analyzeCommandAddNotification(data, symbols) {

  const result = {
    error   : data.readUInt32LE(0),
    symbols : symbols
  };
  result.symbols[0].notify = data.readUInt32LE(4);

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * analyze data results for command 0x07 - Delete Device Notification
 * 
 * @param {Buffer} data RX-ed info buffer
 * @returns {Object} release failed or not
 */
function analyzeCommandDelNotification(data, symbols) {
  const result = {
    error   : data.readUInt32LE(0),
    symbols : new Array(symbols)
  };

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * analyze data results for command 0x08 - Device Notification
 * 
 * @param {Buffer} data RX-ed info buffer
 * @returns {Object} received notification info
 */
function analyzeCommandNotification(data) {

  const result = {
    length  : data.readUInt32LE(0),
    stamps  : [],
    symbols : []
  };
  const numStamps = data.readUInt32LE(4);
  let pos = 8;
  for (let i = 0; i < numStamps; i++) {
   
    const stamp = {
      timestamp : data.readBigUInt64LE(pos + 0),
      samples   : []
    };
    const numSamples = data.readUInt32LE(pos + 8);

    try {
      stamp.timestamp = new Date(Number((stamp.timestamp / BigInt(10000)) - BigInt(11644473600000)));
    } catch (exc) {
      debugError(exc);
    }
    pos += 12;
    for (let s = 0; s < numSamples; s++) {
      const sample = {
        notify : data.readUInt32LE(pos + 0),
        size   : data.readUInt32LE(pos + 4),
        data   : data.slice(pos + 8, pos + 8 + data.readUInt32LE(pos + 4)),
        value  : -1
      };
      
      stamp.samples.push(sample);

      sample.timestamp = stamp.timestamp;
      result.symbols.push(sample);
      pos += 8 + data.readUInt32LE(pos + 4);
    }

    result.stamps.push(stamp);
  }
  return result;
}

/**
 * analyze data results for command 0x09 - Read Write
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzeCommandReadWrite(data) {
  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    buffer : data.slice(8)
  };

  if (result.error > 0) {
    result.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzePlcUploadInfo(data) {

  const result = {
    error  : data.error,
    length : data.length,
    symbols : {
      count  : data.buffer.readUInt32LE(0),
      length : data.buffer.readUInt32LE(4)
    },
    datatypes : {
      count  : data.buffer.readUInt32LE(8),
      length : data.buffer.readUInt32LE(12)
    },
    extra : {
      count  : data.buffer.readUInt32LE(16),
      length : data.buffer.readUInt32LE(20)
    }
  };

  return result;
}

/**
 * analyze the data stream with PLC symbols
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzePlcSymbols(data) {

  function analyzeSymbol(pos) {
    const symbol = {
      group   : data.readUInt32LE(pos + 4),
      offset  : data.readUInt32LE(pos + 8),
      size    : data.readUInt32LE(pos + 12),
      adstype : data.readUInt32LE(pos + 16),
      flags   : data.readUInt16LE(pos + 20),
      arrsize : data.readUInt16LE(pos + 22),
      arrdata : [],
      name    : data.readUInt16LE(pos + 24) + 1,
      kind    : data.readUInt16LE(pos + 26) + 1,
      comment : data.readUInt16LE(pos + 28) + 1,
      handle  : -1,
      notify  : -1
    };

    pos += 30;
    let value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + symbol.name)));
    pos += symbol.name;
    symbol.name = value.toUpperCase();

    value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + symbol.kind)));
    pos += symbol.kind;
    symbol.kind = value;

    value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + symbol.comment)));
    pos += symbol.comment;
    symbol.comment = value;

    /* parse array */
    for (let i = 0; i < symbol.arrsize; i++) {
      const array = {
        startidx : data.readUInt32LE(pos),
        length   : data.readUInt32LE(pos + 4)
      };

      symbol.arrdata.push(array);
      pos += 8;

    }

    return symbol;
  }
  const result = [];

  let symPos = 0;

  while (symPos < data.length) {
    const curLen = data.readUInt32LE(symPos);

    const curSym = analyzeSymbol(symPos);

    result.push(curSym);

    symPos += curLen;
  }

  return result;

}

/**
 * 
 * @param {Buffer} data RX-ed info buffer
 */
function analyzePlcDataTypes(data) {
  

  function analyzeDataType(pos) {
    
    const curType = {
      version  : data.readUInt32LE(pos +  4),
      size     : data.readUInt32LE(pos + 16),
      offset   : data.readUInt32LE(pos + 20),
      datatype : data.readUInt32LE(pos + 24),
      flags    : data.readUInt32LE(pos + 28),

      name     : data.readUInt16LE(pos + 32) + 1,
      kind     : data.readUInt16LE(pos + 34) + 1,
      comment  : data.readUInt16LE(pos + 36) + 1,

      arrsize  : data.readUInt16LE(pos + 38),
      arrdata  : [],
      subsize  : data.readUInt16LE(pos + 40),
      subdata  : []
    };

    pos += 42;
    let value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + curType.name)));
    pos += curType.name;
    curType.name = value.toUpperCase();

    value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + curType.kind)));
    pos += curType.kind;
    curType.kind = value;

    value = data.toString('binary', pos, config.getStringEnd(pos, data.slice(pos, pos + curType.comment)));
    pos += curType.comment;
    curType.comment = value;

    /* parse array */
    for (let i = 0; i < curType.arrsize; i++) {
      const array = {
        startidx : data.readUInt32LE(pos),
        length   : data.readUInt32LE(pos + 4)
      };

      curType.arrdata.push(array);
      pos += 8;
    }

    /* parse subitems */
    for (let i = 0; i < curType.subsize; i++) {
      const subLen = data.readUInt32LE(pos);
      const subSym = analyzeDataType(pos);

      curType.subdata.push(subSym)
      pos += subLen
    }

    return curType;
  }

  const result = [];

  let typePos = 0;

  while (typePos < data.length) {
    const curLen = data.readUInt32LE(typePos);
    const curType = analyzeDataType(typePos);
    
    result.push(curType);

    typePos += curLen;
  }

  return result;
}

/**
 * analyze the data stream with symbol handles
 * 
 * @param {Buffer} data RX-ed info buffer
 * @param {array} symbols 
 */
function analyzePlcSymbolHandles(data, symbols) {
  let symOffset = 0;
  let hndOffset = symbols.length * 8;

  // 1 handle : [HANDLE]
  // x handles: [[HNDERROR1, HNDLEN1, ...], [HANDLE1, ...]]

  if (symbols.length == 1) {
    symbols[0].handle = data.readUInt32LE(symOffset);
  } else {
    let symError = -1;
    let symBytes = -1;
    for (let i = 0; i < symbols.length; i++) {
      symError = data.readUInt32LE(symOffset); // --> todo: check symbol error messages
      if (symError != 0) {
        debugError('error code ' + symError + ' after fetching handle for ' + symbols[i].name);
      }
      symBytes = data.readUInt32LE(symOffset + 4);
  
      symbols[i].handle = data.readUInt32LE(hndOffset);
  
      symOffset += 8;
      hndOffset += symBytes;
    }
  }
  
  return symbols;
}

/**
 * 
 * @param {Buffer} data RX-ed info buffer
 * @param {array} symbols 
 */
function analyzePlcDelSymbolHandles(data) {
  debugVerbose('symbolHandle : ' + data.toString('hex'));
}

/**
 * 
 * @param {Buffer} data RX-ed info buffer
 * @param {array} symbols 
 */
function analyzePlcSymbolValues(data, symbols) {
  const result = [];
  let dataOffset = symbols.length * 4;

  for (let i=0; i< symbols.length; i++) {

    const tmpSymbol = {
      name  : symbols[i].name,
      kind  : symbols[i].kind,
    };
      
    if (symbols.length == 1) {
      tmpSymbol.value = config.analyzePlcValue(symbols[i], data.slice(0, symbols[i].size));
    } else {
      tmpSymbol.value = config.analyzePlcValue(symbols[i], data.slice(dataOffset, dataOffset + symbols[i].size));
      dataOffset += symbols[i].size;
    }

    result.push(tmpSymbol);
  }

  return result;
}

/**
 * 
 * @param {Buffer} data RX-ed info buffer
 * @param {array} symbols 
 */
function analyzePlcSymbolWrite(data, symbols) {
  const result = [];
  let offset = 0;

  for (let i = 0; i < symbols.length; i++) {
    const tmpData = {
      name  : symbols[i].name,
      kind  : symbols[i].kind,
      value : symbols[i].value,
      error : data.readUInt32LE(offset)
    };

    if (tmpData.error > 0) {
      tmpData.error = config.getNameFromValue(config.ERRORS, data.readUInt32LE(offset));
    }
    
    result.push(tmpData);
    offset += 4;
  }

  return result;
}

module.exports = {
  analyzeCommandHeader,
  analyzeCommandInfo,
  analyzeCommandState,
  analyzeCommandRead,
  analyzeCommandWrite,
  analyzeCommandWriteControl,
  analyzeCommandAddNotification,
  analyzeCommandDelNotification,
  analyzeCommandNotification,
  analyzeCommandReadWrite,

  analyzePlcUploadInfo,
  analyzePlcSymbols,
  analyzePlcDataTypes,
  analyzePlcSymbolHandles,
  analyzePlcDelSymbolHandles,
  analyzePlcSymbolValues,
  analyzePlcSymbolWrite 
};