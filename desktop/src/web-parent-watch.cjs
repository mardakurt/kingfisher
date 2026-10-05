/**
 * Loaded into the web server with `--require`, before Next's generated
 * `server.js`.
 *
 * The companion ends itself when the shell's IPC channel closes (the
 * shutdown contract in `services.mjs`); the web server is Next's own file and
 * had no such watch. A shell that exited before its services finished
 * stopping — killed, crashed, or force-quit — left the web server running,
 * orphaned, on the profile's port, and every later launch refused with
 * "Kingfisher needs its own port" until the orphan was found and killed or the
 * Mac restarted (closure audit, 2026-10-05). The channel exists only for this.
 */
'use strict';

if (typeof process.send === 'function') {
  process.on('disconnect', () => process.exit(0));
}
