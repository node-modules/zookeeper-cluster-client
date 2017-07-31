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
    this._zookeeperClientMeta = {};
    this._watchPaths = new Map();
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
      name: `ZookeeperAPIClient@${this.options.connectionString}`,
    };
  }

  _onWatcher(info) {
    debug('client#%s emit watcher with %j', this.clientId, info);
    this.emit(info.key, ...info.args);
  }

  _onEvent(info) {
    debug('client#%s emit event with %j', this.clientId, info);
    if (info.state) {
      this._zookeeperClientMeta.state = info.state;
    }
    if (info.name === 'connected') {
      this._zookeeperClientMeta.sessionId = info.sessionId;
      this._zookeeperClientMeta.sessionPassword = info.sessionPassword;
      this._zookeeperClientMeta.sessionTimeout = info.sessionTimeout;
    }
    this.emit(info.name, ...info.args);
  }

  * _init() {
    // should wait for connected event fired before ready
    yield this.await('connected');
    this._connected = true;
  }

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

  // exists(path, [watcher], callback)
  exists(path, watcher, callback) {
    if (!callback) {
      callback = watcher;
      watcher = undefined;
    }
    if (watcher) {
      this._invokeWithWatcher('exists', [ path ], watcher, callback);
      return;
    }

    this._invokeWithoutWatcher('exists', [ path ], callback);
  }

  // getChildren(path, [watcher], callback)
  getChildren(path, watcher, callback) {
    if (!callback) {
      callback = watcher;
      watcher = undefined;
    }
    if (watcher) {
      this._invokeWithWatcher('getChildren', [ path ], watcher, callback);
      return;
    }

    this._invokeWithoutWatcher('getChildren', [ path ], callback);
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

  // mkdirp(path, [data], [acls], [mode], callback)
  mkdirp(path, data, acls, mode, callback) {
    if (typeof data === 'function') {
      // mkdirp(path, callback)
      callback = data;
      data = null;
      acls = null;
      mode = null;
    } else if (typeof acls === 'function') {
      // mkdirp(path, data, callback)
      callback = acls;
      acls = null;
      mode = null;
    } else if (typeof mode === 'function') {
      // mkdirp(path, data, acls, callback)
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
    this._invokeWithoutWatcher('mkdirp', args, callback);
  }

  // remove(path, [version], callback)
  remove(path, version, callback) {
    if (typeof version === 'function') {
      callback = version;
      version = null;
    }
    const args = [ path ];
    if (version != null) {
      args.push(version);
    }
    this._invokeWithoutWatcher('remove', args, callback);
  }

  getACL(path, callback) {
    this._invokeWithoutWatcher('getACL', [ path ], callback);
  }

  // setACL(path, acls, [version], callback)
  setACL(path, acls, version, callback) {
    if (typeof version === 'function') {
      callback = version;
      version = null;
    }
    const args = [ path, acls ];
    if (version != null) {
      args.push(version);
    }
    this._invokeWithoutWatcher('getChildren', args, callback);
  }

  getState() {
    return this._zookeeperClientMeta.state;
  }
  getSessionId() {
    return this._zookeeperClientMeta.sessionId;
  }
  getSessionPassword() {
    return this._zookeeperClientMeta.sessionPassword;
  }
  getSessionTimeout() {
    return this._zookeeperClientMeta.sessionTimeout;
  }

  // extends apis
  // watch(path, [options], listener)
  watch(path, options, listener) {
    return this._startWatch('getData', path, options, listener);
  }

  unWatch(path, listener) {
    return this._unWatch('getData', path, listener);
  }

  // watchChildren(path, [options], listener)
  watchChildren(path, options, listener) {
    return this._startWatch('getChildren', path, options, listener);
  }

  unWatchChildren(path, listener) {
    return this._unWatch('getChildren', path, listener);
  }

  unWatchAll() {
    // remove all watchers
    for (const key of this._watchPaths.keys()) {
      this.removeAllListeners(key);
    }
    this._watchPaths.clear();
  }

  close(err) {
    this.unWatchAll();
    return super.close(err);
  }

  _startWatch(method, path, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = null;
    }
    options = options || {};
    options.retryDelay = options.retryDelay || 5000;
    const key = `watch:${method}:${path}`;
    this.on(key, listener);

    if (this._watchPaths.has(key)) {
      const info = this._watchPaths.get(key);
      if (info !== false) {
        listener(info.error, ...info.callbackArgs);
      }
    } else {
      this._watchPaths.set(key, false);
      this._execute(key, method, path, options);
    }
    return this;
  }

  _unWatch(method, path, listener) {
    const key = `watch:${method}:${path}`;
    this.removeListener(key, listener);
    return this;
  }

  _execute(key, method, path, options) {
    this[method](path, () => {
      this._execute(key, method, path, options);
    }, (err, ...callbackArgs) => {
      if (err) {
        // retry watch later
        setTimeout(() => {
          this._execute(key, method, path, options);
        }, options.retryDelay);
      }
      this._watchPaths.set(key, { error: err, callbackArgs });
      this.emit(key, err, ...callbackArgs);
    });
  }

  _invokeWithWatcher(method, args, watcher, callback) {
    const path = args[0];
    const key = `watcher:${method}:${path}`;
    debug('client#%s invokeWithWatcher %s %j', this.clientId, method, args);
    this.once(key, watcher);
    this._client.invokeWithWatcher(this.clientId, key, method, args, (err, response) => {
      if (!err && response.error) err = response.error;

      debug('client#%s invokeWithWatcher %s callback, error: %s, callbackArgs: %j, raw invoke from clientId#%s',
        this.clientId, key, err, response && response.callbackArgs, response && response.clientId);
      if (err) {
        // remove watcher key
        this.removeListener(key, watcher);
        return callback(err);
      }
      callback(null, ...response.callbackArgs);
    });
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
