//const sqlite3 = require('sqlite3').verbose();
const net = require('net');
const events = require('events');

const config = require('./const');
//const { emit } = require('process');

/*
 *
 */
class beckhoffBridge extends events {
  constructor (config) {
    super();

    this.address = config.ip;
    this.port = config.port;
    
    this.db = config.db;
    this.develop = {
      verbose : config.verbose,
      debug   : config.debug 
    };

    this.sock = new net.Socket();
    this.sock.setNoDelay(true);
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
  
    this.on('newdata', (data) => {

    });
  }

  initSocket() {
    this.sock = new net.Socket();
    this.sock.setNoDelay(true);
    
    this.sock.on('connect', () => {
      this.sock.setKeepAlive(true, 10000);
      
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

    this.sock.on('error', (err) => {
      this.waitFor.error = true;
      //emit('sock_error', err);
    });
    this.sock.on('close', (had_error) => {
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

  checkRxData(rxlen) {

    const result = Buffer.alloc(rxlen).fill(0);
    let offset = 0;
    for (let i = 0; i < this.rxData.length; i++) {
      this.rxData[i].copy(result, offset);

      offset += this.rxData[i].length;
    }

    if (this.develop.save) {
      //let dbdata = lokiDB.getCollection('trx');
      //let dbsave = {
      //  kind : kind,
      //  tx   : txdata,
      //  rx   : result
      //}
      //dbdata.insertOne(dbsave);

      //lokiDB.saveDatabase();
    }
    if (this.develop.debug) {
      console.log('BKHF RX  : ' + result.toString('hex') + '\n');
    }

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

      if (this.sock.bytesWritten > 0) {
        
        this.sock.write(txdata, (err) => {
          if (this.develop.verbose) {
            console.log('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);
          }
        });
      } else {
        this.sock.connect(this.port, this.address, () => {
          console.log('connected to beckhoff plc : ' + this.address + ':' + this.port );
          
          this.sock.write(txdata, (err) => {
            if (this.develop.verbose) {
              console.log('TX : %i bytes sent - %s', this.sock.bytesWritten, kind);
            }
          });
          
        });
      }

      do {
        await config.sleep(25);

        if (this.waitFor.error) {
          this.waitFor.data = false;
          reject('error');
        }
      } while (this.waitFor.data);

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