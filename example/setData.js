'use strict';

const zookeeper = require('..');

const client = zookeeper.createClient(process.argv[2], { retries: 2 });
const path = process.argv[3];
const data = new Buffer(process.argv[4]);

client.once('connected', () => {
  console.log('Connected to the server.');

  client.setData(path, data, (err, stat) => {
    if (err) {
      console.log('Got error when setting data: %s', err);
      return;
    }

    console.log(
      'Set data "%s" on node %s, version: %d.',
      data.toString(),
      path,
      stat.version
    );
    client.close();
  });
});

client.connect();
