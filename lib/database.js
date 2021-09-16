'use strict';

const sqlite3 = require('sqlite3').verbose();

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
              ON tracking(invokeId)
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
          guid           TEXT,
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
              ON symbols(name)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_handle
              ON symbols(handle)
        `);
        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_symbol_notify
              ON symbols(notify)
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
          guid           TEXT,
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
              ON datatypes(name)
        `);

        this.#database.run(`
          CREATE INDEX IF NOT EXISTS idx_datatype_guid
              ON datatypes(guid)
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
              ON rpcmethods(typeguid)
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
              ON history(handle, time)
        `);
        this.#database.run(`
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

  cleanup_database(settings) {
    this.#database.serialize(() => {
      this.#database
        .run('BEGIN TRANSACTION', [], (err) => {
          if (err) {
            debugError('on cleanup: ' + err);
            return;
          }

          this.#database
            .run(`delete from history 
                   where time not in (select max(time)
                                        from history
                                       where time >= datetime('now', ` + (settings.save ? `'-1 days'` : `'-5 minutes'`) + `)
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
                          this.database.run(rpcStmt, [
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

    if (symbols.length == 1) {
      const allProps = Object.getOwnPropertyNames(symbols[0]);

      if (allProps.findIndex(i => i == 'method') >= 0) {
        sqlQry += '= "' + symbols[0].name.toUpperCase() + '#' + symbols[0].method.toUpperCase() + '"';
      } else {
        sqlQry += '= "' + symbols[0].name.toUpperCase() +'"';
      }
      
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
      
      this.#database.all(sqlQry, [], (err, rows) => {
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

        resolve(data);
      });
    });
  }

  symbolinfo_fetchmethod (symbol, method) {

  }

  symbolhandle_update (symbol) {

    return new Promise((resolve, reject) => {
      this.#database.get(`select ? as name, 
                           ? as handle, 
                           ? as notify, 
                           count(1) as num 
                      from symbols 
                     where name = ?`, [symbol.name, symbol.handle, symbol.notify, symbol.name], (err, row) => {
        if (err) {
          debugError('error finding symbol :' + err);
        }

        if (row.num > 0) {
          this.#database.run(`update symbols 
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
          this.#database.run(`insert into symbols (handle, name) 
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

}

module.exports =  BeckhoffDB;