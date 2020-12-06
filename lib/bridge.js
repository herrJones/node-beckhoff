
const tcp = require('net');
const events = require('events');

const config = require('./const');


/*
 *
 */
class beckhoffBridge extends events {
  #address = null;
  #port = null;
  #develop = null;

  constructor (config) {
    super();

    this.#address = config.ip;
    this.#port = config.port;
    
    this.#develop = {
      verbose : config.verbose,
      debug   : config.debug 
    };

    this.db = config.db;
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
      
      this.isConnected = true;
    });
    this.sock.on('data', (data) => {
      this.dataLen += this.sock.bytesRead - this.rxOffset;
      
      this.rxOffset = this.sock.bytesRead;
      this.rxData.push(data);

      if (this.develop.verbose) {
        console.log(config.getTimestamp() + ' - RX : len = ' + (this.sock.bytesRead - this.rxOffset));
      }

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
      console.log('bridge: timeout event');
      this.isConnected = false;
    });
    this.sock.on('error', (err) => {
      this.waitFor.error = true;
      //this.track_PlcInvoke_FlagError(err);

      this.emit('error', err);
    });
    this.sock.on('close', (had_error) => {
      this.isConnected = false;

      if (had_error) {
        console.error('connection closed after error');
        this.emit('close', true);
      } else {
        console.log('connection closed');
        this.emit('close', false);
      }
    });
  }

  closeSocket() {
    this.sock.end();
  }

  /**
   * TODO
   * @param {string} reason 
   */
  track_PlcInvoke_FlagError(reason) {
    const error = {
      error : reason
    };

    this.db.run(`update tracking
                    set handle = -1,
                        data = ?
                  where invokeId > 0`, [JSON.stringify(error)], (err) => {
                    //const self = this;
                    if (err) {
                      console.error(err.message);
                    }
                    //console.log('updated:' + self.changes)
                  });
  }

  /**
   * mark the record for this invokeId as being processed
   * @param {int} invokeId 
   * @param {Object} data 
   */
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
                     set handle = -1,
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

  /**
   * fetch info stored for this request
   * 
   * @param {*} invokeId 
   */
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
          }
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
      this.rxData = []
    } else {
      this.rxData = this.rxData.slice(0, arrIdx).concat(arrIdx, this.rxData.length);
    }
    
    if (this.develop.debug) {
      console.log('BKHF RX  : ' + result.toString('hex') + '\n');
    }

    this.emit('data', result, this.db);

    //resolve(result);
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
      if (this.develop.debug) {
        console.log('BKHF TX  : ' + txdata.toString('hex') + '\n');
      }
        
      this.sock.write(txdata, (err) => {
        if (err) {
          //console.error(config.getTimestamp + ' - ' + err);
          reject(config.getTimestamp + ' - ' + err);
        }
        if (this.develop.verbose) {
          console.log('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);
        }

        resolve('OK');
      });

    });
  }
}

module.exports = beckhoffBridge;