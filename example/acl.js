'use strict';

const { ACL, Permission, Id } = require('node-zookeeper-client');
const zookeeper = require('..');
const client = zookeeper.createClient('localhost:2181', {
  authInfo: {
    scheme: 'digest',
    auth: 'gxcsoccer:123456',
  },
});

const acls = [
  new ACL(
    Permission.ADMIN,
    new Id('auth', 'gxcsoccer:123456:cdrwa')
    // new Id('ip', '127.0.0.1'),
  ),
];

const path = '/acl_path';
const data = Buffer.from('hello world');

async function main() {

  let r = await client.mkdirp(path, data);
  console.log(r);

  const acl = await client.getACL(path);
  console.log(acl);
  r = await client.setACL(path, acls, -1);

  console.log(r);

  r = await client.getACL(path);
  console.log(r);
}

main().catch(err => {
  console.log(err);
});
