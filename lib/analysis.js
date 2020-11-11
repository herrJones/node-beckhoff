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
    //header   : analyzeHeader(header, settings),
    error    : getValueFromName(config.ERRORS, data.readUInt32LE(0)),
    adsState : getNameFromValue(config.ADSSTATE, data.readUInt16LE(4)), //,message.readUInt16LE(4)
    devState : data.readUInt16LE(6)
  };

  //if (settings.verbose) console.log('plcState: ' + JSON.stringify(result));

  return result;
}

/**
 * analyze the data stream with PLC symbols
 * 
 * @param {Buffer} data 
 * @param {object} settings 
 */
function analyzePlcSymbols(data) {

  const symbols = [];

  const result = {
    buffer : data
  };

  let symPos = 0;

  while (symPos < result.buffer.length) {
    const curLen = result.buffer.readUInt32LE(symPos);

    const curSym = {
      //symPos : symPos,
      //curLen : curLen,
      idxGroup  : result.buffer.readUInt32LE(symPos + 4),
      idxOffset : result.buffer.readUInt32LE(symPos + 8),
      size      : result.buffer.readUInt32LE(symPos + 12),
      name      : result.buffer.readUInt16LE(symPos + 24) + 1,
      kind      : result.buffer.readUInt16LE(symPos + 26) + 1,
      comment   : result.buffer.readUInt16LE(symPos + 28) + 1,
      handle    : -1
    };

    let tmpPos = symPos + 30;
    let value = result.buffer.toString('binary', tmpPos, getStringEnd(tmpPos, result.buffer.slice(tmpPos, tmpPos + curSym.name)));
    tmpPos += curSym.name;
    curSym.name = value.toUpperCase();

    value = result.buffer.toString('binary', tmpPos, getStringEnd(tmpPos, result.buffer.slice(tmpPos, tmpPos + curSym.kind)));
    tmpPos += curSym.kind;
    curSym.kind = value;

    value = result.buffer.toString('binary', tmpPos, getStringEnd(tmpPos, result.buffer.slice(tmpPos, tmpPos + curSym.comment)));
    tmpPos += curSym.comment;
    curSym.comment = value;

    if ((!curSym.name.startsWith('Global_Variables')) &&
        (!curSym.name.startsWith('Constants')) &&
        (!curSym.name.startsWith('TwinCAT_')) && 
        (curSym.kind != 'OTCID')) {

      symbols.push(curSym);
      //db.run(insStmt, [curSym.idxGroup, curSym.idxOffset, curSym.size, curSym.name, curSym.kind, curSym.comment], (err) => {
      //  if (err) {
      //    console.log('error inserting data:' + err);
      //  }
      //});
    }
    symPos += curLen;
  }

  return symbols;

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
  //const result = symbols;

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
  /*
  if (settings.verbose) {    
    result.error = getValueFromName(config.ERRORS, message.readUInt32LE(0));
    console.log('PlcRead: ' + JSON.stringify(result));
  }
  */
  //if (symbols !== null) {
  if (symbols) {
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
 * @param {*} settings 
 */
function analyzePlcReadWrite(data, symbols) {

  const result = {
    error  : data.readUInt32LE(0),
    length : data.readUInt32LE(4),
    buffer : data.slice(8)
  };

  //console.log('PlcReadWrite: ' + JSON.stringify(result));

  if (symbols) {
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
 * @param {*} settings 
 */
function analyzePlcWrite(data, symbols) {

  const result = {
    error  : getNameFromValue(config.ERRORS, data.readUInt32LE(0)) //message.readUInt32LE(0),
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
  //finally {
  return result;
  //}

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
  analyzePlcSymbols,
  analyzePlcSymbolHandles,

  analyzePlcRead,
  analyzePlcReadWrite,
  analyzePlcWrite
};