# node-beckhoff
> Beckhoff ADS/AMS protocol implementation for use as Node.JS library

Heavily inspired on the Node.JS implementation of Roccomuso (https://github.com/roccomuso/node-ads)

This library aims to be faster in handling read and write requests by caching the handles to the variables.
The library uses async/await and Promises instead of the basic callbacks.


