const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

function engineError(code, message) { return Object.assign(new Error(message), { code }); }

function createEngineClient({ file, args = [], env = process.env, startupTimeout = 20_000 }) {
  const events = new EventEmitter();
  let child, starting, ready = false, closed = false, nextId = 0, buffer = '';
  const pending = new Map();
  function rejectPending(error) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  }
  function start() {
    if (closed) return Promise.reject(engineError('ENGINE_CLOSED', 'Game engine is closed.'));
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child?.kill(); reject(engineError('STARTUP_TIMEOUT', 'Game engine did not become ready.')); }, startupTimeout);
      child = spawn(file, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      // Never forward upstream stderr to the renderer or persist authentication logs.
      child.stderr.resume();
      child.stdout.setEncoding('utf8');
      child.stdin.on('error', () => {});
      child.once('error', () => { clearTimeout(timer); reject(engineError('ENGINE_UNAVAILABLE', 'Game engine could not start.')); });
      child.once('exit', () => {
        clearTimeout(timer); ready = false; closed = true;
        const error = engineError('ENGINE_EXITED', 'Game engine stopped. Please restart mini.');
        reject(error); rejectPending(error); events.emit('stopped');
      });
      child.stdout.on('data', data => {
        buffer += data.toString('utf8');
        if (buffer.length > 1024 * 1024) { child.kill(); return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let value;
          try { value = JSON.parse(line); } catch { child.kill(); return; }
          if (!ready) {
            if (value.event !== 'ready' || value.protocol !== 1 || value.backend !== 'mini-prism') { child.kill(); return; }
            ready = true; clearTimeout(timer); resolve(); continue;
          }
          if (value.event) events.emit('event', value);
          const entry = pending.get(value.id);
          if (!entry || (!value.result && !value.error)) continue;
          clearTimeout(entry.timer); pending.delete(value.id);
          if (value.error) entry.reject(engineError(value.error.code, value.error.message));
          else entry.resolve(value.result);
        }
      });
    });
    return starting;
  }
  events.request = async (method, params = {}, { timeout = 30_000 } = {}) => {
    await start();
    if (!ready || closed) throw engineError('ENGINE_EXITED', 'Game engine stopped.');
    const id = `${++nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id); reject(engineError('TIMEOUT', 'The operation timed out. Please retry.'));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  };
  events.close = () => {
    if (closed) return;
    closed = true;
    rejectPending(engineError('ENGINE_CLOSED', 'Game engine is closed.'));
    child?.stdin.end();
    const timer = setTimeout(() => child?.kill(), 1500); timer.unref();
  };
  events.detach = () => {
    closed = true;
    rejectPending(engineError('ENGINE_CLOSED', 'Launcher closed; game continues running.'));
    child?.stdin.end(); child?.stdout.destroy(); child?.stderr.destroy(); child?.unref();
  };
  return events;
}
module.exports = { createEngineClient, engineError };
