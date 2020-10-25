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

    this.expLen = -1;
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
      const rxLen = this.sock.bytesRead - this.rxOffset;
 
      this.rxOffset = this.sock.bytesRead;
      this.rxData.push(data);

      if (this.develop.verbose) {
        console.log(config.getTimestamp() + ' - RX : len = ' + rxLen);
      }

      if ((rxLen > 6) && (this.expLen == -1)) {
        this.expLen = data.readUInt32LE(2);
      }
      if (rxLen > this.expLen) {
        this.checkRxData(rxLen);
      }
    });
    this.sock.on('timeout', () => {
      if (this.isConnected) {
        this.sock.end('timeout detected');
      }

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

  track_PlcInvoke_Resolve(invokeId, data) {
    this.db.get('select handle from tracking where invokeId = ?', invokeId, (err, row) => {
      clearTimeout(row['handle']);
      this.db.run(`update tracking 
                       set handle = -1,
                           data = ?
                     where invokeId = ?`,  [data, invokeId]);
    })
  }

  checkRxData(rxlen) {

    const result = Buffer.alloc(rxlen).fill(0);
    let offset = 0;
    for (let i = 0; i < this.rxData.length; i++) {
      this.rxData[i].copy(result, offset);

      offset += this.rxData[i].length;
    }

    //if (this.develop.save) {
    //  //let dbdata = lokiDB.getCollection('trx');
    //  //let dbsave = {
    //  //  kind : kind,
    //  //  tx   : txdata,
    //  //  rx   : result
    //  //}
    //  //dbdata.insertOne(dbsave);
    //
    //  //lokiDB.saveDatabase();
    //}
    if (this.develop.debug) {
      console.log('BKHF RX  : ' + result.toString('hex') + '\n');
    }

    this.emit('data', result);

    //resolve(result);
    this.expLen = -1;
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