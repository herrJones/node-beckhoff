'use strict';

const sqlite3 = require('sqlite3').verbose();

const debug = require('debug')('bkhf-db');
const debugVerbose = require('debug')('bkhf-db:details');
const debugError = require('debug')('bkhf-db:error');

class BeckhoffDB {
  #database;
  
  constructor (config) {
    let sqliteConnection = ':memory:';
    if (config.save) {
      if (!config.location || (config.location == undefined)) {
        sqliteConnection = __dirname + '/beckhoff.db3';
      } else {
        sqliteConnection = config.location + '/beckhoff.db3';
      } 
    }

    this.#database = new sqlite3.Database(sqliteConnection, (err) => {
      if (err) {
        return debugError(err.message);
      }
      if (config.save) {
        this.#database.run('PRAGMA journal_mode=MEMORY;');
      }

      this.create_database();
    });

  }

  close () {
    this.#database.close();
  }

  create_database () {
    this.#database.parallelize(() => {

      this.#database.run(`
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

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_track_invoke
              ON tracking(invokeId desc)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_track_time
              ON tracking(time asc)
        `);
      });
      
      this.#database.run(`
        CREATE TABLE IF NOT EXISTS symbols (
          idxGroup       INTEGER DEFAULT 0,
          idxOffset      INTEGER DEFAULT 0,
          size           INTEGER DEFAULT 0,
          name           TEXT,
          kind           TEXT DEFAULT 'none',
          comment        TEXT DEFAULT '',
          handle         INTEGER DEFAULT 0,
          notify         INTEGER DEFAULT 0,
          typeguid       TEXT,
          arrdata        BLOB,
          attrs          BLOB
        )
      `, [], (err) => {
        if (err) {
          debugError('create symbols table: ' + err);
          return;
        }

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_name
              ON symbols(name asc)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_handle
              ON symbols(handle desc)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_notify
              ON symbols(notify desc)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_guid
              ON symbols(typeguid asc)
        `);
      });
      
      this.#database.run(`
        CREATE TABLE IF NOT EXISTS datatypes (
          version        INTEGER,
          size           INTEGER,
          offset         INTEGER,
          datatype       INTEGER,
          flags          INTEGER,
          name           TEXT,
          kind           TEXT,
          comment        TEXT,
          hash           TEXT,
          typehash       TEXT,
          arrdata        BLOB,
          subdata        BLOB,
          typeguid       TEXT,
          attrs          BLOB,
          enums          BLOB
        )
      `, [], (err) => {
        if (err) {
          debugError('create datatypes table: ' + err);
          return;
        }

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_datatype_name
              ON datatypes(name asc)
        `);

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_datatype_guid
              ON datatypes(typeguid asc)
        `);
      });

      this.#database.run(`
        CREATE TABLE IF NOT EXISTS rpcmethods (
          typeguid       TEXT,
          version        INTEGER,
          vtableidx      INTEGER,
          retsize        INTEGER,
          retalignsize   INTEGER,
          returnguid     TEXT,
          adstype        TEXT,
          flags          BLOB,
          name           TEXT,
          kind           TEXT,
          comment        TEXT,
          parms          BLOB
        )
        `, [], (err) => {
        if (err) {
          debugError('create rpcmethods table: ' + err);
          return;
        }

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_rpcmethod_guid
              ON rpcmethods(typeguid asc)
        `);
      });

      this.#database.run(`
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

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_history_handle
              ON history(handle desc)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_history_time
              ON history(time asc)
        `);
        this.#database.run(`
          CREATE VIEW IF NOT EXISTS vw_history AS
            select h.time, s.name, s.kind, h.value
              from symbols s,
                   history h
             where h.handle = s.handle
             order by s.name, h.time
        `);
        this.#database.run(`
          CREATE VIEW IF NOT EXISTS vw_rpcmethods AS
            select s.idxGroup, s.idxOffset, 
                   s.name as name, r.name as method, d.name as typename,
                   r.parms, r.adstype as returntype, r.retsize as returnsize,
                   coalesce((select handle from SYMBOLS where name = s.name || '#' || r.name), 0) as handle
              from RPCMETHODS r,
                   DATATYPES d,
                   SYMBOLS s
             where d.TYPEGUID = r.TYPEGUID
               and s.TYPEGUID = r.TYPEGUID
        `);
      });
      
    });
  }

  /**
   * 
   * @param {*} settings 
   */
  database_cleanup(settings) {
    this.#database.serialize(() => {
      this.#database
        .run('BEGIN TRANSACTION', [], (err) => {
          if (err) {
            debugError('on cleanup: ' + err);
            return;
          }

          this.#database
            .run(`delete from HISTORY 
                   where TIME not in (select max(TIME)
                                        from HISTORY
                                       where TIME >= datetime('now', ` + (settings.save ? `'-1 days'` : `'-5 minutes'`) + `)
                                       group by HANDLE)`, (err) => {
              if (err) {
                debugError(JSON.stringify(err));
              }
            })
            .run(`delete from TRACKING
                   where INVOKEID = 0
                     and TIME < datetime('now', ` + (settings.save ? `'-6 hours'` : `'-5 minutes'`) + `)`);
        })
        .run('COMMIT');
    });
  }

  /**
   * 
   * @param {*} data 
   * @returns 
   */
  datatypes_prepare(data) {
    const insStmt = 'INSERT INTO datatypes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    const rpcStmt = 'INSERT INTO rpcmethods VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';

    return new Promise((resolve, reject) => {

      this.#database.serialize(() => {
        this.#database
          .run('BEGIN TRANSACTION', [], (err) => {
            if (err) {
              reject(err);
            }

            // cleanup datatypes and rpcmethods
            // ... then start to fill up again
            this.#database.serialize(() => {
              this.#database
                .run('DELETE FROM datatypes')
                .run('DELETE FROM rpcmethods')
                .parallelize(() => {
                  data.forEach(element => {
                    
                    this.#database.run(insStmt, [
                      element.version, element.size, element.offset, element.datatype, 
                      JSON.stringify(element.flags), element.name, element.kind, element.comment, 
                      element.hash, element.typehash, 
                      JSON.stringify(element.arrdata), JSON.stringify(element.subdata),
                      element.guid, JSON.stringify(element.attrs), JSON.stringify(element.enums)], 
                    (err) => {
                      if (err) {
                        debugError('error inserting datatype :' + err);
                      } else if (element.rpccalls.length > 0) {
                        element.rpccalls.forEach(rpcCall => {
                          this.#database.run(rpcStmt, [
                            element.guid, rpcCall.version, rpcCall.vTableIdx, rpcCall.retSize,
                            rpcCall.retAlignSize, rpcCall.retGuid, rpcCall.retAdsType,
                            JSON.stringify(rpcCall.flags), rpcCall.name, rpcCall.kind,
                            rpcCall.comment, JSON.stringify(rpcCall.parms)]);
                        });
                        
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
   * 
   * @param {*} data 
   * @returns 
   */
  symbolinfo_prepare(data) {
    const insStmt = 'INSERT INTO symbols VALUES (?,?,?,?,?,?,0,0,?,?,?)';

    return new Promise((resolve, reject) => {

      this.#database.serialize(() => {
        this.#database
          .run('BEGIN TRANSACTION', [], (err) => {
            if (err) {
              reject(err);
            }

            // delete all symbols
            // ... and fill up again
            this.#database.serialize(() => {
              this.#database
                .run('DELETE FROM symbols')
                .parallelize(() => {
                  data.forEach(element => {
                  
                    this.#database.run(insStmt, [
                      element.group, element.offset, element.size, 
                      element.name, element.kind, element.comment, 
                      element.guid, JSON.stringify(element.arrdata), 
                      JSON.stringify(element.attrs)], (err) => {
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

  symbolinfo_fetch (symbols) {
    let sqlQry = 
      'select * from symbols where name ';
    const data = [];

    // explicitly convert a single request to an array
    if (!Array.isArray(symbols)) {
      symbols = new Array(symbols);
    }

    if (symbols.length == 0) {
      sqlQry = sqlQry.replace('name', '((handle <> 0) or (notify <> 0))');
    } else if (symbols.length == 1) {
      const allProps = Object.getOwnPropertyNames(symbols[0]);

      if (allProps.findIndex(i => i == 'method') >= 0) {
        sqlQry += '= "' + symbols[0].name.toUpperCase() + '#' + symbols[0].method.toUpperCase() + '"';
      } else {
        sqlQry += '= "' + symbols[0].name.toUpperCase() +'"';
      }

      //sqlQry += ' and ';
      
    } else {
      for (let i = 0; i < symbols.length; i++) {
        if (i == 0) {
          sqlQry += 'in ("' + symbols[i].name.toUpperCase() + '"';
        } else {
          sqlQry += ', "' + symbols[i].name.toUpperCase() + '"';
        }
      }
      sqlQry += ')'; //') and ';
    }

    //sqlQry += '((handle <> 0) or (notify <> 0))';

    return new Promise((resolve, reject) => {
      
      this.#database.all(sqlQry, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        if ((!rows) || (rows.length == 0)) {
          rows = [];
          resolve(rows);
          return;
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
        
        try {
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
                  data[idx].mode = config.ADS_NOTIFYMODE.OnChange;
                  break;
                case 'CYCLIC':
                  data[idx].mode = config.ADS_NOTIFYMODE.Cyclic;
                  break;
                default:
                  data[idx].mode  = symbols[i].mode;
                  break;
              }
              
              data[idx].delay = symbols[i].delay * 1000;
              data[idx].cycle = symbols[i].cycle * 1000;
            }
          }
        }
        catch {}
        
        resolve(data);
      });
    });
  }

  symbolinfo_fetchnotify (symbols) {
    const result = [];
    const notifies = [];

    let selStmt = 'select handle, notify, name, kind from symbols where notify in ';
    for (let i = 0; i < symbols.length; i++) {
      if (i == 0) {
        selStmt += '(?';
      } else {
        selStmt += ',?';
      } 
      notifies.push(symbols[i].notify);
    }
    selStmt += ')';

    return new Promise((resolve, reject) => {
      this.#database.all(selStmt, notifies, (err, rows) => {
        if (err) {
          reject(err.message);
        }

        for (const row of rows) {
          const curSym = symbols.find((obj) => { return obj.notify === row.notify; });
          debugVerbose('symbolinfo_fetchnotify: ' + JSON.stringify(row) + ' -- ' + JSON.stringify(curSym));
          const curVal = after.analyzePlcSymbolValues(curSym.data, row);
          const newSymbol = {
            timestamp : curSym.timestamp,
            name  : row.name,
            kind  : row.kind,
            value : curVal[0].value
          };
          
          result.push(newSymbol);
          this.emit('notify', newSymbol);
        } 

        resolve(result);
      });
    });
  }

  symbolinfo_fetchrpcmethod (symbols, method) {
    let sqlQry = 
      'select * from VW_RPCMETHODS';

    const data = [];

    if (symbols.length == 1) {
      sqlQry += ' where name = "' + symbols[0].name.toUpperCase() +'"';
      if (method != null) {
        sqlQry += ' and method = "' + method.toUpperCase() + '"';
      }
    } else if (symbols.length > 1) {
      sqlQry += ' where name in (';
      for (let i = 0; i < symbols.length; i++) {
        if (i == symbols.length - 1) {
          sqlQry += '"' + symbols[i].name.toUpperCase() + '")';
        } else {
          sqlQry += '"' + symbols[i].name.toUpperCase() + '" ,';
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.#database.all(sqlQry, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        if ((!rows) || (rows.length == 0)) {
          rows = [];
          resolve(rows);
          return;
        }

        for (let r = 0; r < rows.length; r++) {
          const rpcInfo = {
            'group'   : rows[r].idxGroup,
            'offset'  : rows[r].idxOffset,
            'name'    : rows[r].name,
            'method'  : rows[r].method,
            'kind'    : rows[r].typename,
            'retkind' : rows[r].returntype,
            'retsize' : rows[r].returnsize,
            'handle'  : rows[r].handle,
            'parm_in' : [],
            'parm_out': []
          }

          // EXAMPLE data:
          // [
          //  {"size":1,"alignSize":1,"adsType":"SINT","flags":["In"],"reserved":0,"guid":"95190718000000000000000000000003","lenIsParm":0,"name":"value","kind":"SINT","comment":""},
          //  {"size":1,"alignSize":1,"adsType":"BOOL","flags":["In"],"reserved":0,"guid":"95190718000000000000000000000030","lenIsParm":0,"name":"auto","kind":"BOOL","comment":""},
          //  {"size":1,"alignSize":1,"adsType":"SINT","flags":["Out"],"reserved":0,"guid":"95190718000000000000000000000003","lenIsParm":0,"name":"old_value","kind":"SINT","comment":""},{"size":4,"alignSize":4,"adsType":"UDINT","flags":["Out"],"reserved":0,"guid":"95190718000000000000000000000008","lenIsParm":0,"name":"error","kind":"UDINT","comment":""}
          // ]
          const parms = JSON.parse(rows[r].parms);
          for (let p = 0; p < parms.length; p++) {
            let curParm = {
              'parm' : parms[p].name,
              'kind' : parms[p].adsType,
              'size' : parms[p].size,
              'value': 0
            }

            if (parms[p].flags[0] == 'In') {
              rpcInfo.parm_in.push(curParm);
            } else {
              rpcInfo.parm_out.push(curParm);
            }
          }

          data.push(rpcInfo);
        }

        resolve(data);
      });
    });
  }

  symbolinfo_store_rpcmethod(symbols) {
    let insStmt =
      `insert or ignore into SYMBOLS
           (idxGroup, idxOffset, name, kind, comment)
        values `;
    const insParmsStmt = '(?, ?, ?, ?, ?) ';
    const insParms = [];

    return new Promise((resolve, reject) => {
      try {
        for (let s = 0; s < symbols.length; s++) {
          insStmt += insParmsStmt;

          insParms.push(symbols[s].idxGroup);
          insParms.push(symbols[s].idxOffset);
          insParms.push(symbols[s].name + '#' + symbols[s].method);
          insParms.push('METHOD');
          insParms.push('RPC CALL');
        }

        this.#database.run(insStmt, insParms, () => {
          resolve();
        });
      }
      catch (exc) {
        reject(exc);
      }
      
    });
  }

  symbolinfo_store_history(symbols) {
    const insStmt = `insert into HISTORY 
                       select datetime("now") as TIME, HANDLE, ? as value
                         from SYMBOLS
                        where NAME = ?`;

    symbols.forEach((element) => {
      this.#database.run(insStmt, [element.value, element.name]);
    });
    
  }

  symbolhandle_update (symbol) {

    return new Promise((resolve, reject) => {
      this.#database.get(`select ? as name, 
                           ? as handle, 
                           ? as notify, 
                           count(1) as num 
                      from SYMBOLS 
                     where NAME = ?`, [symbol.name, symbol.handle, symbol.notify, symbol.name], (err, row) => {
        if (err) {
          debugError('error finding symbol :' + err);
        }

        if (row.num > 0) {
          this.#database.run(`update SYMBOLS 
                                 set HANDLE = ?,
                                     NOTIFY = ? 
                               where NAME = ?`, [row.handle, row.notify, row.name], (err) => {
            if (err) {
              reject('error updating symbol ' + symbol.name + ' - ' + err.message);
              return;
            }
            resolve();
          });
        } else {
          this.#database.run(`insert into SYMBOLS (handle, name) 
                          values (?, ?)`, [row.handle, row.name], (err) => {
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

  symbolhandle_fetch (symbols) {
    const result = [];
    const names = [];
    let symQry = `select idxGroup, idxOffset, name, handle, notify 
                    from SYMBOLS 
                   where (HANDLE <> 0 or NOTIFY <> 0)`;

    if (symbols.length > 1) {
      symQry += ' and NAME in (?';
      for (let i = 1; i < symbols.length; i++) {
        symQry += ', ?';
        names.push(symbols[i].name.toUpperCase());
      }

      symQry += ')';
    } else if (symbols.length == 1) {
      symQry += ' and NAME = ?'; 
      names.push(symbols[0].name.toUpperCase());
    } else if (!Array.isArray(symbols)) {
      symQry += ' and NAME = ?'; 
      names.push(symbols.name.toUpperCase());
    }
    symQry = symQry.replace(/\n               /, '');

    return new Promise((resolve, reject) => {
      this.#database.all(symQry, names, async (err, rows) => {
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
   * store execution record in database
   * 
   * @param {Object} options 
   * @param {string} kind 
   */
  invoke_track_start(options, kind) {
  
    const reqhandle = setTimeout(() => {
      
      this.#database.run(`
        update TRACKING
           set HANDLE = 0,
               DATA = 'timeout'
         where INVOKEID = ?`, [options.invoke], (err) => {
        if (err) {
          debugError(err.message);
          return err.message;
        }
      });
       
      debug('timeout handler for invokeId ' + options.invoke);
    }, 15000, options);

    return new Promise((resolve, reject) => {
      this.#database.run(`
        insert into TRACKING(TIME, INVOKEID, OPTIONS, HANDLE, KIND)
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
  invoke_track_check(invokeId) {

    return new Promise((resolve,reject) => {
      try {
        this.#database.get(`
          select HANDLE 
            from TRACKING
           where INVOKEID = ?`, [invokeId], (err, row) => {
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
   * mark the record for this invokeId as being processed
   * @param {int} invokeId 
   * @param {Object} data 
   */
  invoke_track_resolve(invokeId, data) {

    return new Promise((resolve, reject) => {
      this.#database.get('select HANDLE from TRACKING where INVOKEID = ?', [invokeId], (err, row) => {
        if (err) {
          reject(err.message);
        }
        if (row) {
          clearTimeout(row.handle);
          this.#database.run(`
                  update TRACKING 
                     set HANDLE = 0,
                         DATA = ?
                   where INVOKEID = ?`,  [JSON.stringify(data), invokeId], 
          (err) => {
            if (err) {
              reject(err.message);
            }
            resolve('OK');
          });
        } else {
          reject('NOK');
        }
      });
    });

  }

  /**
   * return response values stored inside the database
   * 
   * @param {int} invokeId 
   */
  invoke_track_clear(invokeId) {

    return new Promise((resolve, reject) => {
      try {
        this.#database.get(`
          select kind,
                  json_extract(options, "$.request") as request,
                  json_extract(options, "$.symbols") as symbols,
                  json_extract(data, "$.data") as data 
            from TRACKING 
           where INVOKEID = ?`, [invokeId], (err, row) => {
          if (err) {
            reject(err.message);
            return;
          }
          
          this.#database.run(`
            update TRACKING 
                set INVOKEID = 0 
              where INVOKEID = ?`, [invokeId], (err) => {
            if (err) {
              reject(err.message);
              return;
            }
          });
          
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
   * TODO
   * 
   * @param {string} reason 
   */
  invoke_track_flagerror(reason) {
    const error = {
      error : reason
    };

    this.#database.run(`update TRACKING
                           set HANDLE = 0,
                               DATA = ?
                         where INVOKEID > 0`, [JSON.stringify(error)], (err) => {

      if (err) {
        debugError(err.message);
      }

    });
  }

  /**
   * fetch info stored for this request
   * 
   * @param {*} invokeId 
   */
  invoke_track_request_get(invokeId) {

    return new Promise((resolve, reject) => {
      this.#database.get(`
              select kind,
                     json_extract(options, '$.request') as request,
                     json_extract(options, '$.symbols') as symbols
                from TRACKING
               where INVOKEID = ?`, [invokeId], (err, row) => {
        if (err) {
          reject(err.message);
        }
        if (row) {
          const result = {
            kind    : row.kind,
            request : JSON.parse(row.request),
            symbols : JSON.parse(row.symbols)
          };
          resolve(result);
        } else {
          resolve([]);
        }
        
      });
    });
  }

  /**
   * update request info
   * 
   * @param {int} invokeId 
   * @param {Object} request 
   */
  invoke_track_request_upd(invokeId, request) {

    return new Promise((resolve, reject) => {
      this.#database.run(`
              update TRACKING 
                 set OPTIONS = json_set(options, '$.request', ?) 
               where INVOKEID = ?`, [JSON.stringify(request), invokeId], (err) => {
        if (err) {
          reject(err.message);
        }
        resolve('OK');
      });
    });
  }

  /**
   * start tracking pushed notification
   * 
   * @param {Object} options 
   */
  invoke_track_notification(options) {
    // return new Promise((resolve, reject) => {
    this.#database.run(`
        insert into TRACKING(time, options, kind)
          values (datetime('now'), ?, 'notify')
        `, [JSON.stringify(options)]);
      
    // });
    
  }
  
}

module.exports =  BeckhoffDB;