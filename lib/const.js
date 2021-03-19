/* eslint-disable indent */
'use strict';

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
};
/*
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
};
*/
const ADSSTATE = {
  0  : 'INVALID',
  1  : 'IDLE',
  2  : 'RESET',
  3  : 'INIT',
  4  : 'START',
  5  : 'RUN',
  6  : 'STOP',
  7  : 'SAVECFG',
  8  : 'LOADCFG',
  9  : 'POWERFAILURE',
  10 : 'POWERGOOD',
  11 : 'ERROR',
  12 : 'SHUTDOWN',
  13 : 'SUSPEND',
  14 : 'RESUME',
  15 : 'CONFIG',
  16 : 'RECONFIG',
  17 : 'STOPPING'
};


const ERRORS = {
  0   : 'OK',
  1   : 'Internal error',
  2   : 'No Rtime',
  3   : 'Allocation locked memory error',
  4   : 'Insert mailbox error',
  5   : 'Wrong receive HMSG',
  6   : 'target port not found',
  7   : 'target machine not found',
  8   : 'Unknown command ID',
  9   : 'Bad task ID',
  10  : 'No IO',
  11  : 'Unknown AMS command',
  12  : 'Win 32 error',
  13  : 'Port not connected',
  14  : 'Invalid AMS length',
  15  : 'Invalid AMS Net ID',
  16  : 'Low Installation level',
  17  : 'No debug available',
  18  : 'Port disabled',
  19  : 'Port already connected',
  20  : 'AMS Sync Win32 error',
  21  : 'AMS Sync Timeout',
  22  : 'AMS Sync AMS error',
  23  : 'AMS Sync no index map',
  24  : 'Invalid AMS port',
  25  : 'No memory',
  26  : 'TCP send error',
  27  : 'Host unreachable',
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
};

// ADS reserved index groups
const ADSIGRP = {
  SYMTAB:               0xF000,
  SYMNAME:              0xF001,
  SYMVAL:               0xF002,
  GET_SYMHANDLE_BYNAME: 0xF003,    // {TcAdsDef.h: ADSIGRP_SYM_HNDBYNAME}
  READ_SYMVAL_BYNAME:   0xF004,    // {TcAdsDef.h: ADSIGRP_SYM_VALBYNAME}
  RW_SYMVAL_BYHANDLE:   0xF005,    // {TcAdsDef.h: ADSIGRP_SYM_VALBYHND}
  RELEASE_SYMHANDLE:    0xF006,    // {TcAdsDef.h: ADSIGRP_SYM_RELEASEHND}
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
};

// ADS TRANSMISSION MODE for NOTIFICATIONS
const ADSNOTIFYMODE = {
  None: 0,
  ClientCycle: 1,
  ClientOnChange: 2,
  Cyclic: 3,
  OnChange: 4,
  CyclicInContext: 5,
  OnChangeInContext: 6
};

/**
 * ADS symbol flags
 * 
 * Source: TwinCAT.Ads.dll By Beckhoff
 */
 const ADS_SYMBOL_FLAGS = {
  0x0000 : 'None',
  0x0001 : 'Persistent',
  0x0002 : 'BitValue',
  0x0004 : 'ReferenceTo',
  0x0008 : 'TypeGuid',
  0x0010 : 'TComInterfacePtr',
  0x0020 : 'ReadOnly', 
  0x0040 : 'ItfMethodAccess', 
  0x0080 : 'MethodDeref', 
  0x0F00 : 'ContextMask', 
  0x1000 : 'Attributes',
  0x2000 : 'Static',
  0x4000 : 'InitOnReset',
  0x8000 : 'ExtendedFlags'

};

/**
 * ADS data type flags
 * 
 * Source: TwinCAT.Ads.dll By Beckhoff
 */
const ADS_DATA_TYPE_FLAGS = {
  0x00000000 : 'None',
  //ADSDATATYPEFLAG_DATATYPE
  0x00000001 : 'DataType',
  //ADSDATATYPEFLAG_DATAITEM
  0x00000002 : 'DataItem',
  //ADSDATATYPEFLAG_REFERENCETO
  0x00000004 : 'ReferenceTo',
  //ADSDATATYPEFLAG_METHODDEREF
  0x00000008 : 'MethodDeref',
  //ADSDATATYPEFLAG_OVERSAMPLE
  0x00000010 : 'Oversample', // 0x00000010
  //ADSDATATYPEFLAG_BITVALUES
  0x00000020 : 'BitValues', // 0x00000020
  //ADSDATATYPEFLAG_PROPITEM
  0x00000040 : 'PropItem', // 0x00000040
  //ADSDATATYPEFLAG_TYPEGUID
  0x00000080 : 'TypeGuid', // 0x00000080
  //ADSDATATYPEFLAG_PERSISTENT
  0x00000100 : 'Persistent', // 0x00000100
  //ADSDATATYPEFLAG_COPYMASK
  0x00000200 : 'CopyMask', // 0x00000200
  //ADSDATATYPEFLAG_TCCOMIFACEPTR
  0x00000400 : 'TComInterfacePtr', // 0x00000400
  //ADSDATATYPEFLAG_METHODINFOS
  0x00000800 : 'MethodInfos', // 0x00000800
  //ADSDATATYPEFLAG_ATTRIBUTES
  0x00001000 : 'Attributes', // 0x00001000
  //ADSDATATYPEFLAG_ENUMINFOS
  0x00002000 : 'EnumInfos', // 0x00002000
  //
  // this flag is set if the datatype is aligned (ADSDATATYPEFLAG_ALIGNED)
  // 
  0x00010000 : 'Aligned', // 0x00010000
  //
  // data item is static - do not use offs (ADSDATATYPEFLAG_STATIC)
  // 
  0x00020000 : 'Static', // 0x00020000
  //
  // means "ContainSpLevelss" for DATATYPES and "HasSpLevels" for DATAITEMS (ADSDATATYPEFLAG_SPLEVELS)
  // 
  0x00040000 : 'SpLevels', // 0x00040000
  //
  // do not restore persistent data (ADSDATATYPEFLAG_IGNOREPERSIST)
  // 
  0x00080000 : 'IgnorePersist', // 0x00080000
  //Any size array (ADSDATATYPEFLAG_ANYSIZEARRAY)
  // <remarks>
  // If the index is exeeded, a value access to this array will return <see cref="F:TwinCAT.Ads.AdsErrorCode.DeviceInvalidArrayIndex" />
  // </remarks>
  0x00100000 : 'AnySizeArray', // 0x00100000
  //
  //  data type used for persistent variables -&gt; should be saved with persistent data (ADSDATATYPEFLAG_PERSIST_DT,0x00200000)
  // 
  0x00200000 : 'PersistantDatatype', // 0x00200000
  //
  // Persistent data will not restored after reset (cold) (ADSDATATYPEFLAG_INITONRESET,0x00400000)
  // 
  0x00400000 : 'InitOnResult'

}

/**
 * ADS data types
 * 
 * Source: TwinCAT.Ads.dll By Beckhoff
 */
const ADS_DATA_TYPES = {
  0x00000000 : 'ADST_VOID',
  0x00000002 : 'ADST_INT16',
  0x00000003 : 'ADST_INT32',
  0x00000004 : 'ADST_REAL32',
  0x00000005 : 'ADST_REAL64',
  0x00000010 : 'ADST_INT8', 
  0x00000011 : 'ADST_UINT8', 
  0x00000012 : 'ADST_UINT16', 
  0x00000013 : 'ADST_UINT32', 
  0x00000014 : 'ADST_INT64', 
  0x00000015 : 'ADST_UINT64',
  0x0000001E : 'ADST_STRING', 
  0x0000001F : 'ADST_WSTRING', 
  0x00000020 : 'ADST_REAL80', 
  0x00000021 : 'ADST_BIT', 
  0x00000022 : 'ADST_MAXTYPES', 
  0x00000041 : 'ADST_BIGTYPE' 
};

/**
 * ADS RCP method parameter flags
 * 
 * Source: TwinCAT.Ads.dll By Beckhoff
 */
 const RPC_METHOD_PARAM_FLAGS = {
  0x0001 : 'In',
  0x0002 : 'Out',
  0x0004 : 'ByReference',
  0x0005 : 'MaskIn',
  0x0006 : 'MaskOut'
};

// --------------------- 
// -- HELPER ROUTINES --
// ---------------------
/*
 * create timestamp for logging on screen
 */
const getTimestamp = () => {
  const current_datetime = new Date();
              
  return current_datetime.getFullYear() + '-' 
      + (current_datetime.getMonth() + 1).toString().padStart(2, '0') + '-' 
      + current_datetime.getDate().toString().padStart(2, '0') + ' ' 
      + current_datetime.getHours().toString().padStart(2, '0') + ':' 
      + current_datetime.getMinutes().toString().padStart(2, '0') + ':' 
      + current_datetime.getSeconds().toString().padStart(2, '0');
};

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

function createWriteValue(symbol) {
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
function getStringEnd(start, data) {
  return data.indexOf(0) + start;
}
function getValueFromName(object, name) {
  const allValues = Object.getOwnPropertyDescriptors(object);
  let result = null;

  try {
    result =  allValues[name].value;
  }
  catch (exc) {
    debugError(exc);
  }
  //finally {
  return result;
  //}
}
function getNameFromValue(object, value) {
  let result = {};

  try {
    result = Object.entries(object).find(i => i[0] == value)[1];
  }
  catch (exc) {
    debugError(exc);
  }

  return result;

}
function getNameArrayFromValue(object, value) {
  const result = [];
  const keys = Object.keys(object)

  keys.forEach((key) => {
    if (((value & Number(key)) === Number(key))) {
      if ((value === 0) || (Number(key) !== 0)) {
        result.push(object[key]);
      }
      
    }
  })
  //ForEach (key in keys) {
  //  if ((value & object[key]) === object[key]) {
  //    if (value === 0 || object[item] !== 0) 
  //      result.push(item);
  //  }
  //}
      
  return result;
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
  ADSCMD,
  ADSSTATE,
  ADSIGRP,
  ERRORS,
  ADSNOTIFYMODE,
  ADS_SYMBOL_FLAGS,
  ADS_DATA_TYPE_FLAGS,
  ADS_DATA_TYPES,
  RPC_METHOD_PARAM_FLAGS,

  getTimestamp,
  sleep,

  getStringEnd,
  createWriteValue,
  getValueFromName,
  getNameFromValue,
  getNameArrayFromValue,
  analyzePlcValue
};