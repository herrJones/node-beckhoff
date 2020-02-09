# node-beckhoff
> Beckhoff ADS/AMS protocol implementation to use as Node.JS library

Heavily inspired on the Node.JS implementation of Roccomuso (https://github.com/roccomuso/node-ads)

This library aims to be faster in handling read and write requests by caching the handles to the variables.
The library uses async/await and Promises instead of the basic callbacks.

Faster handling
Although implementation is still in javascript, execution speed is gained by storing fixed blocks of data (header) and storing handles in an in-memory database.
The drawback of this is that the application has to restart (or: re-fetch the basic data) after a PLC code-update. 
All symbols are stored in a LokiJS database.
Handles are stored after first use.

Example application
A sample console application is provided.
This shows the (different) approach for node-ads users and will help new users get started.
