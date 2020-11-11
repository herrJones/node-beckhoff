'use strict';

const readline = require('readline');
const ip = require('ip');
const settings = require(__dirname + '/settings.json');

//const ads = require('node-ads');
const ads = require('./node-ads-api');
const BeckhoffClient = require('../lib/beckhoff');

const beckhoff = new BeckhoffClient();


const trmnl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const symbolReadList = 
   [ {'name' : 'SENSORS.temp_v0_badkamer'},
     {'name' : 'SCREENS.scrauto_v2_bureau'},
     {'name' : 'SCREENS.scrpos_v2_bureau'},
     {'name' : 'SENSORS.temp_v2_badkamer'},
     {'name' : 'SENSORS.wct_v2_bureau_c11'}];
const symbolReadMultiList = [
  [{'name' : 'SENSORS.light_tuin_directval'},{'name' : 'SENSORS.light_voordeur_directval'}],
  [{'name' : 'SENSORS.dirtemp_v0_badkamer'},{'name' : 'SENSORS.dirtemp_v0_berging'},{'name' : 'SENSORS.dirtemp_v0_buiten'}],
  [{'name' : 'SCREENS.scrpos_v1_k_links'},{'name' : 'SCREENS.scrpos_v1_k_midden'},{'name' : 'SCREENS.scrpos_v1_k_rechts'}]
];
const symbolWriteList = [
  {'name' : 'DOMOTICS.LGT_V2_TECHNISCH', 'value' : 1 },
  {'name' : 'DOMOTICS.LGT_V2_TECHNISCH', 'value' : 0 },
  {'name' : 'DOMOTICS.dim_v1_living', 'value' : 35 },
  {'name' : 'DOMOTICS.dim_v1_living', 'value' : 100 },
  {'name' : 'DOMOTICS.dim_v1_living', 'value' : 0 }
];

let symbolReadIdx = 0;
let symbolReadMultiIdx = 0;
let symbolWriteIdx = 0;

let options = {};

const waitForCommand = function () {
  trmnl.question('beckhoff ADS/AMS command to test (? for help)  ', function(answer) {
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
        console.log('adsa ?          -- node-ads-api help function\n' +
                    'adsa help       -- node-ads-api help function\n' +
                    'adsa info       -- get plc info\n' +
                    'adsa state      -- get plc state\n' +
                    'adsa symbol     -- get plc symbol list\n' +
                    'adsa read       --\n' +
                    'adsa readmulti  --\n' +
                    'adsa write      --\n');
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
      } else if (answer.endsWith('symbol')) {
        console.log('command: ADS-API symbol list');
        const client = ads.connect(options, function() {
          this.getSymbols((err, symbols) => {
            if (err) {
              console.log(err);
            }
         
            //console.log(JSON.stringify(symbols, null, 2));
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
        //let symbols = symbolReadMultiList[0];
            
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
        
    } else if (answer.startsWith('bkhf')) {
      options = {
        plc : {
          ip      : settings.plc.ip,
          port    : settings.plc.port,
        },
        remote : {  
          netid   : settings.remote.netid,
          port    : settings.remote.port
        },
        local : {
          netid   : ip.address() + '.1.1',
          port    : settings.local.port
        },
        develop : {
          verbose : false,
          debug   : false
        }
      };
      if (answer.endsWith('?') || (answer.endsWith('help'))) {
        console.log('bkhf ?          -- beckhoff help function\n' +
                    'bkhf help       -- beckhoff help function\n' +
                    'bkhf info       -- get plc info\n' +
                    'bkhf state      -- get plc state\n' +
                    'bkhf symbol     -- get plc symbol list\n' + 
                    'bkhf read       -- get plc symbol value\n' +
                    'bkhf readmulti  -- get multiple plc symbol values\n' +
                    'bkhf write      -- write plc symbol value');
        
      } else if (answer.endsWith('info')) {
        console.log('command: BECKHOFF DEVICE INFO');
        
        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const hrstart = process.hrtime();
        beckhoff.getPlcInfo((data) => {
          const hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
          console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
        });
        
      } else if (answer.endsWith('state')) {
        console.log('command: BECKHOFF DEVICE STATE');
          
        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const hrstart = process.hrtime();
        beckhoff.getPlcState((data) => {
          const hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
          console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
        });
          
      } else if (answer.endsWith('symbol')) {
        console.log('command: BECKHOFF SYMBOL LIST');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options; 

        beckhoff.getPlcSymbols((data) => {
          //console.log(JSON.stringify(data));
          console.log('OK - ' + data.length);
        });
      } else if (answer.endsWith('read')) {
        console.log('command: BECKHOFF READ SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbol = symbolReadList[symbolReadIdx];
        if (++symbolReadIdx == symbolReadList.length) symbolReadIdx = 0;

        const hrstart = process.hrtime();
        beckhoff.readPlcData(symbol, (data) => {
          const hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
          console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
        });
      } else if (answer.endsWith('readmulti')) {
        console.log('command: BECKHOFF READ MULTIPLE SYMBOLS');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbols = symbolReadMultiList[symbolReadMultiIdx];
        if (++symbolReadMultiIdx == symbolReadMultiList.length) symbolReadMultiIdx = 0;

        const hrstart = process.hrtime();
        beckhoff.readPlcData(symbols, (data) => {
          const hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
          console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
        });

      } else if (answer.endsWith('write')) {
        console.log('command: BECKHOFF WRITE SYMBOL');

        options.develop.verbose = false;
        options.develop.debug = false;
        beckhoff.settings = options;

        const symbol = symbolWriteList[symbolWriteIdx];
        if (++symbolWriteIdx == symbolWriteList.length) symbolWriteIdx = 0;

        const hrstart = process.hrtime();
        beckhoff.writePlcData(symbol, (data) => {
          const hrend = process.hrtime(hrstart);

          console.log(JSON.stringify(data));
          console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
        });
      }
    } else if (answer == 'quit') {
      console.log('closing down');
      trmnl.close();
    } 
          
    waitForCommand();   
  });
};
  
waitForCommand();
  
trmnl.on('close', function() {
  console.log('\nBYE BYE !!!');
  beckhoff.destroy();
  process.exit(0);
});
