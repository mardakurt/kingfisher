'use client';

/**
 * Getting a published document out of the browser.
 *
 * Two destinations, one set of bytes: the print dialog (whose "Save as PDF"
 * is every operating system's own PDF writer, and better than anything this
 * application could bundle) and a downloaded `.html` file. Printing a
 * different document from the one that downloads would mean two things to
 * keep true; this prints the file.
 */

export const publishFilename = (title: string, extension = 'html'): string =>
  `${
    title
      .replace(/[^\w. -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'study'
  }.${extension}`;

/** Save the document as a file the reader can keep, open and forward. */
export function downloadHtml(html: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next task: revoking synchronously races the download in
  // some browsers, and a leaked object URL dies with the page anyway.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Print the document — which is how it becomes a PDF.
 *
 * A hidden same-origin iframe rather than a popup, for the reason the
 * position report already records: a blocked popup is indistinguishable
 * from a broken feature.
 */
export function printHtml(html: string): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const remove = () => frame.parentNode?.removeChild(frame);

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      remove();
      return;
    }
    view.addEventListener('afterprint', remove, { once: true });
    view.focus();
    view.print();
    setTimeout(remove, 60_000);
  };

  const inner = frame.contentDocument;
  if (!inner) {
    remove();
    return;
  }
  inner.open();
  inner.write(html);
  inner.close();
}
