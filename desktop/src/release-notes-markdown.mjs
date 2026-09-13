/**
 * Tiny safe-markdown renderer for GitHub release notes.
 *
 * The Check-for-Updates dialog renders the body of the GitHub release
 * the user is being offered so they can read what's changed before
 * they click *Install Update*. The body is GitHub-flavoured markdown,
 * but we only ever need the subset that actually appears in
 * Kingfisher releases:
 *
 *   - `# heading`, `## heading`, `### heading`
 *   - `- bullet` lists (also `*` and `+` for robustness)
 *   - `1. numbered` lists
 *   - paragraphs separated by blank lines
 *   - `**bold**` and `*italic*` inline emphasis
 *   - `` `inline code` `` spans
 *
 * The renderer is safe by construction: every line of input is treated
 * as plain text until a token we recognise is reached. The only DOM
 * nodes it ever creates are the ones listed above (`h1`-`h3`, `p`,
 * `ul`, `ol`, `li`, `strong`, `em`, `code`, plus `text` nodes), and
 * the only thing that ever enters a `text` node is a literal slice
 * of the input. No HTML pass-through, no `innerHTML`, no `outerHTML`,
 * no `eval`. A hostile release-notes payload cannot run JavaScript in
 * the dialog through this path.
 *
 * Kept in its own module so vitest can exercise it without booting
 * Electron; the dialog imports it and feeds the output to the
 * `release-notes` region of `update.html`.
 */

const INLINE_CODE = /`([^`]+)`/;
const INLINE_BOLD = /\*\*([^*]+)\*\*/;
const INLINE_ITALIC = /\*([^*]+)\*/;
const INLINE_BOLD_ITALIC = /\*\*\*([^*]+)\*\*\*/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED_ITEM = /^[-*+]\s+/;
const ORDERED_ITEM = /^\d+\.\s+/;

/**
 * Render a markdown source string into a DOM `DocumentFragment`. The
 * caller appends the fragment to its own container.
 *
 * @param {Document} document — the renderer's `document`. Required
 *   so the function is testable without booting Electron.
 * @param {string} source — markdown body.
 * @returns {DocumentFragment}
 */
export function renderReleaseNotes(document, source) {
  const fragment = document.createDocumentFragment();
  if (typeof source !== 'string' || !source) return fragment;
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const el = document.createElement(`h${level}`);
      appendInline(document, el, heading[2]);
      fragment.appendChild(el);
      i += 1;
      continue;
    }
    if (UNORDERED_ITEM.test(line)) {
      const ul = document.createElement('ul');
      while (i < lines.length && UNORDERED_ITEM.test(lines[i])) {
        const li = document.createElement('li');
        appendInline(document, li, lines[i].replace(UNORDERED_ITEM, ''));
        ul.appendChild(li);
        i += 1;
      }
      fragment.appendChild(ul);
      continue;
    }
    if (ORDERED_ITEM.test(line)) {
      const ol = document.createElement('ol');
      while (i < lines.length && ORDERED_ITEM.test(lines[i])) {
        const li = document.createElement('li');
        appendInline(document, li, lines[i].replace(ORDERED_ITEM, ''));
        ol.appendChild(li);
        i += 1;
      }
      fragment.appendChild(ol);
      continue;
    }
    // Plain paragraph: consume until the next blank line or block
    // boundary, then render the joined lines as one inline run so
    // hard-wrapped release-notes paragraphs read naturally.
    const buffer = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !UNORDERED_ITEM.test(lines[i]) &&
      !ORDERED_ITEM.test(lines[i])
    ) {
      buffer.push(lines[i]);
      i += 1;
    }
    const p = document.createElement('p');
    appendInline(document, p, buffer.join(' '));
    fragment.appendChild(p);
  }
  return fragment;
}

/**
 * Append an inline run of text to `parent`, applying the small set of
 * inline markdown patterns the renderer accepts. The function walks
 * the input left-to-right and emits plain text nodes for the parts
 * between recognised tokens, so the output DOM never carries any
 * literal `*` / `**` / `` ` `` characters.
 *
 * @param {Document} document
 * @param {Element} parent
 * @param {string} text
 */
export function appendInline(document, parent, text) {
  let remaining = text;
  while (remaining.length) {
    // Find the next token anywhere in the remaining text. We test
    // `***bold-italic***` first so nested wins over the single-pass
    // bold and italic patterns, and so the body is not accidentally
    // eaten by an outer pattern.
    const boldItalicMatch = remaining.match(INLINE_BOLD_ITALIC);
    const boldMatch = remaining.match(INLINE_BOLD);
    const italicMatch = remaining.match(INLINE_ITALIC);
    const codeMatch = remaining.match(INLINE_CODE);

    const candidates = [];
    if (boldItalicMatch) candidates.push({ ...boldItalicMatch, kind: 'bold-italic' });
    if (boldMatch) candidates.push({ ...boldMatch, kind: 'bold' });
    if (italicMatch) candidates.push({ ...italicMatch, kind: 'italic' });
    if (codeMatch) candidates.push({ ...codeMatch, kind: 'code' });
    if (candidates.length === 0) {
      parent.appendChild(document.createTextNode(remaining));
      return;
    }
    candidates.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      // Tie-break: bold-italic > bold > italic > code at the same
      // position so the longest delimiter wins on overlap.
      const order = { 'bold-italic': 0, bold: 1, italic: 2, code: 3 };
      return order[a.kind] - order[b.kind];
    });
    const pick = candidates[0];

    // Emit whatever plain text precedes the match.
    if (pick.index > 0) {
      parent.appendChild(document.createTextNode(remaining.slice(0, pick.index)));
    }

    if (pick.kind === 'bold-italic') {
      const strong = document.createElement('strong');
      const em = document.createElement('em');
      em.textContent = pick[1];
      strong.appendChild(em);
      parent.appendChild(strong);
    } else if (pick.kind === 'bold') {
      const el = document.createElement('strong');
      appendInline(document, el, pick[1]);
      parent.appendChild(el);
    } else if (pick.kind === 'italic') {
      const el = document.createElement('em');
      appendInline(document, el, pick[1]);
      parent.appendChild(el);
    } else {
      const el = document.createElement('code');
      el.textContent = pick[1];
      parent.appendChild(el);
    }
    remaining = remaining.slice(pick.index + pick[0].length);
  }
}
