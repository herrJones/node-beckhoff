'use strict'

const ads = require('node-ads');
//const ads = require('./node-ads-api');
const beckhoff = require('../lib/beckhoff');
const readline = require("readline");
const fs = require('fs');

const trmnl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const symbolReadList = 
   ['SENSORS.variable1',
    'SCREENS.variable2',
    'SCREENS.variable3',
    'SENSORS.variable4',
    'SENSORS.variable5'];
const symbolWriteList = [
  {'name' : 'LIGHTS.switch01', 'value' : 1 },
  {'name' : 'LIGHTS.switch01', 'value' : 0 },
  {'name' : 'LIGHTS.switch02', 'value' : 1 },
  {'name' : 'LIGHTS.switch02', 'value' : 0 }
]

let symbolReadIdx = 0;
let symbolWriteIdx = 0;

var waitForCommand = function () {
    trmnl.question("beckhoff ADS/AMS command to test (? for help)  ", function(answer) {
      if (answer == "?") {
          console.log("?    -- this help function\n" +
                      "adsa -- test via node-ads-api\n" +
                      "        use 'adsa ?' to get more help\n" +
                      "bkhf -- test a library command\n" +
                      "        use 'bkhf ?' to get more help\n" +
                      "quit -- close this application\n\n" );
  
      } else if (answer.startsWith('adsa')) {
        let options = {
            host: '10.0.0.1',
            amsNetIdTarget: '10.42.129.1.1.1',
            amsNetIdSource: '127.0.0.1.1.1',
            amsPortTarget: 851,
            verbose: 2, 
            timeout: 5000
        }

                if (answer.endsWith('?')) {
          console.log('adsa ?      -- node-ads-api help function\n' +
                      'adsa info   -- get plc info\n' +
                      'adsa state  -- get plc state\n' +
                      'adsa symbol -- get plc symbol list\n\n');
        } else if (answer.endsWith('info')) {
          console.log('command: ADS-API device info\n');

          let hrstart = process.hrtime();
          let client = ads.connect(options, function() {
            
            this.readDeviceInfo((err, data) => {
              let hrend = process.hrtime(hrstart);
              if (err) {
                console.log(err)
              }
  
              console.log(data);
              console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);

            });
          });
  
          client.on('error', (err) => {
            console.error('error :' + err);
          });
          client.on('timeout', (err) => {
            console.error('timeout : ' + err);
          })
        } else if (answer.endsWith('state')) {
          console.log('command: ADS-API device state\n');

          let hrstart = process.hrtime();
          let client = ads.connect(options, function() {
            
            this.readState((err, data) => {
              let hrend = process.hrtime(hrstart);
              if (err) {
                console.log(err)
              }
  
              console.log(data);
              console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);

            });
          });
  
          client.on('error', (err) => {
            console.error('error :' + err);
          });
          client.on('timeout', (err) => {
            console.error('timeout : ' + err);
          })
        } else if (answer.endsWith('symbol')) {
          console.log('command: ADS-API symbol list');
          let client = ads.connect(options, function() {
            this.getSymbols((err, symbols) => {
              if (err) {
                console.log(err)
              }
         
              //console.log(JSON.stringify(symbols, null, 2));
            })
          });
        
          client.on('error', function(err)  {
            console.error("plc client error: " + err);
          });
        
          client.on('timeout', function(err)  {
            console.error("plc client timeout: " + err);
          });
        } else if (answer.endsWith('read')) {
          console.log('command: ADS-API READ SYMBOL');

          let hrstart = process.hrtime();
          let client = ads.connect(options, function() {

            let symbol = {
              'symname' : symbolReadList[symbolReadIdx++]
            }

            if (symbolReadIdx == 5) symbolReadIdx = 0;

            this.read(symbol, (err, data) => {
              let hrend = process.hrtime(hrstart);

              if (err) {
                console.log(err)
              }
  
              console.log(data);
              console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
            });
          });
  
          client.on('error', (err) => {
              console.error('error :' + err);
          });
          client.on('timeout', (err) => {
              console.error('timeout : ' + err);
          })
 
        } else if (answer.endsWith('write')) {
          console.log('command: ADS-API WRITE SYMBOL');

          //let hrstart = process.hrtime();
          let client = ads.connect(options, function() {

            let symbol = {
              'symname' : symbolWriteList[symbolWriteIdx].name,
              'value'   : symbolWriteList[symbolWriteIdx].value
            }

            if (++symbolWriteIdx == 4) symbolWriteIdx = 0;

            this.write(symbol, (err, data) => {
              //let hrend = process.hrtime(hrstart);

              if (err) {
                console.log(err)
              }
  
              console.log(data);
             // console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
            });
          });
  
          client.on('error', (err) => {
              console.error('error :' + err);
          });
          client.on('timeout', (err) => {
              console.error('timeout : ' + err);
          })
 
        }
        
      } else if (answer.startsWith('bkhf')) {
        let settings = {
          plc : {
            ip     : '10.0.0.1',
            port   : 48898,
          },
          remote : {  
            netid  : '10.42.129.1.1.1',
            port   : 851
          },
          local : {
            netid  : '127.0.0.1.1.1',
            port   : 32905
          }
        }
        
		if (answer.endsWith('?')) {
          console.log('bkhf ?      -- beckhoff help function\n' +
                      'bkhf info   -- get plc info\n' +
                      'bkhf state  -- get plc state\n' +
                      'bkhf symbol -- get plc symbol list\n' + 
                      'bkhf read   -- get value of plc symbol\n');
        
        } else if (answer.endsWith('info')) {
          console.log('command: BECKHOFF DEVICE INFO');
          
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          beckhoff.settings.develop.verbose = false;
          
          let hrstart = process.hrtime();
          beckhoff.getPlcInfo((data) => {
            let hrend = process.hrtime(hrstart);

            console.log(JSON.stringify(data));
            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
          });
          
        } else if (answer.endsWith('state')) {
          console.log('command: BECKHOFF DEVICE STATE');
          
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          beckhoff.settings.develop.verbose = false;

          let hrstart = process.hrtime();
          beckhoff.getPlcState((data) => {
            let hrend = process.hrtime(hrstart);

            console.log(JSON.stringify(data));
            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
          });
          
        } else if (answer.endsWith('symbol')) {
          console.log('command: BECKHOFF SYMBOL LIST');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          beckhoff.settings.develop.verbose = false;
          
          beckhoff.getPlcSymbols((data) => {
            console.log(JSON.stringify(data));
          });
        } else if (answer.endsWith('read')) {
          console.log('command: BECKHOFF READ SYMBOL');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          beckhoff.settings.develop.verbose = false;

          let symbol = {
            'name'  : symbolReadList[symbolReadIdx++],
            'value' : ''
          }

          if (symbolReadIdx == 5) symbolReadIdx = 0;

          let hrstart = process.hrtime();
          beckhoff.readPlcData(symbol, (data) => {
            let hrend = process.hrtime(hrstart);

            console.log(JSON.stringify(data));
            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
          });
        } else if (answer.endsWith('write')) {
          console.log('command: BECKHOFF WRITE SYMBOL');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          beckhoff.settings.develop.verbose = true;

          let symbol = {
            'name' : symbolWriteList[symbolWriteIdx].name,
            'value': symbolWriteList[symbolWriteIdx].value 
          }

          if (++symbolWriteIdx == 4) symbolWriteIdx = 0;

          let hrstart = process.hrtime();
          beckhoff.writePlcData(symbol, (data) => {
            let hrend = process.hrtime(hrstart);

            console.log(JSON.stringify(data));
            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
          });
        }
		
      } else if (answer == "quit") {
        console.log('closing down');
        trmnl.close();
      } 
          
      waitForCommand();   
    });
  }
  
  waitForCommand();
  
  trmnl.on("close", function() {
    console.log("\nBYE BYE !!!");
    process.exit(0);
  });
