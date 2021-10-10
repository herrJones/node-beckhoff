/* eslint-disable indent */
'use strict';

const debugError = require('debug')('bkhf-cfg:error');

const ADS_CMD = {
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

const ADS_STATE = {
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

const ADS_RESERVED_PORTS = {
  None: 0,
  //AMS Router (Port 1)
  Router: 1,
  //AMS Debugger (Port 2)
  Debugger: 2,
  //The TCom Server. Dpc or passive level.
  R0_TComServer: 10, // 0x0000000A
  //TCom Server Task. RT context.
  R0_TComServerTask: 11, // 0x0000000B
  //TCom Serve Task. Passive level.
  R0_TComServer_PL: 12, // 0x0000000C
  //TwinCAT Debugger
  R0_TcDebugger: 20, // 0x00000014
  //TwinCAT Debugger Task
  R0_TcDebuggerTask: 21, // 0x00000015
  //The License Server (Port 30)
  R0_LicenseServer: 30, // 0x0000001E
  //Logger (Port 100)
  Logger: 100, // 0x00000064
  //Event Logger (Port 110)
  EventLog: 110, // 0x0000006E
  //application for coupler (EK), gateway (EL), etc.
  DeviceApplication: 120, // 0x00000078
  //Event Logger UM
  EventLog_UM: 130, // 0x00000082
  //Event Logger RT
  EventLog_RT: 131, // 0x00000083
  //Event Logger Publisher
  EventLogPublisher: 132, // 0x00000084
  //R0 Realtime (Port 200)
  R0_Realtime: 200, // 0x000000C8
  //R0 Trace (Port 290)
  R0_Trace: 290, // 0x00000122
  //R0 IO (Port 300)
  R0_IO: 300, // 0x0000012C
  //NC (R0) (Port 500)
  R0_NC: 500, // 0x000001F4
  //R0 Satzausführung (Port 501)
  R0_NCSAF: 501, // 0x000001F5
  //R0 Satzvorbereitung (Port 511)
  R0_NCSVB: 511, // 0x000001FF
  //Preconfigured Nc2-Nc3-Instance
  R0_NCINSTANCE: 520, // 0x00000208
  //R0 ISG (Port 550)
  R0_ISG: 550, // 0x00000226
  //R0 CNC (Port 600)
  R0_CNC: 600, // 0x00000258
  //R0 Line (Port 700)
  R0_LINE: 700, // 0x000002BC
  //R0 PLC (Port 800)
  R0_PLC: 800, // 0x00000320
  //Tc2 PLC RuntimeSystem 1 (Port 801)
  Tc2_Plc1: 801, // 0x00000321
  //Tc2 PLC RuntimeSystem 2 (Port 811)
  Tc2_Plc2: 811, // 0x0000032B
  //Tc2 PLC RuntimeSystem 3 (Port 821)
  Tc2_Plc3: 821, // 0x00000335
  //Tc2 PLC RuntimeSystem 4 (Port 831)
  Tc2_Plc4: 831, // 0x0000033F
  //R0 RTS (Port 850)
  R0_RTS: 850, // 0x00000352
  //Tc3 PLC RuntimeSystem 1 (Port 851)
  Tc3_Plc1: 851,
  //Tc3 PLC RuntimeSystem 2 (Port 852)
  Tc3_Plc2: 852,
  //Tc3 PLC RuntimeSystem 3 (Port 853)
  Tc3_Plc3: 853,
  //Tc3 PLC RuntimeSystem 4 (Port 854)
  Tc3_Plc4: 854,
  //Tc3 PLC RuntimeSystem 5 (Port 855)
  Tc3_Plc5: 855,
  //Camshaft Controller (R0) (Port 900)
  CamshaftController: 900, // 0x00000384
  //R0 CAM Tool (Port 950)
  R0_CAMTOOL: 950, // 0x000003B6
  //R0 User (Port 2000)
  R0_USER: 2000, // 0x000007D0
  //(Port 10000)
  R3_CTRLPROG: 10000, // 0x00002710
  //System Service (AMSPORT_R3_SYSSERV, 10000)
  SystemService: 10000, // 0x00002710
  //(Port 10001)
  R3_SYSCTRL: 10001, // 0x00002711
  //Port 10100
  R3_SYSSAMPLER: 10100, // 0x00002774
  //Port 10200
  R3_TCPRAWCONN: 10200, // 0x000027D8
  //Port 10201
  R3_TCPIPSERVER: 10201, // 0x000027D9
  //Port 10300
  R3_SYSMANAGER: 10300, // 0x0000283C
  //Port 10400
  R3_SMSSERVER: 10400, // 0x000028A0
  //Port 10500
  R3_MODBUSSERVER: 10500, // 0x00002904
  //Port 10502
  R3_AMSLOGGER: 10502, // 0x00002906
  //Port 10600
  R3_XMLDATASERVER: 10600, // 0x00002968
  //Port 10700
  R3_AUTOCONFIG: 10700, // 0x000029CC
  //Port 10800
  R3_PLCCONTROL: 10800, // 0x00002A30
  //Port 10900
  R3_FTPCLIENT: 10900, // 0x00002A94
  //Port 11000
  R3_NCCTRL: 11000, // 0x00002AF8
  //Port 11500
  R3_NCINTERPRETER: 11500, // 0x00002CEC
  //Port 11600
  R3_GSTINTERPRETER: 11600, // 0x00002D50
  //Port 12000
  R3_STRECKECTRL: 12000, // 0x00002EE0
  //Port 13000
  R3_CAMCTRL: 13000, // 0x000032C8
  //Port 14000
  R3_SCOPE: 14000, // 0x000036B0
  //Port 14100
  R3_CONDITIONMON: 14100, // 0x00003714
  //Port 15000
  R3_SINECH1: 15000, // 0x00003A98
  //Port 16000
  R3_CONTROLNET: 16000, // 0x00003E80
  //Port 17000
  R3_OPCSERVER: 17000, // 0x00004268
  //Port 17500
  R3_OPCCLIENT: 17500, // 0x0000445C
  //Port 18000
  R3_MAILSERVER: 18000, // 0x00004650
  //Port 19000
  R3_EL60XX: 19000, // 0x00004A38
  //Port 19100
  R3_MANAGEMENT: 19100, // 0x00004A9C
  //Port 19200
  R3_MIELEHOME: 19200, // 0x00004B00
  //Port 19300
  R3_CPLINK3: 19300, // 0x00004B64
  //Port 19500
  R3_VNSERVICE: 19500, // 0x00004C2C
  //Multiuser (Port 19600)
  R3_MULTIUSER: 19600, // 0x00004C90
  //Default (AMS router assigns)
  USEDEFAULT: 65535, // 0x0000FFFF
};

// ADS reserved index groups
const ADS_IDXGRP = {
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
const ADS_NOTIFYMODE = {
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
const ADS_DATATYPE_FLAGS = {
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

};

/**
 * ADS data types
 * 
 * Source: TwinCAT.Ads.dll By Beckhoff
 */
const ADS_DATATYPES = {
  0x00000000 : 'VOID',     // 'ADST_VOID'
  0x00000002 : 'INT',      // 'ADST_INT16'
  0x00000003 : 'DINT',     // 'ADST_INT32'
  0x00000004 : 'REAL',     // 'ADST_REAL32'
  0x00000005 : 'LREAL',    // 'ADST_REAL64'
  0x00000010 : 'SINT',     // 'ADST_INT8' 
  0x00000011 : 'BYTE',     // 'ADST_UINT8' 
  0x00000012 : 'UINT',     // 'ADST_UINT16' 
  0x00000013 : 'UDINT',    // 'ADST_UINT32' 
  0x00000014 : 'LINT',     // 'ADST_INT64' 
  0x00000015 : 'ULINT',    // 'ADST_UINT64'
  0x0000001E : 'STRING',   // 'ADST_STRING' 
  0x0000001F : 'WSTRING',  // ADST_WSTRING' 
  0x00000020 : 'REAL80',   // 'ADST_REAL80' - reserved 
  0x00000021 : 'BOOL',     // 'ADST_BIT' 
  0x00000022 : 'MAXTYPE',  // 'ADST_MAXTYPES' 
  0x00000041 : 'BIGTYPE',  // 'ADST_BIGTYPE' 
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

  return result;

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

  Object.keys(object).forEach((key) => {
    if (((value & Number(key)) === Number(key))) {
      if ((value === 0) || (Number(key) !== 0)) {
        result.push(object[key]);
      }
    }
  });
      
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
function createPlcValue(symbol, value) {
  let result = Buffer.alloc(symbol.size, 0);

  switch (symbol.kind) {
    case 'BOOL' :
      result.writeUInt8(value, 0);
      break;
    case 'BYTE':
    case 'USINT':
      result.writeUInt8(value, 0);
      break;
    case 'SINT':
      result.writeInt8(value, 0);
      break;
    case 'UINT':
    case 'WORD':
      result.writeUInt16LE(value, 0);
      break;
    case 'INT':
      result.writeInt16LE(value, 0);
      break;  
    case 'DWORD':
    case 'UDINT':
      result.writeUInt32LE(value, 0);
      break;
    case 'DINT':
      result.writeInt32LE(value, 0);
      break;
    case 'REAL':
      result.writeFloatLE(value, 0);
      break;
    case 'LREAL':
      result.writeDoubleLE(value, 0);
      break;
    //case 'STRING':
    //  result = data.toString('binary', 0, getStringEnd(data, 0));
    //  break;
  }

  return result;

}

module.exports = {
  ADS_CMD,
  ADS_STATE,
  ADS_IDXGRP,
  ADS_RESERVED_PORTS,
  ERRORS,
  ADS_NOTIFYMODE,
  ADS_SYMBOL_FLAGS,
  ADS_DATATYPE_FLAGS,
  ADS_DATATYPES,
  RPC_METHOD_PARAM_FLAGS,

  getTimestamp,
  sleep,

  getStringEnd,
  createWriteValue,
  getValueFromName,
  getNameFromValue,
  getNameArrayFromValue,
  analyzePlcValue,
  createPlcValue
};