'use strict';

const assert = require('assert');
// const sleep = require('mz-modules/sleep');
const DataClient = require('../lib/data_client');

describe('test/data_client.test.js', () => {
  const path = '/unittest-dataClient/foo';
  const testdata = new Buffer('unittest-dataClient-getData:' + Date());

  let client;
  before(async function() {
    client = new DataClient({
      connectionString: 'localhost:2181',
    });
    await client.ready();

    await new Promise((resolve, reject) => {
      client.invokeWithoutWatcher('mkdirp', [ path ], err => {
        err ? reject(err) : resolve();
      });
    });
    await new Promise((resolve, reject) => {
      client.invokeWithoutWatcher('setData', [ path, testdata ], err => {
        err ? reject(err) : resolve();
      });
    });
  });

  after(async function() {
    await client.close();
  });

  it('should reconnect while session expired', async function() {
    const method = 'getData';
    const key = `watch:${method}:${path}`;

    const data = await new Promise((resolve, reject) => {
      client.invokeWithWatcher(1000, key, method, [ path ], (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    assert(data && !data.error);
    assert(data.clientId === 1000);
    assert(Array.isArray(data.callbackArgs));
    assert.deepEqual(data.callbackArgs[0], testdata);


    client.subscribe({ event: 'zookeeper-client:watcher' }, ({ key, args }) => {
      assert(key === `watch:${method}:${path}`);
      client.emit('mock_expired', args[0]);
    });

    const originClient = client._zookeeperClient;
    client._zookeeperClient.emit('expired');

    const err = await client.await('mock_expired');
    assert(err && err.message === `need to rewatch ${key} after zookeeper client reconnected`);

    assert(originClient !== client._zookeeperClient);
    assert(client._zookeeperClientConnected = true);
  });
});
