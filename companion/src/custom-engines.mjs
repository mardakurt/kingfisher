/**
 * Registering a user-chosen UCI engine executable.
 *
 * `engines.mjs` already treats every engine generically — capabilities are
 * read from its own `option` lines, not hand-coded per engine — so the only
 * thing this file adds is a trustworthy way to get a *new* binary into the
 * registry: validate it is really an executable file, confirm it actually
 * speaks UCI, and only then hand it a key. A path never reaches
 * `EngineHost.start` without having passed both checks here first.
 */

import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';

/**
 * Rejects anything that is not a real, executable file, truthfully and
 * before a process is ever spawned.
 */
export function validateExecutable(candidatePath) {
  if (!existsSync(candidatePath)) {
    throw new Error(`No file exists at ${candidatePath}.`);
  }
  const stats = statSync(candidatePath);
  if (!stats.isFile()) {
    throw new Error(`${candidatePath} is not a file.`);
  }
  try {
    accessSync(candidatePath, constants.X_OK);
  } catch {
    throw new Error(`${candidatePath} is not executable.`);
  }
}

/**
 * Confirms a binary speaks UCI before it is trusted with a registry key.
 *
 * The same handshake every engine session performs — start, `uci`, wait for
 * `uciok`, `isready`, wait for `readyok`, `quit` — run once up front so a
 * binary that merely happens to be executable (a shell script, `/bin/ls`, a
 * build of the wrong protocol) is rejected here with a specific reason,
 * rather than the first time someone tries to analyse with it. Full option
 * parsing is deliberately left to the browser's existing `parseUciOptions`,
 * which runs anyway the first time the engine is actually started — this
 * only needs to prove the handshake completes and recover a display name.
 */
export function handshakeUci(binaryPath, args = [], { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child?.stdout?.removeAllListeners('data');
      } catch {
        // Already gone.
      }
      try {
        if (child && !child.killed) child.stdin.write('quit\n');
      } catch {
        // The pipe may already be closed.
      }
      // Do not settle until the process has exited. A test worker (or a
      // short-lived caller) may exit as soon as this promise settles; an
      // unreferenced cleanup timer then never fires and leaves an orphan.
      if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
        fn(value);
        return;
      }
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* Already gone. */
        }
      }, 400);
      child.once('exit', () => {
        clearTimeout(killTimer);
        fn(value);
      });
    };

    try {
      child = spawn(binaryPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      reject(new Error(`Could not start ${binaryPath}: ${error.message}`));
      return;
    }

    const timer = setTimeout(() => {
      finish(reject, new Error('The engine did not complete the UCI handshake in time.'));
    }, timeoutMs);

    child.stderr.resume();
    child.stdin.on('error', () => finish(reject, new Error('The engine closed its input pipe.')));

    child.on('error', (error) => {
      finish(reject, new Error(`Could not start the engine: ${error.message}`));
    });
    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(
          reject,
          new Error(
            `The engine exited before completing the UCI handshake (${String(code ?? signal ?? 'unknown')}).`,
          ),
        );
      }
    });

    let stage = 'uci';
    let buffer = '';
    let name = null;
    let author = null;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('id name ')) name = line.slice(8).trim();
        if (line.startsWith('id author ')) author = line.slice(10).trim();
        if (stage === 'uci' && line === 'uciok') {
          stage = 'isready';
          try {
            child.stdin.write('isready\n');
          } catch {
            finish(reject, new Error('The engine closed its input before isready.'));
          }
        } else if (stage === 'isready' && line === 'readyok') {
          finish(resolve, { name, author });
        }
      }
    });

    try {
      child.stdin.write('uci\n');
    } catch (error) {
      finish(reject, new Error(`Could not write to the engine: ${error.message}`));
    }
  });
}
