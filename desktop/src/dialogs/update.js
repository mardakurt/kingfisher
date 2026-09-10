/**
 * The renderer that lives inside the small Check-for-Updates window.
 *
 * The main process opens this HTML in a child BrowserWindow, then
 * subscribes the window to verdict updates. This script talks to the
 * main process exclusively through the small `kingfisher-update`
 * bridge the preload exposes; there is no `fetch`, no
 * `XMLHttpRequest`, and no Node here.
 *
 * Phase 36 redesigns the dialog around the user's actual flow:
 *
 *   1. The user opens *Check for Updates…*
 *   2. The verdict is one of: up-to-date, available, unable-to-check.
 *   3. If available, the primary action is **Install Update** — a
 *      single click that owns the entire download → verify → save
 *      barrier → install → relaunch chain. The dialog does not
 *      make the user click through intermediate states.
 *   4. Progress is shown in the dialog until the OS takes over
 *      for the actual install.
 *
 * Every state name in the switch below is also a value of
 * `STATUS` in `update-protocol.mjs`. Adding a state on the main
 * side without a matching case here is a bug.
 */

(function () {
  const els = {
    close: document.getElementById('close'),
    headline: document.getElementById('headline'),
    detail: document.getElementById('detail'),
    versionLine: document.getElementById('version-line'),
    primary: document.getElementById('primary'),
    secondary: document.getElementById('secondary'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progress-fill'),
    footnote: document.getElementById('footnote'),
  };

  const bridge = window.kingfisherUpdate;
  if (!bridge) {
    showFatal('The updater surface did not receive its bridge.');
    return;
  }

  bridge.onVerdict(render);
  bridge
    .getInitial()
    .then(render)
    .catch((err) => showFatal(String(err?.message ?? err)));

  els.close.addEventListener('click', () => bridge.close());
  els.primary.addEventListener('click', onPrimary);
  els.secondary.addEventListener('click', onSecondary);
  document.addEventListener('keydown', onKey);

  function render(verdict) {
    if (!verdict) return;
    const current = (verdict.currentVersion || '').trim() || 'Kingfisher';
    const latest = (verdict.latestVersion || '').trim();
    els.versionLine.textContent = `Kingfisher ${current}`;
    switch (verdict.status) {
      case 'idle':
        paint({
          headline: 'Kingfisher updates itself in the background.',
          detail: 'Click Check for Updates to ask the release host whether a newer version is available.',
          progress: null,
          footnote: '',
          primary: { label: 'Check for Updates', enabled: true, action: 'check' },
          secondary: null,
        });
        break;
      case 'checking':
        paint({
          headline: 'Checking for updates…',
          detail: 'Reaching the release host.',
          progress: { value: 0, indeterminate: true },
          footnote: '',
          primary: { label: 'Checking…', enabled: false },
          secondary: null,
        });
        break;
      case 'up-to-date':
        paint({
          headline: latest ? `Kingfisher ${current} is the latest available version.` : 'Kingfisher is up to date.',
          detail: latest ? `Kingfisher ${current} is the latest version published on the release channel.` : '',
          progress: null,
          footnote: '',
          primary: { label: 'Done', enabled: true, action: 'close' },
          secondary: { label: 'Check Again', enabled: true, action: 'check' },
        });
        break;
      case 'available':
        paint({
          headline: `Kingfisher ${latest || 'a new version'} is ready to install.`,
          detail: `You're running ${current}. ${releaseNotesTeaser(verdict)}`,
          progress: null,
          footnote: 'Kingfisher will close and reopen automatically.',
          primary: { label: 'Install Update', enabled: true, action: 'install' },
          secondary: { label: 'View Release Notes', enabled: true, action: 'notes' },
        });
        break;
      case 'downloading':
        paint({
          headline: `Downloading Kingfisher ${latest || 'the update'}…`,
          detail: formatProgress(verdict),
          progress: progressFraction(verdict),
          footnote: 'Verifying the download when this finishes.',
          primary: { label: 'Cancel', enabled: true, action: 'cancel' },
          secondary: null,
        });
        break;
      case 'downloaded':
      case 'verifying':
        paint({
          headline: 'Verifying the update…',
          detail: 'Confirming the download matches the release manifest.',
          progress: { value: 1, indeterminate: false },
          footnote: '',
          primary: { label: 'Cancel', enabled: false },
          secondary: null,
        });
        break;
      case 'ready':
        // Reached only if the user opened the dialog after a
        // previous download completed but before Install Update
        // was clicked. The chain is normally automatic.
        paint({
          headline: `Kingfisher ${latest || 'the update'} is ready to install.`,
          detail: 'The update has been verified.',
          progress: null,
          footnote: 'Kingfisher will close and reopen automatically.',
          primary: { label: 'Install Update', enabled: true, action: 'install' },
          secondary: null,
        });
        break;
      case 'waiting-for-save':
        paint({
          headline: 'Finishing saving your work…',
          detail: 'Kingfisher is making sure your last edits are committed before the install.',
          progress: { value: 0, indeterminate: true },
          footnote: 'This only takes a moment.',
          primary: { label: 'Saving…', enabled: false },
          secondary: null,
        });
        break;
      case 'installing':
        paint({
          headline: 'Installing the update…',
          detail: 'Kingfisher will close and reopen automatically.',
          progress: { value: 1, indeterminate: false },
          footnote: 'Do not turn off your computer until this finishes.',
          primary: { label: 'Installing…', enabled: false },
          secondary: null,
        });
        break;
      case 'restarting':
        paint({
          headline: 'Restarting Kingfisher…',
          detail: 'The new version is opening now.',
          progress: { value: 1, indeterminate: false },
          footnote: '',
          primary: { label: 'Restarting…', enabled: false },
          secondary: null,
        });
        break;
      case 'canceled':
        paint({
          headline: 'Download canceled.',
          detail: `Kingfisher ${current} is still installed. You can try again any time.`,
          progress: null,
          footnote: '',
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'failed':
        paint({
          headline: 'The update could not be installed.',
          detail: verdict.reason || 'The download was incomplete or the signature did not verify.',
          progress: null,
          footnote: 'Your installed Kingfisher is unchanged.',
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Download Installer', enabled: true, action: 'fallback' },
        });
        break;
      case 'unable-to-check':
        paint({
          headline: 'Unable to check for updates right now.',
          detail: verdict.reason || 'Try again later.',
          progress: null,
          footnote: 'No data was downloaded and nothing was changed on this machine.',
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      default:
        paint({
          headline: 'Checking for updates…',
          detail: '',
          progress: null,
          footnote: '',
          primary: { label: 'Check for Updates', enabled: false },
          secondary: null,
        });
    }
  }

  function paint({ headline, detail, progress, footnote, primary, secondary }) {
    els.headline.textContent = headline;
    els.detail.textContent = detail || '';
    els.footnote.textContent = footnote || '';
    if (progress == null) {
      els.progress.classList.add('hidden');
      els.progress.classList.remove('indeterminate');
    } else {
      els.progress.classList.remove('hidden');
      if (progress.indeterminate) {
        els.progress.classList.add('indeterminate');
        els.progressFill.style.width = '30%';
      } else {
        els.progress.classList.remove('indeterminate');
        els.progressFill.style.width = `${Math.min(100, Math.max(0, (progress.value || 0) * 100))}%`;
      }
    }
    setButton(els.primary, primary);
    setButton(els.secondary, secondary);
  }

  function setButton(el, spec) {
    if (!spec) {
      el.hidden = true;
      el.onclick = null;
      el.dataset.action = '';
      return;
    }
    el.hidden = false;
    el.textContent = spec.label;
    el.disabled = !spec.enabled;
    el.dataset.action = spec.action || '';
    el.classList.toggle('primary', spec.primary !== false);
    el.classList.toggle('danger', spec.variant === 'danger');
  }

  function onPrimary() {
    dispatch(els.primary.dataset.action);
  }
  function onSecondary() {
    dispatch(els.secondary.dataset.action);
  }
  function dispatch(action) {
    if (!action) return;
    bridge.dispatch(action).catch((err) => showFatal(String(err?.message ?? err)));
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      bridge.close();
    }
  }

  function releaseNotesTeaser(verdict) {
    const bytes = Number(verdict.sizeBytes ?? verdict.download?.bytes ?? 0);
    if (bytes > 0) {
      return `The macOS arm64 build is ${formatBytes(bytes)}.`;
    }
    return 'A new macOS build is available.';
  }

  function formatBytes(n) {
    const mb = n / (1024 * 1024);
    if (mb < 1) return `${(n / 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  function formatProgress(v) {
    const rec = v.receivedBytes || 0;
    const tot = v.totalBytes || 0;
    if (!tot) return 'Downloading…';
    const pct = Math.floor((rec / tot) * 100);
    return `${formatBytes(rec)} of ${formatBytes(tot)} · ${pct}%`;
  }

  function progressFraction(v) {
    const tot = v.totalBytes || 0;
    if (!tot) return { value: 0, indeterminate: true };
    return { value: (v.receivedBytes || 0) / tot, indeterminate: false };
  }

  function showFatal(message) {
    paint({
      headline: 'The updater could not start.',
      detail: message,
      footnote: '',
      progress: null,
      primary: { label: 'Close', enabled: true, action: 'close' },
      secondary: null,
    });
  }
})();
