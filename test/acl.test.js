'use strict';

const assert = require('assert');
const zookeeper = require('..');
const { ACL, Permission, Id } = require('node-zookeeper-client');

describe('acl.test.js', () => {
  const path = '/acl/digest';
  const data = Buffer.from('hello world');

  let client;
  before(async () => {
    client = zookeeper.createClient('localhost:2181', {
      authInfo: {
        scheme: 'digest',
        auth: 'gxcsoccer:123456',
      },
    });
    await client.ready();
  });

  after(async () => {
    await client.remove(path);
    await client.close();
  });

  it('should acl ok', async () => {
    let r = await client.mkdirp(path, data);
    assert(r === path);

    let acls = await client.getACL(path);
    assert(acls && acls.length === 1);
    assert(acls[0].permission === Permission.ALL);
    assert.deepEqual(acls[0].id, Id.ANYONE_ID_UNSAFE);
    console.log(acls);

    await client.setACL(path, [
      new ACL(
        Permission.READ,
        new Id('auth', 'gxcsoccer:123456')
      ),
      new ACL(
        Permission.ADMIN,
        new Id('auth', 'gxcsoccer:123456')
      ),
    ], -1);

    acls = await client.getACL(path);
    assert(acls && acls.length === 2);
    assert(acls[0].permission === Permission.READ);
    assert(acls[0].id && acls[0].id.scheme === 'digest' && acls[0].id.id === 'gxcsoccer:YCs2d8bt1/0hmQ9dHBkeag6DOpM=');
    assert(acls[1].permission === Permission.ADMIN);
    assert(acls[1].id && acls[1].id.scheme === 'digest' && acls[1].id.id === 'gxcsoccer:YCs2d8bt1/0hmQ9dHBkeag6DOpM=');

    r = await client.getData(path);
    assert(r.toString() === 'hello world');

    try {
      await client.setData(path, Buffer.from('hello zookeeper'));
      assert(false);
    } catch (err) {
      console.log(err);
      assert(err.name === 'NO_AUTH');
      assert(err.code === -102);
    }
  });
});
