'use strict';

const ZookeeperClient = require('./api_client');

exports.createClient = (connectionString, options) => {
  options = options || {};
  options.connectionString = connectionString || 'localhost:2181';
  return new ZookeeperClient(options);
};
