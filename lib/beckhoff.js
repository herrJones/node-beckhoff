'use strict';

//const debug = require('debug')('node-beckhoff');

const sqlite3 = require('sqlite3').verbose();
//const Buffer = require('safe-buffer').Buffer;
//const net = require('net');
const events = require('events');

const config = require('./const');
const beckhoffBridge = require('./bridge');
const before = require('./preparation');
const after = require('./analysis');
const analysis = require('./analysis');

//let lokiDB = null; 
//let sqliteDB = null;
//if (settings.develop.save) {
  
/*
  lokiDB = new loki(__dirname + '/beckhoff_data.db', {
    autoload: true,
    autoloadCallback : () => {
      let tmp = lokiDB.getCollection('trx');
      if (tmp === null) {
        lokiDB.addCollection('trx');
        lokiDB.addCollection('symbols',  { indices : ['name'] });
      }
    },
    autosave: false
  });
  */
  
//} else {
//  lokiDB = new loki();
//  //lokiDB.addCollection('trx');
//  lokiDB.addCollection('symbols',  { indices : ['name'] });
//}

//let invokeId = 0;

/*
 *
 *
class beckhoffClient {
  constructor (ip, port) {
    this.sock = new net.Socket();
    this.sock.setNoDelay(true);

    this.address = ip;
    this.port = port;

  }

  async sendBuffer (txdata, kind) {
    let plc = this;
    let rxdata = [];
    let expLen = -1;
    let rxOffset = plc.sock.bytesRead;

    if (settings.develop.debug) {
      console.log('BKHF TX  : ' + txdata.toString('hex') + '\n');
    }

    return new Promise((resolve, reject) => {

      if (plc.sock.bytesWritten > 0) {
        
        plc.sock.write(txdata, (err) => {
          if (settings.develop.verbose) {
            console.log('TX : %i bytes sent - %s', plc.sock.bytesWritten, kind);
          }
        });
      } else {
        plc.sock.connect(plc.port, plc.address, () => {
          console.log("connected to beckhoff plc : " + plc.address + ":" + plc.port );
          
          plc.sock.write(txdata, (err) => {
            if (settings.develop.verbose) {
              console.log('TX : %i bytes sent - %s', plc.sock.bytesWritten, kind);
            }
          });
          
        });
      }

      function checkRxData(rxlen) {

        let result = Buffer.alloc(rxlen).fill(0);
        let offset = 0;
        for (let i = 0; i < rxdata.length; i++) {
          rxdata[i].copy(result, offset);

          offset += rxdata[i].length;
        }

        if (settings.develop.save) {
          let dbdata = lokiDB.getCollection('trx');
          let dbsave = {
            kind : kind,
            tx   : txdata,
            rx   : result
          }
          dbdata.insertOne(dbsave);

          lokiDB.saveDatabase();
        }
        if (settings.develop.debug) {
          console.log('BKHF RX  : ' + result.toString('hex') + '\n');
        }

        resolve(result);

      }

      plc.sock.on('data', (data) => {
        let rxLen = plc.sock.bytesRead - rxOffset;
 
        rxdata.push(data);

        if (settings.develop.verbose) {
          console.log('RX : len = ' + rxLen);
        }

        if ((rxLen > 6) && (expLen == -1)) {
          expLen = data.readUInt32LE(2);
        }
        if (rxLen > expLen) {
          checkRxData(rxLen);
        }

      });

      plc.sock.on('error', (err) => {
        reject(err);
      });
      plc.sock.on('close', (had_error) => {
        if (had_error) {
          console.error("connection closed after error");
          reject('error detected');
        } else {
          console.log("connection closed");
        }
      });

    });
  }
}
*/

class BeckhoffClient extends events {
  constructor() {
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
    
    this.plc = new beckhoffBridge({
      ip      : this.#settings.plc.ip,
      port    : this.#settings.plc.port,
      db      : this.#db,
      develop : {
        verbose : this.#settings.develop.verbose,
        debug   : this.#settings.develop.debug
      }
    });
    this.plc.on('data',  this.recv_Plc_Data);
    this.plc.on('error', this.recv_Plc_Error);
    this.plc.on('close', (had_error) => {
      if (had_error) {
        console.warn(config.getTimestamp() + ' - connection closed due to error');
      } else {
        console.log(config.getTimestamp() + ' - connection closed ');
      }  
    })
    
  }

  create_database () {
    this.#db.serialize(() => {
      //this.#db.run(`
      //  CREATE TABLE IF NOT EXISTS trx (
      //    time           REAL,
      //    kind           TEXT,
      //    tx             BLOB,
      //    rx             BLOB   
      //  )
      //`);
      //this.#db.run(`
      //  CREATE INDEX IF NOT EXISTS idx_trx_time
      //      ON trx(time)
      //`);

      this.#db.run(`
        CREATE TABLE IF NOT EXISTS tracking (
          invokeId       INTEGER,
          handle         INTEGER,
          data           BLOB
        )
      `);

      this.#db.run(`
        CREATE TABLE IF NOT EXISTS symbols (
          idxGroup       INTEGER,
          idxOffset      INTEGER,
          size           INTEGER,
          name           TEXT,
          kind           TEXT,
          comment        TEXT,
          handle         INTEGER DEFAULT -1
        )
      `);
      this.#db.run(`
        CREATE INDEX IF NOT EXISTS idx_symbol_name
            ON symbols(name)
      `);
      this.#db.run(`
        CREATE INDEX IF NOT EXISTS idx_symbol_handle
            ON symbols(handle)
      `);

      this.#db.run(`
        CREATE TABLE IF NOT EXISTS history (
          time           REAL,
          symbol         TEXT,
          kind           TEXT,
          value          TEXT   
        )
      `);
      this.#db.run(`
        CREATE INDEX IF NOT EXISTS idx_history_symbol
            ON history(symbol, time)
      `);
    });

  }

  get settings() {
    return this.#settings;
  }
  set settings(value) {
    
    this.#settings = value;

    this.plc.address = value.plc.ip;
    this.plc.port = value.plc.port;
    this.plc.develop = value.develop;

  }
  get db() {
    return this.#db;
  }


  async track_PlcInvoke_Start(invokeId) {
    const reqhandle = setTimeout((invokeId) => {
      /*
      this.#db.run(`
      update tracking
         set handle = -1,
             data = 'timeout'
       where invokeId = ?`, [invokeId], (err) => {
        if (err) {
          return console.log(err.message);
        }
       });
       */
      console.log('timeout handler for invokeId ' + invokeId);
    }, 15000);

    return new Promise((resolve, reject) => {
      this.#db.run(`
        insert into tracking(invokeId, handle)
          values (?, ?)
      `, [invokeId, reqhandle], (err) => {
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
        this.#db.get('select handle from tracking where invokeId = ?', [invokeId], (err, row) => {
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
        this.#db.get('select json_extract(data, "$.data") as data from tracking where invokeId = ?', [invokeId], (err, row) => {
          if (err) {
            reject(err.message);
          }
          this.#db.run('delete from tracking where invokeId =  ?', [invokeId], (err) => {
            if (err) {
              reject(err.message);
            }
          });

          resolve(row.data);  //['data'];
        });
      }
      catch (exc) {
        reject(exc);
      }
    });
    
  }

  /*
  track_PlcInvoke_TimeOut(invokeId) {
    this.#db.run(`
      update tracking
         set handle = -1,
             data = 'timeout'
       where invokeId = ?`, [invokeId], (err) => {
      if (err) {
        return console.log(err.message);
      }    
    });
  }
  */


  async recv_Plc_Data (data, db) {
    let result = {
      'length' : data.readUInt32LE(2),
      'header' : analysis.analyzeHeader(data.slice(6,38)),
      'data'   : null
    }

    let resolved = -1;
    switch (result.header.command) {
      case config.ADSCMD.INVALID :
        break;

      case config.ADSCMD.ReadDeviceInfo :
        result.data = analysis.analyzePlcInfo(data.slice(38));
        resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
        while (resolved != 'OK') {
          await config.sleep(5);
          resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
        }
        break;

      case config.ADSCMD.Read :
        break;

      case config.ADSCMD.Write :
        break;

      case config.ADSCMD.ReadState :
        result.data = analysis.analyzePlcState(data.slice(38));
        resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
        while (resolved != 'OK') {
          await config.sleep(5);
          resolved = await this.track_PlcInvoke_Resolve(result.header.invoke, result, db);
        }
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
        break;
    }

  }

  recv_Plc_Error (error) {

  }

  destroy() {
    this.plc.closeSocket();
  }

}

/*
 *  REQUESTS to be made
 */ 

/**
  * fetch general PLC info
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
    await this.track_PlcInvoke_Start(options.invoke);
    await this.plc.sendBuffer(txHeader, 'info');

    let reqhandle = 0;
    while (reqhandle != -1) {
      await config.sleep(5);
      reqhandle = await this.track_PlcInvoke_Check(options.invoke);
    }
    rxInfo = await this.track_PlcInvoke_Clear(options.invoke)
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    callback(rxInfo);
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
  let txHeader = before.prepareHeader(options, this.settings);

  try {
    await this.track_PlcInvoke_Start(options.invoke);
    await this.plc.sendBuffer(txHeader, 'state');

    let reqhandle = 0;
    while (reqhandle != -1) {
      await config.sleep(5);
      reqhandle = await this.track_PlcInvoke_Check(options.invoke);
    }
    rxInfo = await this.track_PlcInvoke_Clear(options.invoke)
  }
  catch (exc) {
    
    console.log(exc);
  }
  finally {
    //plc.sock.destroy();
    callback(rxInfo);
  }
};

/**
 * fetch all known symbols from the PLC
 * cache them in an in-memory LokiJS database 
 * 
 * @param {function} callback 
 */
BeckhoffClient.prototype.getPlcSymbols = async function(callback) {
  //let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

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
  let txData = before.preparePlcRead(options, settings);

  try {
    // first command
    let data = await plc.sendBuffer(txData, 'read');
    
    rxInfo = after.analyzePlcRead(data.slice(6), null, settings.develop);

    // prepare symbols request with data from first response
    options = {
      cmd     : config.ADSCMD.Read,
      len     : -1,
      invoke  : ++this.invokeId,
      request : [{
        idxGroup  : config.ADSIGRP.SYM_UPLOAD,
        idxOffset : 0x00000000,
        length    : rxInfo.data.readUInt32LE(4)
      }]
    }
    txData = before.preparePlcRead(options, settings);
    
    data = await plc.sendBuffer(txData, 'symbols');

    // clear local database with PLC symbols
    let symbols = lokiDB.getCollection('symbols');
    symbols.clear();

    // process PLC symbol info
    rxInfo = after.analyzePlcSymbols(data.slice(6), symbols, settings.develop);

  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
};

/**
 * 
 * @param {object} symbols 
 * @param {*} options 
 * @param {Buffer} txData 
 * @param {object} plc 
 */
BeckhoffClient.prototype.readPlcSymbolHandle = function(symbols, options, txData, plc) {
  let rxInfo = {};

  return new Promise(async (resolve, reject) => {
    try {
      const data = await plc.sendBuffer(txData, 'handle');
      rxInfo = after.analyzePlcReadWrite(data.slice(6), settings.develop);
      let offset = 0;
      let hndOffset = options.request.length * 8;

      for (let i=0; i<options.request.length; i++) {
        let element = options.request[i];
        let dbSym = symbols.find({ 'name' : { '$eq' : element.name.toUpperCase() }});
  
        if (options.request.length == 1) {
          dbSym[0].handle = rxInfo.data.readUInt32LE(offset);
  
          offset += 4;
        } else {
          let hndError = rxInfo.data.readUInt32LE(offset);
          offset += 4;
          let hndBytes = rxInfo.data.readUInt32LE(offset);
          offset += 4;
          if (hndBytes == 4) {
            dbSym[0].handle = rxInfo.data.readUInt32LE(hndOffset);
          }
          hndOffset += hndBytes;
        }


        
        symbols.update(dbSym);
      } 
      resolve(rxInfo);
    }
    catch (exc) {
      //console.log(exc);
      reject(exc);
    }
    finally {
    //  return rxInfo;
      
    }
  });
};


/**
 * read the value of all items passed on via symData
 * if necessary: fetch the symbol handle first and complete settings in LokiJS db
 * 
 * @param {object} symData 
 * @param {function} callback 
 */
BeckhoffClient.prototype.readPlcData = async function(symData, callback) {
  //let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : symData
  };

  let symbols = lokiDB.getCollection('symbols');
  let txData = null;
  do {
    options.invoke = ++this.invokeId;
    txData = before.preparePlcSymbolHandle(symbols, options, settings);
    
    if (txData !== null) {
      rxInfo = await readPlcSymbolHandle(symbols, options, txData, this._bridge);   
    } else {
      this.invokeId--;
    }

  } while (txData !== null);


  options.invoke = ++this.invokeId;
  if (options.request.length == 1) {
    options.cmd = config.ADSCMD.Read;
    txData = before.preparePlcRead(options, settings);
  } else {
    options.cmd = config.ADSCMD.ReadWrite;
    // TODO
    txData = before.preparePlcRead(options, settings);
  }

  try {
    const data = await plc.sendBuffer(txData, 'read');

    rxInfo = after.analyzePlcRead(data.slice(6), options.request, settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
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
  //let plc = new beckhoffClient(settings.plc.ip, settings.plc.port);
  let rxInfo = {};

  const options = {
    cmd     : config.ADSCMD.INVALID,
    len     : -1,
    invoke  : 0,
    request : symData
  };

  const symbols = lokiDB.getCollection('symbols');
  let txData = null;
  do {
    options.invoke = ++this.invokeId;
    txData = before.preparePlcSymbolHandle(symbols, options, settings);
    
    if (txData !== null) {
      rxInfo = await readPlcSymbolHandle(symbols, options, txData, plc);   
    } else {
      this.invokeId--;
    }

  } while (txData !== null);


  options.invoke = ++this.invokeId;
  if (options.request.length == 1) {
    options.cmd = config.ADSCMD.Write;
    txData = before.preparePlcWrite(options, settings);
  } else {
    options.cmd = config.ADSCMD.ReadWrite;
    // TODO
    //txData = before.preparePlcWriteRead(options, settings);
  }

  try {
    const data = await this._bridge.sendBuffer(txData, 'write');

    rxInfo = after.analyzePlcWrite(data.slice(6), options.request, settings.develop);
  }
  catch (exc) {
    console.log(exc);
  }
  finally {
    plc.sock.destroy();
    callback(rxInfo);
  }
};



module.exports = BeckhoffClient;
/*
module.exports = {
  settings,

  getPlcInfo,
  getPlcState,
  getPlcSymbols,

  readPlcData,
  writePlcData

}
*/