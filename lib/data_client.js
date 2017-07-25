'use strict';

const zookeeper = require('node-zookeeper-client');
const Base = require('sdk-base');
const events = require('./events');

class ZookeeperClient extends Base {
  constructor(options) {
    super(Object.assign(options, {
      initMethod: '_init',
    }));
    this._zookeeperClient = zookeeper.createClient(this.options.connectionString, this.options);
    this._zookeeperClientStartConnect = false;
    this._zookeeperClientConnected = false;
    this._bindEvents();
  }

  _bindEvents() {
    for (const name of events) {
      this._zookeeperClient.on(name, (...args) => {
        this.emit(name, ...args);
      });
    }
  }

  * _init() {
    this.connect();
    yield this.await('connected');
    this._zookeeperClientConnected = true;
  }

  // subscribe(info, listener) {
  //   // subscribe data from server
  // }
  //
  // publish(info) {
  //   // publish data to server
  // }
  //
  // * getData(id) {
  //   // asynchronous API
  // }

  // cluster-client apis
  subscribe(info, listener) {
    if (info.event) {
      this.on(info.event, listener);
    } else if (info.onceEvent) {
      this.once(info.onceEvent, listener);
    }

    if (this._zookeeperClientConnected && (info.event === 'connected' || info.onceEvent === 'connected')) {
      listener();
    }
  }

  // zookeeper client apis
  connect() {
    // console.log('connect invoke', this._zookeeperClientStartConnect)
    if (!this._zookeeperClientStartConnect) {
      this._zookeeperClientStartConnect = true;
      this._zookeeperClient.connect();
    }
  }

  close() {
    this._zookeeperClientStartConnect = false;
    this._zookeeperClientConnected = false;
    this._zookeeperClient.close();
  }
}

module.exports = ZookeeperClient;
