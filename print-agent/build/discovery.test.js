'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { hostsToScan, parseArpTable } = require('../agent.js');

test('scans every other address on an ordinary home/shop network', () => {
  const hosts = hostsToScan({ Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.20', netmask: '255.255.255.0' }] });
  assert.strictEqual(hosts.length, 253);
  assert.ok(hosts.includes('192.168.1.1') && hosts.includes('192.168.1.254'));
  assert.ok(!hosts.includes('192.168.1.20'), 'skips this computer');
  assert.ok(!hosts.includes('192.168.1.0') && !hosts.includes('192.168.1.255'), 'skips network and broadcast');
});

test('narrows a large network to the 254 addresses around this computer', () => {
  const hosts = hostsToScan({ eth0: [{ family: 'IPv4', internal: false, address: '10.4.7.20', netmask: '255.255.0.0' }] });
  assert.strictEqual(hosts.length, 253);
  assert.ok(hosts.every((h) => h.startsWith('10.4.7.')));
});

test('respects a network smaller than 254 addresses', () => {
  const hosts = hostsToScan({ eth0: [{ family: 'IPv4', internal: false, address: '192.168.5.130', netmask: '255.255.255.252' }] });
  assert.deepStrictEqual(hosts, ['192.168.5.129']);
});

test('ignores loopback, self-assigned and IPv6 connections, and covers two networks', () => {
  const hosts = hostsToScan({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }],
    dead: [{ family: 'IPv4', internal: false, address: '169.254.10.2', netmask: '255.255.0.0' }],
    v6: [{ family: 'IPv6', internal: false, address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::' }],
    wifi: [{ family: 'IPv4', internal: false, address: '192.168.0.5', netmask: '255.255.255.0' }],
    lan: [{ family: 4, internal: false, address: '192.168.8.5', netmask: '255.255.255.0' }],
  });
  assert.strictEqual(hosts.length, 506);
  assert.ok(hosts.every((h) => h.startsWith('192.168.0.') || h.startsWith('192.168.8.')));
});

test('reads hardware addresses from Windows arp output', () => {
  const table = parseArpTable(
    ['Interface: 192.168.1.20 --- 0x7', '  Internet Address      Physical Address      Type', '  192.168.1.50          00-1b-a9-0c-2f-e1     dynamic', '  192.168.1.255         ff-ff-ff-ff-ff-ff     static'].join('\r\n'),
  );
  assert.deepStrictEqual(table, { '192.168.1.50': '00:1b:a9:0c:2f:e1' });
});

test('reads hardware addresses from macOS/Linux arp output, padding short parts', () => {
  const table = parseArpTable('? (192.168.1.50) at 0:1b:a9:c:2f:e1 on en0 ifscope [ethernet]\n? (192.168.1.77) at (incomplete) on en0 ifscope [ethernet]\n');
  assert.deepStrictEqual(table, { '192.168.1.50': '00:1b:a9:0c:2f:e1' });
});
