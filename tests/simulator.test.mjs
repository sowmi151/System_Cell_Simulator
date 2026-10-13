import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, parseCall } from '../lib/simulator.mjs';
const call = (name, args = [], pid = 100) => ({ pid, call: name, args });
test('read advances byte offsets and returns EOF', () => {
  const s = simulate([call('open', ['/tmp/notes.txt', 'r']), call('read', [3, 12]), call('read', [3, 64]), call('read', [3, 10])]);
  assert.equal(s.trace[1].data, 'Welcome to S');
  assert.equal(s.trace[2].data, 'yscall Lab.\n');
  assert.equal(s.trace[3].value, 0);
});
test('writes count UTF-8 bytes, truncate and append correctly', () => {
  const s = simulate([call('open', ['/tmp/test.txt', 'w']), call('write', [3, 'é']), call('close', [3]), call('open', ['/tmp/test.txt', 'a']), call('write', [3, '!']), call('close', [3]), call('open', ['/tmp/test.txt', 'r']), call('read', [3, 20])]);
  assert.equal(s.trace[1].value, 2); assert.equal(s.trace.at(-1).data, 'é!');
  const t = simulate([call('open', ['/tmp/notes.txt', 'w'])]);
  assert.equal(t.files['/tmp/notes.txt'].length, 0);
});
test('forked descriptors share offsets and survive another process closing', () => {
  const s = simulate([call('open', ['/tmp/notes.txt', 'r']), call('fork'), call('read', [3, 7], 101), call('close', [3], 101), call('read', [3, 2])]);
  assert.equal(s.trace[1].value, 101); assert.equal(s.trace[2].data, 'Welcome'); assert.equal(s.trace[4].data, ' t');
  assert.equal(Object.keys(s.handles).length, 1);
});
test('wait rejects running children, then reaps an exited child exactly once', () => {
  const s = simulate([call('fork'), call('wait', [101]), call('exec', ['/bin/demo'], 101), call('exit', [7], 101), call('wait', [101]), call('wait', [101])]);
  assert.equal(s.trace[1].errno, 'EAGAIN'); assert.equal(s.processes[101].image, '/bin/demo');
  assert.equal(s.trace[4].exitStatus, 7); assert.equal(s.processes[101].status, 'reaped'); assert.equal(s.trace[5].errno, 'ECHILD');
});
test('errors do not modify files and closed descriptors are reusable', () => {
  const s = simulate([call('open', ['/missing', 'r']), call('open', ['/tmp/notes.txt', 'r']), call('write', [3, 'no']), call('read', [9, 1]), call('close', [3]), call('open', ['/tmp/notes.txt', 'r'])]);
  assert.equal(s.trace[0].errno, 'ENOENT'); assert.equal(s.trace[2].errno, 'EBADF'); assert.equal(s.trace[3].errno, 'EBADF'); assert.equal(s.trace.at(-1).value, 3);
  assert.equal(new TextDecoder().decode(new Uint8Array(s.files['/tmp/notes.txt'])), 'Welcome to Syscall Lab.\n');
});
test('exec and exit have no ordinary return and a dead process cannot call', () => {
  const s = simulate([call('exec', ['/bin/demo']), call('exit', [0]), call('getpid')]);
  assert.equal(s.trace[0].value, null); assert.equal(s.trace[1].value, null); assert.equal(s.trace[2].errno, 'ESRCH');
});
test('stdout captures data and resource limits reject oversized requests', () => {
  const s = simulate([call('write', [1, 'hello']), call('open', ['/tmp/a', 'w']), call('write', [3, 'x'.repeat(4097)])]);
  assert.equal(s.output, 'hello'); assert.equal(s.trace[2].errno, 'EINVAL'); assert.equal(s.files['/tmp/a'].length, 0);
  assert.throws(() => simulate(Array(201).fill(call('getpid')))); assert.throws(() => simulate([{ pid: 100, call: 'write', args: [1, {}] }]));
});
test('parser accepts JSON arguments without executing source', () => {
  assert.deepEqual(parseCall('write(1, "hello");', 100), call('write', [1, 'hello']));
  assert.throws(() => parseCall('write(1, process.exit())', 100));
  assert.throws(() => parseCall('constructor()', 100));
});
