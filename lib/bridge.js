
const tcp = require('net');
const events = require('events');

const config = require('./const');
const after = require('./analysis');

const debug = require('debug')('bkhf-bridge');
const debugRaw = require('debug')('bkhf-bridge:raw-data');
const debugVerbose = require('debug')('bkhf-bridge:details');
const debugError = require('debug')('bkhf-bridge:error');

/*
 *
 */
class beckhoffBridge extends events {
  #address = null;
  #db = null;
  #develop = null;
  #port = null;

  constructor (config, database) {
    super();

    this.#address = config.ip;
    this.#port = config.port;
    
    this.#develop = {
      verbose : config.develop.verbose,
      debug   : config.develop.debug 
    };

    debug.enabled = true;
    debugError.enabled = true;
    debugVerbose.enabled = config.develop.verbose;
    debugRaw.enabled = config.develop.debug;

    this.#db = database;
    this.sock = null;

    this.isConnected = false;

    this.rxData = [];
    this.txData = [];

    this.rxOffset = 0;
    this.txOffset = 0;

    this.expLen = 0;
    this.dataLen = 0;
    this.waitFor = {
      'data'  : false,
      'error' : false
    };

    this.initSocket();
  }

  get address() {
    return this.#address;
  }
  get port() {
    return this.#port;
  }
  get develop() {
    return this.#develop;
  }

  set address(value) {
    this.#address = value;
  }
  set port(value) {
    this.#port = value;
  }
  set develop(value) {
    this.#develop = value;
  }
 
  initSocket() {
    this.sock = new tcp.Socket();
    this.sock.setNoDelay(true);
    
    this.sock.on('connect', () => {
      this.sock.setKeepAlive(true, 10000);
      
      debug('connection established');
      
      this.isConnected = true;
    });
    this.sock.on('data', (data) => {
      this.dataLen += this.sock.bytesRead - this.rxOffset;
      
      this.rxOffset = this.sock.bytesRead;
      this.rxData.push(data);

      debugVerbose(config.getTimestamp() + ' - RX : len = ' + this.dataLen);

      if ((this.dataLen > 6) && (this.expLen == 0)) {
        this.expLen = data.readUInt32LE(2);
      }
      if (this.dataLen > this.expLen) {
        this.checkRxData(this.dataLen);
      }
    });
    this.sock.on('timeout', () => {
      if (this.isConnected) {
        this.sock.end('timeout detected');
        this.emit('error');
      }
      debugError('bridge: timeout event');
      this.isConnected = false;
    });
    this.sock.on('error', (err) => {
      this.waitFor.error = true;
      //this.track_PlcInvoke_FlagError(err);
      debugError('error received on socket : ' + err);
      this.emit('error', err);
    });
    this.sock.on('close', (had_error) => {
      this.isConnected = false;

      if (had_error) {
        debugError('connection closed after error');
        this.emit('close', true);
      } else {
        debug('connection closed');
        this.emit('close', false);
      }
    });
    this.sock.on('end', () => {
      this.isConnected = false;
      debug('connection ended');
    });
  }

  closeSocket() {
    this.sock.end();
  }

  /**
   * TODO
   * @param {string} reason 
   */
  /*
  track_PlcInvoke_FlagError(reason) {
    const error = {
      error : reason
    };

    this.db.run(`update tracking
                    set handle = 0,
                        data = ?
                  where invokeId > 0`, [JSON.stringify(error)], (err) => {

      if (err) {
        debugError(err.message);
      }

    });
  }
  */

  /**
   * mark the record for this invokeId as being processed
   * @param {int} invokeId 
   * @param {Object} data 
   */
  /*
  track_PlcInvoke_Resolve(invokeId, data) {
    return new Promise((resolve, reject) => {
      this.db.get('select handle from tracking where invokeId = ?', [invokeId], (err, row) => {
        if (err) {
          reject(err.message);
        }
        if (row) {
          clearTimeout(row.handle);
          this.db.run(`
                  update tracking 
                     set handle = 0,
                         data = ?
                   where invokeId = ?`,  [JSON.stringify(data), invokeId], 
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
  */

  /**
   * fetch info stored for this request
   * 
   * @param {*} invokeId 
   */
  /*
  track_PlcInvoke_GetRequest(invokeId) {

    return new Promise((resolve, reject) => {
      this.db.get(`
              select kind,
                     json_extract(options, '$.request') as request,
                     json_extract(options, '$.symbols') as symbols
                from tracking
               where invokeId = ?`, [invokeId], (err, row) => {
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
  */

  /**
   * update request info
   * 
   * @param {int} invokeId 
   * @param {Object} request 
   */
  /*
  track_PlcInvoke_UpdRequest(invokeId, request) {

    return new Promise((resolve, reject) => {
      this.db.run(`
              update tracking 
                 set options = json_set(options, '$.request', ?) 
               where invokeId = ?`, [JSON.stringify(request), invokeId], (err) => {
        if (err) {
          reject(err.message);
        }
        resolve('OK');
      });
    });
  }
  */

  /*
  track_notification(options) {
    // return new Promise((resolve, reject) => {
    this.db.run(`
        insert into tracking(time, options, kind)
          values (datetime('now'), ?, 'notify')
        `, [JSON.stringify(options)]);
      
    // });
    
  }
  */

  /**
   * keep track of symbol values in the history table
   * 
   * @param {Array} symbols 
   */
  /*
  db_store_symbolhistory (symbols) {
    const insStmt = `insert into history 
                       select datetime("now") as time, handle, ? as value
                         from symbols
                        where name = ?`;

    symbols.forEach((element) => {
      this.db.run(insStmt, [element.value, element.name]);
    });
    
  }
  */

  async db_fetch_notifysymbols (symbols) {
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
      this.db.all(selStmt, notifies, (err, rows) => {
        if (err) {
          reject(err.message);
        }

        for (const row of rows) {
          const curSym = symbols.find((obj) => { return obj.notify === row.notify; });
          debugVerbose('db_fetch_notifysymbols: ' + JSON.stringify(row) + ' -- ' + JSON.stringify(curSym));
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

  /**
   * check if received data is complete
   * 
   * @param {int} rxlen 
   */
  checkRxData(rxlen) {

    const result = Buffer.alloc(rxlen).fill(0);
    let offset = 0;
    let arrIdx = 0;
    for (arrIdx = 0; arrIdx < this.rxData.length; arrIdx++) {
      this.rxData[arrIdx].copy(result, offset);

      offset += this.rxData[arrIdx].length;

      if (offset >= rxlen) {
        break;
      }
    }
    /* clean up the receive array */
    if (++arrIdx == this.rxData.length) {
      this.rxData = [];
    } else {
      this.rxData = this.rxData.slice(0, arrIdx).concat(arrIdx, this.rxData.length);
    }

    debugRaw('BKHF RX  : ' + result.toString('hex') + '\n');

    this.emit('data', result, this.db);

    this.expLen = 0;
    this.dataLen = 0;
    if (this.waitForData) {
      this.waitForData = false;
    }
  }

  /**
   * transmit databuffer to the plc
   * connect if necessary
   * 
   * @param {Buffer} txdata 
   * @param {string} kind 
   */
  async sendBuffer (txdata, kind) {

    return new Promise(async (resolve, reject) => {
      this.waitFor.error = false;
      this.waitFor.data = true;

      if (!txdata) {
        reject('no data to transmit');
      }

      if (!this.isConnected) {
        this.sock.connect(this.port, this.address);
  
        while (!this.isConnected) {
          await config.sleep(5);

          if (this.waitFor.error) {
            reject('timeout');
          }
        }
      }
      debugRaw('BKHF TX : ' + txdata.toString('hex') + '\n');
        
      this.sock.write(txdata, (err) => {
        if (err) {
          reject(config.getTimestamp + ' - ' + err);
        }
        debugVerbose('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);

        resolve('OK');
      });

    });
  }

  /**
   * on 'data' event handler for data received from the PLC.
   * to spice things up, execution takes place in the 'plc' object so we cannot
   * use our local version of the database
   * 
   * @param {Buffer} data buffer with RX-data
   */
  async recv_Bkhf_Data (data) {

    const result = {
      'length' : data.readUInt32LE(2),
      'header' : after.analyzeCommandHeader(data.slice(6,38)),
      'data'   : null
    };

    let resolved = -1;
    let rxData = {};

    if (result.header.error != 0) {
      debugError('error received : ' + result.header.error);
      resolved = await this.#db.invoke_track_resolve(result.header.invoke, result)
        .catch((error) => {
          debugError('recv_Bkhf_Data: ' + error);
        });
      return;
    }
    switch (result.header.command) {
      case config.ADS_CMD.INVALID :
        break;

      case config.ADS_CMD.ReadDeviceInfo :
        result.data = after.analyzeCommandInfo(data.slice(38));
        break;

      case config.ADS_CMD.Read :
        rxData = await this.#db.invoke_track_request_get(result.header.invoke)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: Read): ' + error);
          });
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
            this.#db.symbolinfo_store_history(result.data.symbols);
            break;

          case 'symbols':
            result.data.symbols = after.analyzePlcSymbols(result.data.buffer);
            break;

          case 'datatypes':
            result.data.datatypes = after.analyzePlcDataTypes(result.data.buffer);
            break;

        }
        break;

      case config.ADS_CMD.Write :
        rxData = await this.#db.invoke_track_request_get(result.header.invoke)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: Write): ' + error);
          });
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

      case config.ADS_CMD.ReadState :
        result.data = after.analyzeCommandState(data.slice(38));
        break;

      case config.ADS_CMD.WriteControl :
        result.data = after.analyzeCommandWriteControl(data.slice(38));
        break;
  
      case config.ADS_CMD.NotificationAdd :
        rxData = await this.#db.invoke_track_request_get(result.header.invoke)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: NotificationAdd): ' + error);
          });
        result.data = after.analyzeCommandAddNotification(data.slice(38), rxData.symbols);
        break;
  
      case config.ADS_CMD.NotificationDel :
        rxData = await this.#db.invoke_track_request_get(result.header.invoke)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: NotificationDel): ' + error);
          });
        result.data = after.analyzeCommandDelNotification(data.slice(38), rxData.symbols);
        break;
  
      case config.ADS_CMD.Notification :      
        result.data = after.analyzeCommandNotification(data.slice(38));
        result.data.symbols = await this.db_fetch_notifysymbols(result.data.symbols)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: Notification): ' + error);
          });
        this.#db.symbolinfo_store_history(result.data.symbols);
        //this.emit('notify', result.data.symbols);
        return;
  
      case config.ADS_CMD.ReadWrite :
        rxData = await this.#db.invoke_track_request_get(result.header.invoke)
          .catch((error) => {
            debugError('recv_Bkhf_Data (cmd: ReadWrite): ' + error);
          });
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
            this.#db.symbolinfo_store_history(result.data.symbols);
            break;

          case 'setvalue':
            result.data.symbols = after.analyzePlcSymbolWrite(result.data.buffer, rxData.symbols);
            break;
        }
        break;
    }

    resolved = await this.#db.invoke_track_resolve(result.header.invoke, result)
      .catch((error) => {
        debugError(error);
      });
    while (resolved != 'OK') {
      await config.sleep(1);

      resolved = await this.#db.invoke_track_resolve(result.header.invoke, result)
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
    recv_Bkhf_Error (error) {
      debugError(config.getTimestamp() + ' - ' + error);
  
      this.#db.invoke_track_flagerror(error);
    }
  
    /**
     * on 'close' event
     * 
     * @param {boolean} had_error 
     */
    recv_Bkhf_Close (had_error) {
  
      if (had_error) {
        debugError(config.getTimestamp() + ' - connection closed due to error');
      } else {
        debug(config.getTimestamp() + ' - connection closed ');
      }
    
    }
}

module.exports = beckhoffBridge;