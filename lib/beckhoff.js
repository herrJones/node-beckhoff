'use strict';

//const debug = require('debug')('node-beckhoff');

const sqlite3 = require('sqlite3').verbose();
const events = require('events');

const config = require('./const');
const beckhoffBridge = require('./bridge');
const before = require('./preparation');
const after = require('./analysis');

class BeckhoffClient extends events {

  //_db;             // eslint-disable-line
  //_settings;       // eslint-disable-line
  //_plc;            // eslint-disable-line

  constructor(settings) {
    super();

    this._settings = {
      plc : {
        ip     : '10.0.0.1',
        port   : 48898
      },
      remote : {  
        netid  : '10.0.0.1.1.1',
        port   : 851
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
      this._settings.plc = settings.plc;
      this._settings.remote = settings.remote;
      this._settings.local = settings.local;
      this._settings.develop = settings.develop;
    }   

    this.create();

  }

  create() {
    this.invokeId = 0;
    
    let sqliteConnection = ':memory:';
    if (this._settings.develop.save) {
      if (!this._settings.develop.location || (this._settings.develop.location == undefined)) {
        sqliteConnection = __dirname + '/beckhoff.db3';
      } else {
        sqliteConnection = this._settings.develop.location + '/beckhoff.db3';
      } 
    }
 
    this._db = new sqlite3.Database(sqliteConnection, (err) => {
      if (err) {
        return console.error(err.message);
      }

      this.create_database();
    });
    
    this._plc = new beckhoffBridge({
      ip      : this._settings.plc.ip,
      port    : this._settings.plc.port,
      db      : this._db,
      develop : {
        verbose : this._settings.develop.verbose,
        debug   : this._settings.develop.debug
      }
    });
    this._plc.on('data',  this.recv_Plc_Data);
    this._plc.on('error', this.recv_Plc_Error);
    this._plc.on('close', this.recv_Plc_Close);
    
  }

  create_database () {
    this._db.parallelize(() => {

      this._db.run(`
        CREATE TABLE IF NOT EXISTS tracking (
          time           REAL,
          invokeId       INTEGER,
          kind           TEXT,
          handle         INTEGER,
          options        BLOB,
          data           BLOB
        )
      `, [], (err) => {
        if (err) {
          console.error('create tracking table: ' + err);
          return;
        }

        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_track_invoke
              ON tracking(invokeId)
        `);
      });
      
      this._db.run(`
        CREATE TABLE IF NOT EXISTS symbols (
          idxGroup       INTEGER DEFAULT 0,
          idxOffset      INTEGER DEFAULT 0,
          size           INTEGER DEFAULT 0,
          name           TEXT,
          kind           TEXT DEFAULT 'none',
          comment        TEXT DEFAULT '',
          handle         INTEGER DEFAULT -1,
          notify         INTEGER DEFAULT -1
        )
      `, [], (err) => {
        if (err) {
          console.error('create symbols table: ' + err);
          return;
        }

        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_name
              ON symbols(name)
        `);
        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_handle
              ON symbols(handle)
        `);
        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_notify
              ON symbols(notify)
        `);
      });
      
      this._db.run(`
        CREATE TABLE IF NOT EXISTS datatypes (
          version        INTEGER,
          size           INTEGER,
          offset         INTEGER,
          datatype       INTEGER,
          flags          INTEGER,
          name           TEXT,
          kind           TEXT,
          comment        TEXT,
          arraySize      INTEGER,
          subItems       INTEGER
        )
      `, [], (err) => {
        if (err) {
          console.error('create datatypes table: ' + err);
          return;
        }

        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_datatype_name
              ON datatypes(name)
        `);
      });

      this._db.run(`
        CREATE TABLE IF NOT EXISTS history (
          time           REAL,
          symbol         TEXT,
          kind           TEXT,
          value          TEXT
        )
      `, [], (err) => {
        if (err) {
          console.error('create history table: ' + err);
          return;
        }

        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_history_symbol
              ON history(symbol, time)
        `);
      });
      
    });

  }

  get settings() {
    return this._settings;
  }
  set settings(value) {
    // backup the 'bytes' section
    const tmp = this._settings.bytes;

    this._settings = value;
    // ... and restore it
    this._settings.bytes = tmp;

    this._plc.address = value.plc.ip;
    this._plc.port = value.plc.port;
    this._plc.develop = value.develop;

  }
  get db() {
    return this._db;
  }

  /**
   * store execution record in database
   * 
   * @param {*} options 
   */
  track_PlcInvoke_Start(options, kind) {
  
    const reqhandle = setTimeout(() => {
      
      this._db.run(`
        update tracking
           set handle = -1,
               data = 'timeout'
         where invokeId = ?`, [options.invoke], (err) => {
        if (err) {
          return console.log(err.message);
        }
      });
       
      console.log('timeout handler for invokeId ' + options.invoke);
    }, 15000, options);

    return new Promise((resolve, reject) => {
      this._db.run(`
        insert into tracking(time, invokeId, options, handle, kind)
          values (datetime('now'), ?, ?, ?, ?)
      `, [options.invoke, JSON.stringify(options), reqhandle, kind], (err) => {
        if (err) {
          reject(err.message);
        }
        resolve(reqhandle);
      });
    });
  }

  /**
   * check execution record in database
   * 
   * @param {*} invokeId 
   */
  track_PlcInvoke_Check(invokeId) {

    return new Promise((resolve,reject) => {
      try {
        this._db.get(`
          select handle 
            from tracking
           where invokeId = ?`, [invokeId], (err, row) => {
          if (err) {
            reject(err.message);
          }
          resolve(row.handle);
        });
      }
      catch (exc) {
        reject(exc);
      }
    });

  }

  /**
   * return response values stored inside the database
   * 
   * @param {int} invokeId 
   */
  track_PlcInvoke_Clear(invokeId) {

    return new Promise((resolve, reject) => {
      try {
        this._db.get(`
          select kind,
                 json_extract(options, "$.request") as request,
                 json_extract(options, "$.symbols") as symbols,
                 json_extract(data, "$.data") as data 
            from tracking 
           where invokeId = ?`, [invokeId], (err, row) => {
          if (err) {
            reject(err.message);
          }
          
          if (this._settings.develop.save) {
            this._db.run(`
              update tracking 
                  set invokeId = -1 
                where invokeId = ?`, [invokeId], (err) => {
              if (err) {
                reject(err.message);
              }
            });
          } else {
            this._db.run('delete from tracking where invokeId =  ?', [invokeId], (err) => {
              if (err) {
                reject(err.message);
              }
            });
          }
          
          const result = {
            kind    : row.kind,
            request : JSON.parse(row.request),
            symbols : JSON.parse(row.symbols),
            data    : JSON.parse(row.data)
          };

          resolve(result);
        });
      }
      catch (exc) {
        reject(exc);
      }
    });
    
  }

  /**
   * send prepared data to the PLC
   * 
   * @param {*} options 
   * @param {*} txHeader 
   * @param {*} kind 
   */
  async plc_invoke (options, txHeader, kind) {
    let rxInfo = {};

    await this.track_PlcInvoke_Start(options, kind);
 
    await this._plc.sendBuffer(txHeader, kind)
      .catch((reason) => {
        throw {
          invoke : options.invoke,
          stage  : 'sendbuffer',
          error  : reason
        };
      });

    let reqhandle = 0;
    while (reqhandle != -1) {
      await config.sleep(1);
      reqhandle = await this.track_PlcInvoke_Check(options.invoke)
        .catch((reason) => {
          throw {
            invoke : options.invoke,
            stage  : 'plcinvoke_check',
            error  : reason
          };
        });                    
    }
    rxInfo = await this.track_PlcInvoke_Clear(options.invoke)
      .catch((reason) => {
        throw {
          invoke : options.invoke,
          stage  : 'plcinvoke_clear',
          error  : reason
        };
      });

    return rxInfo;

  }

  /**
   * find handles for symbols in the local database
   * symbol names will be converted to UPPERCASE
   * 
   * @param {object} requests list of symbols to find
   * @returns {Promise} symboldetails 
   */
  db_fetch_symbolhandles (symbols) {
    let sqlQry = 
      'select * from symbols where name ';
    const data = [];

    // explicitly convert a single request to an array
    if (!Array.isArray(symbols)) {
      symbols = new Array(symbols);
    }

    if (symbols.length == 1) {
      sqlQry += '= "' + symbols[0].name.toUpperCase() +'"';
    } else {
      for (let i = 0; i < symbols.length; i++) {
        if (i == 0) {
          sqlQry += 'in ("' + symbols[i].name.toUpperCase() + '"';
        } else {
          sqlQry += ', "' + symbols[i].name.toUpperCase() + '"';
        }
      }
      sqlQry += ')';
    }
    return new Promise((resolve, reject) => {
      
      this._db.all(sqlQry, [], (err, rows) => {
        if (err) {
          reject(err);
        }

        if (!rows) {
          rows = [];
        }

        for (let r = 0; r < rows.length; r++) {
          const newSymbol = {
            'name'   : rows[r].name,
            'group'  : rows[r].idxGroup,
            'offset' : rows[r].idxOffset,
            'kind'   : rows[r].kind,
            'size'   : rows[r].size,
            'handle' : rows[r].handle,
            'notify' : rows[r].notify
          };

          data.push(newSymbol);
        }

        if (data.length != symbols.length) {
          let missing = false;

          for (let i = 0; i < symbols.length; i++) {
            missing = data.includes(obj => obj.name === symbols[i].name.toUpperCase());

            if (!missing) {
              const missingSymbol = {
                'name'   : symbols[i].name.toUpperCase(),
                'group'  : -1,
                'offset' : -1,
                'kind'   : -1,
                'size'   : 0xFFFFFFFF,
                'handle' : -1,
                'notify' : -1
              };

              symbols.push(missingSymbol);
            }
          }
        }
        
        const allProps = Object.getOwnPropertyNames(symbols[0]);
        // we assume ALL or NEITHER elements have a 'value' property
        if (allProps.findIndex(i => i == 'value') >= 0) {
          for (let i = 0; i < symbols.length; i++) {
            const idx = data.findIndex(obj => obj.name === symbols[i].name.toUpperCase());

            data[idx].value = symbols[i].value;
          }
        }

        // we assume ALL or NEITHER elements have a 'mode/delay/cycle' property
        //if (symbols[0].hasOwnProperty('mode')) {
        if (allProps.findIndex(i => i == 'mode') >= 0) {
          for (let i = 0; i < symbols.length; i++) {
            const idx = data.findIndex(obj => obj.name === symbols[i].name.toUpperCase());

            switch (symbols[i].mode.toUpperCase()) {
              case 'ONCHANGE':
                data[idx].mode = config.ADSNOTIFYMODE.OnChange;
                break;
              case 'CYCLIC':
                data[idx].mode = config.ADSNOTIFYMODE.Cyclic;
                break;
              default:
                data[idx].mode  = symbols[i].mode;
                break;
            }
            
            data[idx].delay = symbols[i].delay * 1000;
            data[idx].cycle = symbols[i].cycle * 1000;
          }
        }

        resolve(data);
      });
    });
  }

  /**
   * 
   * @param {*} symbols 
   */
  db_fetch_notifyhandle (symbols) {

    return new Promise(async (resolve, reject) => {

    });
  }

  /**
   * 
   * @param {*} symbol 
   */
  db_update_symbolhandle (symbol) {

    return new Promise((resolve, reject) => {
      this._db.get('select ? as name, ? as handle, count(1) as num from symbols where name = ?', [symbol.name, symbol.handle, symbol.name], (err, row) => {
        if (err) {
          console.log('error finding symbol :' + err);
        }

        if (row.num > 0) {
          this._db.run('update symbols set handle = ? where name = ?', [row.handle, row.name], (err) => {
            if (err) {
              reject('error updating symbol ' + symbol.name + ' - ' + err.message);
            }
            resolve();
          });
        } else {
          this._db.run('insert into symbols (handle, name) values (?, ?)', [row.handle, row.name], (err) => {
            if (err) {
              reject('error inserting symbol ' + symbol.name + ' - ' + err.message);
            }
            resolve();
          });
        }          
      });
    });

  }

  /**
   * 
   * @param {*} symbol 
   */
  db_update_notifyhandle (symbol) {

    return new Promise((resolve, reject) => {
      this._db.run('update symbols set notify = ? where name = ?', [symbol.notify, symbol.name], (err) => {
        if (err) {
          reject('error updating symbol ' + symbol.name + ' - ' + err.message);
        }
        resolve();
      });
    });

  }

  /**
   * fetch a specific (series of) symbol handle(s)
   * store the result in the SQLite database
   * 
   * @param {*} options 
   * @param {Buffer} txData 
   */
  plc_invoke_symbolhandles(options, txData) {

    return new Promise(async (resolve, reject) => {
      try {
        const rxdata = await this.plc_invoke(options, txData, 'gethandle');
        
        for (let i=0; i < rxdata.data.symbols.length; i++) {

          await this.db_update_symbolhandle(rxdata.data.symbols[i]);
          
        }

        resolve('OK');
      }
      catch (exc) {
        reject(exc);
      }
      
    });
  }

  /**
   * release all used handles
   * @param {*} symbols 
   */
  async plc_release_symbolhandles(symbols) {
    let symQry = 'select name, handle from symbols where handle <> -1';

    if (Array.isArray(symbols)) {
      symQry += ' and name in (?';
      for (let i = 1; i < symbols.length; i++) {
        symQry += ', ?';
      }

      symQry += ')';
    } else if (symbols) {
      symbols = new Array(symbols);

      symQry += ' and name = ?'; 
    } else {
      symbols = [];
    }
    return new Promise(async (resolve, reject) => {

      this.db.all(symQry, symbols, async (err, rows) => {
        if (err) {
          reject(err);
        }

        if (rows.length > 0) {
          let txData = null;

          const options = {
            cmd     : config.ADSCMD.INVALID,
            len     : 0,
            invoke  : ++this.invokeId,
            request : {},
            symbols : [] 
          };

          for (let i = 0; i < rows.length; i++) {
            const handle = {
              group  : config.ADSIGRP.RELEASE_SYMHANDLE,
              offset : 0,
              name      : rows[i].name,
              length    : 4,
              handle    : rows[i].handle
            };

            options.symbols.push(handle);
          }
          if (options.symbols.length == 1) {
            options.cmd = config.ADSCMD.Write;
            txData = before.prepareCommandWrite(options, this._settings, 'relhandle');
          } else {
            options.cmd = config.ADSCMD.ReadWrite;
            options.request = {
              group   : config.ADSIGRP.SUMUP_WRITE,
              offset  : options.symbols.length,
              rLength : options.symbols.length *  4,
              wLength : options.symbols.length * 16
            };

            txData = before.prepareCommandReadWrite(options, this._settings, 'relhandle');
          }

          const rxData = await this.plc_invoke(options, txData, 'relhandle')
            .catch((error) => {
              console.error('error release handle: ' + error);
              reject('NOK');
            });
          for (let i = 0; i < options.symbols.length; i++) {
            options.symbols[i].handle = -1;
            await this.db_update_symbolhandle(options.symbols[i]);
          }
          console.log('release : ' + JSON.stringify(rxData));
          resolve('OK');
        } else {
          resolve('NONE');
        }
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
  async plc_fetch_symbolhandles (symbols) {

    // start by fetching some symbol info from the database
    const options = {
      cmd     : config.ADSCMD.INVALID,
      len     : -1,
      invoke  : 0,
      request : {},
      symbols : await this.db_fetch_symbolhandles(symbols)
    };
  
    return new Promise(async (resolve, reject) => {
      let txData = null;
      let rxData = null;
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
          txData = before.prepareCommandReadWrite(options, this._settings, 'gethandle');
          rxData = await this.plc_invoke_symbolhandles(options, txData); 
    
          rxData = await this.db_fetch_symbolhandles(symbols);
          resolve(rxData);
        } else {
          resolve(options.symbols);
        }
      }
      catch (exc) {
        reject(exc);
      }
      
    });
  }

  /**
   * on 'data' event handler for data received from the PLC.
   * to spice things up, execution takes place in the 'plc' object so we cannot
   * use our local version of the database
   * 
   * @param {*} data  
   */
  async recv_Plc_Data (data) {
  //  async recv_Plc_Data (data, db) {

    const result = {
      //'buffer' : data.slice(38),
      'length' : data.readUInt32LE(2),
      'header' : after.analyzeHeader(data.slice(6,38)),
      'data'   : null
    };

    let resolved = -1;
    let rxData = {};
    switch (result.header.command) {
      case config.ADSCMD.INVALID :
        break;

      case config.ADSCMD.ReadDeviceInfo :
        result.data = after.analyzeCommandInfo(data.slice(38));
        break;

      case config.ADSCMD.Read :
        rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        result.data = after.analyzeCommandRead(data.slice(38));
        if (result.data.error != 0) {
          break;
        }
        switch (rxData.kind) {
          case 'uploadinfo':
            result.data = after.analyzePlcUploadInfo(result.data);
            break;

          case 'getvalue':
            result.data.symbols = after.analyzePlcSymbolValues(result.data.buffer, rxData.symbols);
            break;

          case 'symbols':
            result.data.symbols = after.analyzePlcSymbols(result.data.buffer);
            break;

          case 'datatypes':
            result.data.datatypes = after.analyzePlcDataTypes(result.data.buffer);
            break;

          default:
            //result.data = after.analyzePlcRead(data.slice(38));
            break;
        }
        break;

      case config.ADSCMD.Write :
        rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        result.data = after.analyzeCommandWrite(data.slice(38));
        if (result.data.error != 0) {
          break;
        }
        switch (rxData.kind) {
          case 'setvalue':
            result.data.symbols = after.analyzePlcSymbolsWrite(result.data.buffer, rxData.symbols);
            break;

          case 'relhandle':
            result.data.symbols = after.analyzePlcDelSymbolHandles(result.data.buffer, rxData.symbols);
            break;

          default:
            //result.data = after.analyzePlcWrite(data.slice(38));
            break;
        }
        break;

      case config.ADSCMD.ReadState :
        result.data = after.analyzeCommandState(data.slice(38));
        break;

      case config.ADSCMD.WriteControl :
        // TODO
        break;
  
      case config.ADSCMD.NotificationAdd :
        //rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        //result.data = after.analyzeAddPlcNotification(data.slice(38));
        //rxData.symbols[0].notify = result.data.handle;
        //this.db_update_notifyhandle(rxData.symbols);
        //await this.track_PlcInvoke_UpdRequest(result.header.invoke, rxData.symbols);
        break;
  
      case config.ADSCMD.NotificationDel :
        //rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        //result.data = after.analyzeDelPlcNotification(data.slice(38), rxData.symbols);
        //rxData.symbols[0].notify = -1;
        //this.db_update_notifyhandle(rxData.symbols);
        //await this.track_PlcInvoke_UpdRequest(result.header.invoke, rxData.symbols);
        break;
  
      case config.ADSCMD.Notification :
        //result.data = after.analyzePlcNotification(data.slice(38));
        //this.emit('notify', result.data);
        break;
  
      case config.ADSCMD.ReadWrite :
        rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        result.data = after.analyzeCommandReadWrite(data.slice(38));
        if (result.data.error != 0) {
          break;
        }
        switch (rxData.kind) {
          case 'gethandle':
            result.data.symbols = after.analyzePlcSymbolHandles(result.data.buffer, rxData.symbols);
            break;

          case 'relhandle':
            result.data.symbols = after.analyzePlcDelSymbolHandles(result.data.buffer, rxData.symbols);
            break;

          case 'getvalue':
            result.data.symbols = after.analyzePlcSymbolValues(result.data.buffer, rxData.symbols);
            break;

          case 'setvalue':
            result.data.symbols = after.analyzePlcSymbolWrite(result.data.buffer, rxData.symbols);
            break;

          //default:
          //  //esult.data = after.analyzePlcReadWrite(data.slice(38));
          //  break;
        }
        
        break;
    }

    resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result);
    while (resolved != 'OK') {
      await config.sleep(1);

      resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result);
    }

  }

  recv_Plc_Error (error, db) {
    console.error(config.getTimestamp() + ' - ' + error);

    this.track_PlcInvoke_FlagError(error, db);
  }

  recv_Plc_Close (had_error) {
    if (had_error) {
      console.warn(config.getTimestamp() + ' - connection closed due to error');
      //reject('abort');
    } else {
      console.log(config.getTimestamp() + ' - connection closed ');
    }
  }

  async destroy() {
    await this.plc_release_symbolhandles();
    // await release notify handles

    this._plc.closeSocket();
    this._db.close();
  }

}

/*
 *  REQUESTS to be made
 */ 

/**
  * fetch general PLC info
  * 
  * @param {function} callback 
  */
BeckhoffClient.prototype.getPlcInfo = function() {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.ReadDeviceInfo,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : []
  };
  const txHeader = before.prepareHeader(options, this.settings);

  return new Promise(async (resolve, reject) => {
    try {
      rxInfo = await this.plc_invoke(options, txHeader, 'info')
        .catch((error) => {
          throw error;
        });
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data);
    }
  });  
};

/**
 * fetch PLC running state
 * 
 */
BeckhoffClient.prototype.getPlcState = async function() {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.ReadState,
    len     : 0,
    invoke  : ++this.invokeId,
    request : {},
    symbols : []
  };
  const txHeader = before.prepareHeader(options, this.settings);

  return new Promise(async (resolve, reject) => {
    try {
      rxInfo = await this.plc_invoke(options, txHeader, 'state')
        .catch((error) => {
          throw error;
        });
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data);
    }
  });
};

/**
 * fetch all known symbols from the PLC
 * cache them in the SQLite database for later reference 
 * 
 */
BeckhoffClient.prototype.getPlcSymbols = async function() {
  let rxInfo = {};
  let isDbClean = false;

  // release any existing symbolhandles before refreshing
  await this.plc_release_symbolhandles();
  //await release notify handles

  let options = {
    cmd     : config.ADSCMD.Read,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {
      group  : config.ADSIGRP.SYM_UPLOADINFO2,
      offset : 0x00000000,
      length : 0x30
    },
    symbols : []
  };
  let txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  // be sure to clean up the database
  this.db.serialize(() => {

    this.db.run('BEGIN TRANSACTION');
    this.db.run('DELETE FROM symbols', [], (err) => {
      if (err) {
        console.log('error deleting data:' + err);
      }
      isDbClean = true;
    });
  });

  return new Promise(async (resolve, reject) => {
    try {
      // first command
      rxInfo = await this.plc_invoke(options, txData, 'uploadinfo')
        .catch((error) => {
          throw error;
        });
      console.log(JSON.stringify(rxInfo));
      
      // prepare symbols request with data from first response
      options = {
        cmd     : config.ADSCMD.Read,
        len     : -1,
        invoke  : ++this.invokeId,
        request : {
          group  : config.ADSIGRP.SYM_UPLOAD,
          offset : 0x00000000,
          length : rxInfo.data.symbols.length
        },
        symbols : []
      };
      txData = before.prepareCommandRead(options, this.settings, 'symbols');
      
      // second command
      rxInfo = await this.plc_invoke(options, txData, 'symbols')
        .catch((error) => {
          throw error;
        });

      // wait until database is cleaned up
      while (!isDbClean) {
        await config.sleep(1);
      }

      // store everything in the database
      const insStmt = 'INSERT INTO symbols VALUES (?,?,?,?,?,?, -1, -1)';
  
      this.db.serialize(() => {
        
        this.db.parallelize(() => {
          rxInfo.data.symbols.forEach(element => {
            
            this.db.run(insStmt, [element.group, element.offset, element.size, element.name, element.kind, element.comment], (err) => {
              if (err) {
                console.log('error inserting symbol :' + err);
              }
            });
          });
        });
        this.db.run('COMMIT', [], (err) => {
          if (err) {
            reject(err);
          }
          resolve(rxInfo.data.symbols);
        });
      });
    }
    catch (exc) {
      reject(exc);
    }

  });

};

/**
 * retrieve the list of data types and store them into the database
 */
BeckhoffClient.prototype.getPlcDataTypes = async function() {
  let rxInfo = {};
  let isDbClean = false;

  let options = {
    cmd     : config.ADSCMD.Read,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {
      group  : config.ADSIGRP.SYM_UPLOADINFO2,
      offset : 0x00000000,
      length : 0x30
    },
    symbols : []
  };
  let txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  // be sure to clean up the database
  this.db.serialize(() => {

    this.db.run('BEGIN TRANSACTION');
    this.db.run('DELETE FROM datatypes', [], (err) => {
      if (err) {
        console.log('error deleting data:' + err);
      }
      isDbClean = true;
    });
  });

  return new Promise(async (resolve, reject) => {
    try {
      // first command
      rxInfo = await this.plc_invoke(options, txData, 'uploadinfo')
        .catch((error) => {
          throw error;
        });
      console.log(JSON.stringify(rxInfo));

      // prepare datatypes request with data from first response
      options = {
        cmd     : config.ADSCMD.Read,
        len     : -1,
        invoke  : ++this.invokeId,
        request : {
          group  : config.ADSIGRP.SYM_DT_UPLOAD,
          offset : 0x00000000,
          length : rxInfo.data.datatypes.length
        },
        symbols : []
      };
      txData = before.prepareCommandRead(options, this.settings, 'datatypes');
      
      // second command
      rxInfo = await this.plc_invoke(options, txData, 'datatypes')
        .catch((error) => {
          throw error;
        });

      // wait until database is cleaned up
      while (!isDbClean) {
        await config.sleep(1);
      }

      const insStmt = 'INSERT INTO datatypes VALUES (?,?,?,?,?,?,?,?,?,?)';
      this.db.serialize(() => {
        
        this.db.parallelize(() => {
          rxInfo.data.datatypes.forEach(element => {
            
            this.db.run(insStmt, [element.version, element.size, element.offset, element.datatype, element.flags, element.name, element.kind, element.comment, element.arraySize, element.subItems], (err) => {
              if (err) {
                console.log('error inserting datatype :' + err);
              }
            });
          });
        });
        this.db.run('COMMIT', [], (err) => {
          if (err) {
            reject(err);
          }
          resolve(rxInfo.data);
        });
      });
    }
    catch (exc) {
      reject(exc);
    }
  });
};

/**
 * read the value of all items passed on via symData
 * this routine works for 1 or more symbols
 * if necessary: fetch the symbol handle first and complete settings in SQLite db
 * 
 * @param {object} symData info needed per symbol: name
 */
BeckhoffClient.prototype.readPlcData = async function(symData) {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise(async (resolve, reject) => {
    let txData = null;
    
    options.invoke = ++this.invokeId;
    if (options.symbols.length == 1) {
      options.cmd = config.ADSCMD.Read;
      txData = before.prepareCommandRead(options, this.settings, 'getvalue');
    } else {
      options.cmd = config.ADSCMD.ReadWrite;

      let symlen = 0;
      let dataLen = 0;
      for (let i = 0; i < options.symbols.length; i++) {
        symlen  += options.symbols[i].size + 4;
        dataLen += 12;
      }

      options.request.group = config.ADSIGRP.SUMUP_READ;
      options.request.offset = options.symbols.length;
      options.request.rLength = symlen;
      options.request.wLength = dataLen;

      txData = before.prepareCommandReadWrite(options, this.settings, 'getvalue');
    }
    
    try {  
      rxInfo = await this.plc_invoke(options, txData, 'getvalue')
        .catch((error) => {
          throw error;
        });
      if (rxInfo.data.error != 0) {
        reject(rxInfo.data);
      }
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data.symbols);
    }
  });
  
};

/**
 * write the value of all items passode on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {object} symData info needed per symbol: name, value
 */
BeckhoffClient.prototype.writePlcData = async function (symData) {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise(async (resolve, reject) => {
    let txData = null;

    options.invoke = ++this.invokeId;
    if (options.request.length == 1) {
      options.cmd = config.ADSCMD.Write;
      txData = before.prepareCommandWrite(options, this.settings, 'setvalue');
    } else {
      options.cmd = config.ADSCMD.ReadWrite;
      // TODO
      //txData = before.preparePlcWriteRead(options, settings);
    }
    

    try {
      rxInfo = await this.plc_invoke(options, txData, 'setvalue')
        .catch((error) => {
          throw error;
        });       
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data.symbols);
    }
  });
};

/**
 * 
 * @param {object} symData info needed per symbol: name, mode, delay, cycletime 
 */
BeckhoffClient.prototype.addPlcNotification = async function (symData) {
  const options = {
    cmd     : config.ADSCMD.NotificationAdd,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise(async (resolve, reject) => {
    let txData = null;
    let rxInfo = null;
    
    options.invoke = ++this.invokeId;
    txData = before.prepareCommandAddNotification(options, this.settings);

    try {
      rxInfo = await this.plc_invoke(options, txData, 'write')
        .catch((error) => {
          throw error;
        });
        
      this.db_update_notifyhandle(rxInfo.data.symbols[0]);
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data.symbols);
    }
    
  });
};

/**
 * 
 * @param {*} symData info needed per symbol: name 
 */
BeckhoffClient.prototype.delPlcNotification = async function (symData) {
  const options = {
    cmd     : config.ADSCMD.NotificationDel,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise(async (resolve, reject) => {
    let txData = null;
    let rxInfo = null;
    
    options.invoke = ++this.invokeId;
    txData = before.prepareCommandDelNotification(options, this.settings);

    try {
      rxInfo = await this.plc_invoke(options, txData, 'write')
        .catch((error) => {
          throw error;
        });
        
      this.db_update_notifyhandle(rxInfo.data.symbols[0]);
    }
    catch (exc) {
      reject(exc);
    }
    finally {
      resolve(rxInfo.data.symbols);
    }
  });
};

module.exports = BeckhoffClient;
