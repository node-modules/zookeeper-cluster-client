'use strict';

const zookeeper = require('..');

const client1 = zookeeper.createClient(process.argv[2], { retries: 2 });
const path = process.argv[3];

function remove(client, path) {
  client.remove(
    path,
    (error, data) => {
      if (error) {
        console.log('client#%s Error occurred: %s.', client.clientId, error);
        return;
      }

      console.log(
        'client#%s Node: %s remove result: %j',
        client.clientId,
        path,
        data
      );
    }
  );
}

client1.once('connected', () => {
  console.log('client#%s Connected to ZooKeeper, leader: %s, state: %j.',
    client1.clientId, client1.isClusterClientLeader, client1.getState());
  remove(client1, path);
});

client1.connect();
