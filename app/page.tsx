'use client';
import { useRef, useState } from 'react';
import { ArrowRight, Braces, ChevronRight, CircleHelp, Code2, Cpu, FileText, Folder, GitFork, Layers, Play, RotateCcw, Terminal, Download, Check, X, BookOpen } from 'lucide-react';
import { catalog, initialState, parseCall } from '../lib/simulator.mjs';

type Command = { pid: number; call: string; args: (string | number)[] };
type SimState = ReturnType<typeof initialState>;
const examples = {
  'Read a file': ['open("/tmp/notes.txt", "r")', 'read(3, 12)', 'read(3, 64)', 'close(3)'],
  'Write a file': ['open("/tmp/message.txt", "w")', 'write(3, "Hello from user space!\\n")', 'close(3)', 'open("/tmp/message.txt", "r")', 'read(3, 64)'],
  'Create a process': ['fork()', 'getpid()', 'wait(101)'],
  'Explore an error': ['open("/missing.txt", "r")', 'read(9, 16)'],
};
export default function Home() {
  const [state, setState] = useState<SimState>(initialState);
  const [history, setHistory] = useState<Command[]>([]);
  const [pid, setPid] = useState(100);
  const [program, setProgram] = useState(examples['Read a file'].join('\n'));
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Files');
  const [selectedFile, setSelectedFile] = useState('/tmp/notes.txt');
  const [selectedCall, setSelectedCall] = useState('open');
  const [nav, setNav] = useState('Simulator');
  const [activeTrace, setActiveTrace] = useState<number | null>(null);
  const rows = program.split('\n').filter(line => line.trim() && !line.trim().startsWith('//'));
  const processes = Object.values(state.processes) as any[];
  const process: any = state.processes[pid as keyof typeof state.processes];
  const running = processes.filter(p => p.status === 'running');
  const last: any = activeTrace === null ? state.trace.at(-1) : state.trace[activeTrace];
  async function run(all: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const selected = all ? rows.slice(cursor) : rows.slice(cursor, cursor + 1);
      if (!selected.length) throw new Error('The program is complete. Load an example or edit the program to run more calls.');
      const added = selected.map(line => parseCall(line, pid));
      const commands = [...history, ...added];
      const response = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commands }) });
      const result = await response.json() as { state: SimState; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to run the simulation.');
      setState(result.state); setHistory(commands); setCursor(cursor + added.length); setActiveTrace(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function reset() { setState(initialState()); setHistory([]); setPid(100); setCursor(0); setError(''); setActiveTrace(null); }
  function loadExample(name: string) { reset(); setProgram(examples[name as keyof typeof examples].join('\n')); setNav('Simulator'); }
  function exportSession() {
    const blob = new Blob([JSON.stringify({ format: 'syscall-lab-v1', commands: history, state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'syscall-session.json'; link.click(); URL.revokeObjectURL(url);
  }
  const info = catalog[selectedCall as keyof typeof catalog];
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#" className="brand" onClick={e => { e.preventDefault(); setNav('Simulator'); }}><span className="brand-mark"><Braces size={23}/></span><span>syscall<span className="brand-light">lab</span><small>OPERATING SYSTEMS, EXPLAINED</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{[{ label: 'Simulator', icon: Terminal }, { label: 'Call reference', icon: BookOpen }, { label: 'Examples', icon: Code2 }].map(({ label, icon: Icon }) => <button key={label} className={'nav-item ' + (nav === label ? 'selected' : '')} onClick={() => setNav(label)}><Icon size={18}/>{label}{nav === label && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-note"><span className="mini-label"><Layers size={16}/> A WINDOW INTO THE KERNEL</span><h3>Small calls.<br/>Big things happening.</h3><p>See what your operating system does behind every line of code.</p><div className="tiny-flow">user space <ArrowRight size={13}/> kernel</div></div>
      <button className="help-link" onClick={() => setNav('Call reference')}><CircleHelp size={17}/> How this simulator works</button>
      <div className="sidebar-footer"><span className="avatar">SL</span><div>Learning workspace<small>Virtual environment</small></div><span className="status-dot"/></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/><strong>{nav}</strong></div><div className="topbar-right"><span className="environment"><span className="status-dot"/> SIMULATED LINUX</span><span className="version">v1.0</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">YOUR OPERATING SYSTEM, UNDER THE HOOD</div><h1>{nav === 'Simulator' ? 'System call simulator' : nav === 'Examples' ? 'Learn by doing' : 'Meet the system calls'}</h1><p>{nav === 'Simulator' ? 'Run a call. Cross the boundary. Watch the kernel respond.' : nav === 'Examples' ? 'Start with a small program and follow what happens inside the kernel.' : 'A practical guide to the calls supported in this virtual environment.'}</p></div><button className="button secondary export" onClick={exportSession} disabled={busy}><Download size={16}/> Export session</button></div>
        {nav === 'Examples' ? <div className="example-grid">{Object.entries(examples).map(([name, code], i) => <button className="example-card" key={name} onClick={() => loadExample(name)}><span className="example-number">0{i + 1}</span><h2>{name}</h2><pre>{code.join('\n')}</pre><span className="example-link">Open in simulator <ArrowRight size={16}/></span></button>)}</div> : nav === 'Call reference' ? <div className="reference-page"><div className="reference-grid">{Object.entries(catalog).map(([name, entry]) => <article className="reference-card" key={name}><code>{entry.signature}</code><p>{entry.description}</p><button className="text-button" onClick={() => { setProgram(entry.example); setCursor(0); setNav('Simulator'); }}>Try {name} <ArrowRight size={14}/></button></article>)}</div><div className="model-note"><strong>About this teaching model</strong><p>All files and processes are virtual. The backend rebuilds your session from its call history on every request. Sessions live in this browser tab; export to save a snapshot. There is no native code execution. Paths are absolute, writes and reads count UTF-8 bytes, stdin starts at EOF, and wait is nonblocking. Fork creates a child state without automatically scheduling child instructions. Exec records a new process image without loading or running a binary. PID 0 represents a virtual reaper for orphaned processes.</p></div></div> : <>
          <div className="session-strip"><div><span className="live-icon"><Cpu size={17}/></span><strong>Sandbox is ready</strong><span className="strip-divider"/><span>Isolated virtual environment</span></div><div><span><b>{running.length}</b> running {running.length === 1 ? 'process' : 'processes'}</span><span className="strip-divider"/><span><b>{state.trace.length}</b> calls executed</span></div></div>
          <div className="workspace-grid">
            <section className="panel program-panel"><div className="panel-header"><div><Code2 size={17}/><h2>Program</h2><span className="subtle-tag">USER SPACE</span></div><select aria-label="Load example" value="" disabled={busy} onChange={e => loadExample(e.target.value)}><option value="" disabled>Load example</option>{Object.keys(examples).map(name => <option key={name}>{name}</option>)}</select></div><div className="editor-toolbar"><span className="file-tab"><FileText size={14}/> program.sys</span><label>Process <select aria-label="Selected process" value={pid} disabled={busy} onChange={e => setPid(Number(e.target.value))}>{processes.map(p => <option key={p.pid} value={p.pid}>PID {p.pid}{p.status !== 'running' ? ` · ${p.status}` : ''}</option>)}</select></label></div>
              <div className="code-editor"><div className="line-numbers" aria-hidden="true">{program.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div><textarea aria-label="System call program" spellCheck={false} value={program} disabled={busy} onChange={e => { setProgram(e.target.value); setCursor(0); }} /></div><div className="editor-hint"><span className="status-dot"/> {cursor === rows.length && rows.length ? 'Program complete' : `${rows.length - cursor} call(s) remaining`}<span>JSON arguments · one call per line</span></div>
              <div className="execution-controls"><button className="button primary" disabled={busy || !running.some(p => p.pid === pid) || cursor >= rows.length} onClick={() => run(true)}><Play size={15} fill="currentColor"/>{busy ? 'Running…' : 'Run program'}</button><button className="button secondary" disabled={busy || !running.some(p => p.pid === pid) || cursor >= rows.length} onClick={() => run(false)}><ChevronRight size={17}/> Step</button><button className="reset-button" onClick={reset} disabled={busy} aria-label="Reset session"><RotateCcw size={17}/></button></div>
              {error && <div className="error-message" role="alert">{error}</div>}
            </section>
            <section className="panel kernel-panel"><div className="panel-header"><div><Cpu size={17}/><h2>Kernel state</h2><span className="subtle-tag mint">KERNEL SPACE</span></div><span className="status-dot"/></div><div className="tabs" role="tablist">{['Files', 'Descriptors', 'Processes'].map(t => <button role="tab" aria-selected={tab === t} key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
              {tab === 'Files' ? <div className="files-view"><div className="file-list">{Object.keys(state.files).map(path => <button key={path} onClick={() => setSelectedFile(path)} className={selectedFile === path ? 'active' : ''}><FileText size={16}/><span>{path.split('/').at(-1)}<small>{path.slice(0, path.lastIndexOf('/'))}</small></span><small>{state.files[path as keyof typeof state.files].length} B</small></button>)}</div><div className="file-preview"><div className="mini-label"><Folder size={13}/>{selectedFile}</div><pre>{state.files[selectedFile as keyof typeof state.files] ? new TextDecoder().decode(new Uint8Array(state.files[selectedFile as keyof typeof state.files])) || '(empty file)' : 'Select a file to inspect its contents.'}</pre><span className="preview-caption">Virtual file contents · UTF-8</span></div></div> : tab === 'Descriptors' ? <div className="table-wrap"><table><thead><tr><th>FD</th><th>TARGET</th><th>MODE</th><th>OFFSET</th></tr></thead><tbody>{Object.entries(process?.fds || {}).map(([fd, id]: any) => { const h: any = state.handles[id as keyof typeof state.handles]; return <tr key={fd}><td><span className="fd-number">{fd}</span></td><td>{h?.path || id}</td><td>{h?.mode || (id === 'stdin' ? 'r' : 'w')}</td><td>{h?.offset ?? '—'}</td></tr>; })}</tbody></table>{!Object.keys(process?.fds || {}).length && <p className="empty-small">This process has no open descriptors.</p>}<p className="table-caption">Descriptors for PID {pid}. Forked processes share underlying file offsets.</p></div> : <div className="process-list">{processes.map(p => <button key={p.pid} className={'process-card ' + (p.pid === pid ? 'active' : '')} onClick={() => !busy && setPid(p.pid)} disabled={busy}><span className="process-icon"><GitFork size={18}/></span><div><strong>PID {p.pid} <span className={'process-status ' + p.status}>{p.status}</span></strong><small>{p.image} · parent {p.ppid || 'virtual reaper'}{p.exitCode !== null ? ` · exit ${p.exitCode}` : ''}</small></div><ChevronRight size={15}/></button>)}<p className="table-caption">Select a process to run its calls and inspect its descriptors.</p></div>}
            </section>
          </div>
          <div className="lower-grid"><section className="panel trace-panel"><div className="panel-header"><div><Terminal size={17}/><h2>Execution trace</h2><span className="count-badge">{state.trace.length}</span></div><span className="small-muted">Click a call for details</span></div>{!state.trace.length ? <div className="empty-trace"><span className="empty-icon"><Terminal size={24}/></span><h3>The story starts with a call</h3><p>Run your program to follow the journey from user space to kernel space.</p><span className="empty-flow">PROGRAM <ArrowRight size={14}/> SYSTEM CALL <ArrowRight size={14}/> KERNEL</span></div> : <div className="trace-list">{state.trace.map((row: any, i: number) => <button key={row.step} onClick={() => setActiveTrace(i)} className={'trace-row ' + ((activeTrace === i || activeTrace === null && i === state.trace.length - 1) ? 'active' : '')}><span className="trace-step">{String(row.step).padStart(2, '0')}</span><span className={'result-icon ' + (row.ok ? 'success' : 'failure')}>{row.ok ? <Check size={13}/> : <X size={13}/>}</span><code>{row.call}({row.args.map((arg: any) => JSON.stringify(arg)).join(', ')})</code><span className="trace-pid">PID {row.pid}</span><span className={'return-value ' + (!row.ok ? 'failure' : '')}>→ {row.errno || (row.value === null ? 'no return' : row.value)}</span></button>)}</div>}</section>
            <section className="panel insight-panel"><div className="panel-header"><div><Layers size={17}/><h2>{last ? 'Inside the call' : 'Call spotlight'}</h2></div><CircleHelp size={16}/></div>{last ? <div className="insight-content"><span className="eyebrow">STEP {last.step} · PID {last.pid}</span><h3 className="mono">{last.call}()</h3><p>{last.detail}</p><div className="return-card"><span>RETURN VALUE</span><strong className={!last.ok ? 'failure' : ''}>{last.errno || (last.value === null ? 'No return' : last.value)}</strong></div>{last.data !== undefined && <pre className="read-result">{last.data === '' ? '(end of file)' : last.data}</pre>}{last.exitStatus !== undefined && <div className="read-result">Exit status: {last.exitStatus}</div>}<p className="insight-footnote">{catalog[last.call as keyof typeof catalog]?.description}</p></div> : <div className="insight-content"><select aria-label="System call spotlight" value={selectedCall} onChange={e => setSelectedCall(e.target.value)}>{Object.keys(catalog).map(name => <option key={name} value={name}>{name}()</option>)}</select><h3 className="mono">{info.signature}</h3><p>{info.description}</p><div className="spotlight-example"><span>TRY THIS</span><code>{info.example}</code></div><button className="text-button" onClick={() => { setProgram(info.example); setCursor(0); }}>Use this call <ArrowRight size={14}/></button></div>}</section></div>
          <section className="console"><span><Terminal size={15}/> Standard output</span><pre>{state.output || 'Output from write(1, "...") or write(2, "...") appears here.'}</pre></section>
          <footer className="page-footer"><span><span className="status-dot"/> Educational simulation · no host system access</span><span>Explore. Execute. Understand.</span></footer>
        </>}
      </main>
    </div>
  </div>;
}
