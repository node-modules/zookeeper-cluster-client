'use strict';

const zookeeper = require('node-zookeeper-client');
const ZookeeperClient = require('./api_client');

exports.createClient = (connectionString, options) => {
  options = options || {};
  options.connectionString = connectionString || 'localhost:2181';
  return new ZookeeperClient(options);
};

exports.ACL = zookeeper.ACL;
exports.Id = zookeeper.Id;
exports.Permission = zookeeper.Permission;
exports.CreateMode = zookeeper.CreateMode;
exports.State = zookeeper.State;
exports.Event = zookeeper.Event;
exports.Exception = zookeeper.Exception;
