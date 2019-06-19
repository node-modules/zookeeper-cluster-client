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
      singleMode: true,
      port: parseInt(process.env.NODE_CLUSTER_CLIENT_PORT || 21789),
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
      this._connected = true;
      this._zookeeperClientMeta.sessionId = info.sessionId;
      this._zookeeperClientMeta.sessionPassword = info.sessionPassword;
      this._zookeeperClientMeta.sessionTimeout = info.sessionTimeout;
    }
    this.emit(info.name, ...info.args);
  }

  async _init() {
    // should wait for connected event fired before ready
    await this.await('connected');
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

  // async getData(path, [watcher], [options = { withStat = false }])
  async getData(path, watcher, options = {}) {
    let ret;
    if (typeof watcher === 'object') {
      options = watcher;
      watcher = null;
    }
    if (watcher) {
      ret = await this._invokeWithWatcher('getData', [ path ], watcher);
    }
    ret = await this._invokeWithoutWatcher('getData', [ path ]);
    return options.withStat ? { data: ret[0], stat: ret[1] } : ret[0];
  }

  // async exists(path, [watcher])
  async exists(path, watcher) {
    let ret;
    if (watcher) {
      ret = await this._invokeWithWatcher('exists', [ path ], watcher);
    }
    ret = await this._invokeWithoutWatcher('exists', [ path ]);
    return ret[0];
  }

  // async getChildren(path, [watcher], [options = { withStat = false }])
  async getChildren(path, watcher, options = {}) {
    let ret;
    if (typeof watcher === 'object') {
      options = watcher;
      watcher = null;
    }
    if (watcher) {
      ret = await this._invokeWithWatcher('getChildren', [ path ], watcher);
    }
    ret = await this._invokeWithoutWatcher('getChildren', [ path ]);
    return options.withStat ? { children: ret[0], stat: ret[1] } : ret[0];
  }

  // async setData(path, data, [version])
  async setData(path, data, version) {
    const args = [ path, data ];
    if (version != null) {
      args.push(version);
    }
    const ret = await this._invokeWithoutWatcher('setData', args);
    return ret[0];
  }

  // async create(path, [data], [acls], [mode])
  async create(path, data, acls, mode) {
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
    const ret = await this._invokeWithoutWatcher('create', args);
    return ret[0];
  }

  // async mkdirp(path, [data], [acls], [mode])
  async mkdirp(path, data, acls, mode) {
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
    const ret = await this._invokeWithoutWatcher('mkdirp', args);
    return ret[0];
  }

  // async remove(path, [version])
  async remove(path, version) {
    const args = [ path ];
    if (version != null) {
      args.push(version);
    }
    await this._invokeWithoutWatcher('remove', args);
  }

  // async getACL(path, [options = { withStat = false }])
  async getACL(path, options = {}) {
    const ret = await this._invokeWithoutWatcher('getACL', [ path ]);
    return options.withStat ? { acls: ret[0], stat: ret[1] } : ret[0];
  }

  // async setACL(path, acls, [version])
  async setACL(path, acls, version) {
    const args = [ path, acls ];
    if (version != null) {
      args.push(version);
    }
    const ret = await this._invokeWithoutWatcher('setACL', args);
    return ret[0];
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
        listener(info.error, ...info.data);
      }
    } else {
      this._watchPaths.set(key, false);
      this._execute(key, method, path, options).catch(err => { this.emit('error', err); });
    }
    return this;
  }

  _unWatch(method, path, listener) {
    const key = `watch:${method}:${path}`;
    if (!listener) {
      this.removeAllListeners(key);
    } else {
      this.removeListener(key, listener);
    }
    return this;
  }

  async _execute(key, method, path, options) {
    let err;
    let data = [];
    try {
      data = await this._invokeWithWatcher(method, [ path ], () => {
        this._execute(key, method, path, options).catch(err => { this.emit('error', err); });
      });
    } catch (e) {
      err = e;
      // retry watch later
      setTimeout(() => {
        this._execute(key, method, path, options).catch(err => { this.emit('error', err); });
      }, options.retryDelay);
      debug('client#%s _execute %s %s %s error: %s, retry after %s',
        this.clientId, key, method, path, err, options.retryDelay);
    }
    this._watchPaths.set(key, { error: err, data });
    this.emit(key, err, ...data);
  }

  _invokeWithWatcher(method, args, watcher) {
    const path = args[0];
    const key = `watcher:${method}:${path}`;
    debug('client#%s invokeWithWatcher %s %j', this.clientId, method, args);
    this.once(key, watcher);
    return new Promise((resolve, reject) => {
      this._client.invokeWithWatcher(this.clientId, key, method, args, (err, response) => {
        if (!err && response.error) err = response.error;

        debug('client#%s invokeWithWatcher %s callback, error: %s, callbackArgs: %j, raw invoke from clientId#%s',
          this.clientId, key, err, response && response.callbackArgs, response && response.clientId);
        if (err) {
          // remove watcher key
          this.removeListener(key, watcher);
          return reject(err);
        }
        resolve(response.callbackArgs);
      });
    });
  }

  // without watcher, only invoke once
  _invokeWithoutWatcher(method, args) {
    debug('client#%s invokeWithoutWatcher %s %j', this.clientId, method, args);
    return new Promise((resolve, reject) => {
      this._client.invokeWithoutWatcher(method, args, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }
}

module.exports = ZookeeperAPIClient;
