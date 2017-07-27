'use strict';

const zookeeper = require('..');

const client = zookeeper.createClient(process.argv[2], { retries: 2 });
const path = process.argv[3];

client.once('connected', () => {
  console.log('Connected to the server.');

  client.create(path, err => {
    if (err) {
      console.log('Failed to create node: %s due to: %s.', path, err);
    } else {
      console.log('Node: %s is successfully created.', path);
    }

    client.close();
  });
});

client.connect();
