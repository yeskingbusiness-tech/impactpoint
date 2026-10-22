// Runs the full test suite against a freshly spawned server on TEST_PORT.
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || 8099;
process.env.TEST_PORT = String(PORT);

function waitPort(port, timeout = 8000) {
  return new Promise((res, rej) => {
    const end = Date.now() + timeout;
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.end(); res(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() > end) rej(new Error('server did not start'));
        else setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

function run(cmd, args) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    p.on('exit', (code) => res(code || 0));
  });
}

console.log('── starting test server on port', PORT);
const server = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit',
});

let failed = 0;
try {
  await waitPort(PORT);
  console.log('\n── [1/3] simulation test');
  failed += await run('node', ['test/sim.test.js']);
  console.log('\n── [2/3] server integration test');
  failed += await run('node', ['test/integration.test.js']);
  console.log('\n── [3/3] client smoke test');
  failed += await run('node', ['test/client.test.js']);
} finally {
  server.kill('SIGKILL');
}

console.log(failed ? `\n✗ TEST SUITE FAILED (code ${failed})` : '\n✓ ALL TESTS PASSED');
process.exit(failed ? 1 : 0);
