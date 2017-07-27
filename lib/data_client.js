'use strict';

const debug = require('debug')('zookeeper-cluster-client:data_client');
const zookeeper = require('node-zookeeper-client');
const Base = require('sdk-base');
const events = require('./events');

let _clientId = 0;

class DataClient extends Base {
  constructor(options) {
    super(Object.assign(options, {
      initMethod: '_init',
    }));
    this.clientId = _clientId++;
    this._zookeeperClient = zookeeper.createClient(this.options.connectionString, this.options);
    this._zookeeperClientStartConnect = false;
    this._zookeeperClientConnected = false;
    this._zookeeperClientClosed = false;
    this._zookeeperClientReconnectWaitting = false;
    this._watchers = new Map();
    this._bindEvents();
  }

  _bindEvents() {
    for (const name of events) {
      this._zookeeperClient.on(name, (...args) => {
        debug('zookeeper client#%s emit %s %j', this.clientId, name, args);
        this.emit(name, ...args);
        this.emit('zookeeper-client:event', {
          name,
          args,
        });
      });
    }
  }

  * _init() {
    this.connect();
    yield this.await('connected');
    this._zookeeperClientConnected = true;
  }

  // cluster-client apis
  subscribe(info, listener) {
    // events
    if (info.event) {
      this.on(info.event, listener);
    }
    if (this._zookeeperClientConnected && info.event === 'connected') {
      listener();
    }
  }

  invokeWithoutWatcher(method, args, callback) {
    args.push((err, ...callbackArgs) => {
      callback(err, callbackArgs);
    });
    this._zookeeperClient[method](...args);
  }

  invokeWithWatcher(clientId, key, method, args, callback) {
    debug('try to invokeWithWatcher %s %j from client#%s', method, args, clientId);
    if (this._watchers.has(key)) {
      const info = this._watchers.get(key);
      if (info !== false) {
        debug('send to client#%s: callbackArgs:%j, raw invoke from client#%s',
          clientId, info.callbackArgs, info.clientId);
        callback(null, info.callbackArgs);
      } else {
        // wait for callback return
        this.once(`${key}:callback`, info => {
          debug('send to client#%s: err:%s, callbackArgs:%j, raw invoke from client#%s',
            clientId, info.error, info.callbackArgs, info.clientId);
          callback(info.error, info.callbackArgs);
        });
      }
      return;
    }

    // set watcher lock
    this._watchers.set(key, false);
    debug('zookeeperClient#%s.%s(%j) from client#%s', this.clientId, method, args, clientId);
    this._zookeeperClient[method](...args, (...watcherArgs) => {
      debug('emit %s: %j', key, watcherArgs);
      // delete watcher lock on watcher fire
      this._watchers.delete(key);
      this.emit('zookeeper-client:watcher', {
        key,
        args: watcherArgs,
      });
    }, (error, ...callbackArgs) => {
      if (error) {
        // delete watcher lock on path error
        this._watchers.delete(key);
      } else {
        this._watchers.set(key, { callbackArgs, clientId });
      }
      debug('send to client#%s: err:%s, callbackArgs:%j',
        clientId, error, callbackArgs);
      callback(error, callbackArgs);
      this.emit(`${key}:callback`, { error, callbackArgs, clientId });
    });
  }

  // zookeeper client apis
  connect() {
    if (!this._zookeeperClientStartConnect) {
      this._zookeeperClientStartConnect = true;
      this._zookeeperClient.connect();
      debug('zookeeper client#%s connect()', this.clientId);
    }
  }

  close() {
    debug('zookeeper client#%s closing, _zookeeperClientStartConnect: %s',
      this.clientId, this._zookeeperClientStartConnect);
    if (!this._zookeeperClientStartConnect) {
      return Promise.resolve();
    }

    this._zookeeperClientClosed = true;
    this._zookeeperClientStartConnect = false;
    return new Promise(resolve => {
      this._zookeeperClient.close();
      this.once('disconnected', () => {
        debug('zookeeper client#%s closed', this.clientId);
        resolve();
      });
    });
  }
}

module.exports = DataClient;
