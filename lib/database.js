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
}

module.exports =  BeckhoffDB;