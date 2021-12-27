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
    this.clientId = process.pid + ':' + _clientId++;
    const { scheme, auth } = this.options.authInfo || {};
    this._zookeeperClient = zookeeper.createClient(this.options.connectionString, this.options);
    if (scheme && auth) {
      this._zookeeperClient.addAuthInfo(scheme, Buffer.from(auth));
    }
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
        const data = { name, args };
        data.state = this._zookeeperClient.getState();
        if (name === 'connected') {
          data.sessionId = this._zookeeperClient.getSessionId();
          data.sessionPassword = this._zookeeperClient.getSessionPassword();
          data.sessionTimeout = this._zookeeperClient.getSessionTimeout();
        }
        debug('zookeeper client#%s emit %s %j', this.clientId, name, data);
        // emit to dataClient itself
        this.emit(`zookeeper-client:event:${name}`, ...args);
        // emit to apiClient
        this.emit('zookeeper-client:event', data);
      });
    }
    this._zookeeperClient.on('state', state => {
      debug('zookeeper client#%s state: %s', this.clientId, state);
    });
    this._zookeeperClient.on('expired', () => {
      debug('zookeeper client#%s expired, _zookeeperClientClosed: %s',
        this.clientId, this._zookeeperClientClosed);
      if (this._zookeeperClientClosed) return;
      setImmediate(() => this._reconnect());
    });
  }

  async _init() {
    this.connect();
    await this.await('zookeeper-client:event:connected');
    this._zookeeperClientConnected = true;
  }

  _reconnect() {
    // clean up exists client before reconnect
    const client = this._zookeeperClient;
    client.removeAllListeners('state');
    for (const name of events) {
      client.removeAllListeners(name);
    }
    this.removeAllListeners('zookeeper-client:event:connected');

    // create new client to reconnect
    this._zookeeperClient = zookeeper.createClient(this.options.connectionString, this.options);
    this._zookeeperClient.connect();
    this._bindEvents();
    debug('zookeeper client#%s reconnecting', this.clientId);
    this.once('zookeeper-client:event:connected', () => {
      debug('zookeeper client#%s reconnected', this.clientId);
      const keys = [...this._watchers.keys()];
      for (const key of keys) {
        this._watchers.delete(key);
        const err = new Error(`need to rewatch ${key} after zookeeper client reconnected`);
        debug('zookeeper client#%s emit watcher error: %s',
          this.clientId, err.message);
        this.emit('zookeeper-client:watcher', {
          key,
          args: [ err ],
        });
      }
    });
  }

  // cluster-client apis
  subscribe(info, listener) {
    // events
    if (info.event) {
      this.on(info.event, listener);
    }
    // should fire connected event to apiClient immediately after dataClient connected
    if (this._zookeeperClientConnected && info.event === 'zookeeper-client:event') {
      const data = { name: 'connected', args: [] };
      data.state = this._zookeeperClient.getState();
      data.sessionId = this._zookeeperClient.getSessionId();
      data.sessionPassword = this._zookeeperClient.getSessionPassword();
      data.sessionTimeout = this._zookeeperClient.getSessionTimeout();
      listener(data);
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
        callback(null, info);
      } else {
        // wait for callback return
        this.once(`${key}:callback`, info => {
          debug('send to client#%s: err:%s, callbackArgs:%j, raw invoke from client#%s',
            clientId, info.error, info.callbackArgs, info.clientId);
          callback(null, info);
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
      callback(null, { error, callbackArgs, clientId });
      this.emit(`${key}:callback`, { error, callbackArgs, clientId });
    });
  }

  // zookeeper client apis
  connect() {
    if (this._zookeeperClientClosed) {
      process.nextTick(() => {
        this.emit('error', new Error('Can\'t connect to zookeeper after client closed'));
      });
      return;
    }
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
      this.once('zookeeper-client:event:disconnected', () => {
        debug('zookeeper client#%s closed', this.clientId);
        resolve();
      });
    });
  }
}

module.exports = DataClient;
