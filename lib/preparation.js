const Buffer = require('safe-buffer').Buffer;
//const loki = require('lokijs');

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

/**
 * Prepare binary header to transmit
 * speed-gain by storing binary versions of source and destination
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} header-data to transmit
 */
function prepareHeader(options, settings) {
  
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

/**
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcRead(options, settings) { 

  let msgData = Buffer.alloc(12).fill(0);

  msgData.writeUInt32LE(options.request[0].idxGroup,  0);
  msgData.writeUInt32LE(options.request[0].idxOffset, 4);
  msgData.writeUInt32LE(options.request[0].length,    8);

  if (options.request[0].hasOwnProperty("handle")) {
    if (options.request[0].handle != -1) {
      // in case we have a valid read-request!!
      msgData.writeUInt32LE(options.request[0].idxGroup|| ADSIGRP.RW_SYMVAL_BYHANDLE, 0);
      msgData.writeUInt32LE(options.request[0].handle, 4);
      msgData.writeUInt32LE(options.request[0].size,   8);
    }
  }

  options.len = msgData.length;
  let headerData = prepareHeader(options, settings);

  return Buffer.concat([headerData, msgData]);
}

/**
 * 
 * @param {object} options
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcWrite(options, settings) {
  let msgData = Buffer.alloc(12).fill(0);
  let symData = Buffer.alloc(0);

//  if (options.request[0].hasOwnProperty("handle")) {
  if (options.request[0].handle != -1) {
    // in case we have a valid read-request!!
    msgData.writeUInt32LE(options.request[0].idxGroup|| ADSIGRP.RW_SYMVAL_BYHANDLE, 0);
    msgData.writeUInt32LE(options.request[0].handle, 4);
    msgData.writeUInt32LE(options.request[0].size,   8);

    symData = createPlcValue(options.request[0]);
  }

  options.len = msgData.length + symData.length;
  let headerData = prepareHeader(options, settings);

  return Buffer.concat([headerData, msgData, symData]);
}

/**
 * 
 * @param {object} options 
 * @param {object} settings 
 * @returns {Buffer} data to transmit 
 */
function preparePlcWriteRead(options, settings) {
  let msgData = Buffer.alloc(16 + options.request.wLength);

  msgData.writeInt32LE(options.request.idxGroup,  0);
  msgData.writeInt32LE(options.request.idxOffset, 4);
  msgData.writeInt32LE(options.request.rLength,   8);
  msgData.writeInt32LE(options.request.wLength,   12);
  options.request.buffer.copy(msgData, 16);

  options.len = msgData.length;
  let headerData = prepareHeader(options, settings);

  return Buffer.concat([headerData, msgData]);
}

/**
 * 
 * @param {*} symbols 
 * @param {*} options 
 * @param {*} settings 
 */
function preparePlcSymbolHandle(symbols, options, settings) {
  let result = null;
  let request = null;

  if (Array.isArray(options.request)) {
    options.cmd = ADSCMD.ReadWrite;
  } else {
    options.cmd = ADSCMD.Read;
    options.request = new Array(options.request);
  }

  for (let i = 0; i < options.request.length; i++) {
    let element = options.request[i];
    let dbSym = symbols.find({ 'name' : { '$eq' : element.name.toUpperCase() }});

    try {
      element.group  = dbSym[0].idxGroup;
      element.offset = dbSym[0].idxOffset;
      element.kind   = dbSym[0].kind;
      element.size   = dbSym[0].size;
      element.handle = dbSym[0].handle;
    }
    catch (exc) {
      console.log(element.name + 'is not known');
      element.handle = -1;

      let newSym = {
        name : element.name,
        idxGroup : -1,
        idxOffset : -1,
        kind : -1,
        size : -1,
        handle : -1
      }
      symbols.insertOne(newSym);
    }

    if (element.handle == -1) {
      let rwBuffer = Buffer.from(element.name);
      let rwData = {
        cmd     : ADSCMD.ReadWrite,
        len     : 0,
        invoke  : options.invoke,
        request : {
          idxGroup  : ADSIGRP.GET_SYMHANDLE_BYNAME,
          idxOffset : 0x00000000,
          rLength   : 4,
          wLength   : rwBuffer.length, 
          buffer    : rwBuffer
        }
      }
      request = preparePlcWriteRead(rwData, settings);
      break;   // because I cannot handle multi-symbol requests for now...
    }
  }

  if (request !== null) {
    // temporary solution: should become concatenate of all requests
    result = request;
  }

  return result;
}

/*
 * HELPER ROUTINES
 */
function createPlcValue(symbol) {
  let result = new Buffer(symbol.size).fill(0);

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
      var tmpBuf = Buffer.from(value.toString().slice(0,symbol.value.length-1) + '\0', 'binary')
      tmpBuf.copy(result, 0)
      break;
  }

  return result;
}

module.exports = {
  prepareHeader,
  preparePlcRead,
  preparePlcWrite,
  preparePlcWriteRead,

  preparePlcSymbolHandle
}