/**
 * Remote engines: a companion on another of the player's machines serves its
 * engines, and this companion uses them (Phase 85). `docs/design/remote-engines.md`.
 *
 * The channel is TLS 1.2 with a pre-shared key — the pairing key — so it is
 * encrypted and both ends are authenticated by the one secret the player
 * copied from one machine to the other. A lost connection ends every session
 * on it, on both sides: a remote engine that went quiet is failed, never
 * reused (AGENTS.md, Engines).
 */

import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import tls from 'node:tls';

const CIPHERS = 'PSK-AES256-GCM-SHA384';
const IDENTITY = 'kingfisher-engines';
const MAX_LINE = 64 * 1024;
const PING_MS = 15_000;
const SILENCE_MS = 45_000;

const TLS_OPTIONS = { ciphers: CIPHERS, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' };

export const newPairingKey = () => randomBytes(32);

export function pairingCode(address, port, key) {
  return `kingfisher-engines://${address}:${port}/#k=${key.toString('base64url')}`;
}

/** The pairing code a player pasted, or why it is not one. */
export function parsePairingCode(code) {
  const match =
    /^kingfisher-engines:\/\/([A-Za-z0-9.:[\]-]+):(\d{1,5})\/#k=([A-Za-z0-9_-]{43})$/.exec(
      String(code).trim(),
    );
  if (!match) throw new Error('That is not a Kingfisher engine-host pairing code.');
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error('The pairing code names an impossible port.');
  const key = Buffer.from(match[3], 'base64url');
  if (key.length !== 32) throw new Error('The pairing code’s key is the wrong length.');
  return { host: match[1].replace(/^\[|\]$/g, ''), port, key };
}

/** Newline-delimited JSON on a socket, with a line limit and a silence limit. */
function channel(socket, onMessage, onClose) {
  let pending = '';
  let heard = Date.now();
  let closed = false;
  const close = (reason) => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    socket.destroy();
    onClose(reason);
  };
  const send = (message) => {
    if (closed) return false;
    socket.write(`${JSON.stringify(message)}\n`);
    return true;
  };
  const timer = setInterval(() => {
    if (Date.now() - heard > SILENCE_MS) close('no answer for 45 seconds');
    else send({ type: 'ping' });
  }, PING_MS);
  timer.unref?.();
  socket.setEncoding('utf8');
  socket.setKeepAlive(true, 10_000);
  socket.on('data', (chunk) => {
    heard = Date.now();
    pending += chunk;
    if (pending.length > MAX_LINE && !pending.includes('\n')) {
      close('a message longer than 64 kB');
      return;
    }
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        close('a message that is not JSON');
        return;
      }
      if (message?.type === 'ping') send({ type: 'pong' });
      else if (message?.type !== 'pong') onMessage(message);
    }
  });
  socket.on('error', (error) => close(error.message));
  socket.on('close', () => close('the connection closed'));
  return {
    send,
    close,
    get closed() {
      return closed;
    },
  };
}

/**
 * Serve this machine's engines to paired companions.
 *
 * `engines` is the companion's own `EngineHost` and `registry` its engine
 * registry; nothing else of the companion is reachable from here.
 */
export function serveEngines({
  engines,
  registry,
  key,
  port = 0,
  address = '0.0.0.0',
  label = hostname(),
}) {
  const connections = new Set();
  const server = tls.createServer(
    {
      ...TLS_OPTIONS,
      pskIdentityHint: IDENTITY,
      pskCallback: (_socket, identity) => (identity === IDENTITY ? key : null),
    },
    (socket) => {
      const mine = new Map();
      const unsubscribes = new Map();
      const conversation = channel(
        socket,
        (message) => {
          try {
            if (message.type === 'hello') {
              conversation.send({
                type: 'welcome',
                host: label,
                engines: registry.list().map(({ key: engineKey, name, version }) => ({
                  key: engineKey,
                  name: name ?? engineKey,
                  ...(version ? { version } : {}),
                })),
              });
            } else if (message.type === 'start') {
              try {
                const started = engines.start(String(message.engine));
                mine.set(started.id, true);
                conversation.send({ type: 'started', ref: message.ref, session: started.id });
                unsubscribes.set(
                  started.id,
                  engines.subscribe(started.id, (line) => {
                    if (line === null) conversation.send({ type: 'end', session: started.id });
                    else conversation.send({ type: 'line', session: started.id, line });
                  }),
                );
              } catch (error) {
                conversation.send({
                  type: 'failed',
                  ref: message.ref,
                  error: String(error.message ?? error),
                });
              }
            } else if (message.type === 'send' && mine.has(message.session)) {
              engines.send(String(message.session), String(message.line));
            } else if (message.type === 'stop' && mine.has(message.session)) {
              unsubscribes.get(message.session)?.();
              engines.stop(String(message.session));
              mine.delete(message.session);
            }
          } catch (error) {
            conversation.send({ type: 'error', error: String(error.message ?? error) });
          }
        },
        () => {
          // Whatever this connection started ends with it.
          for (const id of mine.keys()) {
            unsubscribes.get(id)?.();
            engines.stop(id);
          }
          mine.clear();
          connections.delete(conversation);
        },
      );
      connections.add(conversation);
    },
  );
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, address, () => {
      resolve({
        port: server.address().port,
        connections: () => connections.size,
        close: () =>
          new Promise((done) => {
            for (const connection of connections) connection.close('the host is stopping');
            server.close(() => done());
          }),
      });
    });
  });
}

/**
 * One paired engine host, as this companion sees it: its engines, and
 * sessions that look to the rest of the companion like its own.
 */
export class RemoteEngineHost {
  #options;
  #conversation = null;
  #waiting = new Map();
  #sessions = new Map();
  #next = 1;
  label = null;
  engines = [];
  error = null;

  constructor({ host, port, key, label = null }) {
    this.#options = { host, port, key };
    this.label = label;
  }

  get connected() {
    return Boolean(this.#conversation && !this.#conversation.closed);
  }

  connect({ timeout = 10_000 } = {}) {
    return new Promise((resolve, reject) => {
      const { host, port, key } = this.#options;
      const socket = tls.connect({
        ...TLS_OPTIONS,
        host,
        port,
        // No certificate: the key authenticates the host, and only a host that
        // holds it can complete the handshake.
        checkServerIdentity: () => undefined,
        pskCallback: () => ({ psk: key, identity: IDENTITY }),
      });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`${host}:${port} did not answer within ${timeout / 1000} s.`));
      }, timeout);
      let welcomed = false;
      socket.once('error', (error) => {
        clearTimeout(timer);
        if (!welcomed) {
          reject(
            new Error(
              /BAD_RECORD_MAC|DECRYPT|handshake|alert/i.test(`${error.code} ${error.message}`)
                ? 'The engine host refused the pairing key.'
                : `Could not reach ${host}:${port}: ${error.message}`,
            ),
          );
        }
      });
      socket.once('secureConnect', () => {
        this.#conversation = channel(
          socket,
          (message) => {
            if (message.type === 'welcome') {
              welcomed = true;
              clearTimeout(timer);
              this.label = this.label ?? String(message.host ?? host).slice(0, 64);
              this.engines = Array.isArray(message.engines) ? message.engines : [];
              this.error = null;
              resolve(this);
            } else this.#receive(message);
          },
          (reason) => {
            clearTimeout(timer);
            this.error = reason;
            this.#lost(reason);
            if (!welcomed) reject(new Error(`The engine host closed the connection: ${reason}.`));
          },
        );
        this.#conversation.send({ type: 'hello' });
      });
    });
  }

  #receive(message) {
    if (message.type === 'started' || message.type === 'failed') {
      const waiter = this.#waiting.get(message.ref);
      this.#waiting.delete(message.ref);
      if (!waiter) return;
      if (message.type === 'failed') waiter.reject(new Error(String(message.error)));
      else waiter.resolve(String(message.session));
      return;
    }
    const session = this.#sessions.get(message.session);
    if (!session) return;
    if (message.type === 'line') {
      let line = String(message.line);
      // The host is part of the engine's identity, wherever that identity is read.
      if (/^id name /.test(line)) line = `${line} · on ${this.label}`;
      session.emit(line);
    } else if (message.type === 'end') {
      session.exited = true;
      session.end();
    }
  }

  #lost(reason) {
    for (const waiter of this.#waiting.values())
      waiter.reject(new Error(`Connection lost: ${reason}.`));
    this.#waiting.clear();
    for (const session of this.#sessions.values()) {
      if (session.exited) continue;
      session.exited = true;
      session.emit(
        `#error The connection to ${this.label ?? this.#options.host} was lost (${reason}).`,
      );
      session.end();
    }
  }

  async start(engineKey) {
    if (!this.connected) throw new Error(`${this.label ?? 'The engine host'} is not connected.`);
    const ref = this.#next++;
    const id = await new Promise((resolve, reject) => {
      this.#waiting.set(ref, { resolve, reject });
      this.#conversation.send({ type: 'start', ref, engine: engineKey });
    });
    const listeners = new Set();
    const backlog = [];
    const session = {
      exited: false,
      emit: (line) => {
        backlog.push(line);
        if (backlog.length > 500) backlog.shift();
        for (const listener of listeners) listener(line);
      },
      end: () => {
        for (const listener of listeners) listener(null);
      },
      listeners,
      backlog,
    };
    this.#sessions.set(id, session);
    return id;
  }

  send(id, line) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('No such engine session.');
    if (session.exited || !this.connected) throw new Error('That engine has exited.');
    this.#conversation.send({
      type: 'send',
      session: id,
      line: String(line).replace(/[\r\n]+/g, ' '),
    });
  }

  subscribe(id, listener) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error('No such engine session.');
    if (session.exited && session.backlog.length === 0) throw new Error('That engine has exited.');
    for (const line of session.backlog) listener(line);
    if (session.exited) {
      listener(null);
      return () => undefined;
    }
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  stop(id) {
    if (!this.#sessions.has(id)) return;
    this.#sessions.delete(id);
    this.#conversation?.send({ type: 'stop', session: id });
  }

  list() {
    return [...this.#sessions.entries()].map(([id, session]) => ({ id, exited: session.exited }));
  }

  close() {
    this.#conversation?.close('closed by this companion');
  }
}
