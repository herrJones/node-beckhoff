'use strict';

const config = require('./const'); 

function analyzeHeader(data) {
  let result = null;

  //console.log('header = ' + data.toString('hex'));
  result = {
    target  : data.slice(0,6),
    trgPort : data.readUInt16LE(6),
    source  : data.slice(8,14),
    srcPort : data.readUInt16LE(14), 

    command : data.readUInt16LE(16), // getNameFromValue(ADSCMD, data.readUInt16LE(16)),
    state   : data.readUInt16LE(18),
    length  : data.readUInt32LE(20),
    error   : data.readUInt32LE(24), // getValueFromName(ERRORS, data.readUInt32LE(24)),
    invoke  : data.readUInt32LE(28)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(24));
  }

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {*} settings 
 */
function analyzePlcInfo(data) {
  const result = {
    //header   : analyzeHeader(header, settings),
    error    : getValueFromName(config.ERRORS, data.readUInt32LE(0)),
    major    : data.readUInt8(4),
    minor    : data.readUInt8(5),
    build    : data.readUInt16LE(6),
    device   : data.toString('binary',8, getStringEnd(8, data.slice(8, 23)))
  };

  //if (settings.verbose) console.log('plcInfo: ' + JSON.stringify(result));

  return result;
}

/**
 * 
 * @param {Buffer} data 
 */
function analyzePlcState(data) {

  const result = {
    error    : getValueFromName(config.ERRORS, data.readUInt32LE(0)),
    adsState : getNameFromValue(config.ADSSTATE, data.readUInt16LE(4)), //,message.readUInt16LE(4)
    devState : data.readUInt16LE(6)
  };

  //if (settings.verbose) console.log('plcState: ' + JSON.stringify(result));

  return result;
}

function analyzePlcUploadInfo(data) {

  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    symbols : {
      count : data.readUInt32LE(8),
      length : data.readUInt32LE(12)
    },
    datatypes : {
      count : data.readUInt32LE(16),
      length : data.readUInt32LE(20)
    },
    extra : {
      count : data.readUInt32LE(24),
      length : data.readUInt32LE(28)
    }
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * analyze the data stream with PLC symbols
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcSymbols(data) {

  function analyzeSymbol(pos) {
    const symbol = {
      //symPos : symPos,
      //curLen : curLen,
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
    let value = data.toString('binary', pos, getStringEnd(pos, data.slice(pos, pos + symbol.name)));
    pos += symbol.name;
    symbol.name = value.toUpperCase();

    value = data.toString('binary', pos, getStringEnd(pos, data.slice(pos, pos + symbol.kind)));
    pos += symbol.kind;
    symbol.kind = value;

    value = data.toString('binary', pos, getStringEnd(pos, data.slice(pos, pos + symbol.comment)));
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

function analyzePlcDataTypes(data) {
  const result = [];

  let typePos = 0;

  while (typePos < data.length) {
    const curLen = data.readUInt32LE(typePos);

    const curType = {
      version  : data.readUInt32LE(typePos + 4),
      size     : data.readUInt32LE(typePos + 16),
      offset   : data.readUInt32LE(typePos + 20),
      datatype : data.readUInt32LE(typePos + 24),
      flags    : data.readUInt32LE(typePos + 28),

      name     : data.readUInt16LE(typePos + 32) + 1,
      kind     : data.readUInt16LE(typePos + 34) + 1,
      comment  : data.readUInt16LE(typePos + 36) + 1,

      arraySize : data.readUInt16LE(typePos + 38),
      subItems  : data.readUInt16LE(typePos + 40)
    };

    let tmpPos = typePos + 42;
    let value = data.toString('binary', tmpPos, getStringEnd(tmpPos, data.slice(tmpPos, tmpPos + curType.name)));
    tmpPos += curType.name;
    curType.name = value.toUpperCase();

    value = data.toString('binary', tmpPos, getStringEnd(tmpPos, data.slice(tmpPos, tmpPos + curType.kind)));
    tmpPos += curType.kind;
    curType.kind = value;

    value = data.toString('binary', tmpPos, getStringEnd(tmpPos, data.slice(tmpPos, tmpPos + curType.comment)));
    tmpPos += curType.comment;
    curType.comment = value;

    result.push(curType);

    typePos += curLen;
  }

  return result;
}

/**
 * analyze the data stream with symbol handles
 * 
 * @param {Buffer} data 
 * @param {object} symbols 
 */
function analyzePlcSymbolHandles(data, symbols) {
  let symOffset = 0;
  let hndOffset = symbols.length * 8;

  // 1 handle : [HANDLE]
  // x handles: [[HNDERROR1, HNDLEN1, ...], [HANDLE1, ...]]

  if (symbols.length == 1) {
    symbols[0].handle = data.readUInt32LE(0);
  } else {
    let symError = -1;
    let symBytes = -1;
    for (let i = 0; i < symbols.length; i++) {
      symError = data.readUInt32LE(symOffset); // --> todo: check symbol error messages
      if (symError != 0) {
        console.error('error code ' + symError + ' after fetching handle for ' + symbols[i].name);
      }
      symBytes = data.readUInt32LE(symOffset + 4);
  
      symbols[i].handle = data.readUInt32LE(hndOffset);
  
      symOffset += 8;
      hndOffset += symBytes;
    }
  }
  
  //return symbols;
}

/**
 * 
 * @param {Buffer} data 
 * @param {*} symbols 
 */
function analyzePlcRead(data, symbols) {

  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    buffer : data.slice(8)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }
  
  if (symbols && (result.error == 0)) {
    result.symbols = [];

    const offset = 0;
    let dataOffset = symbols.length * 4;
    for (let i=0; i< symbols.length; i++) {
      //let offset = i*4;

      const tmpSymbol = {
        name  : symbols[i].name,
        kind  : symbols[i].kind
      };
      
      if (symbols.length == 1) {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.buffer.slice(offset, offset + 4));
      } else {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.buffer.slice(dataOffset, dataOffset + symbols[i].size));
        dataOffset += symbols[i].size;
      }

      result.symbols.push(tmpSymbol);
    }
   
  }

  return result;
}

/**
 * 
 * @param {*} data 
 * @param {*} symbols 
 */
function analyzePlcReadWrite(data, symbols) {

  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    buffer : data.slice(8)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }
  //console.log('PlcReadWrite: ' + JSON.stringify(result));

  if (symbols && (result.error == 0)) {
    result.symbols = [];

    const offset = 0;
    let dataOffset = symbols.length * 4;
    for (let i=0; i< symbols.length; i++) {
      //let offset = i*4;

      const tmpSymbol = {
        name  : symbols[i].name,
        kind  : symbols[i].kind
      };
      
      if (symbols.length == 1) {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.buffer.slice(offset, offset + 4));
      } else {
        tmpSymbol.value = analyzePlcValue(symbols[i], result.buffer.slice(dataOffset, dataOffset + symbols[i].size));
        dataOffset += symbols[i].size;
      }

      result.symbols.push(tmpSymbol);
    }
   
  }

  return result;
}

/**
 * 
 * @param {*} data 
 * @param {*} symbols 
 */
function analyzePlcWrite(data, symbols) {

  const result = {
    error  : data.readUInt32LE(0)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  if (symbols !== undefined) {
    result.symbols = {
      name  : symbols[0].name,
      kind  : symbols[0].kind,
      value : symbols[0].value
    };
  }

  return result;
}

/**
 * 
 * @param {*} data 
 */
function analyzeAddPlcNotification(data) {

  const result = {
    error  : data.readUInt32LE(0), //getNameFromValue(config.ERRORS, data.readUInt32LE(0)),
    handle : data.readUInt32LE(4)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * 
 * @param {*} data 
 */
function analyzeDelPlcNotification(data) {
  const result = {
    error  : data.readUInt32LE(0)
  };

  if (result.error > 0) {
    result.error = getNameFromValue(config.ERRORS, data.readUInt32LE(0));
  }

  return result;
}

/**
 * 
 * @param {*} data 
 */
function analyzePlcNotification(data) {
  
  const result = {
    length : data.readUInt32LE(0),
    stamps : new Array(data.readUInt32LE(4))
  };
  
  let pos = 8;
  for (let i = 0; i < result.stamps.length; i++) {
    result.stamps[i] = {
      timestamp : data.readBigUInt64LE(0), //data.slice(pos, pos+7),
      samples   : new Array(data.readUInt32LE(pos + 8))
    };

    pos += 8;
    for (let s = 0; s < result.stamps[i].samples; s++) {
      result.stamps[i].samples[s] = {
        handle : data.readUInt32LE(pos + 0),
        size   : data.readUInt32LE(pos + 4),
        data   : data.slice(pos + 8, pos + data.readUInt32LE(pos + 4))
      };
      pos += 8 + data.readUInt32LE(pos + 4);
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
  let result = {};

  try {
    result = Object.entries(object).find(i => i[0] == value)[1];
  }
  catch (exc) {
    console.log(exc);
  }

  return result;

}
function getValueFromName(object, name) {
  const allValues = Object.getOwnPropertyDescriptors(object);
  let result = null;

  try {
    result =  allValues[name].value;
  }
  catch (exc) {
    console.log(exc);
  }
  //finally {
  return result;
  //}
}
function analyzePlcValue(symbol, data) {
  let result = null;
  switch (symbol.kind) {
    case 'BOOL' :
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
  analyzeHeader,
  analyzePlcInfo,
  analyzePlcState,
  analyzePlcUploadInfo,
  analyzePlcSymbols,
  analyzePlcDataTypes,
  analyzePlcSymbolHandles,

  analyzePlcRead,
  analyzePlcReadWrite,
  analyzePlcWrite,

  analyzeAddPlcNotification,
  analyzePlcNotification,
  analyzeDelPlcNotification
};