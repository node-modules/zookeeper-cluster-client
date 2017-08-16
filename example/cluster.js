'use strict';

const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;
const zookeeper = require('..');

let latestData;
function getData(client, path) {
  client.getData(path, event => {
    console.log(event);
    getData(client, path);
  }, (err, data, meta) => {
    latestData = { data, meta };
    console.log(`${path} => ${data.toString()}, version: ${meta.version}`);
  });
}

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died, code: ${code}, signal: ${signal}`);
  });
} else {
  const client = zookeeper.createClient();
  client.once('connected', () => {
    console.log(`Worker ${process.pid} zookeeper connected, leader: ${client.isClusterClientLeader}`);
    getData(client, '/foo');
  });
  client.ready(() => {
    console.log(`Worker ${process.pid} zookeeper ready`);
  });

  // Workers can share any TCP connection
  // In this case it is an HTTP server
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`hello zookeeper, data: ${latestData.data.toString()}, version: ${latestData.meta.version}`);
  }).listen(8000);
  console.log(`Worker ${process.pid} started`);
}
