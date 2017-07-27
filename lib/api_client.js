'use strict';

const debug = require('debug')('zookeeper-cluster-client:api_client');
const { APIClientBase } = require('cluster-client');
const DataClient = require('./data_client');

let _clientId = 0;

class ZookeeperAPIClient extends APIClientBase {
  constructor(options) {
    super(Object.assign(options, { initMethod: '_init' }));
    this.clientId = _clientId++;
    this._client.subscribe({ event: 'zookeeper-client:watcher' }, this._onWatcher.bind(this));
    this._client.subscribe({ event: 'zookeeper-client:event' }, this._onEvent.bind(this));
    this._connected = false;
  }

  get DataClient() {
    return DataClient;
  }
  get delegates() {
    return {
      connect: 'invokeOneway',
      invokeWithoutWatcher: 'invoke',
      invokeWithWatcher: 'invoke',
    };
  }
  get clusterOptions() {
    return {
      port: 27787,
      name: `ZookeeperAPIClient@${this.options.connectionString}`,
    };
  }

  _onWatcher(info) {
    debug('client#%s emit watcher event with %j', this.clientId, info);
    this.emit(info.key, ...info.args);
  }

  _onEvent(info) {
    debug('client#%s emit watcher event with %j', this.clientId, info);
    this.emit(info.name, ...info.args);
  }

  * _init() {
    // should wait for connected event fired before ready
    yield this.await('connected');
    this._connected = true;
  }
  // subscribe(...args) {
  //   return this._client.subscribe(...args);
  // }
  // publish(...args) {
  //   return this._client.publish(...args);
  // }
  // * getData(id) {
  //   // write your business logic & use data client API
  //   if (this._cache.has(id)) {
  //     return this._cache.get(id);
  //   }
  //   const data = yield this._client.getData(id);
  //   this._cache.set(id, data);
  //   return data;
  // }

  on(event, listener) {
    super.on(event, listener);
    if (this._connected && event === 'connected') {
      listener();
    }
    return this;
  }

  once(event, listener) {
    if (this._connected && event === 'connected') {
      listener();
    } else {
      super.once(event, listener);
    }
    return this;
  }

  // zookeeper client apis
  connect() {
    this._client.connect();
  }

  // getData(path, [watcher], callback)
  getData(path, watcher, callback) {
    if (!callback) {
      callback = watcher;
      watcher = undefined;
    }
    if (watcher) {
      this._invokeWithWatcher('getData', [ path ], watcher, callback);
      return;
    }

    this._invokeWithoutWatcher('getData', [ path ], callback);
  }

  // setData(path, data, [version], callback)
  setData(path, data, version, callback) {
    if (typeof version === 'function') {
      callback = version;
      version = null;
    }
    const args = [ path, data ];
    if (version != null) {
      args.push(version);
    }
    this._invokeWithoutWatcher('setData', args, callback);
  }

  // create(path, [data], [acls], [mode], callback)
  create(path, data, acls, mode, callback) {
    if (typeof data === 'function') {
      // create(path, callback)
      callback = data;
      data = null;
      acls = null;
      mode = null;
    } else if (typeof acls === 'function') {
      // create(path, data, callback)
      callback = acls;
      acls = null;
      mode = null;
    } else if (typeof mode === 'function') {
      // create(path, data, acls, callback)
      callback = acls;
      mode = null;
    }
    const args = [ path ];
    if (data != null) {
      args.push(data);
    }
    if (acls != null) {
      args.push(acls);
    }
    if (mode != null) {
      args.push(mode);
    }
    this._invokeWithoutWatcher('create', args, callback);
  }

  _invokeWithWatcher(method, args, watcher, callback) {
    const path = args[0];
    const key = `watcher:${method}:${path}`;
    debug('client#%s invokeWithWatcher %s %j', this.clientId, method, args);
    this._client.invokeWithWatcher(this.clientId, key, method, args, (err, callbackArgs) => {
      if (err) {
        // remove watcher key
        this.removeListener(key, watcher);
        return callback(err);
      }
      callback(null, ...callbackArgs);
    });
    this.once(key, watcher);
  }

  // without watcher, only invoke once
  _invokeWithoutWatcher(method, args, callback) {
    debug('client#%s invokeWithoutWatcher %s %j', this.clientId, method, args);
    this._client.invokeWithoutWatcher(method, args, (err, callbackArgs) => {
      if (err) return callback(err);
      callback(null, ...callbackArgs);
    });
  }
}

module.exports = ZookeeperAPIClient;
