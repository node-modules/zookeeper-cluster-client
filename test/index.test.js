'use strict';

const zookeeper = require('..');
const pedding = require('pedding');

describe('test/index.test.js', () => {
  describe('connect() and connected', () => {
    it('should connected successfully', done => {
      done = pedding(4, done);
      const client1 = zookeeper.createClient();
      client1.connect();
      client1.on('connected', done);
      client1.ready(done);

      const client2 = zookeeper.createClient();
      client2.connect();
      client2.on('connected', done);
      client2.ready(done);
    });
  });
});
