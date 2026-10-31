const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

async function startServer(environment = {}) {
  const portProbe = net.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, OPENAI_API_KEY: '', OPENAI_BASE_URL: '', ...environment, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const baseURL = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited before starting: ${output}`);
    try {
      const response = await fetch(baseURL);
      if (response.ok) {
        return {
          baseURL,
          async close() {
            if (child.exitCode !== null) return;
            const exited = once(child, 'exit');
            child.kill();
            await exited;
          }
        };
      }
    } catch { /* Wait for the listening socket. */ }
    await delay(50);
  }
  child.kill();
  throw new Error(`Server did not become ready: ${output}`);
}

module.exports = { startServer };
