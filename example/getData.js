'use strict';

const zookeeper = require('..');

const client1 = zookeeper.createClient(process.argv[2], { retries: 2 });
const client2 = zookeeper.createClient(process.argv[2], { retries: 2 });
const client3 = zookeeper.createClient(process.argv[2], { retries: 2 });
const path = process.argv[3];

function getData(client, path) {
  client.getData(
    path,
    event => {
      console.log('client#%s Got event: %j', client.clientId, event);
      getData(client, path);
    },
    (error, data, stat) => {
      if (error) {
        console.log('client#%s Error occurred when getting data: %s.', client.clientId, error);
        return;
      }

      console.log(
        'client#%s Node: %s has data: %s, version: %d',
        client.clientId,
        path,
        data ? data.toString() : undefined,
        stat.version
      );
    }
  );
}

client1.once('connected', () => {
  console.log('client#%s Connected to ZooKeeper, leader: %s, state: %j.',
    client1.clientId, client1.isClusterClientLeader, client1.getState());
  client2.once('connected', () => {
    console.log('client#%s Connected to ZooKeeper, leader: %s.',
      client2.clientId, client2.isClusterClientLeader);
    getData(client1, path);
    getData(client2, path);
  });
  client3.once('connected', () => {
    console.log('client#%s Connected to ZooKeeper, leader: %s.',
      client3.clientId, client3.isClusterClientLeader);
    getData(client3, path);
  });
});

client1.connect();
