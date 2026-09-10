/**
 * The renderer that lives inside the small Check-for-Updates window.
 *
 * The main process opens this HTML in a child BrowserWindow, then
 * subscribes the window to verdict updates. This script talks to the
 * main process exclusively through the small `kingfisher-update`
 * bridge the preload exposes; there is no `fetch`, no
 * `XMLHttpRequest`, and no Node here.
 *
 * The goal of the dialog is to *not feel* like a Kingfisher app
 * surface: a player who clicks the macOS menu item expects a small,
 * calm, native panel. Buttons follow the platform's
 * "primary on the right" convention, Escape cancels or closes, and
 * the whole window is keyboard-operable without reaching for the
 * mouse.
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
    const version = (verdict.currentVersion || '').trim() || 'Kingfisher';
    els.versionLine.textContent = `Kingfisher ${version}`;
    switch (verdict.status) {
      case 'checking':
        paint({
          headline: 'Checking for updates…',
          detail: 'Reaching the release host.',
          progress: null,
          primary: { label: 'Checking…', enabled: false },
          secondary: null,
        });
        break;
      case 'up-to-date':
        paint({
          headline: `Kingfisher ${verdict.currentVersion} is the latest available version.`,
          detail: 'You are up to date.',
          progress: null,
          primary: { label: 'Done', enabled: true, action: 'close' },
          secondary: { label: 'Check Again', enabled: true, action: 'check' },
        });
        break;
      case 'newer-available':
        paint({
          headline: `Kingfisher ${verdict.latestVersion} is available.`,
          detail: `You're running ${verdict.currentVersion}. The macOS ${verdict.download.arch} build is ${formatBytes(verdict.download.bytes)}.`,
          progress: null,
          primary: { label: 'Download Update', enabled: true, action: 'download' },
          secondary: { label: 'View Release Notes', enabled: true, action: 'release' },
        });
        break;
      case 'downloading':
        paint({
          headline: `Downloading Kingfisher ${verdict.latestVersion}…`,
          detail: formatProgress(verdict),
          progress: progressFraction(verdict),
          primary: { label: 'Cancel', enabled: true, action: 'cancel' },
          secondary: null,
        });
        break;
      case 'verifying':
        paint({
          headline: 'Verifying download…',
          detail: 'Checking the SHA-256 against the release manifest.',
          progress: { value: 1, indeterminate: false },
          primary: { label: 'Cancel', enabled: false },
          secondary: null,
        });
        break;
      case 'ready':
        paint({
          headline: `Kingfisher ${verdict.latestVersion} is ready to install.`,
          detail: 'The DMG has been verified and is safe to open.',
          progress: null,
          primary: { label: 'Open Installer', enabled: true, action: 'open' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'canceled':
        paint({
          headline: 'Download canceled.',
          detail: 'No update was installed.',
          progress: null,
          primary: { label: 'Download Again', enabled: true, action: 'download' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'failed':
        paint({
          headline: 'The downloaded update could not be verified.',
          detail: 'The file did not match the expected SHA-256. The download has been removed.',
          progress: null,
          primary: { label: 'Try Again', enabled: true, action: 'download' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      case 'unable-to-check':
        paint({
          headline: 'Unable to check for updates right now.',
          detail: verdict.reason || 'Try again later.',
          progress: null,
          primary: { label: 'Try Again', enabled: true, action: 'check' },
          secondary: { label: 'Close', enabled: true, action: 'close' },
        });
        break;
      default:
        paint({
          headline: 'Checking for updates…',
          detail: '',
          progress: null,
          primary: { label: 'Check for Updates', enabled: false },
          secondary: null,
        });
    }
  }

  function paint({ headline, detail, progress, primary, secondary }) {
    els.headline.textContent = headline;
    els.detail.textContent = detail || '';
    if (progress == null) {
      els.progress.classList.add('hidden');
    } else {
      els.progress.classList.remove('hidden');
      els.progressFill.style.width = `${Math.min(100, Math.max(0, (progress.value || 0) * 100))}%`;
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

  function formatBytes(n) {
    const mb = n / (1024 * 1024);
    if (mb < 1) return `${(n / 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(0)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  function formatProgress(v) {
    const rec = v.receivedBytes || 0;
    const tot = v.totalBytes || 0;
    if (!tot) return '';
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
      progress: null,
      primary: { label: 'Close', enabled: true, action: 'close' },
      secondary: null,
    });
  }
})();
