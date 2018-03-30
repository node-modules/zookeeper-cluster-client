'use strict';

const assert = require('assert');
const pedding = require('pedding');
const sleep = require('mz-modules/sleep');
const zookeeper = require('..');

describe('test/index.test.js', () => {
  describe('connect() and connected', () => {
    let client1;
    let client2;

    afterEach(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
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

    it('should emit error on connect() after client closed', async function() {
      client1 = zookeeper.createClient();
      await client1.ready();
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
      await sleep(1);
      assert(onceCalled);
      assert(onCalled);

      await client1.close();
      // after close state should be DISCONNECTED
      // console.log(client1.getState())
      // assert(client1.getState().name === 'DISCONNECTED');
      // close again work
      await client1.close();
      let err;
      client1.once('error', e => {
        err = e;
      });
      client1.connect();
      await sleep(10);
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

    before(async function() {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      await client1.ready();
      await client2.ready();
    });
    before(async function() {
      await client2.mkdirp(testpath);
      await client2.setData(testpath, new Buffer(testdata));
    });

    after(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
        client1 = null;
      }
      console.log('close all clients');
    });

    it('should get path data without watcher work', async function() {
      const datas = [];
      let data = await client1.getData(testpath);
      assert(data);
      assert(data.toString() === testdata);
      datas.push(data);

      data = await client2.getData(testpath);
      assert(data);
      assert(data.toString() === testdata);
      datas.push(data);

      await sleep(500);
      assert(datas.length === 2);

      const ret = await client1.getData(testpath, { withStat: true });
      assert(ret && ret.data && ret.data.toString() === testdata);
      assert(ret.stat && typeof ret.stat.version === 'number');
    });

    it('should get path data with watcher work', async function() {
      const datas = [];
      const events = [];
      let data = await client1.getData(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(data);
      assert(data.toString() === testdata);
      datas.push(data);

      data = await client2.getData(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(data);
      assert(data.toString() === testdata);
      datas.push(data);

      // getData and watcher again
      data = await client2.getData(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(data);
      assert(data.toString() === testdata);
      datas.push(data);

      assert(datas.length === 3);

      const ret = await client1.getData(testpath, event => {
        assert(event);
        events.push(event);
      }, { withStat: true });
      assert(ret && ret.data && ret.data.toString() === testdata);
      assert(ret.stat && typeof ret.stat.version === 'number');

      // change data
      await client1.setData(testpath, new Buffer('changed'));
      await sleep(500);
      assert(events.length === 4);

      const datas2 = [];
      data = await client1.getData(testpath);
      assert(data);
      assert(data.toString() === 'changed');
      datas2.push(data);

      data = await client2.getData(testpath);
      assert(data);
      assert(data.toString() === 'changed');
      datas2.push(data);
      assert(datas2.length === 2);
    });

    it('should get not exists path data with watcher work', async function() {
      const datas = [];
      const events = [];
      const errors = [];
      const testpath = '/foo-not-exists-path-test-case';
      try {
        await client1.getData(testpath, event => {
          assert(event);
          events.push(event);
        });
      } catch (err) {
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
      }
      try {
        await client2.getData(testpath, event => {
          assert(event);
          events.push(event);
        });
      } catch (err) {
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
      }
      await sleep(100);
      try {
        // getData and watcher again
        await client2.getData(testpath, event => {
          assert(event);
          events.push(event);
        });
      } catch (err) {
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
      }

      await sleep(500);
      assert(datas.length === 0);
      assert(errors.length === 3);
      // change data
      try {
        await client1.setData(testpath, new Buffer('changed'));
      } catch (err) {
        assert(err instanceof Error);
        assert(err.name === 'NO_NODE');
        errors.push(err);
      }
      await sleep(500);
      assert(events.length === 0);
      assert(errors.length === 4);
    });
  });

  describe('watch()', () => {
    let client1;
    let client2;
    const testpath = '/unittest5';
    const testdata = 'unittest-data:' + Date.now();

    before(async function() {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      await client1.ready();
      await client2.ready();
    });
    before(async function() {
      await client2.mkdirp(testpath);
      await client2.setData(testpath, new Buffer(testdata));
    });

    after(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
        client1 = null;
      }
      console.log('close all clients');
    });

    it('should leader watch success', async function() {
      client1.watch(testpath, (err, data) => {
        assert.ifError(err);
        client1.emit(testpath, data);
      });

      let val = await client1.await(testpath);
      assert.deepEqual(val, new Buffer(testdata));

      client2.setData(testpath, new Buffer('123'));

      val = await client1.await(testpath);
      assert.deepEqual(val, new Buffer('123'));

      client2.setData(testpath, new Buffer(testdata));
      val = await client1.await(testpath);
      assert.deepEqual(val, new Buffer(testdata));

      client1.unWatch(testpath);
    });

    it('should follwer watch success', async function() {
      const listener = (err, data) => {
        assert.ifError(err);
        client2.emit(testpath, data);
      };
      client2.watch(testpath, listener);

      let val = await client2.await(testpath);
      assert.deepEqual(val, new Buffer(testdata));

      client1.setData(testpath, new Buffer('123'));

      val = await client2.await(testpath);
      assert.deepEqual(val, new Buffer('123'));

      client1.setData(testpath, new Buffer(testdata));
      val = await client2.await(testpath);
      assert.deepEqual(val, new Buffer(testdata));

      client2.unWatch(testpath, listener);
    });
  });

  describe('exists()', () => {
    let client1;
    let client2;
    const testpath = '/unittest4-exists';
    const testdata = 'unittest-data-exists:' + Date();

    before(async function() {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      await client1.ready();
      await client2.ready();
    });
    before(async function() {
      const isExists = await client2.exists(testpath);
      if (isExists) {
        await client2.remove(testpath);
      }
      await client2.create(testpath);
      await client2.setData(testpath, new Buffer(testdata));
    });

    after(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
        client1 = null;
      }
      console.log('close all exists() clients');
    });

    it('should check exists path without watcher work', async function() {
      const metas = [];
      let meta = await client1.exists(testpath);
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas.push(meta);

      meta = await client2.exists(testpath);
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas.push(meta);

      await sleep(500);
      assert(metas.length === 2);
    });

    it('should check path exists with watcher work', async function() {
      const metas = [];
      const events = [];
      let meta = await client1.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      });
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas.push(meta);

      meta = await client2.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      });
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas.push(meta);

      await sleep(100);
      // exists and watcher again
      meta = await client2.exists(testpath, event => {
        assert(event);
        assert(event.name === 'NODE_DATA_CHANGED');
        events.push(event);
      });
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas.push(meta);

      await sleep(500);
      assert(metas.length === 3);
      // change data
      await client1.setData(testpath, new Buffer('changed'));
      await sleep(500);
      assert(events.length === 3);

      const metas2 = [];
      meta = await client1.exists(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas2.push(meta);

      meta = await client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(meta);
      assert(meta.ctime);
      assert(meta.mtime);
      metas2.push(meta);

      await sleep(500);
      assert(metas2.length === 2);
    });

    it('should check not exists path data with watcher work', async function() {
      const events = [];
      const testpath = '/foo-not-exists-path-test-case';
      let data = await client1.exists(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(!data);

      data = await client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(!data);

      await sleep(100);

      // exists and watcher again
      data = await client2.exists(testpath, event => {
        assert(event);
        events.push(event);
      });
      assert(!data);

      await sleep(500);
      assert(events.length === 0);
    });
  });

  describe('getChildren()', () => {
    let client1;
    let client2;
    const testpathRoot = '/unittest4-getChildren';
    const testpath = '/unittest4-getChildren/foo1';
    const testdata = 'unittest-data-getChildren:' + Date();

    before(async function() {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      await client1.ready();
      await client2.ready();
    });
    before(async function() {
      await client2.mkdirp(testpathRoot, zookeeper.CreateMode.PERSISTENT);
      await client1.mkdirp(testpath);
      await client1.setData(testpath, new Buffer(testdata));

      await client2.mkdirp(testpath + '2');
      await client2.setData(testpath + '2', new Buffer(testdata));

      try {
        // try to delete foo13
        await client2.remove(testpath + '3');
      } catch (err) {
        console.log('remove foo13 error: %s', err);
      }
    });

    after(async function() {
      try {
        // try to delete foo13
        await client2.remove(testpath + '3');
      } catch (err) {
        console.log('remove foo13 error: %s', err);
      }
    });

    after(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
        client1 = null;
      }
      console.log('close all exists() clients');
    });

    it('should getChildren exists path without watcher work', async function() {
      const lists = [];
      let dirs = await client1.getChildren(testpathRoot);
      assert(dirs);
      assert(dirs.length === 2);
      assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
      lists.push(dirs);

      dirs = await client2.getChildren(testpathRoot);
      assert(dirs);
      assert(dirs.length === 2);
      assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
      lists.push(dirs);

      await sleep(500);
      assert(lists.length === 2);

      const ret = await client1.getChildren(testpathRoot, { withStat: true });
      assert(ret && ret.children && ret.children.length === 2);
      assert.deepEqual(ret.children, [ 'foo1', 'foo12' ]);
      assert(ret.stat && typeof ret.stat.version === 'number');
    });

    it('should check path exists with watcher work', async function() {
      const lists = [];
      const events = [];
      let dirs = await client1.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      });
      assert(dirs);
      assert(dirs.length === 2);
      assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
      lists.push(dirs);

      dirs = await client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      });
      assert(dirs);
      assert(dirs.length === 2);
      assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
      lists.push(dirs);

      await sleep(100);
      // exists and watcher again
      dirs = await client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      });
      assert(dirs);
      assert(dirs.length === 2);
      assert.deepEqual(dirs, [ 'foo1', 'foo12' ]);
      lists.push(dirs);

      const ret = await client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      }, { withStat: true });
      assert(ret && ret.children && ret.children.length === 2);
      assert.deepEqual(ret.children, [ 'foo1', 'foo12' ]);
      assert(ret.stat && typeof ret.stat.version === 'number');

      await sleep(500);
      assert(lists.length === 3);
      // add dir
      await client2.create(testpath + '3');
      await client2.setData(testpath + '3', new Buffer(testdata));

      await sleep(500);
      assert(events.length === 4);

      const lists2 = [];
      dirs = await client1.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      });
      assert(dirs);
      assert(dirs.length === 3);
      assert.deepEqual(dirs, [ 'foo13', 'foo1', 'foo12' ]);
      lists2.push(dirs);

      dirs = await client2.getChildren(testpathRoot, event => {
        assert(event);
        assert(event.name === 'NODE_CHILDREN_CHANGED');
        events.push(event);
      });
      assert(dirs);
      assert(dirs.length === 3);
      assert.deepEqual(dirs, [ 'foo13', 'foo1', 'foo12' ]);
      lists2.push(dirs);

      await sleep(500);
      assert(lists2.length === 2);
    });

    it('should getChildren not exists path data with watcher work', async function() {
      const events = [];
      const testpath = '/foo-not-exists-path-test-case';
      try {
        await client1.getChildren(testpath, event => {
          assert(event);
          events.push(event);
        });
        assert(false);
      } catch (err) {
        assert(err);
        assert(err.name === 'NO_NODE');
      }
      try {
        await client2.getChildren(testpath, event => {
          assert(event);
          events.push(event);
        });
        assert(false);
      } catch (err) {
        assert(err);
        assert(err.name === 'NO_NODE');
      }
      await sleep(100);
      try {
        // exists and watcher again
        await client2.getChildren(testpath, event => {
          assert(event);
          events.push(event);
        });
        assert(false);
      } catch (err) {
        assert(err);
        assert(err.name === 'NO_NODE');
      }

      await sleep(500);
      assert(events.length === 0);
    });
  });

  describe('watchChildren()', () => {
    let client1;
    let client2;
    const testpathRoot = '/unittest4-watchChildren';
    const testpath = '/unittest4-watchChildren/foo1';
    const testdata = 'unittest4-data-watchChildren:' + Date();

    before(async function() {
      client1 = zookeeper.createClient();
      client2 = zookeeper.createClient();
      await client1.ready();
      await client2.ready();
    });
    before(async function() {
      await client2.mkdirp(testpathRoot, zookeeper.CreateMode.PERSISTENT);
      await client1.mkdirp(testpath);
      await client1.setData(testpath, new Buffer(testdata));

      await client2.mkdirp(testpath + '2');
      await client2.setData(testpath + '2', new Buffer(testdata));

      try {
        // try to delete foo13
        await client2.remove(testpath + '3');
      } catch (err) {
        console.log('remove foo13 error: %s', err);
      }
    });

    after(async function() {
      try {
        // try to delete foo13
        await client2.remove(testpath + '3');
      } catch (err) {
        console.log('remove foo13 error: %s', err);
      }
    });

    after(async function() {
      // close follwer first
      if (client2) {
        await client2.close();
        client2 = null;
      }

      if (client1) {
        await client1.close();
        client1 = null;
      }
      console.log('close all watchChildren() clients');
    });

    it('should watch one path children', async function() {
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
      await sleep(100);
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
      await sleep(500);
      assert(lists.length === 3);

      let count = 0;
      client2.watchChildren(testpathRoot, (err, dirs) => {
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
        // assert(stat);
        // assert(typeof stat.version === 'number');
      });
      // add dir
      await client2.create(testpath + '3');
      await client2.setData(testpath + '3', new Buffer(testdata));
      await sleep(500);
      client2.unWatchAll();
    });
  });
});
