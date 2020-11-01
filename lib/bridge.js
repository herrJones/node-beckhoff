//const sqlite3 = require('sqlite3').verbose();
const tcp = require('net');
const events = require('events');

const config = require('./const');
//const { emit } = require('process');

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
      'data' : false,
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
        console.log(config.getTimestamp() + ' - RX : len = ' + rxLen);
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
      }
      console.log('bridge: timeout event');
      this.isConnected = false;
    });
    this.sock.on('error', (err) => {
      this.waitFor.error = true;
      this.emit('error', err);
    });
    this.sock.on('close', (had_error) => {
      this.isConnected = false;

      if (had_error) {
        console.error('connection closed after error');
        this.emit('sock_closed', true);
      } else {
        console.log('connection closed');
        this.emit('sock_closed', false);
      }
    });
  }

  closeSocket() {
    this.sock.end();
  }

  async track_PlcInvoke_Resolve(invokeId, data, db) {
    return new Promise((resolve, reject) => {
      db.get('select handle from tracking where invokeId = ?', [invokeId], (err, row) => {
        if (err) {
          reject(err.message);
        }
        if (row) {
          clearTimeout(row.handle); // ['handle']);
          db.run(`update tracking 
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

  async sendBuffer (txdata, kind) {

    //let rxdata = [];
    //let expLen = -1;
    //let rxOffset = this.sock.bytesRead;

    if (!this.isConnected) {
      this.sock.connect(this.port, this.address);

      while (!this.isConnected) {
        await config.sleep(25);
      }
    }
    if (this.develop.debug) {
      console.log('BKHF TX  : ' + txdata.toString('hex') + '\n');
    }

    return new Promise(async (resolve, reject) => {
      this.waitFor.error = false;
      this.waitFor.data = true;

      //if (this.sock.bytesWritten > 0) {
        
        this.sock.write(txdata, (err) => {
          if (err) {
            console.error(config.getTimestamp + ' - ' + err);
          }
          if (this.develop.verbose) {
            console.log('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);
          }

          resolve('OK');
        });
      //} else {
      //  this.sock.connect(this.port, this.address, () => {
      //    console.log('connected to beckhoff plc : ' + this.address + ':' + this.port );
      //    
      //    this.sock.write(txdata, (err) => {
      //      if (err) {
      //        console.error(config.getTimestamp + ' - ' + err);
      //      }
      //
      //      if (this.develop.verbose) {
      //        console.log('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);
      //      }
      //
      //      resolve('OK');
      //    });
      //    
      //  });
      //}
      /*
      do {
        await config.sleep(25);

        if (this.waitFor.error) {
          this.waitFor.data = false;
          reject('error');
        }
      } while (this.waitFor.data);
      */

      this.sock.on('error', (err) => {
        reject(err);
      });
      this.sock.on('close', (had_error) => {
        if (had_error) {
          console.error('connection closed after error');
          reject('error detected');
        } else {
          console.log('connection closed');
        }
      });

    });
  }
}

module.exports = beckhoffBridge;