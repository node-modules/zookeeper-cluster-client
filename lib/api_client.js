'use strict';

const { APIClientBase } = require('cluster-client');
const DataClient = require('./data_client');
const events = require('./events');

class ZookeeperClient extends APIClientBase {
  constructor(options) {
    super(Object.assign(options, { initMethod: '_init' }));
  }

  get DataClient() {
    return DataClient;
  }
  get delegates() {
    return {
      connect: 'invokeOneway',
    };
  }
  get clusterOptions() {
    return {
      port: 27787,
      name: `ZookeeperClient@${this.options.connectionString}`,
    };
  }

  * _init() {
    // should wait for connected event fired before ready
    yield this.await('connected');
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
    if (events.indexOf(event) === -1) {
      super.on(event, listener);
    } else {
      this._client.subscribe({ event }, listener);
    }
    return this;
  }

  once(event, listener) {
    if (events.indexOf(event) === -1) {
      super.once(event, listener);
    } else {
      this._client.subscribe({ onceEvent: event }, listener);
    }
    return this;
  }

  // zookeeper client apis
  connect() {
    this._client.connect();
  }
}

module.exports = ZookeeperClient;
