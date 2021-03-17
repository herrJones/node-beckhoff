'use strict';

const config = require('./const');
const Buffer = require('safe-buffer').Buffer;

const debugVerbose = require('debug')('bkhf-prep:details');
//const debugError = require('debug')('bkhf-prep:error');

/**
 * Prepare binary header to transmit
 * speed-gain by storing binary versions of source and destination
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} header-data to transmit
 */
function prepareCommandHeader(options, settings) {
  
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
 * prepare command 0x02 - Read
 * 
 * @param {Object} options 
 * @param {Object} settings 
 * @param {string} kind 
 * @returns {Buffer} data to transmit
 */
function prepareCommandRead(options, settings, kind) {
  const msgData = Buffer.alloc(12);

  if (settings.develop.verbose) {
    debugVerbose('commandRead (' + kind + '):' + JSON.stringify(options.request));
  }

  switch (kind) {
    case 'getvalue' :
      msgData.writeUInt32LE(options.symbols[0].group  || config.ADSIGRP.RW_SYMVAL_BYHANDLE, 0);
      msgData.writeUInt32LE(options.symbols[0].offset || options.request[0].handle ,        4);
      msgData.writeUInt32LE(options.symbols[0].size,                                        8);
      break;

    default:
      msgData.writeUInt32LE(options.request.group,  0);
      msgData.writeUInt32LE(options.request.offset, 4);
      msgData.writeUInt32LE(options.request.length, 8);
      break;
  }

  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);

  return Buffer.concat([headerData, msgData]);
}

/**
 * prepare  command 0x03 - Write
 * 
 * @param {Object} options 
 * @param {Object} settings 
 * @param {string} kind 
 * @returns {Buffer} data to transmit
 */
function prepareCommandWrite(options, settings, kind) {
  let msgData = null;
  let symData = null;

  if (settings.develop.verbose) {
    debugVerbose('commandWrite (' + kind + '):' + JSON.stringify(options.request));
  }

  switch (kind) {
    case 'setvalue':
      msgData = Buffer.alloc(12);

      msgData.writeUInt32LE(options.symbols[0].group  || config.ADSIGRP.RW_SYMVAL_BYHANDLE, 0);
      msgData.writeUInt32LE(options.symbols[0].offset || options.symbols[0].handle, 4);
      msgData.writeUInt32LE(options.symbols[0].size,   8);

      symData = config.createWriteValue(options.symbols[0]);
      msgData = Buffer.concat([msgData, symData]);
      break;

    case 'relhandle':
      msgData = Buffer.alloc(16);
      msgData.writeUInt32LE(options.symbols[0].group,   0);
      msgData.writeUInt32LE(options.symbols[0].offset,  4);
      msgData.writeUInt32LE(options.symbols[0].length,  8);
      msgData.writeUInt32LE(options.symbols[0].handle, 12);
      break;

    default:
      break;
  }

  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);

  return Buffer.concat([headerData, msgData]);
}

/**
 * prepare command 0x05 - WriteControl
 * 
 * @param {*} options 
 * @param {*} settings 
 */
function prepareCommandWriteControl(options, settings) {
  let msgData = null;
  const allProps = Object.getOwnPropertyNames(options.symbols);
  if (allProps.findIndex(i => i == 'data') >= 0) {
    msgData = Buffer.alloc(8 + options.symbols.data.length).fill(0);
  } else {
    msgData = Buffer.alloc(8).fill(0);
    options.symbols.data = Buffer.alloc(0);
  }

  if (settings.develop.verbose) {
    debugVerbose('writeControl (' + options.symbols.adsState + '):' + JSON.stringify(options.request));
  }

  //TODO : change ADS port in case of switch to config mode

  msgData.writeUInt16LE(config.getValueFromName(config.ADSSTATE, options.symbols.adsState), 0);
  msgData.writeUInt16LE(options.symbols.devState   , 2);
  msgData.writeUInt32LE(options.symbols.data.length, 4);

  if (options.symbols.data.length > 0) {
    msgData.copy(options.symbols.data, 8);
  }
  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);
  
  return Buffer.concat([headerData, msgData]);
}

/**
 * prepare command 0x06 - Add Device Notification
 * 
 * @param {*} options 
 * @param {*} settings 
 * @returns {Buffer} data to transmit
 */
function prepareCommandAddNotification(options, settings) {
  const msgData = Buffer.alloc(40).fill(0);

  //msgData.writeUInt32LE(options.symbols[0].group,   0);
  //msgData.writeUInt32LE(options.symbols[0].offset,  4);
  msgData.writeUInt32LE(config.ADSIGRP.RW_SYMVAL_BYHANDLE,  0);
  msgData.writeUInt32LE(options.symbols[0].handle,          4);
  msgData.writeUInt32LE(options.symbols[0].size,            8);
  msgData.writeUInt32LE(options.symbols[0].mode,           12);
  msgData.writeUInt32LE(options.symbols[0].delay * 10000,  16);
  msgData.writeUInt32LE(options.symbols[0].cycle * 10000,  20);

  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);
  
  return Buffer.concat([headerData, msgData]);
}

/**
 * prepare command 0x07 - Delete Device Notification
 * 
 * @param {*} options 
 * @param {*} settings 
 * @returns {Buffer} data to transmit
 */
function prepareCommandDelNotification(options, settings) {
  const msgData = Buffer.alloc(4);
  
  msgData.writeUInt32LE(options.symbols.notify, 0);

  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);
  
  return Buffer.concat([headerData, msgData]);
}

/**
 * prepare command 0x09 - Read Write
 * @param {Object} options 
 * @param {Object} settings 
 * @param {string} kind 
 * @returns {Buffer} data to transmit
 */
function prepareCommandReadWrite(options, settings, kind) {
  const msgData = Buffer.alloc(16 + options.request.wLength).fill(0);
  let offset = 0;

  if (settings.develop.verbose) {
    debugVerbose('commandReadWrite (' + kind + '):' + JSON.stringify(options.request) + ' - buflen : ' + msgData.length);
  }
  
  msgData.writeUInt32LE(options.request.group,   offset +  0);
  msgData.writeUInt32LE(options.request.offset,  offset +  4);
  msgData.writeUInt32LE(options.request.rLength, offset +  8);
  msgData.writeUInt32LE(options.request.wLength, offset + 12);

  offset = 16;
  switch (kind) {
    case 'getvalue':
      for (let i=0; i<options.symbols.length; i++) {
        
        //console.log('symbol[' + i + '].offset = ' + offset)
        msgData.writeUInt32LE(options.symbols[i].group  || config.ADSIGRP.RW_SYMVAL_BYHANDLE, offset + 0);
        msgData.writeUInt32LE(options.symbols[i].offset || options.symbols[i].handle ,        offset + 4);
        msgData.writeUInt32LE(options.symbols[i].size,                                        offset + 8);
       
        offset += 12;
      }
      break;

    case 'setvalue':
      for (let i=0; i<options.symbols.length; i++) {
        
        msgData.writeUInt32LE(options.symbols[i].group  || config.ADSIGRP.RW_SYMVAL_BYHANDLE,  offset + 0);
        msgData.writeUInt32LE(options.symbols[i].offset || options.symbols[i].handle,          offset + 4);
        msgData.writeUInt32LE(options.symbols[i].size,                                         offset + 8);
       
        offset += 12;
      }

      //offset -= 12;
      for (let i=0; i<options.symbols.length; i++) {
        const value = config.createWriteValue(options.symbols[i]);

        value.copy(msgData, offset);

        offset += options.symbols[i].size;
        
      }
      break;

    case 'gethandle':
      options.request.buffer.copy(msgData, 16);
      break;

    case 'relhandle':
      options.request.buffer.copy(msgData, 16);
      break;

    default:
      break;
  }

  options.len = msgData.length;
  const headerData = prepareCommandHeader(options, settings);

  return Buffer.concat([headerData, msgData]);
}

/**
 * 
 * @param {Object} options 
 */
function prepareGetHandleRequest(options) {
  let rwBuffer = null;

  if (options.symbols.length == 1) {
    rwBuffer = Buffer.from(options.symbols[0].name);

    options.request.group   = config.ADSIGRP.GET_SYMHANDLE_BYNAME;
    options.request.offset  = 0;
    options.request.rLength = 4;
  } else {
    let symNames = Buffer.alloc(0);
    rwBuffer = Buffer.alloc(options.symbols.length * 16);

    options.request.group   = config.ADSIGRP.SUMUP_READWRITE;
    options.request.offset  = options.symbols.length;
    options.request.rLength = options.symbols.length * 16;

    for (let i = 0; i < options.symbols.length; i++) {
      const index = 16*i;
      const symName = Buffer.from(options.symbols[i].name);
      
      rwBuffer.writeUInt32LE(config.ADSIGRP.GET_SYMHANDLE_BYNAME, index + 0);
      rwBuffer.writeUInt32LE(0x00000000, index + 4);
      rwBuffer.writeUInt32LE(0x00000004, index + 8);
      rwBuffer.writeUInt32LE(symName.length + 1, index + 12);

      const symBufLen = symNames.length + symName.length + 1;
      symNames = Buffer.concat([symNames, symName], symBufLen);
    }
    rwBuffer = Buffer.concat([rwBuffer, symNames]);
  }

  options.cmd = config.ADSCMD.ReadWrite;
  options.len = 16 + rwBuffer.length;

  options.request.wLength = rwBuffer.length;
  options.request.buffer = rwBuffer;
}

/**
 * 
 * @param {Object} options 
 */
function prepareDelHandleRequest(options) {
  let rwBuffer = null;

  if (options.symbols.length == 1) {
    options.request.group  = config.ADSIGRP.RELEASE_SYMHANDLE;
    options.request.offset = 0;
    options.request.length = 4;
    options.request.handle = options.symbols[0].handle; 

  } else if (options.symbols.length  > 1) {
    options.request.group   = config.ADSIGRP.SUMUP_WRITE;
    options.request.offset  = options.symbols.length;
    options.request.rLength = options.symbols.length * 4;
    options.request.wLength = options.symbols.length * 16;
    
    rwBuffer = Buffer.alloc(16 * options.symbols.length);
    
    let offset = 0;
    for (let i = 0; i < options.symbols.length; i++) {
      
      rwBuffer.writeUInt32LE(config.ADSIGRP.RELEASE_SYMHANDLE, offset + 0);
      rwBuffer.writeUInt32LE(0                               , offset + 4);
      rwBuffer.writeUInt32LE(4                               , offset + 8);

      offset += 12;
    }

    for (let i = 0; i < options.symbols.length; i++) {
      rwBuffer.writeUInt32LE(options.symbols[i].handle, offset);

      offset += 4;
    }

    options.request.buffer = rwBuffer;
  }
}

/*
 * HELPER ROUTINES
 */


module.exports = {
  prepareCommandHeader,
  prepareCommandRead,
  prepareCommandWrite,
  prepareCommandWriteControl,
  prepareCommandAddNotification,
  prepareCommandDelNotification,
  prepareCommandReadWrite,

  prepareGetHandleRequest,
  prepareDelHandleRequest
};