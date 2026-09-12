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
    showFatal();
    els.primary.disabled = true;
    return;
  }

  let receivedVerdict = false;
  bridge.onVerdict((verdict) => {
    receivedVerdict = true;
    render(verdict);
  });
  bridge
    .getInitial()
    .then((verdict) => {
      if (!receivedVerdict) render(verdict);
    })
    .catch(() => showFatal());

  els.primary.addEventListener('click', onPrimary);
  els.secondary.addEventListener('click', onSecondary);
  document.addEventListener('keydown', onKey);

  let currentVersion = '';
  function render(verdict) {
    if (!verdict) return;
    currentVersion = verdict.currentVersion || currentVersion;
    const current = String(currentVersion).trim();
    const latest = (verdict.latestVersion || '').trim();
    els.versionLine.textContent = `Kingfisher ${current}`.trim();
    switch (verdict.status) {
      case 'idle':
        paint({
          headline: 'Check for updates',
          detail:
            'Check whether a newer version is available. Updates are checked only when you ask.',
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
          headline: 'You’re up to date',
          detail: 'You have the latest version available on this release channel.',
          progress: null,
          footnote: '',
          primary: { label: 'Close', enabled: true, action: 'close' },
          secondary: null,
        });
        break;
      case 'available':
        paint({
          headline: `Kingfisher ${latest || 'a new version'} is available`,
          detail: `You’re running ${current}. ${releaseNotesTeaser(verdict)}`,
          progress: null,
          footnote: 'Kingfisher will close and reopen automatically.',
          primary: { label: 'Install Update', enabled: true, action: 'install' },
          secondary: { label: 'Later', enabled: true, action: 'close' },
        });
        break;
      case 'downloading':
        paint({
          headline: `Downloading Kingfisher ${latest || 'the update'}…`,
          detail: formatProgress(verdict),
          progress: progressFraction(verdict),
          footnote: 'Verifying the download when this finishes.',
          primary: { label: 'Cancel', enabled: true, action: 'cancel', primary: false },
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
          primary: { label: 'Cancel', enabled: false, primary: false },
          secondary: null,
        });
        break;
      case 'ready':
        // Reached only if the user opened the dialog after a
        // previous download completed but before Install Update
        // was clicked. The chain is normally automatic.
        paint({
          headline: `Kingfisher ${latest || 'the update'} is ready to install`,
          detail: 'The update has been verified.',
          progress: null,
          footnote: 'Kingfisher will close and reopen automatically.',
          primary: { label: 'Install Update', enabled: true, action: 'install' },
          secondary: { label: 'Later', enabled: true, action: 'close' },
        });
        break;
      case 'waiting-for-save':
        paint({
          headline: 'Finishing saving your work…',
          detail: 'Your latest edits must finish saving before Kingfisher can restart.',
          progress: { value: 0, indeterminate: true },
          footnote: 'Keep Kingfisher open while your work is saved.',
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
          headline: 'Download cancelled',
          detail: `Kingfisher ${current} is still installed. You can try again any time.`,
          progress: null,
          footnote: '',
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'failed':
        paint({
          headline: /sav|unsaved/i.test(verdict.reason || '')
            ? 'Your work could not be confirmed saved'
            : 'The update could not be installed',
          detail: failureDetail(verdict.reason),
          progress: null,
          footnote: 'Your installed Kingfisher is unchanged.',
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'preview':
        paint({
          headline: 'You’re using a preview build',
          detail: `Previews are replaced by downloading the next one${
            verdict.build ? ` — you have build ${verdict.build}` : ''
          }.`,
          progress: null,
          footnote: 'Nothing was requested or changed.',
          primary: { label: 'Open Download Page', enabled: true, action: 'fallback' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'unable-to-check':
        paint({
          headline: 'Unable to check for updates',
          detail: 'The update service is unavailable. Check your connection and try again later.',
          progress: null,
          footnote: 'Your installed Kingfisher is unchanged.',
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
    const focused = document.activeElement;
    els.headline.textContent = headline;
    els.detail.textContent = detail || '';
    els.footnote.textContent = footnote || '';
    if (progress == null) {
      els.progress.removeAttribute('aria-valuenow');
      els.progress.classList.add('hidden');
      els.progress.classList.remove('indeterminate');
    } else {
      els.progress.classList.remove('hidden');
      if (progress.indeterminate) {
        els.progress.removeAttribute('aria-valuenow');
        els.progress.classList.add('indeterminate');
        els.progressFill.style.width = '30%';
      } else {
        els.progress.classList.remove('indeterminate');
        const percent = Math.min(100, Math.max(0, (progress.value || 0) * 100));
        els.progressFill.style.width = `${percent}%`;
        els.progress.setAttribute('aria-valuenow', String(Math.round(percent)));
      }
    }
    setButton(els.primary, primary);
    setButton(els.secondary, secondary);
    if (
      focused === document.body ||
      focused?.disabled ||
      focused?.hidden ||
      focused?.matches('.window')
    ) {
      (
        document.querySelector('button.primary:not(:disabled):not([hidden])') ||
        document.querySelector('button:not(:disabled):not([hidden])') ||
        document.querySelector('.window')
      ).focus();
    }
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
    el.classList.toggle('primary', el === els.primary && spec.primary !== false);
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
    if (action === 'close') {
      bridge.close();
      return;
    }
    bridge.dispatch(action).catch(() => showFatal());
  }
  function onKey(event) {
    if (
      event.key === 'Enter' &&
      !document.activeElement?.matches('button') &&
      !els.primary.disabled
    ) {
      event.preventDefault();
      onPrimary();
    }
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
    return 'The download starts when you choose Install Update.';
  }

  function formatBytes(n) {
    const mb = n / (1024 * 1024);
    if (n < 1024) return `${n} B`;
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

  function failureDetail(reason) {
    // Never render transport errors, local paths, manifest names or stack traces.
    if (/sav|unsaved/i.test(reason || ''))
      return 'Finish saving your work, then try the update again. Kingfisher has not restarted.';
    return 'The download or verification did not finish. Try again later.';
  }

  function showFatal() {
    paint({
      headline: 'The updater could not start',
      detail: 'Close this window and try Check for Updates again.',
      footnote: '',
      progress: null,
      primary: { label: 'Close', enabled: true, action: 'close' },
      secondary: null,
    });
  }
})();
