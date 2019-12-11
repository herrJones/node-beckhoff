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
                      'adsa symbol -- get plc symbol list\n\n');
        } else if (answer.endsWith('info')) {
          console.log('command: ADS-API device info\n');
          let client = ads.connect(options, function() {
            
            this.readDeviceInfo((err, data) => {
              if (err) {
                console.log(err)
              }
  
              console.log(data);
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
                      'bkhf symbol -- get plc symbol list\n\n');
        
        } else if (answer.endsWith('info')) {
          console.log('command: BECKHOFF DEVICE INFO');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;

          beckhoff.getPlcInfo((data) => {
            console.log(JSON.stringify(data));
          });
          
        } else if (answer.endsWith('state')) {
          console.log('command: BECKHOFF DEVICE STATE');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;

          beckhoff.getPlcState((data) => {
            console.log(JSON.stringify(data));
          });
          
        } else if (answer.endsWith('symbol')) {
          console.log('command: BECKHOFF SYMBOL LIST');
          beckhoff.settings.remote = settings.remote;
          beckhoff.settings.local = settings.local;
          beckhoff.settings.plc = settings.plc;
          
          beckhoff.getPlcSymbols((data) => {
            console.log(JSON.stringify(data));
          });
        } else if (answer.endsWith('test')) {
          let result = beckhoff.testPlcSymbols();

          console.log(JSON.stringify(result));
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
