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
      client1.ready(() => {
        assert(client1.isClusterClientLeader);
        assert(client1.getState());
        assert(client1.getState().name === 'SYNC_CONNECTED');
        assert(Buffer.isBuffer(client1.getSessionId()));
        assert(Buffer.isBuffer(client1.getSessionPassword()));
        assert(typeof client1.getSessionTimeout() === 'number');
        assert(client1.getSessionTimeout() > 0);
        done();
      });
    });

    it('should emit error on connect() after client closed', function* () {
      client1 = zookeeper.createClient();
      yield client1.ready();
      // _client subscribe none
      client1._client.subscribe({}, () => {
        throw new Error('should not run this');
      });
      assert(client1.getState().name === 'SYNC_CONNECTED');
      let onceCalled = false;
      let onCalled = false;
      client1.on('connected', () => {
        onCalled = true;
      });
      client1.once('connected', () => {
        onceCalled = true;
      });
      yield sleep(1);
      assert(onceCalled);
      assert(onCalled);

      yield client1.close();
      // after close state should be DISCONNECTED
      // console.log(client1.getState())
      // assert(client1.getState().name === 'DISCONNECTED');
      // close again work
      yield client1.close();
      let err;
      client1.once('error', e => {
        err = e;
      });
      client1.connect();
      yield sleep(10);
      assert(err);
      assert(err.message === 'Can\'t connect to zookeeper after client closed');
    });

    it('should multi clients connected successfully', done => {
      done = pedding(4, done);
      client1 = zookeeper.createClient();
      client1.connect();
      client1.once('connected', done);
      client1.ready(() => {
        assert(client1.getState());
        assert(client1.getState().name === 'SYNC_CONNECTED');
        assert(Buffer.isBuffer(client1.getSessionId()));
        assert(Buffer.isBuffer(client1.getSessionPassword()));
        assert(typeof client1.getSessionTimeout() === 'number');
        assert(client1.getSessionTimeout() > 0);
        done();
      });

      client2 = zookeeper.createClient();
      client2.connect();
      client2.once('connected', done);
      client2.ready(() => {
        assert(client2.getState());
        assert(client2.getState().name === 'SYNC_CONNECTED');
        assert(Buffer.isBuffer(client2.getSessionId()));
        assert(Buffer.isBuffer(client2.getSessionPassword()));
        assert(typeof client2.getSessionTimeout() === 'number');
        assert(client2.getSessionTimeout() > 0);
        done();
      });
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
      yield sleep(100);
      // getData and watcher again
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
      assert(datas.length === 3);
      // change data
      client1.setData(testpath, new Buffer('changed'), err => {
        assert(!err);
      });
      yield sleep(500);
      assert(events.length === 3);

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

    it('should get not exists path data with watcher work', function* () {
      const datas = [];
      const events = [];
      const errors = [];
      const testpath = '/foo-not-exists-path-test-case';
      client1.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
        assert(!data);
      });
      client2.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
        assert(!data);
      });
      yield sleep(100);
      // getData and watcher again
      client2.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
        assert(!data);
      });

      yield sleep(500);
      assert(datas.length === 0);
      assert(errors.length === 3);
      // change data
      client1.setData(testpath, new Buffer('changed'), err => {
        assert(err);
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
      });
      yield sleep(500);
      assert(events.length === 0);
      assert(errors.length === 4);
    });
  });

  describe('exists()', () => {
    let client1;
    let client2;
    const testpath = '/unittest4-exists';
    const testdata = 'unittest-data-exists:' + Date();

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
      console.log('close all exists() clients');
    });

    it('should check exists path without watcher work', function* () {
      const metas = [];
      client1.exists(testpath, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas.push(meta);
      });
      client2.exists(testpath, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas.push(meta);
      });

      yield sleep(500);
      assert(metas.length === 2);
    });

    it('should check path exists with watcher work', function* () {
      const metas = [];
      const events = [];
      client1.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      }, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas.push(meta);
      });
      client2.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      }, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas.push(meta);
      });
      yield sleep(100);
      // exists and watcher again
      client2.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      }, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas.push(meta);
      });

      yield sleep(500);
      assert(metas.length === 3);
      // change data
      client1.setData(testpath, new Buffer('changed'), err => {
        assert(!err);
      });
      yield sleep(500);
      assert(events.length === 3);

      const metas2 = [];
      client1.exists(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas2.push(meta);
      });
      client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, meta) => {
        assert(!err);
        assert(meta);
        assert(meta.ctime);
        assert(meta.mtime);
        metas2.push(meta);
      });
      yield sleep(500);
      assert(metas2.length === 2);
    });

    it('should check not exists path data with watcher work', function* () {
      let callbackCount = 0;
      const events = [];
      const testpath = '/foo-not-exists-path-test-case';
      client1.exists(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(!err);
        assert(!data);
        callbackCount++;
      });
      client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(!err);
        assert(!data);
        callbackCount++;
      });
      yield sleep(100);
      // exists and watcher again
      client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(!err);
        assert(!data);
        callbackCount++;
      });

      yield sleep(500);
      assert(events.length === 0);
      assert(callbackCount === 3);
    });
  });

  describe('getChildren()', () => {
    let client1;
    let client2;
    const testpathRoot = '/unittest4-getChildren';
    const testpath = '/unittest4-getChildren/foo1';
    const testdata = 'unittest-data-getChildren:' + Date();

    before(function* () {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      yield client1.ready();
      yield client2.ready();
    });
    before(done => {
      done = pedding(3, done);
      client2.mkdirp(testpathRoot, zookeeper.CreateMode.PERSISTENT, (err, p) => {
        console.log(err, p);
        client1.create(testpath, (err, meta) => {
          console.log(err, meta);
          client1.setData(testpath, new Buffer(testdata), (err, meta) => {
            console.log(err, meta);
            done();
          });
        });
        client2.create(testpath + '2', (err, meta) => {
          console.log(err, meta);
          client2.setData(testpath + '2', new Buffer(testdata), (err, meta) => {
            console.log(err, meta);
            done();
          });
        });
      });

      // try to delete foo13
      client2.remove(testpath + '3', err => {
        console.log('remove foo13 error: %s', err);
        done();
      });
    });

    after(done => {
      // try to delete foo13
      client2.remove(testpath + '3', err => {
        console.log('remove foo13 error: %s', err);
        done();
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
      console.log('close all exists() clients');
    });

    it('should getChildren exists path without watcher work', function* () {
      const lists = [];
      client1.getChildren(testpathRoot, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        lists.push(dirs);
      });
      client2.getChildren(testpathRoot, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        lists.push(dirs);
      });

      yield sleep(500);
      assert(lists.length === 2);
    });

    it('should check path exists with watcher work', function* () {
      const lists = [];
      const events = [];
      client1.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        lists.push(dirs);
      });
      client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        lists.push(dirs);
      });
      yield sleep(100);
      // exists and watcher again
      client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        lists.push(dirs);
      });

      yield sleep(500);
      assert(lists.length === 3);
      // add dir
      client2.create(testpath + '3', err => {
        assert(!err);
        client2.setData(testpath + '3', new Buffer(testdata), err => {
          assert(!err);
        });
      });
      yield sleep(500);
      assert(events.length === 3);

      const lists2 = [];
      client1.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 3);
        assert.deepEqual(dirs, [ 'foo13', 'foo1', 'foo12' ]);
        lists2.push(dirs);
      });
      client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, (err, dirs) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 3);
        assert.deepEqual(dirs, [ 'foo13', 'foo1', 'foo12' ]);
        lists2.push(dirs);
      });
      yield sleep(500);
      assert(lists2.length === 2);
    });

    it('should getChildren not exists path data with watcher work', function* () {
      let callbackCount = 0;
      const events = [];
      const testpath = '/foo-not-exists-path-test-case';
      client1.getChildren(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err.name === 'NO_NODE');
        assert(!data);
        callbackCount++;
      });
      client2.getChildren(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err.name === 'NO_NODE');
        assert(!data);
        callbackCount++;
      });
      yield sleep(100);
      // exists and watcher again
      client2.getChildren(testpath, event => {
        assert(event);
        events.push(event);
      }, (err, data) => {
        assert(err);
        assert(err.name === 'NO_NODE');
        assert(!data);
        callbackCount++;
      });

      yield sleep(500);
      assert(events.length === 0);
      assert(callbackCount === 3);
    });
  });

  describe('watchChildren()', () => {
    let client1;
    let client2;
    const testpathRoot = '/unittest4-watchChildren';
    const testpath = '/unittest4-watchChildren/foo1';
    const testdata = 'unittest4-data-watchChildren:' + Date();

    before(function* () {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      yield client1.ready();
      yield client2.ready();
    });
    before(done => {
      done = pedding(3, done);
      client2.mkdirp(testpathRoot, zookeeper.CreateMode.PERSISTENT, (err, p) => {
        console.log(err, p);
        client1.create(testpath, (err, meta) => {
          console.log(err, meta);
          client1.setData(testpath, new Buffer(testdata), (err, meta) => {
            console.log(err, meta);
            done();
          });
        });
        client2.create(testpath + '2', (err, meta) => {
          console.log(err, meta);
          client2.setData(testpath + '2', new Buffer(testdata), (err, meta) => {
            console.log(err, meta);
            done();
          });
        });
      });

      // try to delete foo13
      client2.remove(testpath + '3', err => {
        console.log('remove foo13 error: %s', err);
        done();
      });
    });

    after(done => {
      // try to delete foo13
      client2.remove(testpath + '3', err => {
        console.log('remove foo13 error: %s', err);
        done();
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
      console.log('close all watchChildren() clients');
    });

    it('should watch one path children', function* () {
      const lists = [];
      client1.watchChildren(testpathRoot, (err, dirs, stat) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        assert(stat);
        assert(typeof stat.version === 'number');
        lists.push(dirs);
      });
      client2.watchChildren(testpathRoot, (err, dirs, stat) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        assert(stat);
        assert(typeof stat.version === 'number');
        lists.push(dirs);
      });
      yield sleep(100);
      // exists and watcher again
      client2.watchChildren(testpathRoot, (err, dirs, stat) => {
        assert(!err);
        assert(dirs);
        assert(dirs.length === 2);
        assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        assert(stat);
        assert(typeof stat.version === 'number');
        lists.push(dirs);
      });
      client1.unWatchAll();
      client2.unWatchAll();
      yield sleep(500);
      assert(lists.length === 3);

      let count = 0;
      client2.watchChildren(testpathRoot, (err, dirs, stat) => {
        count++;
        assert(!err);
        assert(dirs);
        if (count === 1) {
          assert(dirs.length === 2);
          assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
        } else {
          assert(dirs.length === 3);
          assert.deepEqual(dirs, [ 'foo13', 'foo1', 'foo12' ]);
        }
        assert(stat);
        assert(typeof stat.version === 'number');
      });
      // add dir
      client2.create(testpath + '3', err => {
        assert(!err);
        client2.setData(testpath + '3', new Buffer(testdata), err => {
          assert(!err);
        });
      });
      yield sleep(500);
      client2.unWatchAll();
    });
  });
});
