'use strict';

//const debug = require('debug')('node-beckhoff');

const sqlite3 = require('sqlite3').verbose();
const events = require('events');

const config = require('./const');
const beckhoffBridge = require('./bridge');
const before = require('./preparation');
const after = require('./analysis');

class BeckhoffClient extends events {
  #db = null;
  #settings = null;
  #plc = null;

  constructor() {
    super();

    this.#settings = {
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

    this.create();

  }

  create() {
    this.invokeId = 0;
    this.#db = new sqlite3.Database(':memory:', (err) => {
    //this.#db = new sqlite3.Database('./beckhoff.db3', (err) => {
      if (err) {
        return console.error(err.message);
      }

      this.create_database();
    });
    
    this.#plc = new beckhoffBridge({
      ip      : this.#settings.plc.ip,
      port    : this.#settings.plc.port,
      db      : this.#db,
      develop : {
        verbose : this.#settings.develop.verbose,
        debug   : this.#settings.develop.debug
      }
    });
    this.#plc.on('data',  this.recv_Plc_Data);
    this.#plc.on('error', this.recv_Plc_Error);
    this.#plc.on('close', (had_error) => {
      if (had_error) {
        console.warn(config.getTimestamp() + ' - connection closed due to error');
      } else {
        console.log(config.getTimestamp() + ' - connection closed ');
      }  
    });
    
  }

  create_database () {
    this.#db.serialize(() => {

      this.#db.run(`
        CREATE TABLE IF NOT EXISTS tracking (
          time           REAL,
          invokeId       INTEGER,
          handle         INTEGER,
          options        BLOB,
          data           BLOB
        );
        CREATE INDEX IF NOT EXISTS idx_track_invoke
            ON symbols(name);
      `);

      this.#db.run(`
        CREATE TABLE IF NOT EXISTS symbols (
          idxGroup       INTEGER DEFAULT 0,
          idxOffset      INTEGER DEFAULT 0,
          size           INTEGER DEFAULT 0,
          name           TEXT,
          kind           TEXT DEFAULT 'none',
          comment        TEXT DEFAULT '',
          handle         INTEGER DEFAULT -1,
          notify         INTEGER DEFAULT -1
        );
        CREATE INDEX IF NOT EXISTS idx_symbol_name
            ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbol_handle
            ON symbols(handle);
      `);
      //this.#db.run(`
      //  CREATE INDEX IF NOT EXISTS idx_symbol_name
      //      ON symbols(name)
      //`);
      //this.#db.run(`
      //  CREATE INDEX IF NOT EXISTS idx_symbol_handle
      //      ON symbols(handle)
      //`);
      this.#db.run(`
        CREATE TABLE IF NOT EXISTS history (
          time           REAL,
          symbol         TEXT,
          kind           TEXT,
          value          TEXT   
        );
        CREATE INDEX IF NOT EXISTS idx_history_symbol
            ON history(symbol, time);
      `);
      //this.#db.run(`
      //  CREATE INDEX IF NOT EXISTS idx_history_symbol
      //      ON history(symbol, time)
      //`);
    });

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

  }
  get db() {
    return this.#db;
  }

  async track_PlcInvoke_Start(options) {
  
    const reqhandle = setTimeout(() => {
      
      this.#db.run(`
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
      this.#db.run(`
        insert into tracking(time, invokeId, options, handle)
          values (datetime('now'), ?, ?, ?)
      `, [options.invoke, JSON.stringify(options), reqhandle], (err) => {
        if (err) {
          reject(err.message);
        }
        resolve(reqhandle);
      });
    });
  }

  async track_PlcInvoke_Check(invokeId) {

    return new Promise((resolve,reject) => {
      try {
        this.#db.get(`
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

  /*
  track_PlcInvoke_Resolve(invokeId, data) {
    this.#db.get('select handle from tracking where invokeId = ?', invokeId, (err, row) => {
      clearTimeout(row['handle']);
      this.#db.run(`update tracking 
                       set handle = -1,
                           data = ?
                     where invokeId = ?`,  [data, invokeId]);
    })
  }*/

  async track_PlcInvoke_Clear(invokeId) {

    return new Promise((resolve, reject) => {
      try {
        //this.#db.get('select json_extract(data, "$.data") as data from tracking where invokeId = ?', [invokeId], (err, row) => {
        this.#db.get(`
          select json_extract(options, "$.request") as options, 
                 json_extract(data, "$.data") as data 
            from tracking 
           where invokeId = ?`, [invokeId], (err, row) => {
          if (err) {
            reject(err.message);
          }
          //this.#db.run('delete from tracking where invokeId =  ?', [invokeId], (err) => {
          //  if (err) {
          //    reject(err.message);
          //  }
          //});

          this.#db.run(`
             update tracking 
                set invokeId = -1 
              where invokeId = ?`, [invokeId], (err) => {
            if (err) {
              reject(err.message);
            }
          });

          const result = {
            options : JSON.parse(row.options),
            data    : JSON.parse(row.data)
          };

          resolve(result);  //['data'];
        });
      }
      catch (exc) {
        reject(exc);
      }
    });
    
  }

  async plc_invoke (options, txHeader, kind) {
    let rxInfo = {};
    await this.track_PlcInvoke_Start(options);
    await this.#plc.sendBuffer(txHeader, kind);

    let reqhandle = 0;
    while (reqhandle != -1) {
      await config.sleep(1);
      reqhandle = await this.track_PlcInvoke_Check(options.invoke);
    }
    rxInfo = await this.track_PlcInvoke_Clear(options.invoke)

    return rxInfo;
  }

  /**
   * find handles for symbols in the local database
   * symbol names will be converted to UPPERCASE
   * 
   * @param {object} requests
   * @returns {Promise} symboldetails 
   */
  async plc_fetch_symbolhandles (requests) {
    let sqlQry = 
      'select * from symbols where name '
    const symbols = [];

    // explicitly convert a single request to an array
    if (!Array.isArray(requests)) {
      requests = new Array(requests);
    }

    if (requests.length == 1) {
      sqlQry += '= "' + requests[0].name.toUpperCase() +'"';
    } else {
      for (let i = 0; i < requests.length; i++) {
        if (i == 0) {
          sqlQry += 'in ("' + requests[i].name.toUpperCase() + '"';
        } else {
          sqlQry += ', "' + requests[i].name.toUpperCase() + '"';
        }
      }
      sqlQry += ')';
    }
    return new Promise((resolve, reject) => {
      
      this.#db.all(sqlQry, [], (err, rows) => {
        if (err) {
          reject(err);
        }

        if (!rows) {
          rows = []
        }

        for (let r = 0; r < rows.length; r++) {
          const newSymbol = {
            'name'   : rows[r].name,
            'group'  : rows[r].idxGroup,
            'offset' : rows[r].idxOffset,
            'kind'   : rows[r].kind,
            'size'   : rows[r].size,
            'handle' : rows[r].handle
          }

          symbols.push(newSymbol);
        }

        if (symbols.length != requests.length) {
          let missing = false;

          for (let i = 0; i < requests.length; i++) {
            missing = symbols.includes(obj => obj.name === requests[i].name);

            if (!missing) {
              const missingSymbol = {
                'name'   : requests[i].name.toUpperCase(),
                'group'  : -1,
                'offset' : -1,
                'kind'   : -1,
                'size'   : -1,
                'handle' : -1
              }
    
              symbols.push(missingSymbol)
            }
          }
        }

        // for now: multiple write requests not possible
        if (requests[0].hasOwnProperty('value')) {
          symbols[0].value = requests[0].value;
        }

        resolve(symbols);
      });
    });
  }

  /**
   * on 'data' event handler for data received from the PLC.
   * to spice things up, execution takes place in the 'plc' object so we cannot
   * use our local version of the database
   * 
   * @param {*} data 
   * @param {*} db 
   */
  async recv_Plc_Data (data, db) {

    let result = {
      'buffer' : data.slice(38),
      'length' : data.readUInt32LE(2),
      'header' : after.analyzeHeader(data.slice(6,38)),
      'data'   : null
    }

    let resolved = -1;
    let request = {};
    switch (result.header.command) {
      case config.ADSCMD.INVALID :
        break;

      case config.ADSCMD.ReadDeviceInfo :
        result.data = after.analyzePlcInfo(data.slice(38));
      
        break;

      case config.ADSCMD.Read :
        request = await this.track_PlcInvoke_GetRequest(result.header.invoke, db);
        if (request[0].hasOwnProperty('name')) {
          result.data = after.analyzePlcRead(data.slice(38), request);
          await this.track_PlcInvoke_UpdRequest(result.header.invoke, request, db);
        } else {
          result.data = after.analyzePlcRead(data.slice(38));
        }
        break;

      case config.ADSCMD.Write :
        request = await this.track_PlcInvoke_GetRequest(result.header.invoke, db);
        if (request[0].hasOwnProperty('name')) {
          result.data = after.analyzePlcWrite(data.slice(38), request);
          await this.track_PlcInvoke_UpdRequest(result.header.invoke, request, db);
        } else {
          result.data = after.analyzePlcWrite(data.slice(38));
        }
        break;

      case config.ADSCMD.ReadState :
        result.data = after.analyzePlcState(data.slice(38));
        
        break;

      case config.ADSCMD.WriteControl :
        break;
  
      case config.ADSCMD.NotificationAdd :
        break;
  
      case config.ADSCMD.NotificationDel :
        break;
  
      case config.ADSCMD.Notification :
        break;
  
      case config.ADSCMD.ReadWrite :
        request = await this.track_PlcInvoke_GetRequest(result.header.invoke, db);
        if (request[0].hasOwnProperty('name')) {
          result.data = after.analyzePlcReadWrite(data.slice(38), request);
          await this.track_PlcInvoke_UpdRequest(result.header.invoke, request, db);
        } else {
          result.data = after.analyzanalyzePlcReadWriteePlcRead(data.slice(38));
        }
        break;
    }

    resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
    while (resolved != 'OK') {
      await config.sleep(1);
      resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
    }

  }

  recv_Plc_Error (error) {
    // no errors yet...
  }

  destroy() {
    this.#plc.closeSocket();
    this.#db.close();
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
BeckhoffClient.prototype.getPlcInfo = async function(callback) {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.ReadDeviceInfo,
    len     : 0,
    invoke  : ++this.invokeId,
    request : null
  };
  const txHeader = before.prepareHeader(options, this.settings);

  try {
    rxInfo = await this.plc_invoke(options, txHeader, 'info');
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    callback(rxInfo.data);
  }
    
};

/**
 * fetch PLC running state
 * 
 * @param {function} callback 
 */
BeckhoffClient.prototype.getPlcState = async function(callback) {
  let rxInfo = {};

  let options = {
    cmd     : config.ADSCMD.ReadState,
    len     : 0,
    invoke  : ++this.invokeId,
    request : null
  };
  const txHeader = before.prepareHeader(options, this.settings);

  try {
    rxInfo = await this.plc_invoke(options, txHeader, 'state');
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    callback(rxInfo.data);
  }
};

/**
 * fetch all known symbols from the PLC
 * cache them in the SQLite database for later reference 
 * 
 * @param {function} callback 
 */
BeckhoffClient.prototype.getPlcSymbols = async function(callback) {
  let rxInfo = {};
  let isDbClean = false;

  let options = {
    cmd     : config.ADSCMD.Read,
    len     : -1,
    invoke  : ++this.invokeId,
    request : [{
      idxGroup  : config.ADSIGRP.SYM_UPLOADINFO2,
      idxOffset : 0x00000000,
      length    : 0x30
    }]
  };
  let txData = before.preparePlcRead(options, this.settings);

  // be sure to clean up the database
  this.db.serialize(() => {

    this.db.run('BEGIN TRANSACTION');
    this.db.run('DELETE FROM symbols', [], (err) => {
      if (err) {
        console.log('error deleting data:' + err);
      }
      isDbClean = true;
    });
  })

  try {
    // first command
    rxInfo = await this.plc_invoke(options, txData, 'read');
    console.log(JSON.stringify(rxInfo));
    // prepare symbols request with data from first response
    options = {
      cmd     : config.ADSCMD.Read,
      len     : -1,
      invoke  : ++this.invokeId,
      request : [{
        idxGroup  : config.ADSIGRP.SYM_UPLOAD,
        idxOffset : 0x00000000,
        length    : Buffer.from(rxInfo.data.buffer).readUInt32LE(4)
      }]
    }
    txData = before.preparePlcRead(options, this.settings);
    
    // second command
    rxInfo = await this.plc_invoke(options, txData, 'symbols');

    // process PLC symbol info
    const symbols = after.analyzePlcSymbols(Buffer.from(rxInfo.data.buffer));

    // store everything in the database
    const insStmt = 'INSERT INTO symbols VALUES (?,?,?,?,?,?, -1, -1)';

    // wait until database is cleaned up
    while (!isDbClean) {
      await config.sleep(1);
    }
    this.db.serialize(() => {
      //this.db.run('BEGIN TRANSACTION');  --> has moved before delete statement
      this.db.parallelize(() => {
        symbols.forEach(element => {
          
            this.db.run(insStmt, [element.idxGroup, element.idxOffset, element.size, element.name, element.kind, element.comment], (err) => {
              if (err) {
                console.log('error inserting symbol :' + err);
              }
            });
        });
      });
      this.db.run('COMMIT')
    });
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    callback(rxInfo.data);
  }
};

/**
 * fecth a specific (series of) symbol handle(s)
 * store the result in the SQLite database
 * 
 * @param {*} options 
 * @param {Buffer} txData 
 */
BeckhoffClient.prototype.fetchPlcSymbolHandle = function(options, txData) {

  return new Promise(async (resolve, reject) => {
    try {
      const rxdata = await this.plc_invoke(options, txData, 'handle');
      
      after.analyzePlcSymbolHandles(Buffer.from(rxdata.data.buffer), options.request);
      
      let symUpdated = 0;
      for (let i=0; i<options.request.length; i++) {
        let element = options.request[i];
                    
        this.db.get('select ? as name, ? as handle, count(1) as num from symbols where name = ?', [element.name, element.handle, element.name], (err, row) => {
          if (err) {
            console.log('error finding symbol :' + err);
          }

          if (row.num > 0) {
            this.db.run('update symbols set handle = ? where name = ?', [row.handle, row.name], (err) => {
              if (err) {
                console.log(err.message);
              }
              symUpdated++;
            });
          } else {
            this.db.run('insert into symbols (handle, name) values (?, ?)', [row.handle, row.name], (err) => {
              if (err) {
                console.log(err.message);
              }
              symUpdated++;
            })
          }          
        });

      }
      
      while (symUpdated != options.request.length) {
        await config.sleep(1);
      }
      resolve('OK');
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
 * @param {object} symData 
 * @param {function} callback 
 */
BeckhoffClient.prototype.readPlcData = async function(symData, callback) {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : await this.plc_fetch_symbolhandles(symData)
  };

  let txData = null;
  let newHandles = [];
  let newHandlesNeeded = false;
  for (let i = 0; i < options.request.length; i++) {
    if (options.request[i].handle <= 0) {
      newHandles.push(options.request[i]);
      newHandlesNeeded = true;
    }
  }
  if (newHandlesNeeded) {
    options.request = newHandles;
    options.invoke = ++this.invokeId;
    txData = before.preparePlcSymbolHandle(options, this.settings);
    rxInfo = await this.fetchPlcSymbolHandle(options, txData); 

    options.request = await this.plc_fetch_symbolhandles(symData);
  }
  
  options.invoke = ++this.invokeId;
  if (options.request.length == 1) {
    options.cmd = config.ADSCMD.Read;
    txData = before.preparePlcRead(options, this.settings);
  } else {
    options.cmd = config.ADSCMD.ReadWrite;
    txData = before.preparePlcRead(options, this.settings);
  }

  try {
    //const data = await plc.sendBuffer(txData, 'read');
    rxInfo = await this.plc_invoke(options, txData, 'read');
    //console.log(JSON.stringify(rxInfo));
    //rxInfo = after.analyzePlcRead(Buffer.from(rxData.data.buffer), options.request)

  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    callback(rxInfo.data.symbols);
  }
  
};

/**
 * write the value of all items passode on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {object} symData 
 * @param {function} callback 
 */
//async function writePlcData(symData, callback) {
BeckhoffClient.prototype.writePlcData = async function (symData, callback) {
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : await this.plc_fetch_symbolhandles(symData)
  };

  let txData = null;
  let newHandles = [];
  let newHandlesNeeded = false;
  for (let i = 0; i < options.request.length; i++) {
    if (options.request[i].handle <= 0) {
      newHandles.push(options.request[i]);
      newHandlesNeeded = true;
    }
  }
  if (newHandlesNeeded) {
    options.request = newHandles;
    options.invoke = ++this.invokeId;
    txData = before.preparePlcSymbolHandle(options, this.settings);
    rxInfo = await this.fetchPlcSymbolHandle(options, txData); 

    options.request = await this.plc_fetch_symbolhandles(symData);
  }

  options.invoke = ++this.invokeId;
  if (options.request.length == 1) {
    options.cmd = config.ADSCMD.Write;
    txData = before.preparePlcWrite(options, this.settings);
  } else {
    options.cmd = config.ADSCMD.ReadWrite;
    // TODO
    //txData = before.preparePlcWriteRead(options, settings);
  }

  try {
    rxInfo = await this.plc_invoke(options, txData, 'write');
    //rxInfo = after.analyzePlcWrite(data.slice(6), options.request, settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    //plc.sock.destroy();
    callback(rxInfo.data.symbols);
  }
};

module.exports = BeckhoffClient;
