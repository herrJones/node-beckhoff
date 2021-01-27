'use strict';

const debug = require('debug')('bkhf');
const debugVerbose = require('debug')('bkhf:details');
const debugRaw = require('debug')('bkhf:raw-data');
const debugError = require('debug')('bkhf:error');

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
    
    // create / initialize database
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
        return debugError(err.message);
      }

      this.create_database();
    });
    
    // prepare PLC connection
    this._plc = new beckhoffBridge({
      ip      : this._settings.plc.ip,
      port    : this._settings.plc.port,
      db      : this._db,
      develop : {
        verbose : this._settings.develop.verbose,
        debug   : this._settings.develop.debug
      }
    });
    this._plc.on('data',   this.recv_Plc_Data);
    //this._plc.on('notify', this.recv_Plc_Notify);
    this._plc.on('notify', (data) => {
      this.emit('notify', data);
    });
    this._plc.on('error',  this.recv_Plc_Error);
    this._plc.on('close',  this.recv_Plc_Close);

    debug.enabled = true;
    debugError.enabled = true;
    debugVerbose.enabled = this._settings.develop.verbose;
    debugRaw.enabled = this._settings.develop.debug;

    // prepare general settings
    this.invokeId = 0;
    this.cleanup = setTimeout(() => {
      debug('cleaning history ' + JSON.stringify(this._settings.develop));
      debug('  -> history  :' + (this._settings.develop.save ? '-1 days' : '-5 minutes'));
      debug('  -> tracking :' + (this._settings.develop.save ? '-6 hours' : '-5 minutes'));
      this.cleanup_history(this._settings.develop);
    }, 30000, this._settings.develop);
    
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

    this._plc.closeSocket();
    this._db.close();
  }

  create_database () {
    this._db.parallelize(() => {

      this._db.run(`
        CREATE TABLE IF NOT EXISTS tracking (
          time           REAL,
          invokeId       INTEGER default 0,
          kind           TEXT,
          handle         INTEGER default 0,
          options        BLOB,
          data           BLOB
        )
      `, [], (err) => {
        if (err) {
          debugError('create tracking table: ' + err);
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
          handle         INTEGER DEFAULT 0,
          notify         INTEGER DEFAULT 0
        )
      `, [], (err) => {
        if (err) {
          debugError('create symbols table: ' + err);
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
          debugError('create datatypes table: ' + err);
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
          handle         INTEGER,
          value          TEXT
        )
      `, [], (err) => {
        if (err) {
          debugError('create history table: ' + err);
          return;
        }

        this._db.run(`
          CREATE INDEX IF NOT EXISTS idx_history_handle
              ON history(handle, time)
        `);
        this._db.run(`
          CREATE VIEW IF NOT EXISTS vw_history AS
            select h.time, s.name, s.kind, h.value
              from symbols s,
                   history h
             where h.handle = s.handle
             order by s.name, h.time
        `);
      });
      
    });

  }

  cleanup_history(settings) {
    this.cleanup = setTimeout(() => {
      this.cleanup_history(settings);
    }, 300000, settings);

    this._db.serialize(() => {
      this._db
        .run('BEGIN TRANSACTION', [], (err) => {
          if (err) {
            debugError('on cleanup: ' + err);
            return;
          }

          this._db
            .run(`delete from history 
                   where time not in (select max(time)
                                        from history
                                       where time >= datetime('now', ` + (settings.save ? `'- 1 days'` : `'-5 minutes'`) + `)
                                       group by handle)`, (err) => {
              if (err) {
                debugError(JSON.stringify(err));
              }
            })
            .run(`delete from tracking
                   where invokeId = 0
                     and time < datetime('now', ` + (settings.save ? `'-6 hours'` : `'-5 minutes'`) + `)`);
        })
        .run('COMMIT');
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

    // change debug-levels
    debugVerbose.enabled = value.develop.verbose;
    debugRaw.enabled = value.develop.debug;
  }
  get db() {
    return this._db;
  }

  /**
   * store execution record in database
   * 
   * @param {Object} options 
   * @param {string} kind 
   */
  track_PlcInvoke_Start(options, kind) {
  
    const reqhandle = setTimeout(() => {
      
      this._db.run(`
        update tracking
           set handle = 0,
               data = 'timeout'
         where invokeId = ?`, [options.invoke], (err) => {
        if (err) {
          debugError(err.message);
          return err.message;
        }
      });
       
      debug('timeout handler for invokeId ' + options.invoke);
    }, 15000, options);

    return new Promise((resolve, reject) => {
      this._db.run(`
        insert into tracking(time, invokeId, options, handle, kind)
          values (datetime('now'), ?, ?, ?, ?)
      `, [options.invoke, JSON.stringify(options), reqhandle, kind], (err) => {
        if (err) {
          reject(err.message);
          return;
        }
        resolve(reqhandle);
      });
    });
  }

  /**
   * check execution record in database
   * 
   * @param {int} invokeId 
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
            return;
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
            return;
          }
          
          //if (this._settings.develop.save) {
          this._db.run(`
            update tracking 
                set invokeId = 0 
              where invokeId = ?`, [invokeId], (err) => {
            if (err) {
              reject(err.message);
              return;
            }
          });
          //} else {
          //  this._db.run('delete from tracking where invokeId =  ?', [invokeId], (err) => {
          //    if (err) {
          //      reject(err.message);
          //    }
          //  });
          //}
          
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
   * @param {Object} options 
   * @param {Buffer} txData 
   * @param {string} kind 
   */
  async plc_invoke (options, txBuffer, kind) {
    let rxInfo = {};
    await this.track_PlcInvoke_Start(options, kind)
      .catch((exc) => {
        debugError(JSON.stringify(exc));
        throw exc;
      });

    return new Promise((resolve, reject) => {
      this._plc.sendBuffer(txBuffer, kind)
        .then(async () => {
          let reqhandle = -1;
          while (reqhandle != 0) {
            await config.sleep(1);
            reqhandle = await this.track_PlcInvoke_Check(options.invoke)
              .catch((exc) => {
                debugError(JSON.stringify(exc));
                throw exc;
              });                 
          }
          rxInfo = await this.track_PlcInvoke_Clear(options.invoke)
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
   * refresh datatype info in the database
   * 
   * @param {Array} datatypes 
   * @returns {String} status message
   */
  db_prepare_datatypes(datatypes) {
    const insStmt = 'INSERT INTO datatypes VALUES (?,?,?,?,?,?,?,?,?,?)';
    
    return new Promise((resolve, reject) => {

      this._db.serialize(() => {
        this._db
          .run('BEGIN TRANSACTION', [], (err) => {
            if (err) {
              reject(err);
            }

            this._db.serialize(() => {
              this._db
                .run('DELETE FROM datatypes')
                .parallelize(() => {
                  datatypes.forEach(element => {
              
                    this.db.run(insStmt, [element.version, element.size, element.offset, element.datatype, element.flags, element.name, element.kind, element.comment, element.arraySize, element.subItems], (err) => {
                      if (err) {
                        debugError('error inserting datatype :' + err);
                      }
                    });
                  });
                });
            });
          })
          .run('COMMIT', [], (err) => {
            if (err) {
              reject(err);
            }
            resolve('OK');
          });

      });
    });
  }

  /**
   * refresh symbol info in the database
   * 
   * @param {Array} symbols 
   * @returns {String} status message
   */
  db_prepare_symbolinfo(symbols) {
    const insStmt = 'INSERT INTO symbols VALUES (?,?,?,?,?,?, 0, 0)';

    return new Promise((resolve, reject) => {

      this._db.serialize(() => {
        this._db
          .run('BEGIN TRANSACTION', [], (err) => {
            if (err) {
              reject(err);
            }

            this._db.serialize(() => {
              this._db
                .run('DELETE FROM symbols')
                .parallelize(() => {
                  symbols.forEach(element => {
                  
                    this._db.run(insStmt, [element.group, element.offset, element.size, element.name, element.kind, element.comment], (err) => {
                      if (err) {
                        debugError('error inserting symbol :' + err);
                      }
                    });
                  });
                });
            });
          })
          .run('COMMIT', [], (err) => {
            if (err) {
              reject(err);
            }
            resolve('OK');
          });

      });
    });
    
  }

  /**
   * find handles for symbols in the local database
   * symbol names will be converted to UPPERCASE
   * 
   * @param {object} requests list of symbols to find
   * @returns {Promise} symboldetails 
   */
  db_fetch_symbolinfo (symbols) {
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
          return;
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
                'handle' : 0,
                'notify' : 0
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
   * fetch the notification handle
   * 
   * @param {Array} symbol object with symbol information
   * @returns {Array} with symbol info found
   */
  db_fetch_symbolhandle (symbols) {
    const result = [];
    const names = [];
    let symQry = `select idxGroup, idxOffset, name, handle, notify 
                    from symbols 
                   where (handle <> 0 or notify <> 0)`;

    if (symbols.length > 1) {
      symQry += ' and name in (?';
      for (let i = 1; i < symbols.length; i++) {
        symQry += ', ?';
        names.push(symbols[i].name.toUpperCase());
      }

      symQry += ')';
    } else if (symbols.length == 1) {
      symQry += ' and name = ?'; 
      names.push(symbols[0].name.toUpperCase());
    } 
    return new Promise((resolve, reject) => {
      this._db.all(symQry, names, async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        if (rows) {
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

            result.push(newSymbol);
          }
        }

        resolve(result);
      });
    });
  }
  
  /**
   * update symbol and/or notify handle in the database
   * 
   * @param {Object} symbol object with symbol information
   */
  db_update_symbolhandle (symbol) {

    return new Promise((resolve, reject) => {
      this._db.get(`select ? as name, 
                           ? as handle, 
                           ? as notify, 
                           count(1) as num 
                      from symbols 
                     where name = ?`, [symbol.name, symbol.handle, symbol.notify, symbol.name], (err, row) => {
        if (err) {
          debugError('error finding symbol :' + err);
        }

        if (row.num > 0) {
          this._db.run(`update symbols 
                           set handle = ?,
                               notify = ? 
                         where name = ?`, [row.handle, row.notify, row.name], (err) => {
            if (err) {
              reject('error updating symbol ' + symbol.name + ' - ' + err.message);
              return;
            }
            resolve();
          });
        } else {
          this._db.run('insert into symbols (handle, name) values (?, ?)', [row.handle, row.name], (err) => {
            if (err) {
              reject('error inserting symbol ' + symbol.name + ' - ' + err.message);
              return;
            }
            resolve();
          });
        }          
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

            await this.db_update_symbolhandle(rxdata.data.symbols[i]);
            
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
  async plc_fetch_symbolhandles (symbols) {

    // start by fetching some symbol info from the database
    const options = {
      cmd     : config.ADSCMD.INVALID,
      len     : -1,
      invoke  : 0,
      request : {},
      symbols : await this.db_fetch_symbolinfo(symbols)
    };
  
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
          txData = before.prepareCommandReadWrite(options, this._settings, 'gethandle');
          
          this.plc_invoke_symbolhandles(options, txData)
            .then(async (rxData) => {
              rxData = await this.db_fetch_symbolinfo(symbols);
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
   * on 'data' event handler for data received from the PLC.
   * to spice things up, execution takes place in the 'plc' object so we cannot
   * use our local version of the database
   * 
   * @param {Buffer} data buffer with RX-data
   */
  async recv_Plc_Data (data) {

    const result = {
      'length' : data.readUInt32LE(2),
      'header' : after.analyzeCommandHeader(data.slice(6,38)),
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
            this.db_store_symbolhistory(result.data.symbols);
            break;

          case 'symbols':
            result.data.symbols = after.analyzePlcSymbols(result.data.buffer);
            break;

          case 'datatypes':
            result.data.datatypes = after.analyzePlcDataTypes(result.data.buffer);
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
            result.data.symbols = after.analyzePlcSymbolWrite(result.data.buffer, rxData.symbols);
            break;

          case 'relhandle':
            result.data.symbols = after.analyzePlcDelSymbolHandles(result.data.buffer, rxData.symbols);
            break;

        }
        break;

      case config.ADSCMD.ReadState :
        result.data = after.analyzeCommandState(data.slice(38));
        break;

        //case config.ADSCMD.WriteControl :
        //  // TODO
        //  break;
  
      case config.ADSCMD.NotificationAdd :
        rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        result.data = after.analyzeCommandAddNotification(data.slice(38), rxData.symbols);
        break;
  
      case config.ADSCMD.NotificationDel :
        rxData = await this.track_PlcInvoke_GetRequest(result.header.invoke);
        result.data = after.analyzeCommandDelNotification(data.slice(38), rxData.symbols);
        break;
  
      case config.ADSCMD.Notification :      
        result.data = after.analyzeCommandNotification(data.slice(38));
        result.data.symbols = await this.db_store_notifyhistory(result.data.symbols)
          .catch((error) => {
            debugError(error);
          });
        this.track_notification(result);
        //this.emit('notify', result.data.symbols);
        return;
  
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
            this.db_store_symbolhistory(result.data.symbols);
            break;

          case 'setvalue':
            result.data.symbols = after.analyzePlcSymbolWrite(result.data.buffer, rxData.symbols);
            break;
        }
        break;
    }

    resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result)
      .catch((error) => {
        debugError(error);
      });
    while (resolved != 'OK') {
      await config.sleep(1);

      resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result)
        .catch((error) => {
          debugError(error);
        });
    }

  }

  /**
   * on 'error' event
   * 
   * @param {*} error 
   */
  recv_Plc_Error (error) {
    debugError(config.getTimestamp() + ' - ' + error);

    this.track_PlcInvoke_FlagError(error);
  }

  /**
   * on 'close' event
   * 
   * @param {boolean} had_error 
   */
  recv_Plc_Close (had_error) {
    if (had_error) {
      debugError(config.getTimestamp() + ' - connection closed due to error');
    } else {
      debug(config.getTimestamp() + ' - connection closed ');
    }
  
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
    cmd     : config.ADSCMD.ReadDeviceInfo,
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
    cmd     : config.ADSCMD.ReadState,
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
  txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txData, 'uploadinfo')
      .then(async (rxInfo) => {
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
        rxInfo = await this.plc_invoke(options, txData, 'symbols');

        // cleanup data (if needed) and store fetched symbols
        await this.db_prepare_symbolinfo(rxInfo.data.symbols);
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
  txData = before.prepareCommandRead(options, this.settings, 'uploadinfo');

  return new Promise((resolve, reject) => {
    this.plc_invoke(options, txData, 'uploadinfo')
      .then(async (rxInfo) => {
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

        rxInfo = await this.plc_invoke(options, txData, 'datatypes');
        
        // cleanup data (if needed) and store fetched symbols
        await this.db_prepare_datatypes(rxInfo.data.datatypes);
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
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise((resolve, reject) => {
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
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : await this.plc_fetch_symbolhandles(symData)
  };

  return new Promise((resolve, reject) => {
    let txData = null;

    options.invoke = ++this.invokeId;
    if (options.symbols.length == 1) {
      options.cmd = config.ADSCMD.Write;
      txData = before.prepareCommandWrite(options, this.settings, 'setvalue');
    } else {
      let dataLen = 0;
      for (let i = 0; i < options.symbols.length; i++) {
        dataLen += 12 + options.symbols[i].size;
      }

      options.cmd = config.ADSCMD.ReadWrite;

      options.request.group = config.ADSIGRP.SUMUP_WRITE;
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
 * release one, more or all symbolhandles used to read and write values
 * 
 * @param {Array} symData list of symbols to release
 * @returns {String} status message
 */
BeckhoffClient.prototype.delPlcHandle = async function (symData) {
  let txData = null;

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : ++this.invokeId,
    request : {},
    symbols : await this.db_fetch_symbolhandle(symData)
  };

  return new Promise((resolve, reject) => {
    before.prepareDelHandleRequest(options);
    
    if (options.symbols.length == 1) {
      options.cmd = config.ADSCMD.Write;
      txData = before.prepareCommandWrite(options, this._settings, 'relhandle');
    } else if (options.symbols.length  > 1) {
      options.cmd = config.ADSCMD.ReadWrite;
      txData = before.prepareCommandReadWrite(options, this._settings, 'relhandle');
    } else {
      resolve('NONE');
      return;
    }

    this.plc_invoke(options, txData, 'relhandle')
      .then(async (rxData) => {
        for (let i = 0; i < options.symbols.length; i++) {
          options.symbols[i].handle = 0;
          await this.db_update_symbolhandle(options.symbols[i]);
        }
        console.log('release : ' + JSON.stringify(rxData));
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

  if (!Array.isArray(symData)) {
    symData = new Array(symData);
  }

  const allSymbols = await this.db_fetch_symbolhandle(symData);
  const options = {
    cmd     : config.ADSCMD.NotificationAdd,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : []
  };

  return new Promise((resolve, reject) => {
    let txData = null;

    for (let i = 0; i < allSymbols.length; i++) {
      options.invoke = ++this.invokeId;
      options.symbols = allSymbols[i];
      txData = before.prepareCommandAddNotification(options, this.settings);

      this.plc_invoke(options, txData, 'addnotify')
        .then(async (rxInfo) => {
          await this.db_update_symbolhandle(rxInfo.data.symbols)
            .catch((error) => {
              console.error(error);
            });

        })
        .catch((exc) => {
          reject(exc);
        });
    }

    resolve(allSymbols);
    
  });
};


/**
 * 
 * @param {Array} symData info needed per symbol: name 
 * @returns {Promise} written symbol info
 */
BeckhoffClient.prototype.delPlcNotification = async function (symData) {
  
  if (!Array.isArray(symData)) {
    symData = new Array(symData);
  }

  const allSymbols = await this.db_fetch_symbolhandle(symData);
  const options = {
    cmd     : config.ADSCMD.NotificationDel,
    len     : -1,
    invoke  : -1,
    request : {},
    symbols : []
  };

  return new Promise((resolve, reject) => {
    let txData = null;

    for (let i = 0; i < allSymbols.length; i++) {
      options.invoke = ++this.invokeId;
      options.symbols = allSymbols[i];
      txData = before.prepareCommandDelNotification(options, this.settings);

      this.plc_invoke(options, txData, 'delnotify')
        .then(async (rxInfo) => {
          await this.db_update_symbolhandle(rxInfo.data.symbols)
            .catch((error) => {
              console.error(error);
            });

        })
        .catch((exc) => {
          reject(exc);
        });
    }

    resolve(allSymbols);

  });
  
};


module.exports = BeckhoffClient;
