# node-beckhoff
> Beckhoff ADS/AMS protocol implementation to use as Node.JS library

Heavily inspired on the Node.JS implementation of _roccomuso_ (https://github.com/roccomuso/node-ads)
and _jisotalo_ (https://github.com/jisotalo/ads-client)

This library aims to be faster in handling read and write requests by caching the handles to the variables.
The library uses async/await and Promises instead of the basic callbacks, so it's a little easier to read and follow.

The calls exposed to the user side provide Promises

## Faster handling
Although implementation is still in javascript, execution speed is gained by storing fixed blocks of data (header) and storing handles in a SQLite database (default choice = in-memory)(storing on-disk is also possible but may have performance penalties, depending on the kind of storage used ).
The drawback of this is that the application has to restart (or: re-fetch datatypes and symbols) after a PLC code-update. 

Handles are stored after first use.
When the application terminates, all handles are cleaned upon exit

## Commands provided
* __getPlcInfo__  : read plc version
* __getPlcState__ : read current plc state 
* __getPlcSymbols__ : read the list of plc symbols 
  _-> this step is necessary in order to read and write individual symbols_
* __getPlcDataTypes__ : read the list of plc datatypes
  _-> RPC functions are also being fetched_
  _  (they can be used to execute functions rather than write data (still TODO))_
* __readPlcData__ : read the current value of a (list of) specified symbol(s) 
  _-> multiple symbols allowed_
* __writePlcData__ : set the value of a specified symbol 
  _-> multiple symbols allowed_
* __delPlcHandle__ : delete a read handle for a symbol
  _-> multiple symbols allowed_
  _-> handles are fetched automatically upon read/write/notify_
* __addPlcNotification__ : add a notification for a specific symbol
  _-> multiple symbols allowed_
* __delPlcNotification__ : remove notifications for a specific symbol
  _-> multiple symbols allowed_
* __getRpcMethodInfo__ : fetch info about rpc methods provided
  _-> only 1 method allowed per call_
  _-> this requires updated plc datatypes and symbols_
* __callPlcRpcMethod__ : call an rpc method on the plc
  _-> only 1 method allowed per call_
* __destroy__ : close connection to th PLC. Free used symbol + notify handles.


## Example application
A sample console application is provided.
This shows the (different) approach for node-ads users and will help new users get started.

## Quick-start

```javascript
const BeckhoffClient = require('node-beckhoff');
const settings = require(__dirname + '/settings.json');

const beckhoff = new BeckhoffClient(settings);

const tmpSettings = beckhoff.settings;

tmpSettings.plc.ip = 'plc-ip';
tmpSettings.remote.netid = 'plc-netid';
tmpSettings.develop.verbose = true;
tmpSettings.develop.debug = false;
beckhoff.settings = tmpSettings;

// fetch plc info
let data = await beckhoff.getPlcInfo();
console.log(JSON.stringify(data));

// fetch all symbols 
data = await beckhoff.getPlcSymbols();
//console.log(JSON.stringify(data)); -> this will produce quite some output
console.log('OK - ' + data.length);

let symbol = [
  { name : 'SENSORS.temp_outside' }
];
data = await beckhoff.readPlcData(symbol);
console.log(JSON.stringify(data));

symbol = [
  { name : 'SENSORS.temp_outside' },
  { name : 'SENSORS.temp_inside' }
];
data = await beckhoff.readPlcData(symbol);
console.log(JSON.stringify(data));

symbol = [
  { name : 'LIGHTS.light_outside', value : 1 }
];
data = await beckhoff.writePlcData(symbol);
console.log(JSON.stringify(data));

/*
 * symbol notifications
 */
beckhoff.on('notify', (data) => {
  console.log(JSON.stringify(data));
})

symbols = [
 // {name : "SENSORS.temp_inside",        mode: "cyclic",   delay : 5, cycle: 30},
  {name : "SENSORS.contact_front_door", mode: "onchange", delay : 5, cycle: 5}
];
data = await beckhoff.addPlcNotification(symbols);
console.log(JSON.stringify(data));

symbols = [
 // {name : "SENSORS.temp_inside"},
  {name : "SENSORS.contact_front_door"}
];
data = await beckhoff.delPlcNotification(symbols);
console.log(JSON.stringify(data));

// in order to know the syntax for rpc calls on your plc,
// first do a 'getRpcMethodInfo' call
rpcCall = [
  {
    "name" : "LIGHTS.lgt_tabletop",
    "method" : "SET_VALUE", 
    "parm_in" : [{"parm" : "value", "value" : 1}]
  }
];
data = await beckhoff.callPlcRpcMethod(rpcCall);
console.log(JSON.stringify(data));

await beckhoff.destroy();
```