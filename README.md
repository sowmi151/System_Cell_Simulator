# Syscall Lab

A React frontend and JavaScript backend for an educational system call simulator. React runs through the supplied Vinext framework; the backend is an HTTP route compatible with Node-based local development and Cloudflare Workers deployment.

## Start locally

Requires Node.js 22.13 or later.

```sh
npm run install:ci
npm run dev
```

Open the local URL printed by the development server.

```sh
node --test tests/simulator.test.mjs
npx tsc --noEmit
npm run build
```

## Using the simulator

Load an example, then choose **Step** or **Run program**. Each nonempty line is a call with JSON arguments. Double quotes are required for text. Lines beginning with `//` are ignored.

The file example reads from an initial virtual file. To explore processes, run `fork()`, select PID 101, run `exec("/bin/demo")` and `exit(7)`, then select PID 100 and run `wait(101)`. Editing the program starts a new program cursor but retains current kernel state. Reset clears the session and rewinds the program.

## Backend API

`POST /api/simulate` accepts the complete command history:

```json
{
  "commands": [
    { "pid": 100, "call": "open", "args": ["/tmp/notes.txt", "r"] },
    { "pid": 100, "call": "read", "args": [3, 12] }
  ]
}
```

Returns `{ "state": { ... } }` with virtual files as byte arrays, open file descriptions, processes, captured output, and a trace. Invalid request structure returns HTTP 400; a payload larger than 150,000 characters returns HTTP 413. A simulated syscall failure is a successful HTTP response with `ok: false`, `value: -1`, and an `errno` in the trace.

The backend replays the history from a clean initial state, rather than accepting a client-provided kernel state. There are no database credentials or host filesystem calls. Sessions are per browser tab and reset on reload. Export downloads a JSON snapshot; importing snapshots is not implemented.

## Model and limits

Supported calls: `open`, `read`, `write`, `close`, `fork`, `exec`, `wait`, `exit`, `getpid`.

- `r` and `rw` require an existing file; `w` creates or truncates; `a` creates or appends. Descriptors start at the lowest unused value, usually 3.
- Reads and writes count UTF-8 bytes. Decoding a partial multibyte read can display a replacement character.
- `fork` copies descriptors while sharing open file descriptions and offsets. The trace shows the parent result; the child return is described rather than automatically scheduled.
- `exec` records the image path and preserves descriptors. It does not load or execute a real binary; successful exec has no return to the original program.
- `wait(pid)` is deliberately nonblocking: a running child returns `EAGAIN`. Exited children become zombies until reaped. Orphans are transferred to virtual PID 0; this is simplified process reaping.
- `exit` closes the process descriptors and records an exit status from 0 through 255.
- stdin is initially EOF. stdout and stderr share the displayed console.
- Limits: 200 calls per session, 32 virtual files, 32 process records, 256 descriptors per process, 64 KiB per file, 4,096 bytes per read, and 4,096 characters per write.

## Source map

`app/page.tsx`: interactive frontend. `app/globals.css`: responsive interface. `app/api/simulate/route.ts`: backend HTTP API. `lib/simulator.mjs`: deterministic simulation engine and parser. `tests/simulator.test.mjs`: behavior tests.
