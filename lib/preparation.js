'use strict';

const config = require('./const');
const Buffer = require('safe-buffer').Buffer;

/**
 * Prepare binary header to transmit
 * speed-gain by storing binary versions of source and destination
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} header-data to transmit
 */
function prepareHeader(options, settings) {
  
  // check whether we have a prepared statement
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
  const tcpHeader = Buffer.alloc(6).fill(0);
  tcpHeader.writeUInt32LE(32 + options.len, 2);   // TCP header - length

  const amsHeader = Buffer.concat([settings.bytes.remote, settings.bytes.local], 32);

  amsHeader.writeUInt16LE(options.cmd, 16);       // AMS header - command ID
  amsHeader.writeUInt16LE(4, 18);                 // AMS header - flags : Request + ADS command (TCP)
  amsHeader.writeUInt32LE(options.len, 20);       // AMS header - data length
  amsHeader.writeUInt32LE(0, 24);                 // AMS header - error code
  amsHeader.writeUInt32LE(options.invoke, 28);    // AMS header - invoke ID

  return Buffer.concat([tcpHeader, amsHeader]);
}

/**
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcRead(options, settings) { 
  const msgData = Buffer.alloc(12 * options.request.length).fill(0);
  let result = null;

  let offset = 0;
  msgData.writeUInt32LE(options.request[0].idxGroup,  offset + 0);
  msgData.writeUInt32LE(options.request[0].idxOffset, offset + 4);
  msgData.writeUInt32LE(options.request[0].length,    offset + 8);

  let symLen = 0;
  // are we dealing with symbol read request?
  if (options.request[0].hasOwnProperty('handle')) {
    
    for (let i=0; i<options.request.length; i++) {
      offset = i * 12;

      msgData.writeUInt32LE(options.request[i].idxGroup || config.ADSIGRP.RW_SYMVAL_BYHANDLE, offset + 0);
      msgData.writeUInt32LE(options.request[i].handle, offset + 4);
      msgData.writeUInt32LE(options.request[i].size,   offset + 8);
      
      symLen += options.request[i].size + 4;
      
    }
  }

  if (options.request.length == 1) {
    options.len = msgData.length;
    const headerData = prepareHeader(options, settings);
    result = Buffer.concat([headerData, msgData]);
  } else {
    const tmpOptions = {
      cmd    : config.ADSCMD.ReadWrite,
      len    : 16 + msgData.length,
      invoke : options.invoke,
      request : {
        idxGroup  : config.ADSIGRP.SUMUP_READ,
        idxOffset : options.request.length,
        rLength   : symLen,
        wLength   : msgData.length,
        buffer    : msgData
      }
    };

    result = preparePlcWriteRead(tmpOptions, settings, true);
  }

  return result;
}

/**
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcWrite(options, settings) {
  const msgData = Buffer.alloc(12).fill(0);
  let symData = Buffer.alloc(0);

  //  if (options.request[0].hasOwnProperty("handle")) {
  if (options.request[0].handle != -1) {
    // in case we have a valid read-request!!
    msgData.writeUInt32LE(options.request[0].idxGroup|| config.ADSIGRP.RW_SYMVAL_BYHANDLE, 0);
    msgData.writeUInt32LE(options.request[0].handle, 4);
    msgData.writeUInt32LE(options.request[0].size,   8);

    symData = createPlcValue(options.request[0]);
  }

  options.len = msgData.length + symData.length;
  const headerData = prepareHeader(options, settings);

  return Buffer.concat([headerData, msgData, symData]);
}

/**
 * 
 * @param {object} options 
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcWriteRead(options, settings, header = true) {
  const msgData = Buffer.alloc(16 + options.request.wLength);
  let headerData = Buffer.alloc(0);

  msgData.writeUInt32LE(options.request.idxGroup,   0);
  msgData.writeUInt32LE(options.request.idxOffset,  4);
  msgData.writeUInt32LE(options.request.rLength,    8);
  msgData.writeUInt32LE(options.request.wLength,   12);
  options.request.buffer.copy(msgData, 16);

  // when preparing multiple statements, adding the header is not necessary
  if (header) {
    options.len = msgData.length;
    headerData = prepareHeader(options, settings);
  }

  return Buffer.concat([headerData, msgData]);
}

/**
 * 
 * @param {*} options 
 * @param {*} settings 
 * @returns {Buffer} data to transmit
 */
function preparePlcSymbolHandle(options, settings) {
  let result = Buffer.alloc(0);
  let request = Buffer.alloc(0);
  //const toFetch = [];

  if (options.request.length == 1) {
    options.cmd = config.ADSCMD.Read;
  } else {
    options.cmd = config.ADSCMD.ReadWrite;
  }

  let rwBuffer = null;
  let rwData = null;
  let rwLength = null;
  let symNames = null;
  switch (options.request.length) {
    case 0:
      result = null;
      break;
    case 1:
      rwBuffer = Buffer.from(options.request[0].name);
      rwData = {
        cmd     : config.ADSCMD.ReadWrite,
        len     : 16 + rwBuffer.length,
        invoke  : options.invoke,
        request : {
          idxGroup  : config.ADSIGRP.GET_SYMHANDLE_BYNAME,
          idxOffset : 0x00000000,
          rLength   : 0x00000004,
          wLength   : rwBuffer.length, 
          buffer    : rwBuffer
        }
      };
      request = preparePlcWriteRead(rwData, settings);
      result = Buffer.concat([result, request]);
      break;
    default:
      rwLength = options.request.length * 16;
      //for (let i=0; i<toFetch.length; i++) {
      //  rwLength += 17 + toFetch[i].length;
      //}
      
      rwBuffer = Buffer.alloc(rwLength);
      symNames = Buffer.alloc(0);
      for (let i=0; i<options.request.length; i++) {
        const index = 16*i;
        const symName = Buffer.from(options.request[i].name);
        
        rwBuffer.writeUInt32LE(config.ADSIGRP.GET_SYMHANDLE_BYNAME, index + 0);
        rwBuffer.writeUInt32LE(0x00000000, index + 4);
        rwBuffer.writeUInt32LE(0x00000004, index + 8);
        rwBuffer.writeUInt32LE(symName.length + 1, index + 12);

        const symBufLen = symNames.length + symName.length + 1;
        symNames = Buffer.concat([symNames, symName], symBufLen);
      }

      rwBuffer = Buffer.concat([rwBuffer, symNames]);

      rwData = {
        cmd     : config.ADSCMD.ReadWrite,
        len     : 16 + rwBuffer,
        invoke  : options.invoke,
        request : {
          idxGroup  : config.ADSIGRP.SUMUP_READWRITE,
          idxOffset : options.request.length,
          rLength   : options.request.length * 16,
          wLength   : rwBuffer.length, 
          buffer    : rwBuffer
        }
      };
      request = preparePlcWriteRead(rwData, settings);
      result = Buffer.concat([result, request]);
  }
  
  return result;
}

/**
 * 
 * @param {*} options 
 * @param {*} settings 
 */
function preparePlcHandleRelease(options, settings) {
  let msgData = null;
  let headerData = null;
  let offset = 0;

  if (options.request.length == 1) {
    msgData = Buffer.alloc(16);
    options.cmd = config.ADSCMD.Write;

    msgData.writeUInt32LE(options.request[0].idxGroup,  offset +  0);
    msgData.writeUInt32LE(options.request[0].idxOffset, offset +  4);
    msgData.writeUInt32LE(options.request[0].length,    offset +  8);
    msgData.writeUInt32LE(options.request[0].handle,    offset + 12);
  } else {
    msgData = Buffer.alloc(16 + options.request.length * 16);
    options.cmd = config.ADSCMD.ReadWrite;

    msgData.writeUInt32LE(config.ADSIGRP.SUMUP_WRITE,  offset +  0);
    msgData.writeUInt32LE(options.request.length,      offset +  4);
    msgData.writeUInt32LE(options.request.length * 4,  offset +  8);
    msgData.writeUInt32LE(options.request.length * 16, offset + 12);

    for (let i = 0; i < options.request.length; i++) {
      offset += 16;

      msgData.writeUInt32LE(options.request[i].idxGroup,  offset +  0);
      msgData.writeUInt32LE(options.request[i].idxOffset, offset +  4);
      msgData.writeUInt32LE(options.request[i].length,    offset +  8);
      msgData.writeUInt32LE(options.request[i].handle,    offset + 12);
    }
  }
  //options.request.buffer.copy(msgData, 16);
  
  options.len = msgData.length;
  headerData = prepareHeader(options, settings);
  
  return Buffer.concat([headerData, msgData]);
}

/*
 * HELPER ROUTINES
 */
function createPlcValue(symbol) {
  const result = Buffer.alloc(symbol.size).fill(0);
  let tmpBuf = null;

  switch(symbol.kind) {
    case 'BOOL':
    case 'BYTE':
    case 'USINT':
      result.writeUInt8(symbol.value, 0);
      break;
    case 'SINT':
      result.writeInt8(symbol.value, 0);
      break;
    case 'UINT':
    case 'WORD':
      result.writeUInt16LE(symbol.value, 0);
      break;
    case 'INT':
      result.writeInt16LE(symbol.value, 0);
      break;
    case 'DWORD':
    case 'UDINT':
      result.writeUInt32LE(symbol.value, 0);
      break;
    case 'DINT':
      result.writeInt32LE(symbol.value, 0);
      break;
    case 'REAL':
      result.writeFloatLE(symbol.value, 0);
      break;
    case 'LREAL':
      result.writeDoubleLE(symbol.value, 0);
      break;
    case 'STRING':
      tmpBuf = Buffer.from(symbol.value.toString().slice(0,symbol.value.length-1) + '\0', 'binary');
      tmpBuf.copy(result, 0);
      break;
  }

  return result;
}

module.exports = {
  prepareHeader,
  preparePlcRead,
  preparePlcWrite,
  preparePlcWriteRead,

  preparePlcSymbolHandle,
  preparePlcHandleRelease
};