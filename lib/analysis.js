'use strict';

const config = require('./const'); 


function analyzeHeader(data, settings) {
  let result = null;

  if (settings.verbose) {
    result = {
      //target  : data.slice(0,6),
      //trgPort : data.readUInt16LE(6),
      //source  : data.slice(8,14),
      //srcPort : data.readUInt16LE(14),
      command : getNameFromValue(config.ADSCMD, data.readUInt16LE(16)),  //  data.readUInt16LE(16),
      state   : data.readUInt16LE(18),
      length  : data.readUInt32LE(20),
      error   : data.readUInt32LE(24).toString() + ' - ' + getValueFromName(config.ERRORS, data.readUInt32LE(24)),
      invoke  : data.readUInt32LE(28)
    };
  } else {
    result = {
      command : data.readUInt16LE(16), // getNameFromValue(ADSCMD, data.readUInt16LE(16)),
      state   : data.readUInt16LE(18),
      length  : data.readUInt32LE(20),
      error   : data.readUInt32LE(24), // getValueFromName(ERRORS, data.readUInt32LE(24)),
      invoke  : data.readUInt32LE(28)
    }

    if (result.error > 0) {
      result.error = data.readUInt32LE(24).toString() + " - " + getValueFromName(config.ERRORS, data.readUInt32LE(24));
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
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header   : analyzeHeader(header, settings),
    error    : getValueFromName(config.ERRORS, message.readUInt32LE(0)),
    major    : message.readUInt8(4),
    minor    : message.readUInt8(5),
    build    : message.readUInt16LE(6),
    device   : message.toString('binary',8, getStringEnd(8, data.slice(8, 23)))
  };

  if (settings.verbose) console.log('plcInfo: ' + JSON.stringify(result));

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcState(data, settings) {
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header   : analyzeHeader(header, settings),
    error    : getValueFromName(config.ERRORS, message.readUInt32LE(0)),
    adsState : getNameFromValue(config.ADSSTATE, message.readUInt16LE(4)), //,message.readUInt16LE(4)
    devState : message.readUInt16LE(6)
  };

  if (settings.verbose) console.log('plcState: ' + JSON.stringify(result));

  return result;
}

/**
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcSymbols(data, symbols, settings) {
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  };

  if (settings.verbose)  {
    result.error = getValueFromName(config.ERRORS, message.readUInt32LE(0));

    result.data = message.slice(8, 88);
    console.log('PlcSymbols: ' + JSON.stringify(result));
    result.data = message.slice(8);
  }

  let symPos = 0;

  while (symPos < result.data.length) {
    const curLen = result.data.readUInt32LE(symPos);

    const curSym = {
      //symPos : symPos,
      //curLen : curLen,
      idxGroup  : result.data.readUInt32LE(symPos + 4),
      idxOffset : result.data.readUInt32LE(symPos + 8),
      size      : result.data.readUInt32LE(symPos + 12),
      name      : result.data.readUInt16LE(symPos + 24) + 1,
      kind      : result.data.readUInt16LE(symPos + 26) + 1,
      comment   : result.data.readUInt16LE(symPos + 28) + 1,
      handle    : -1
    };

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
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  };

  if (settings.verbose) {
    
    result.error = getValueFromName(config.ERRORS, message.readUInt32LE(0));

    console.log('PlcRead: ' + JSON.stringify(result));
  
  };

  if (symbols !== null) {
    result.symbols = [];

    const offset = 0;
    let dataOffset = symbols.length * 4;
    for (let i=0; i< symbols.length; i++) {
      //let offset = i*4;

      const tmpSymbol = {
        name  : symbols[i].name,
        kind  : symbols[i].kind
      };

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
   
  }

  return result;
}

/**
 * 
 * @param {*} data 
 * @param {*} settings 
 */
function analyzePlcReadWrite(data, settings) {
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header : analyzeHeader(header, settings),
    error  : message.readUInt32LE(0),
    length : message.readUInt32LE(4),
    data   : message.slice(8)
  };

  if (settings.verbose) {
    result.error = getValueFromName(config.ERRORS, message.readUInt32LE(0));
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
  const header = data.slice(0,32);
  const message = data.slice(32);

  const result = {
    header : analyzeHeader(header, settings),
    error  : getNameFromValue(config.ERRORS, message.readUInt32LE(0)) //message.readUInt32LE(0),
    //length : message.readUInt32LE(4),
    //data   : message.slice(8)
  };

  if (symbols !== null) {
    result.symbols = {
      name  : symbols[0].name,
      kind  : symbols[0].kind,
      value : symbols[0].value
    };
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
  const allNames = Object.getOwnPropertyNames(object);
  let result = {};

  try {
    result =  allNames[value];
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    return result;
  }

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
  finally {
    return result;
  }
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
  analyzePlcInfo,
  analyzePlcState,
  analyzePlcSymbols,

  analyzePlcRead,
  analyzePlcReadWrite,
  analyzePlcWrite
}