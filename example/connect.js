'use strict';

const zookeeper = require('..');

const client1 = zookeeper.createClient();
client1.connect();
client1.on('connected', () => {
  console.log('client1 connected');
});
client1.ready(() => {
  console.log('client1 ready');
});

const client2 = zookeeper.createClient();
client2.connect();
client2.once('connected', () => {
  console.log('client2 connected once');
});
client2.on('connected', () => {
  console.log('client2 connected');
});
client2.ready(() => {
  console.log('client2 ready');
});

setTimeout(() => {
  const client3 = zookeeper.createClient();
  client3.connect();
  client3.on('connected', () => {
    console.log('client3 connected');
  });
  client3.ready(() => {
    console.log('client3 ready');
  });
}, 100);
