'use strict';

const readline = require('readline');
const settings = require(__dirname + '/settings.json');

const adsa = require('node-ads');
const adsc = require('ads-client');

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
const symbolNotifyList = settings.notifylist;
const symbolRpcList = settings.rpcMethodList;

let symbolReadIdx = 0;
let symbolReadMultiIdx = 0;
let symbolWriteIdx = 0;
let symbolWriteMultiIdx = 0;

let symbolStartNotifyIdx = 0;
let symbolStopNotifyIdx = 0;
let symbolRpcIdx = 0;

let options = {};

let rpcValue = 1;

const waitForCommand = async function () {
  trmnl.question('beckhoff ADS/AMS command to test (? for help)  ', async function(answer) {
    if ((answer == '?') || (answer == 'help')) {
      console.log('?    -- this help function\n' +
                  'adsa -- test via node-ads-api\n' +
                  '        use "adsa ?" to get more help\n' +
                  'adsc -- test via ads-client\n' +
                  '        use "adsc ?" to get more help\n' +
                  'bkhf -- test a library command\n' +
                  '        use "bkhf ?" to get more help\n' +
                  'quit -- close this application\n\n' );
  
    } else if (answer.startsWith('adsa')) {
      options = {
        host: settings.plc.ip,
        amsNetIdTarget: settings.remote.netid,
        amsPortTarget: settings.remote.port,
        amsNetIdSource: settings.local.netid,//ip.address()+ '.1.1',
        verbose: 2, 
        timeout: 10000
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
                    'adsa writemulti   -- write multiple plc symbol values\n' +
                    'adsa notify start -- get notifications from a plc symbol value\n' +
                    'adsa notify stop  -- stop getting notifications from a plc symbol value');
      } else if (answer.endsWith('info')) {
        console.log('command: ADS-API device info\n');

        const hrstart = process.hrtime();
        const client = adsa.connect(options, function() {
            
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
        const client = adsa.connect(options, function() {
          
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
        const client = adsa.connect(options, function() {
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
        const client = adsa.connect(options, function() {
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
        const client = adsa.connect(options, function() {

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
        const client = adsa.connect(options, function() {

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
        const client = adsa.connect(options, function() {

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
        const client = adsa.connect(options, function() {

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

      } else if (answer.endsWith('notify start')) {
        console.log('command: ADS-API WRITE SYMBOL');

        const symbol = {
          'symname' : symbolNotifyList[symbolStartNotifyIdx].name,
          'bytelength' : adsa.INT,
          'cycleTime' : 5000,
          'maxDelay'  : 5000
        };

        if (symbolNotifyList[symbolStartNotifyIdx].mode.toUpperCase() == 'CYCLIC') {
          symbol.transmissionMode = adsa.NOTIFY.CYCLIC;
        } else {
          symbol.transmissionMode = adsa.NOTIFY.ONCHANGE;
        }

        if (++symbolStartNotifyIdx == 2) symbolStartNotifyIdx = 0;

        const hrstart = process.hrtime();
        const client = adsa.connect(options, function() {

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
        const client = adsa.connect(options, function() {

          const symbol = {
            'symname' : symbolNotifyList[symbolStopNotifyIdx].name
          };

          if (++symbolStopNotifyIdx == 4) symbolStopNotifyIdx = 0;

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
        
    } else if (answer.startsWith('adsc')) { 
      options = {
        localAmsNetId: settings.local.netid,//ip.address()+ '.1.1',
        localAdsPort: settings.local.port,                //Can be anything that is not used
        targetAmsNetId: settings.remote.netid,
        targetAdsPort: settings.remote.port,
        routerAddress: settings.plc.ip,     //PLC ip address
        routerTcpPort: settings.plc.port
      };

      let hrstart = 0;
      let hrend = 0;
      if (answer.endsWith('?') || answer.endsWith('help')) {
        console.log(
          'adsc ?            -- ads-client help function\n' +
          'adsc help         -- ads-client help function\n' +
          'adsc info         -- get plc info\n' +
          'adsc symbols      -- get plc symbol list\n' + 
          'adsc datatypes    -- get plc datatypes list\n' +
          'adsc state        -- get plc state\n' +
          'adsc state get    -- get plc state\n' +
          'adsc state start  -- set plc in START state\n' +
          'adsc state stop   -- set plc in STOP state\n' +
          'adsc state config -- set plc in CONFIG state\n' +
          'adsc rpc          -- call plc rpc method\n');
      } else if (answer.endsWith('info')) {
        console.log('command: ADS-CLIENT DEVICE INFO');
        const client = new adsc.Client(options);

        hrstart = process.hrtime();
        await client.connect()
          .then(() => {
            return client.readDeviceInfo();
          }) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));

            return client.disconnect();
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

      } else if (answer.endsWith('symbols')) {
        console.log('command: ADS-CLIENT symbol list');
        const client = new adsc.Client(options);

        hrstart = process.hrtime();
        await client.connect()
          .then(() => {
            return client.readAndCacheSymbols();
          }) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));

            return client.disconnect();
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

      } else if (answer.endsWith('datatypes')) {
        console.log('command: ADS-CLIENT datatypes list');

        const client = new adsc.Client(options);

        hrstart = process.hrtime();
        await client.connect()
          .then(() => {
            //client.setDebugging(4);
            return client.readAndCacheDataTypes();
          }) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));

            return client.disconnect();
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          }); 

      } else if (answer.includes(' state ', 3)) {
        if (answer.endsWith('get')) {
          console.log('command: ADS-CLIENT DEVICE STATE');
          const client = new adsc.Client(options);
          
          hrstart = process.hrtime();
          await client.connect()
            .then(async () => {
              const sysState = await client.readSystemManagerState();
              const plcState = await  client.readPlcRuntimeState();
              return sysState + plcState;
            }) 
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
  
              return client.disconnect();
            })
            .catch(async (error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
  
              client.disconnect();
  
            });
        } else if (answer.endsWith('start')) {
          console.log('command: ADS-CLIENT START PLC');
          const client = new adsc.Client(options);
          
          hrstart = process.hrtime();
          await client.connect()
            .then(() => {
              client.setDebugging(4);
              return client.startPlc(options.targetAdsPort);
            }) 
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));

              client.setDebugging(1);
  
              return client.disconnect();
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            });
        } else if (answer.endsWith('stop')) {
          console.log('command: ADS-CLIENT STOP PLC');
          const client = new adsc.Client(options);
          
          hrstart = process.hrtime();
          await client.connect()
            .then(() => {
              client.setDebugging(4);
              return client.stop(options.targetAdsPort);
            }) 
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
              client.setDebugging(1);
              return client.disconnect();
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            });
        } else if (answer.endsWith('config')) {
          console.log('command: ADS-CLIENT SET DEVICE IN CONFIG STATE');
          const client = new adsc.Client(options);
          
          hrstart = process.hrtime();
          await client.connect()
            .then(() => {
              client.setDebugging(4);
              return client.setSystemManagerToConfig();
            }) 
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
              client.setDebugging(1);
              return client.disconnect();
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            });
        } else if (answer.endsWith('activate')) {
          console.log('command: ADS-CLIENT SET DEVICE IN ACTIVE STATE');
          const client = new adsc.Client(options);
          
          hrstart = process.hrtime();
          await client.connect()
            .then(() => {
              client.setDebugging(4);
              return client.setSystemManagerToRun();
            }) 
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
              client.setDebugging(1);
              return client.disconnect();
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            });
        }
      } else if (answer.endsWith('rpc')) {
        console.log('command: ADS-CLIENT CALL RPC METHOD');
        const client = new adsc.Client(options);

        hrstart = process.hrtime();
        await client.connect()
          .then(() => {
            const currRpcMethod = symbolRpcList[symbolRpcIdx];
            rpcValue = currRpcMethod.value;

            if (++symbolRpcIdx == 2) symbolRpcIdx = 0;

            client.setDebugging(2);
            return client.invokeRpcMethod(currRpcMethod.name, currRpcMethod.method, {
              value: rpcValue
            });
          }) 
          .then((data) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(data));

            if (rpcValue == 1) {
              rpcValue = 0;
            } else {
              rpcValue = 1;
            }
            client.setDebugging(1);
            return client.disconnect();
          })
          .catch((error) => {
            hrend = process.hrtime(hrstart);
            console.log(JSON.stringify(error));
          });
      }

      if (Array.isArray(hrend)) {
        console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
      }
    } else if (answer.startsWith('bkhf')) {
      options = {
        plc : settings.plc,
        remote : settings.remote,
        local : {
          netid   : settings.local.netid,
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
                    'bkhf writemulti   -- write multiple plc symbol values\n' +
                    'bkhf notify start -- get notifications from a plc symbol value\n' +
                    'bkhf notify stop  -- stop getting notifications from a plc symbol value\n' +
                    'bkhf rpc info     -- get info on RPC methods available\n' +
                    'bkhf rpc call     -- call RPC methods');
        
      } else if (answer.endsWith('info') && !answer.includes(('rpc'))) {
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

        const symbols = symbolWriteMultiList[symbolWriteMultiIdx];
        if (++symbolWriteMultiIdx == symbolWriteMultiList.length) symbolWriteMultiIdx = 0;

        hrstart = process.hrtime();
        const data = await beckhoff.writePlcData(symbols);
        hrend = process.hrtime(hrstart);

        console.log(JSON.stringify(data));

      } else if (answer.includes(' notify ', 3)) {
        if (answer.endsWith('start')) {
          console.log('command: BECKHOFF START NOTIFYING SYMBOL');

          options.develop.verbose = false;
          options.develop.debug = false;
          beckhoff.settings = options;
  
          if (symbolStartNotifyIdx >= symbolNotifyList.length) {
            console.log('all notifications are active');
          } else {
            const symbols = symbolNotifyList[symbolStartNotifyIdx++];
      
            hrstart = process.hrtime();
            const data = await beckhoff.addPlcNotification(symbols);
            hrend = process.hrtime(hrstart);
  
            console.log(JSON.stringify(data));
          }
          
        } else if (answer.endsWith('stop')) {
          console.log('command: BECKHOFF STOP NOTIFYING SYMBOL');

          options.develop.verbose = false;
          options.develop.debug = false;
          beckhoff.settings = options;
  
          if (symbolStopNotifyIdx >= symbolNotifyList.length) {
            console.log('all notifications are deleted');
          } else {
            const symbols = symbolNotifyList[symbolStopNotifyIdx++];
      
            hrstart = process.hrtime();
            const data = await beckhoff.delPlcNotification(symbols);
            hrend = process.hrtime(hrstart);
    
            console.log(JSON.stringify(data));
          }
        }
      } else if (answer.includes(' rpc ', 3)) {
        if (answer.endsWith('info')) {

          hrstart = process.hrtime();
          beckhoff.getRpcMethodInfo([])
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            }); 
        } else if (answer.endsWith('call')) {

          const currRpcMethod = symbolRpcList[symbolRpcIdx];
          //rpcValue = currRpcMethod.value;

          if (++symbolRpcIdx == symbolRpcList.length) symbolRpcIdx = 0;
          //if (++symbolRpcIdx == 4) symbolRpcIdx = 2;

          options.develop.verbose = false;
          options.develop.debug = true;
          beckhoff.settings = options;

<<<<<<< HEAD
          hrstart = process.hrtime();
          await beckhoff.callPlcRpcMethod([currRpcMethod])
            .then((data) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(data));
            })
            .catch((error) => {
              hrend = process.hrtime(hrstart);
              console.log(JSON.stringify(error));
            });
=======
        if (symbolStopNotifyIdx >= symbolNotifyList.length) {
          console.log('all notifications are deleted');
        } else {
          const symbols = symbolNotifyList[symbolStopNotifyIdx++];
    
          hrstart = process.hrtime();
          const data = await beckhoff.delPlcNotification(symbols);
          hrend = process.hrtime(hrstart);
  
          console.log(JSON.stringify(data));
>>>>>>> e2b63f5f0fabfcbe895da3f9b0d5adedd082baeb
        }
      }
      
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

beckhoff.on('notify', (data) => {
  console.log('notify: ' + JSON.stringify(data));
});
  
trmnl.on('close', async function() {
  console.log('\nBYE BYE !!!');
  await beckhoff.destroy()
    .catch((error) => {
      console.error('on close : ' + error);
    });
  process.exit(0);
});
