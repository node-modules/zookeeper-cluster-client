'use strict';

const zookeeper = require('..');

const client1 = zookeeper.createClient(process.argv[2], { retries: 2 });
const client2 = zookeeper.createClient(process.argv[2], { retries: 2 });
const path = process.argv[3];

function getData(path) {
  client1.getData(
    path,
    (error, data, stat) => {
      if (error) {
        console.log('Error occurred when getting data: %s.', error);
        return;
      }

      console.log(
        'Node: %s has data: %s, version: %d',
        path,
        data ? data.toString() : undefined,
        stat.version
      );

      setTimeout(() => {
        client1.close();
      }, 1000);
    }
  );

  client2.getData(
    path,
    (error, data, stat) => {
      if (error) {
        console.log('Error occurred when getting data: %s.', error);
        return;
      }

      console.log(
        'Node: %s has data: %s, version: %d',
        path,
        data ? data.toString() : undefined,
        stat.version
      );

      setTimeout(() => {
        client2.close();
      }, 1000);
    }
  );
}

client1.once('connected', () => {
  console.log('client1 Connected to ZooKeeper.');
  client2.ready(() => {
    console.log('client2 Connected to ZooKeeper.');
    getData(path);
  });
});
