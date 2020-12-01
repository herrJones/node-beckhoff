'use strict';

const readline = require('readline');
const ip = require('ip');
const settings = require(__dirname + '/settings.json');

const ads = require('node-ads');
//const ads = require('./node-ads-api');

const BeckhoffClient = require('../lib/beckhoff');
const beckhoff = new BeckhoffClient(settings);

const trmnl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const symbolReadList = settings.readlist;
const symbolReadMultiList = settings.readlist_multi;
const symbolWriteList = settings.writelist;
const symbolWriteMultiList = settings.writelist_multi;
//const symbolNotifyList = settings.notifyList;

let symbolReadIdx = 0;
let symbolReadMultiIdx = 0;
let symbolWriteIdx = 0;
let symbolWriteMultiIdx = 0;
//let symbolStartNotifyIdx = 0;
//let symbolStopNotifyIdx = 0;

let options = {};

const waitForCommand = async function () {
  trmnl.question('beckhoff ADS/AMS command to test (? for help)  ', async function(answer) {
    if (answer == '?') {
      console.log('?    -- this help function\n' +
                  'adsa -- test via node-ads-api\n' +
                  '        use "adsa ?" to get more help\n' +
                  'bkhf -- test a library command\n' +
                  '        use "bkhf ?" to get more help\n' +
                  'quit -- close this application\n\n' );
  
    } else if (answer.startsWith('adsa')) {
      options = {
        host: settings.plc.ip,
        amsNetIdTarget: settings.remote.netid,
        amsPortTarget: settings.remote.port,
        amsNetIdSource: ip.address() + '.1.1',
        verbose: 2, 
        timeout: 15000
      };

      if (answer.endsWith('?') || answer.endsWith('help')) {
        console.log('adsa ?            -- node-ads-api help function\n' +
                    'adsa help         -- node-ads-api help function\n' +
                    'adsa info         -- get plc info\n' +
                    'adsa state        -- get plc state\n' +
                    'adsa symbols      -- get plc symbol list\n' + 
                    'adsa datatypes    -- get plc datatypes list\n' +
                    'adsa read         -- get plc symbol value\n' +
                    'adsa readmulti    -- get multiple plc symbol values\n' +
                    'adsa write        -- write plc symbol value\n' +
                    'adsa writemulti   -- write multiple plc symbol values\n'); // +
        //            'adsa notify start -- get notifications from a plc symbol value\n' +
        //            'adsa notify stop  -- stop getting notifications from a plc symbol value');
      } else if (answer.endsWith('info')) {
        console.log('command: ADS-API device info\n');

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {
            
          this.readDeviceInfo((err, data) => {
            const hrend = process.hrtime(hrstart);
            if (err) {
              console.log(err);
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
        });
      } else if (answer.endsWith('state')) {
        console.log('command: ADS-API device state\n');

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {
          
          this.readState((err, data) => {
            const hrend = process.hrtime(hrstart);
            if (err) {
              console.log(err);
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
        });
      } else if (answer.endsWith('symbols')) {
        console.log('command: ADS-API symbol list');
        const client = ads.connect(options, function() {
          this.getSymbols((err, symbols) => {
            if (err) {
              console.log(err);
            }
         
            console.log(JSON.stringify(symbols, null, 2));
          });
        });
        
        client.on('error', function(err)  {
          console.error('plc client error: ' + err);
        });
        
        client.on('timeout', function(err)  {
          console.error('plc client timeout: ' + err);
        });
      } else if (answer.endsWith('datatypes')) {
        console.log('command: ADS-API datatypes list');
        const client = ads.connect(options, function() {
          this.getDatatyps((err, types) => {
            if (err) {
              console.log(err);
            }
         
            console.log(JSON.stringify(types, null, 2));
          });
        });
        
        client.on('error', function(err)  {
          console.error('plc client error: ' + err);
        });
        
        client.on('timeout', function(err)  {
          console.error('plc client timeout: ' + err);
        });
      } else if (answer.endsWith('read')) {
        console.log('command: ADS-API READ SYMBOL');

        const symbol = symbolReadList[symbolReadIdx];
          
        Object.defineProperty(symbol, 'symname', Object.getOwnPropertyDescriptor(symbol, 'name'));
        delete symbol['name'];

        if (++symbolReadIdx == 5) symbolReadIdx = 0;

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          this.read(symbol, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });
 
      } else if (answer.endsWith('readmulti')) {
        console.log('command: ADS-API READ MULTIPLE SYMBOLS');
        const symbols = symbolReadMultiList[symbolReadMultiIdx];
            
        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];

          Object.defineProperty(symbol, 'symname', Object.getOwnPropertyDescriptor(symbol, 'name'));
          delete symbol['name'];
        }
          

        if (++symbolReadMultiIdx == symbolReadMultiList.length) symbolReadMultiIdx = 0;

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          this.multiRead(symbols, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });
      } else if (answer.endsWith('write')) {
        console.log('command: ADS-API WRITE SYMBOL');

        const symbol = {
          'symname' : symbolWriteList[symbolWriteIdx].name,
          'value'   : symbolWriteList[symbolWriteIdx].value
        };

        if (++symbolWriteIdx == 4) symbolWriteIdx = 0;
        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          this.write(symbol, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });

      } else if (answer.endsWith('writemulti')) {
        console.log('command: ADS-API WRITE MULTIPLE SYMBOLS');
        const symbols = symbolWriteMultiList[symbolWriteMultiIdx];

        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];

          Object.defineProperty(symbol, 'symname', Object.getOwnPropertyDescriptor(symbol, 'name'));
          delete symbol['name'];
        }
        //const symbol = {
        //  'symname' : symbolWriteList[symbolWriteIdx].name,
        //  'value'   : symbolWriteList[symbolWriteIdx].value
        //};

        if (++symbolWriteMultiIdx == 4) symbolWriteMultiIdx = 0;

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          this.multiWrite(symbols, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });

      } 
      /*else if (answer.endsWith('notify start')) {
        console.log('command: ADS-API WRITE SYMBOL');

        const symbol = {
          'symname' : symbolNotifyList[symbolStartNotifyIdx].name,
          'bytelength' : ads.INT,
          'cycleTime' : 5000,
          'maxDelay'  : 5000
        };

        if (symbolNotifyList[symbolStartNotifyIdx].mode.toUpperCase() == 'CYCLIC') {
          symbol.transmissionMode = ads.NOTIFY.CYCLIC;
        } else {
          symbol.transmissionMode = ads.NOTIFY.ONCHANGE;
        }

        if (++symbolStartNotifyIdx == 2) symbolStartNotifyIdx = 0;

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          this.notify(symbol, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });

      } else if (answer.endsWith('notify stop')) {
        console.log('command: ADS-API WRITE SYMBOL');

        const hrstart = process.hrtime();
        const client = ads.connect(options, function() {

          const symbol = {
            'symname' : symbolWriteList[symbolWriteIdx].name,
            'value'   : symbolWriteList[symbolWriteIdx].value
          };

          if (++symbolWriteIdx == 4) symbolWriteIdx = 0;

          this.write(symbol, (err, data) => {
            const hrend = process.hrtime(hrstart);

            if (err) {
              console.log(err);
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
        });

      }
      */

        
    } else if (answer.startsWith('bkhf')) {
      options = {
        plc : settings.plc,
        remote : settings.remote,
        local : {
          netid   : ip.address() + '.1.1',
          port    : settings.local.port
        },
        develop : settings.develop
      };

      let hrstart = 0;
      let hrend = 0;
      if (answer.endsWith('?') || (answer.endsWith('help'))) {
        console.log('bkhf ?            -- beckhoff help function\n' +
                    'bkhf help         -- beckhoff help function\n' +
                    'bkhf info         -- get plc info\n' +
                    'bkhf state        -- get plc state\n' +
                    'bkhf symbols      -- get plc symbol list\n' + 
                    'bkhf datatypes    -- get plc datatypes list\n' +
                    'bkhf read         -- get plc symbol value\n' +
                    'bkhf readmulti    -- get multiple plc symbol values\n' +
                    'bkhf write        -- write plc symbol value\n' +
                    'bkhf writemulti   -- write multiple plc symbol values\n'); // +
        //            'bkhf notify start -- get notifications from a plc symbol value\n' +
        //            'bkhf notify stop  -- stop getting notifications from a plc symbol value');
        
      } else if (answer.endsWith('info')) {
        console.log('command: BECKHOFF DEVICE INFO');
        
        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        hrstart = process.hrtime();
        await beckhoff.getPlcInfo()
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 
        
      } else if (answer.endsWith('state')) {
        console.log('command: BECKHOFF DEVICE STATE');
          
        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        hrstart = process.hrtime();
        await beckhoff.getPlcState()
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 
          
      } else if (answer.endsWith('symbols')) {
        console.log('command: BECKHOFF SYMBOL LIST');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options; 

        hrstart = process.hrtime();
        await beckhoff.getPlcSymbols()
          .then((data) => {
            hrend = process.hrtime(hrstart);
            //console.log(JSON.stringify(data));
            console.log('OK - ' + data.length);
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

        
      } else if (answer.endsWith('datatypes')) {
        console.log('command: BECKHOFF DATATYPE LIST');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options; 

        hrstart = process.hrtime();
        await beckhoff.getPlcDataTypes()
          .then((data) => {
            hrend = process.hrtime(hrstart);
            //console.log(JSON.stringify(data));
            console.log('OK - ' + data.length);
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

        
      } else if (answer.endsWith('read')) {
        console.log('command: BECKHOFF READ SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbol = symbolReadList[symbolReadIdx];
        if (++symbolReadIdx == symbolReadList.length) symbolReadIdx = 0;

        hrstart = process.hrtime();
        await beckhoff.readPlcData(symbol)
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 
        
      } else if (answer.endsWith('readmulti')) {
        console.log('command: BECKHOFF READ MULTIPLE SYMBOLS');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbols = symbolReadMultiList[symbolReadMultiIdx];
        if (++symbolReadMultiIdx == symbolReadMultiList.length) symbolReadMultiIdx = 0;

        hrstart = process.hrtime();
        await beckhoff.readPlcData(symbols) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

      } else if (answer.endsWith('write')) {
        console.log('command: BECKHOFF WRITE SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbol = symbolWriteList[symbolWriteIdx];
        if (++symbolWriteIdx == symbolWriteList.length) symbolWriteIdx = 0;

        hrstart = process.hrtime();
        await beckhoff.writePlcData(symbol) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 
        
      } else if (answer.endsWith('writemulti')) {
        console.log('command: BECKHOFF WRITE MULTIPLE SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        //const symbols = symbolWriteMultiList[symbolWriteMultiIdx];
        //if (++symbolWriteMultiIdx == symbolWriteMultiList.length) symbolWriteMultiIdx = 0;

        console.log('still in testing stage - sorry...');
        //hrstart = process.hrtime();
        //const data = await beckhoff.writePlcData(symbols);
        //hrend = process.hrtime(hrstart);

        //console.log(JSON.stringify(data));

      } 
      /*
      else if (answer.endsWith('notify start')) {
        console.log('command: BECKHOFF START NOTIFYING SYMBOL');

        options.develop.verbose = true;
        options.develop.debug = true;
        beckhoff.settings = options;

        if (symbolStartNotifyIdx >= symbolNotifyList.length) {
          console.log('all notifications are active');
        } else {
          const symbols = symbolNotifyList[symbolStartNotifyIdx++];
    
          //hrstart = process.hrtime();
          const data = await beckhoff.addPlcNotification(symbols);
          //hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
        }
        

      } else if (answer.endsWith('notify stop')) {
        console.log('command: BECKHOFF STOP NOTIFYING SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        if (symbolStopNotifyIdx >= symbolNotifyList.length) {
          console.log('all notifications are deleted');
        } else {
          const symbols = symbolNotifyList[symbolStopNotifyIdx++];
    
          //hrstart = process.hrtime();
          const data = await beckhoff.delPlcNotification(symbols);
          //hrend = process.hrtime(hrstart);
  
          console.log(JSON.stringify(data));
        }
        
      }
      */

      if (Array.isArray(hrend)) {
        console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
      }
    } else if (answer == 'quit') {
      console.log('closing down');
      trmnl.close();
    } 
          
    waitForCommand();   
  });
};
  
waitForCommand();
  
trmnl.on('close', async function() {
  console.log('\nBYE BYE !!!');
  await beckhoff.destroy()
    .catch((error) => {
      console.error('on close : ' + error);
    });
  process.exit(0);
});
