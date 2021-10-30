'use strict';

const debug = require('debug')('bkhf');
const debugVerbose = require('debug')('bkhf:details');
//const debugRaw = require('debug')('bkhf:raw-data');
const debugError = require('debug')('bkhf:error');

//const sqlite3 = require('sqlite3').verbose();
const events = require('events');

const config = require('./const');
const beckhoffBridge = require('./bridge');
const BeckhoffDB = require('./database');
const before = require('./preparation');
const after = require('./analysis');


class BeckhoffClient extends events {
  #db = null;
  #plc = null;    
  #settings = null;         

  constructor(settings) {
    super();

    this.#settings = {
      plc : {
        ip     : '10.0.0.1',            // 'default' PLC IP address
        port   : 48898                  // default PLC port to connect to
      },
      remote : {  
        netid  : '10.0.0.1.1.1',        // 'default' PLC NetID 
        port   : 851                    // default PLC NetID port
      },
      local : {
        netid  : '10.0.0.2.1.1',
        port   : 32905
      },
      bytes : {
        local  : [],                     // prepared buffer of local address
        remote : []                      // prepared buffer of remote address
      },
      develop : {
        verbose : true,                  // be verbose
        debug : false,                   // be EXTRA verbose
        save : false,                    // keep database on disk
        location : ''                    // location of the saved database
      }
    };
 
    if (settings) {
      this.#settings.plc = settings.plc;
      this.#settings.remote = settings.remote;
      this.#settings.local = settings.local;
      this.#settings.develop = settings.develop;
    }   

    this.create();

  }

  create() {
    
    // create / initialize database 
    this.#db = new BeckhoffDB(this.#settings.develop);

    // prepare PLC connection
    this.#plc = new beckhoffBridge({
      ip      : this.#settings.plc.ip,
      port    : this.#settings.plc.port,
      develop : {
        verbose : this.#settings.develop.verbose,
        debug   : this.#settings.develop.debug
      }
    }, this.#db);
    this.#plc.on('data',   this.#plc.recv_Bkhf_Data);
    //this.#plc.on('notify', this.recv_Plc_Notify);
    this.#plc.on('notify', (data) => {
      this.emit('notify', data);
    });
    this.#plc.on('error',  this.#plc.recv_Bkhf_Error);
    this.#plc.on('close',  this.#plc.recv_Bkhf_Close);

    debug.enabled = true;
    debugError.enabled       = true;
    after.debugError.enabled = true;
    debugVerbose.enabled        = this.#settings.develop.verbose;
    before.debugVerbose.enabled = this.#settings.develop.verbose;
    after.debugVerbose.enabled  = this.#settings.develop.verbose;
    //debugRaw.enabled = this.#settings.develop.debug;

    // prepare general settings
    this.invokeId = 0;
    this.cleanup = setTimeout(() => {
      debug('cleaning history ' + JSON.stringify(this.#settings.develop));
      debug('  -> history  :' + (this.#settings.develop.save ? '-1 days' : '-5 minutes'));
      debug('  -> tracking :' + (this.#settings.develop.save ? '-6 hours' : '-5 minutes'));
      this.cleanup_history(this.#settings.develop);
    }, 30000, this.#settings.develop);
    
  }

  /**
   * custom 'destroy()' function
   */
  async destroy() {
    let result = null;
    debug('releasing notify handles');
    result = await this.delPlcNotification([]);
    debugVerbose(JSON.stringify(result));
    
    debug('releasing symbol handles');
    result = await this.delPlcHandle([]);
    debugVerbose(JSON.stringify(result));

    clearTimeout(this.cleanup);

    this.#plc.closeSocket();
    this.#db.close();
  }

  cleanup_history(settings) {
    this.cleanup = setTimeout(() => {
      this.cleanup_history(settings);
    }, 300000, settings);

    this.#db.database_cleanup(settings);
  }

  get settings() {
    return this.#settings;
  }
  set settings(value) {
    // backup the 'bytes' section
    const tmp = this.#settings.bytes;

    this.#settings = value;
    // ... and restore it
    this.#settings.bytes = tmp;

    this.#plc.address = value.plc.ip;
    this.#plc.port = value.plc.port;
    this.#plc.develop = value.develop;

    // change debug-levels
    debugVerbose.enabled = value.develop.verbose;
    //debugRaw.enabled = value.develop.debug;
  }
  get db() {
    return this.#db;
  }

  /**
   * send prepared data to the PLC
   * 
   * @param {Object} options 
   * @param {Buffer} txData 
   * @param {string} kind 
   */
  async plc_invoke (options, txBuffer, kind) {
    let rxInfo = {};
    await this.#db.invoke_track_start(options, kind)
      .catch((exc) => {
        debugError(JSON.stringify(exc));
        throw exc;
      });

    return new Promise((resolve, reject) => {
      this.#plc.sendBuffer(txBuffer, kind)
        .then(async () => {
          let reqhandle = -1;
          while (reqhandle != 0) {
            await config.sleep(1);
            reqhandle = await this.#db.invoke_track_check(options.invoke)
              .catch((exc) => {
                debugError(JSON.stringify(exc));
                throw exc;
              });                 
          }
          rxInfo = await this.#db.invoke_track_clear(options.invoke)
            .catch((exc) => {
              debugError(JSON.stringify(exc));
              throw exc;
            });


          resolve(rxInfo);
        })
        .catch((reason) => {
          reject({
            invoke : options.invoke,
            error  : reason
          });
        });
    });
  }

  /**
   * fetch a specific (series of) symbol handle(s)
   * store the result in the SQLite database
   * 
   * @param {Object} options 
   * @param {Buffer} txData 
   */
  plc_invoke_symbolhandles(options, txData) {

    return new Promise((resolve, reject) => {
      this.plc_invoke(options, txData, 'gethandle')
        .then(async (rxdata) => {
          for (let i=0; i < rxdata.data.symbols.length; i++) {

            await this.#db.symbolhandle_update(rxdata.data.symbols[i]);
            
          }
  
          resolve('OK');
        })
        .catch((exc) => {
          reject(exc);
        });
      
    });
  }

  /**
   * fetch a specific (series of) symbol handle(s)
   * if unknown, fetch the handle from the plc
   * 
   * @param {Array} symbols list symbols to fetch
   * @returns {Promise} rxData
   */
  async plc_fetch_symbolhandles (symbols, skipInitial = false) {

    // start by fetching some symbol info from the database
    const options = {
      cmd     : config.ADS_CMD.INVALID,
      len     : -1,
      invoke  : 0,
      request : {},
      symbols : null
    };
    if (skipInitial) {
      options.symbols = symbols;
    } else {
      options.symbols = await this.#db.symbolinfo_fetch(symbols);
    }
  
    return new Promise( (resolve, reject) => {
      let txData = null;
      const newHandles = [];
      let newHandlesNeeded = false;

      try {
        // check whether the plc handle is known for the symbol(s) 
        for (let i = 0; i < options.symbols.length; i++) {
          if (options.symbols[i].handle <= 0) {
            newHandles.push(options.symbols[i]);
            newHandlesNeeded = true;
          }
        }
        // if necessary: fetch the handles from the PLC
        if (newHandlesNeeded) {
          options.invoke = ++this.invokeId;
          options.symbols = newHandles;
          
          before.prepareGetHandleRequest(options);
          txData = before.prepareCommandReadWrite(options, this.#settings, 'gethandle');
          
          this.plc_invoke_symbolhandles(options, txData)
            .then(async (rxData) => {
              rxData = await this.#db.symbolinfo_fetch(symbols);
              resolve(rxData);
            })
            .catch((exc) => {
              reject(exc.message);
            });
          
        } else {
          resolve(options.symbols);
        }
      }
      catch (exc) {
        reject(exc.message);
      }
      
    });
  }

  /**
   * fetch a specific rpc method handle
   * if unknown, fetch the handle from the plc
   * 
   * for the time being: only 1 call at a time
   * 
   * @param {*} symbols list symbols + methods to fetch
   * @returns {Promise} rxData
   */
  async plc_fetch_rpcmethodhandles (symbols) {

    return new Promise((resolve, reject) => {
      this.#db.symbolinfo_fetchrpcmethod(symbols)
        .then(async (data) => {
          // check for completeness of data
          let createSym = false;
          for (let i = 0; i < data.length; i++) {
            if (data[i].created == 0) {
              createSym = true;
            }
          }

          if (createSym) {
            await this.#db.symbolinfo_store_rpcmethod(data);
          }

          for (let i = 0; i < data.length; i++) {
            data[i].name += '#' + data[i].method;
            delete data[i].method;
          }

          return data;
        })
        .then(async (symData) => {
          let data = await this.plc_fetch_symbolhandles(symData, true);
          if (data.length == 0) {
            reject('handle to RPC method does not exist');
            return;
          }

          for (let i = 0; i < data.length; i++) {
            symData[i].handle = data[i].handle;
          }

          resolve(symData);
        })
        .catch((exc) => {
          reject(exc);
        });
    });
    
    /*
    return new Promise((resolve, reject) => {
      this.#db.symbolinfo_fetch(symbols)
        .then(async (rpcData) => {
          if (symbols.length > rpcData.length) {
            await this.#db.symbolinfo_store_rpcmethod(symbols);
            rpcData = await this.#db.symbolinfo_fetch(symbols);
          }
        })
        .then(async () => {
          let data = await this.plc_fetch_symbolhandles(symbols);
          //debug('symData = ' + JSON.stringify(data));
          if (data.length == 0) {
            reject('handle to RPC method does not exist')
          }
          data = await this.#db.symbolinfo_fetchrpcmethod(symbols, symbols[0].method);
          
          data[0].name += '#' + data[0].method;

          for (let p = 0; p < data[0].parm_in.length; p++) {
            //debug('data[0]    = ' + JSON.stringify(data[0]));
            //debug('symbols[0] = ' + JSON.stringify(symbols[0]));
            data[0].parm_in[p].value = symbols[0].parm_in[p].value;
          }

          resolve(data);
        })
        .catch((exc) => {
          reject(exc);
        });
    });
    */

  }
  
}

/*
 *  REQUESTS to be made
 */ 

/**
  * fetch general PLC info
  * 
  * @returns {Promise} plc info 
  */
BeckhoffClient.prototype.getPlcInfo = function() {

  const options = {
    cmd     : config.ADS_CMD.ReadDeviceInfo,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : []
  };
  const txHeader = before.prepareCommandHeader(options, this.settings);

  return new Promise((resolve, reject) => {

    this.plc_invoke(options, txHeader, 'info')
      .then((rxInfo) => {
        resolve(rxInfo.data);
      })
      .catch((exc) => {
        reject(exc);
      });

  });  
};

/**
 * fetch PLC running state
 * 
 * @returns {Promise} plc state info
 */
BeckhoffClient.prototype.getPlcState = async function() {

  const options = {
    cmd     : config.ADS_CMD.ReadState,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : []
  };
  const txHeader = before.prepareCommandHeader(options, this.settings);

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txHeader, 'state')
      .then((rxInfo) => {
        resolve(rxInfo.data);
      })
      .catch((exc) => {
        reject(exc);
      });

  });
};

/**
 * fetch PLC system state
 * 
 * @returns {Promise} plc state info
 */
BeckhoffClient.prototype.getPlcSystemState = async function() {

  const options = {
    cmd     : config.ADS_CMD.ReadState,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : []
  };
  const txHeader = before.prepareCommandHeaderCustom(options, this.settings, config.ADS_RESERVED_PORTS.SystemService);

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txHeader, 'state')
      .then((rxInfo) => {
        resolve(rxInfo.data);
      })
      .catch((exc) => {
        reject(exc);
      });

  });
};

/**
 * set PLC running state
 * !! use with caution !!
 * 
 * @returns {Promise} plc state info
 */
BeckhoffClient.prototype.setPlcState = async function(stateData) {

  const options = {
    cmd     : config.ADS_CMD.WriteControl,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : stateData
  };
  
  const txData = before.prepareCommandWriteControl(options, this.settings);
  // to config : 
  // --> 0000200000000a510109010110270a5101090102898004000400000000000000000007000000
  // <-- 00003d0000000a510109010289800a51010901015403080004001d0000000000000000000000190000000100000090a236493d8cd701010000001000000001000000df
  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txData, 'state')
      .then((rxInfo) => {
        resolve(rxInfo.data);
      })
      .catch((exc) => {
        reject(exc);
      });

  });
};

/**
 * fetch all known symbols from the PLC
 * cache them in the SQLite database for later reference 
 * 
 * @returns {Promise} plc symbol list
 */
BeckhoffClient.prototype.getPlcSymbols = async function() {
  let txData = null;

  // release any existing symbolhandles before refreshing
  await this.delPlcNotification([]);
  await this.delPlcHandle([]);
  
  let options = {
    cmd     : config.ADS_CMD.Read,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {
      group  : config.ADS_IDXGRP.SYM_UPLOADINFO2,
      offset : 0x00000000,
      length : 0x30
    },
    symbols : []
  };
  txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txData, 'uploadinfo')
      .then(async (rxInfo) => {
        debugVerbose(JSON.stringify(rxInfo));

        // prepare symbols request with data from first response
        options = {
          cmd     : config.ADS_CMD.Read,
          len     : -1,
          invoke  : ++this.invokeId,
          request : {
            group  : config.ADS_IDXGRP.SYM_UPLOAD,
            offset : 0x00000000,
            length : rxInfo.data.symbols.length
          },
          symbols : []
        };
        txData = before.prepareCommandRead(options, this.settings, 'symbols');

        // second command
        rxInfo = await this.plc_invoke(options, txData, 'symbols');

        // cleanup data (if needed) and store fetched symbols
        await this.db.symbolinfo_prepare(rxInfo.data.symbols);
        resolve(rxInfo.data.symbols);
      })
      .catch((err) => {
        reject(err);
      });
  }); 

};

/**
 * retrieve the list of data types and store them into the database
 * 
 * @returns {Promise} plc datatypes list
 */
BeckhoffClient.prototype.getPlcDataTypes = async function() {
  let txData = null;

  let options = {
    cmd     : config.ADS_CMD.Read,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {
      group  : config.ADS_IDXGRP.SYM_UPLOADINFO2,
      offset : 0x00000000,
      length : 0x30
    },
    symbols : []
  };
  txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txData, 'uploadinfo')
      .then(async (rxInfo) => {
        debugVerbose(JSON.stringify(rxInfo));

        // prepare datatypes request with data from first response
        options = {
          cmd     : config.ADS_CMD.Read,
          len     : -1,
          invoke  : ++this.invokeId,
          request : {
            group  : config.ADS_IDXGRP.SYM_DT_UPLOAD,
            offset : 0x00000000,
            length : rxInfo.data.datatypes.length
          },
          symbols : []
        };
        txData = before.prepareCommandRead(options, this.settings, 'datatypes');

        rxInfo = await this.plc_invoke(options, txData, 'datatypes');
        
        // cleanup data (if needed) and store fetched symbols
        await this.db.datatypes_prepare(rxInfo.data.datatypes);
        resolve(rxInfo.data);

      })
      .catch((exc) => {
        reject(exc);
      });

  });
};

/**
 * read the value of all items passed on via symData
 * this routine works for 1 or more symbols
 * if necessary: fetch the symbol handle first and complete settings in SQLite db
 * 
 * @param {Array} symData info needed per symbol: name
 * @returns {Promise} read symbol info
 */
BeckhoffClient.prototype.readPlcData = async function(symData) {

  const options = {
    cmd     : config.ADS_CMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise((resolve, reject) => {
    let txData = null;
    
    options.invoke = ++this.invokeId;
    if (options.symbols.length == 1) {
      options.cmd = config.ADS_CMD.Read;
      txData = before.prepareCommandRead(options, this.settings, 'getvalue');
    } else {
      options.cmd = config.ADS_CMD.ReadWrite;

      let symlen = 0;
      let dataLen = 0;
      for (let i = 0; i < options.symbols.length; i++) {
        symlen  += options.symbols[i].size + 4;
        dataLen += 12;
      }

      options.request.group = config.ADS_IDXGRP.SUMUP_READ;
      options.request.offset = options.symbols.length;
      options.request.rLength = symlen;
      options.request.wLength = dataLen;

      txData = before.prepareCommandReadWrite(options, this.settings, 'getvalue');
    }
    
    this.plc_invoke(options, txData, 'getvalue')
      .then((rxInfo) => {
        if (rxInfo.data.error != 0) {
          reject(rxInfo.data);
        }
        resolve(rxInfo.data.symbols);
      })
      .catch((exc) => {
        reject(exc);
      });

  });
  
};

/**
 * write the value of all items passode on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {Array} symData info needed per symbol: name, value
 * @returns {Promise} written symbol info
 */
BeckhoffClient.prototype.writePlcData = async function (symData) {

  const options = {
    cmd     : config.ADS_CMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise((resolve, reject) => {
    let txData = null;

    options.invoke = ++this.invokeId;
    if (options.symbols.length == 1) {
      options.cmd = config.ADS_CMD.Write;
      txData = before.prepareCommandWrite(options, this.settings, 'setvalue');
    } else {
      let dataLen = 0;
      for (let i = 0; i < options.symbols.length; i++) {
        dataLen += 12 + options.symbols[i].size;
      }

      options.cmd = config.ADS_CMD.ReadWrite;

      options.request.group = config.ADS_IDXGRP.SUMUP_WRITE;
      options.request.offset = options.symbols.length;
      options.request.rLength = options.symbols.length * 4;
      options.request.wLength = dataLen;

      txData = before.prepareCommandReadWrite(options, this.settings, 'setvalue');
    }
    
    this.plc_invoke(options, txData, 'setvalue')
      .then((rxInfo) => {
        if (rxInfo.data.error != 0) {
          reject(rxInfo.data);
        }
        resolve(rxInfo.data.symbols);
      })
      .catch((exc) => {
        reject(exc);
      });

  });
};

/**
 * find out the RPC methods, necessary parameters and returnvalues
 * (this needs symbolinfo and datatypes)
 * 
 * @param {Array} symData info needed per symbol: name
 * @returns {Promise} info struct on how to call RPC methods
 */
BeckhoffClient.prototype.getRpcMethodInfo = async function (symData) {

  return new Promise((resolve, reject) => {
    this.db.symbolinfo_fetchrpcmethod(symData)
      .then((rpcData) => {

        for (let s=0; s < rpcData.length; s++) {
          delete rpcData[s].group;
          delete rpcData[s].offset;
          delete rpcData[s].kind;
          delete rpcData[s].return;

          for (let p=0; p < rpcData[s].parm_in.length; p++) {
            delete rpcData[s].parm_in[p].kind;
            delete rpcData[s].parm_in[p].size;
          }

          delete rpcData[s].parm_out;
          delete rpcData[s].created;
        }
        resolve(rpcData);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * call an RPC method on a symbol.
 * 
 * for the time being: only 1 call at a time
 * 
 * @param {Array} rpcData info needed per symbol: name, method, parm_in
 * @returns {Promise} result and output of rpc method
 */
BeckhoffClient.prototype.callPlcRpcMethod = async function (rpcData) {

  const options = {
    cmd     : config.ADS_CMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_rpcmethodhandles(rpcData)
  };

  return new Promise((resolve, reject) => {
    let txData = null;

    options.invoke = ++this.invokeId;
    options.cmd = config.ADS_CMD.ReadWrite;

    options.request.group = config.ADS_IDXGRP.RW_SYMVAL_BYHANDLE;
    options.request.offset = options.symbols[0].handle;

    // rLength = return value size + size of output parms
    options.request.rLength = options.symbols[0].retsize;
    for (let p = 0; p <  options.symbols[0].parm_out.length; p++) {
      options.request.rLength +=  options.symbols[0].parm_out[p].size;
    }

    // wLength = size of all parameters
    options.request.wLength = 0;
    for (let p = 0; p <  options.symbols[0].parm_in.length; p++) {
      options.request.wLength +=  options.symbols[0].parm_in[p].size;
    }
    //options.request.parm_in = rpcData[0].parm_in;
    options.request.buffer = Buffer.alloc(options.request.wLength, 0);
    let offset = 0;
    for (let p = 0; p <  options.symbols[0].parm_in.length; p++) {
      const value = config.createPlcValue(options.symbols[0].parm_in[p]);

      value.copy(options.request.buffer, offset);
      //options.request.buffer.copy(config.createPlcValue(), offset);
      offset +=  options.symbols[0].parm_in[p].size;
    }

    txData = before.prepareCommandReadWrite(options, this.settings, 'rpcmethod');

    this.plc_invoke(options, txData, 'rpcmethod')
      .then(async (rxData) => {
        //for (let i = 0; i < options.symbols.length; i++) {
        //  options.symbols[i].handle = 0;
        //  //await this.db_update_symbolhandle(options.symbols[i]);
        //  await this.db.symbolhandle_update(options.symbols[i]);
        //}
        debug('rpcMethod : ' + JSON.stringify(rxData));

        await this.delPlcHandle(options.symbols);
        resolve('OK');
      })
      .catch((error) => {
        debugError('error receiving rpcMethod: ' + error);
        reject('NOK');
      });
  });
  
};


/**
 * release one, more or all symbolhandles used to read and write values
 * 
 * @param {Array} symData list of symbols to release
 * @returns {String} status message
 */
BeckhoffClient.prototype.delPlcHandle = async function (symData) {
  let txData = null;

  const options = {
    cmd     : config.ADS_CMD.INVALID,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {},
    symbols : null
  };
  try {
    if (symData[0].handle == 0) {
      options.symbols = await this.plc_fetch_symbolhandles(symData);
    } else {
      options.symbols = symData;
    }
  }
  catch {
    options.symbols = await this.plc_fetch_symbolhandles(symData)
  }
  
  return new Promise((resolve, reject) => {
    before.prepareDelHandleRequest(options);
    
    if (options.symbols.length == 1) {
      options.cmd = config.ADS_CMD.Write;
      txData = before.prepareCommandWrite(options, this.settings, 'relhandle');
    } else if (options.symbols.length  > 1) {
      options.cmd = config.ADS_CMD.ReadWrite;
      txData = before.prepareCommandReadWrite(options, this.settings, 'relhandle');
    } else {
      resolve('NONE');
      return;
    }

    this.plc_invoke(options, txData, 'relhandle')
      .then(async (rxData) => {
        for (let i = 0; i < options.symbols.length; i++) {
          options.symbols[i].handle = 0;
          
          await this.db.symbolhandle_update(options.symbols[i]);
        }
        debug('release : ' + JSON.stringify(rxData));
        resolve('OK');
      })
      .catch((error) => {
        debugError('error release handle: ' + error);
        reject('NOK');
      });
  });
};

/**
 * 
 * @param {Array} symData info needed per symbol: name, mode, delay, cycletime 
 * @returns {Promise} symbol notification info
 */
BeckhoffClient.prototype.addPlcNotification = async function (symData) {

  async function sendAddPlcNotification(reference, idx) {
    return new Promise((resolve, reject) => {
      const txData = before.prepareCommandAddNotification(options, reference.settings);

      reference.plc_invoke(options, txData, 'addnotify')
        .then(async (rxInfo) => {
          options.symbols[0].notify = rxInfo.data.symbols[0].notify;
          //await reference.db_update_symbolhandle(options.symbols[0])
          await reference.db.symbolhandle_update(options.symbols[0])
            .catch((error) => {
              debugError(error);
            });

          const thisSymbol = {
            id : idx,
            data : rxInfo.data.symbols[0]
          };
          
          resolve(thisSymbol);

        })
        .catch((error) => {
          debugError('error add notification: ' + error);
          reject('NOK');
        });
    });

  }

  if (!Array.isArray(symData)) {
    symData = new Array(symData);
  }

  const allSymbols = await this.plc_fetch_symbolhandles(symData);
  //const allSymbols =  await this.db.symbolhandle_fetch(symData);

  const options = {
    cmd     : config.ADS_CMD.NotificationAdd,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : []
  };

  let notIdx = 0;

  for (const sym of allSymbols) {
    options.invoke = ++this.invokeId;
    options.symbols = new Array(sym);

    await sendAddPlcNotification(this, notIdx)
      .then((symbol) => {
        allSymbols[symbol.id] = symbol.data;
      })
      .catch((err) => {
        //reject(err);
        debugError(err);
      });
    notIdx++; 
  }

  return Promise.resolve(allSymbols);

};

/**
 * 
 * @param {Array} symData info needed per symbol: name 
 * @returns {Promise} written symbol info
 */
BeckhoffClient.prototype.delPlcNotification = async function (symData) {
  
  async function sendDelPlcNotification (reference, idx) {
    return new Promise((resolve, reject) => {
      const txData = before.prepareCommandDelNotification(options, reference.settings);

      reference.plc_invoke(options, txData, 'delnotify')
        .then(async (rxInfo) => {

          debug('del notification : ' + JSON.stringify(rxInfo));
          options.symbols[0].notify = 0;
          //await reference.db_update_symbolhandle(options.symbols[0])
          await reference.db.symbolhandle_update(options.symbols[0])
            .catch((error) => {
              debugError(error);
            });

          const thisSymbol = {
            id : idx,
            data : rxInfo.data.symbols[0]
          };
          
          resolve(thisSymbol);

        })
        .catch((error) => {
          debugError('error del notification: ' + error);
          reject('NOK');
        });
    });

  }

  if (!Array.isArray(symData)) {
    symData = new Array(symData);
  }

  const allSymbols = await this.plc_fetch_symbolhandles(symData);
  //const allSymbols =  await this.db.symbolhandle_fetch(symData);

  const options = {
    cmd     : config.ADS_CMD.NotificationDel,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : []
  };

  let notIdx = 0;

  for (const sym of allSymbols) {

    // skip symbols not flagged for notifications
    if (sym.notify == 0) {
      continue;
    }

    options.invoke = ++this.invokeId;
    options.symbols = new Array(sym);

    await sendDelPlcNotification(this, notIdx)
      .then((symbol) => {
        allSymbols[symbol.id] = symbol.data;
      })
      .catch((err) => {
        debugError(err);
      });
    notIdx++; 
  }

  return Promise.resolve(allSymbols);
  
};


module.exports = BeckhoffClient;
