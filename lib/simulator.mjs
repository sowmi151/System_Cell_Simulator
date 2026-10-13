const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export const catalog = {
  open: { signature: 'open(path, mode)', description: 'Open a virtual file and return a file descriptor. Modes: r, w (create/truncate), a (append), rw (existing file).', example: 'open("/tmp/notes.txt", "rw")' },
  read: { signature: 'read(fd, count)', description: 'Read up to count UTF-8 bytes and advance the shared file offset. Empty data means end of file.', example: 'read(3, 12)' },
  write: { signature: 'write(fd, data)', description: 'Write UTF-8 bytes at the current offset. Returns the number of bytes written.', example: 'write(3, "Hello kernel!")' },
  close: { signature: 'close(fd)', description: 'Release a descriptor in the selected process. A shared open file survives while another descriptor references it.', example: 'close(3)' },
  fork: { signature: 'fork()', description: 'Create a child process. Descriptors are copied and their underlying file offsets remain shared. The displayed result is the parent return value; the child receives 0.', example: 'fork()' },
  exec: { signature: 'exec(program)', description: 'Replace the selected process image while keeping its PID and descriptors. This teaching model records the image without executing a program.', example: 'exec("/bin/demo")' },
  wait: { signature: 'wait(childPid)', description: 'Reap an exited direct child and collect its exit status. A running child returns EAGAIN in this nonblocking teaching model.', example: 'wait(101)' },
  exit: { signature: 'exit(status)', description: 'End the selected process, close its descriptors and retain its exit status until the parent waits.', example: 'exit(0)' },
  getpid: { signature: 'getpid()', description: 'Return the selected process ID.', example: 'getpid()' },
};
export function initialState() {
  return { files: { '/tmp/notes.txt': Array.from(encoder.encode('Welcome to Syscall Lab.\n')), '/home/student/readme.txt': Array.from(encoder.encode('Every system call crosses the user / kernel boundary.\n')) }, handles: {}, nextHandle: 1, nextPid: 101, processes: { 100: { pid: 100, ppid: 0, image: '/bin/student', status: 'running', exitCode: null, fds: { 0: 'stdin', 1: 'stdout', 2: 'stderr' } } }, output: '', trace: [] };
}
const integer = (n, min, max) => { if (!Number.isInteger(n) || n < min || n > max) fail('EINVAL', `Expected an integer from ${min} to ${max}.`); return n; };
function pathValue(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 200 || path.includes('\0') || path.split('/').some(x => x === '..' || x === '.')) fail('EINVAL', 'Use an absolute virtual path without . or .. segments.');
  return path;
}
function collectHandles(state) {
  const used = new Set(Object.values(state.processes).flatMap(p => Object.values(p.fds)));
  for (const id of Object.keys(state.handles)) if (!used.has(Number(id))) delete state.handles[id];
}
function execute(state, process, call, args) {
  const expected = { open: 2, read: 2, write: 2, close: 1, fork: 0, exec: 1, wait: 1, exit: 1, getpid: 0 };
  if (!Object.hasOwn(expected, call)) fail('ENOSYS', 'Unknown system call.');
  if (args.length !== expected[call]) fail('EINVAL', `${call} expects ${expected[call]} argument(s).`);
  if (!process || process.status !== 'running') fail('ESRCH', 'Select a running process.');
  const descriptor = fd => {
    integer(fd, 0, 255);
    if (!Object.hasOwn(process.fds, fd)) fail('EBADF', `Descriptor ${fd} is not open in PID ${process.pid}.`);
    return process.fds[fd];
  };
  switch (call) {
    case 'open': {
      const path = pathValue(args[0]), mode = args[1];
      if (!['r', 'w', 'a', 'rw'].includes(mode)) fail('EINVAL', 'Mode must be r, w, a or rw.');
      if (['r', 'rw'].includes(mode) && !Object.hasOwn(state.files, path)) fail('ENOENT', 'The virtual file does not exist.');
      let fd = 0; while (Object.hasOwn(process.fds, fd)) fd++;
      if (fd > 255) fail('EMFILE', 'The process has too many open descriptors.');
      if (!Object.hasOwn(state.files, path) && Object.keys(state.files).length >= 32) fail('ENOSPC', 'The virtual filesystem is full.');
      if (mode === 'w' || !Object.hasOwn(state.files, path)) state.files[path] = [];
      const id = state.nextHandle++;
      state.handles[id] = { path, mode, offset: mode === 'a' ? state.files[path].length : 0 };
      process.fds[fd] = id;
      return { value: fd, detail: `Allocated fd ${fd} → ${path}` };
    }
    case 'read': {
      const id = descriptor(args[0]), count = integer(args[1], 0, 4096);
      if (id === 'stdin') return { value: 0, data: '', detail: 'Virtual stdin is at EOF.' };
      if (typeof id === 'string' || !['r', 'rw'].includes(state.handles[id].mode)) fail('EBADF', 'Descriptor is not readable.');
      const handle = state.handles[id], bytes = state.files[handle.path].slice(handle.offset, handle.offset + count);
      handle.offset += bytes.length;
      return { value: bytes.length, data: decoder.decode(new Uint8Array(bytes)), detail: `${bytes.length} byte(s) read; offset → ${handle.offset}` };
    }
    case 'write': {
      const id = descriptor(args[0]);
      if (typeof args[1] !== 'string' || args[1].length > 4096) fail('EINVAL', 'Write data must be text of at most 4096 characters.');
      const bytes = Array.from(encoder.encode(args[1]));
      if (id === 'stdout' || id === 'stderr') {
        if (state.output.length + args[1].length > 65536) fail('ENOSPC', 'The virtual console is full.');
        state.output += args[1]; return { value: bytes.length, detail: `Wrote ${bytes.length} byte(s) to ${id}.` };
      }
      if (typeof id === 'string' || !['w', 'a', 'rw'].includes(state.handles[id].mode)) fail('EBADF', 'Descriptor is not writable.');
      const handle = state.handles[id], file = state.files[handle.path];
      const offset = handle.mode === 'a' ? file.length : handle.offset;
      if (offset + bytes.length > 65536) fail('ENOSPC', 'Virtual files are limited to 64 KiB.');
      for (let i = 0; i < bytes.length; i++) file[offset + i] = bytes[i];
      handle.offset = offset + bytes.length;
      return { value: bytes.length, detail: `${bytes.length} byte(s) written; offset → ${handle.offset}` };
    }
    case 'close': descriptor(args[0]); delete process.fds[args[0]]; collectHandles(state); return { value: 0, detail: `Released fd ${args[0]}.` };
    case 'fork': {
      if (Object.keys(state.processes).length >= 32) fail('EAGAIN', 'The process table is full.');
      const pid = state.nextPid++;
      state.processes[pid] = { ...process, pid, ppid: process.pid, fds: { ...process.fds } };
      return { value: pid, detail: `Child ${pid} created. Parent returns ${pid}; child returns 0. File offsets are shared.` };
    }
    case 'exec': process.image = pathValue(args[0]); return { value: null, detail: 'Process image replaced. Successful exec does not return to the original program.' };
    case 'wait': {
      const pid = integer(args[0], 100, 10000), child = state.processes[pid];
      if (!child || child.ppid !== process.pid || child.status === 'reaped') fail('ECHILD', 'No matching unreaped direct child.');
      if (child.status === 'running') fail('EAGAIN', 'Child is still running. This simulator models wait as nonblocking.');
      child.status = 'reaped'; return { value: pid, exitStatus: child.exitCode, detail: `Reaped child ${pid}; exit status ${child.exitCode}.` };
    }
    case 'exit': {
      const status = integer(args[0], 0, 255);
      process.exitCode = status; process.status = 'zombie'; process.fds = {};
      for (const child of Object.values(state.processes)) if (child.ppid === process.pid) { child.ppid = 0; if (child.status === 'zombie') child.status = 'reaped'; }
      if (process.ppid === 0) process.status = 'reaped';
      collectHandles(state); return { value: null, detail: `Process exited with status ${status}. No return to caller.` };
    }
    case 'getpid': return { value: process.pid, detail: 'Returned the current process ID.' };
  }
}
export function simulate(commands) {
  if (!Array.isArray(commands) || commands.length > 200) throw new Error('Provide up to 200 commands. Reset to start a new session.');
  const state = initialState();
  for (const command of commands) {
    if (!command || typeof command !== 'object' || !Number.isInteger(command.pid) || typeof command.call !== 'string' || !Array.isArray(command.args) || command.args.length > 4 || command.args.some(x => !['string', 'number'].includes(typeof x))) throw new Error('Each command requires a numeric pid, a call name and an array of string or number arguments.');
    const row = { step: state.trace.length + 1, pid: command.pid, call: command.call, args: command.args };
    try { Object.assign(row, execute(state, state.processes[command.pid], command.call, command.args), { ok: true }); }
    catch (error) { if (!error.code) throw error; Object.assign(row, { ok: false, value: -1, errno: error.code, detail: error.message }); }
    state.trace.push(row);
  }
  return state;
}
export function parseCall(text, pid) {
  const match = text.trim().replace(/;$/, '').match(/^([a-z]+)\s*\((.*)\)$/);
  if (!match || !Object.hasOwn(catalog, match[1])) throw new Error('Use a supported call such as open("/tmp/notes.txt", "r").');
  let args; try { args = JSON.parse(`[${match[2]}]`); } catch { throw new Error('Use double quotes around text and commas between arguments.'); }
  return { pid: Number(pid), call: match[1], args };
}
