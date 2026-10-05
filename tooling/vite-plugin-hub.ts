/**
 * Development-only owner of the Python connectivity hub.
 *
 * When `vite` (or `tauri dev`, which runs vite) starts, this plugin:
 *   1. picks a free local port and a fresh per-launch token,
 *   2. starts `hub/server.py` bound to 127.0.0.1 with that token,
 *   3. exposes { url, token } to the interface through `virtual:hub-connection`,
 *   4. restarts the hub whenever a file in `hub/` changes, and stops it with vite.
 *
 * In a production build the virtual module exports `null`; the Tauri shell
 * then supplies the connection instead (see src-tauri/src/lib.rs).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:hub-connection';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not determine a free port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

function pythonExecutable(): string {
  return process.env['THE_DAY_PYTHON'] ?? (process.platform === 'win32' ? 'python' : 'python3');
}

export function hubPlugin(): Plugin {
  const token = randomBytes(32).toString('hex');
  let port = 0;
  let child: ChildProcess | null = null;
  let hubDir = '';

  const start = (): void => {
    child = spawn(pythonExecutable(), [path.join(hubDir, 'server.py'), '--port', String(port), '--lifeline'], {
      cwd: hubDir,
      // The token travels by environment, never on the command line, so it
      // does not show up in process listings.
      env: { ...process.env, THE_DAY_HUB_TOKEN: token, PYTHONUNBUFFERED: '1' },
      // stdin stays open as a lifeline: the hub exits when it closes.
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.on('error', (error) => {
      console.error(`[hub] could not start Python (${pythonExecutable()}): ${error.message}`);
    });
  };

  const stop = (): void => {
    if (child !== null) {
      child.stdin?.end();
      child.kill();
      child = null;
    }
  };

  return {
    name: 'the-day-hub',

    async configResolved(config) {
      hubDir = path.resolve(config.root, 'hub');
      if (config.command === 'serve') {
        port = await findFreePort();
      }
    },

    configureServer(server) {
      start();
      server.watcher.add(hubDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(hubDir) && file.endsWith('.py')) {
          console.log('[hub] change detected, restarting');
          stop();
          start();
        }
      });
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const connection = port === 0 ? null : { url: `http://127.0.0.1:${port}`, token };
      return `export const devHubConnection = ${JSON.stringify(connection)};`;
    },
  };
}
