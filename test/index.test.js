'use strict';

const assert = require('assert');
const pedding = require('pedding');
const sleep = require('mz-modules/sleep');
const zookeeper = require('..');

describe('test/index.test.js', () => {
  describe('connect() and connected', () => {
    let client1;
    let client2;

    afterEach(function* () {
      // close follwer first
      if (client2) {
        yield client2.close();
        client2 = null;
      }

      if (client1) {
        yield client1.close();
        client1 = null;
      }
      console.log('close all clients');
    });

    it('should one client connected successfully', done => {
      done = pedding(2, done);
      client1 = zookeeper.createClient();
      client1.connect();
      client1.once('connected', done);
      client1.ready(done);
    });

    it('should multi clients connected successfully', done => {
      done = pedding(4, done);
      client1 = zookeeper.createClient();
      client1.connect();
      client1.once('connected', done);
      client1.ready(done);

      client2 = zookeeper.createClient();
      client2.connect();
      client2.once('connected', done);
      client2.ready(done);
    });
  });

  describe('getData()', () => {
    let client1;
    let client2;
    const testpath = '/unittest4';
    const testdata = 'unittest-data:' + Date();

    before(function* () {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      yield client1.ready();
      yield client2.ready();
    });
    before(done => {
      client2.create(testpath, (err, meta) => {
        console.log(err, meta);
        client2.setData(testpath, new Buffer(testdata), (err, meta) => {
          console.log(err, meta);
          done();
        });
      });
    });

    after(function* () {
      // close follwer first
      if (client2) {
        yield client2.close();
        client2 = null;
      }

      if (client1) {
        yield client1.close();
        client1 = null;
      }
      console.log('close all clients');
    });

    it('should get path data without watcher work', function* () {
      const datas = [];
      client1.getData(testpath, (err, data) => {
        assert(!err);
        assert(data);
        assert(data.toString() === testdata);
        datas.push(data);
      });
      client2.getData(testpath, (err, data) => {
        assert(!err);
        assert(data);
        assert(data.toString() === testdata);
        datas.push(data);
      });

      yield sleep(500);
      assert(datas.length === 2);
    });

    it('should get path data with watcher work', function* () {
      const datas = [];
      const events = [];
      client1.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(!err);
        assert(data);
        assert(data.toString() === testdata);
        datas.push(data);
      });
      client2.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data, meta) => {
        assert(!err);
        assert(data);
        assert(data.toString() === testdata);
        datas.push(data);
        console.log('data => %s, meta => %j', data.toString(), meta);
      });

      yield sleep(500);
      assert(datas.length === 2);
      // change data
      client1.setData(testpath, new Buffer('changed'), err => {
        assert(!err);
      });
      yield sleep(500);
      assert(events.length === 2);

      const datas2 = [];
      client1.getData(testpath, (err, data) => {
        assert(!err);
        assert(data);
        assert(data.toString() === 'changed');
        datas2.push(data);
      });
      client2.getData(testpath, (err, data) => {
        assert(!err);
        assert(data);
        assert(data.toString() === 'changed');
        datas2.push(data);
      });
      yield sleep(500);
      assert(datas2.length === 2);
    });
  });
});
