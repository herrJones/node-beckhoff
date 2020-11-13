# node-beckhoff
> Beckhoff ADS/AMS protocol implementation to use as Node.JS library

Heavily inspired on the Node.JS implementation of Roccomuso (https://github.com/roccomuso/node-ads)

This library aims to be faster in handling read and write requests by caching the handles to the variables.
The library uses async/await and Promises instead of the basic callbacks, so it's a little easier to read and follow.

The calls exposed to the user side provide Promises

## Faster handling
Although implementation is still in javascript, execution speed is gained by storing fixed blocks of data (header) and storing handles in a SQLite database (default choice = in-memory).
The drawback of this is that the application has to restart (or: re-fetch the basic data) after a PLC code-update. 

Handles are stored after first use.
When the 

## Commands provided
* __getPlcInfo__  : read plc version
* __getPlcState__ : read current plc state 
* __getPlcSymbols__ : read the list of plc symbols 
  _-> this step is necessary in order to read and write individual symbols_
* __readPlcData__ : read the current value of a (list of) specified symbol(s) 
  _-> multiple symbols allowed_
* __writePlcData__ : set the value of a specified symbol 
  _-> multiple symbols not (yet?) allowed_
* __destroy__ : close connection to th PLC. Free used handles.

_Notifications_ are a planned feature

## Example application
A sample console application is provided.
This shows the (different) approach for node-ads users and will help new users get started.

## Quick-start

```javascript
const BeckhoffClient = require('node-beckhoff');

const beckhoff = new BeckhoffClient();

const tmpSettings = beckhoff.settings;

tmpSettings.plc.ip = 'plc-ip';
tmpSettings.remote.netid = 'plc-netid';
tmpSettings.develop.verbose = true;
tmpSettings.develop.debug = false;
beckhoff.settings = tmpSettings;

beckhoff.getPlcInfo((data) => {
  console.log(JSON.stringify(data));
});

beckhoff.getPlcSymbols((data) => {
  //console.log(JSON.stringify(data)); -> this will produce quite some output
  console.log('OK - ' + data.length);
});

const symbol = {
  name : 'SENSORS.temp_outside'
}
beckhoff.readPlcData(symbol, (data) => {
  console.log(JSON.stringify(data));
});
```