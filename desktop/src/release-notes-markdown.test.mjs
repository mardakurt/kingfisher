/**
 * Tests for the safe markdown renderer used by the Check-for-Updates
 * dialog to display the GitHub release-notes body.
 *
 * Uses a minimal DOM polyfill (jsdom-like) so the renderer can run in
 * vitest's node environment. We deliberately do NOT pull in jsdom as
 * a dependency: this is the only place in the codebase that needs a
 * DOM, and the renderer is small enough to drive against a tiny
 * `document`/`Element` polyfill that captures what `renderReleaseNotes`
 * and `appendInline` actually use.
 */
import { describe, expect, it } from 'vitest';

import { renderReleaseNotes, appendInline } from './release-notes-markdown.mjs';

/* --------------------------------------------------------------------------
 * Minimal DOM polyfill.
 *
 * `renderReleaseNotes` only ever creates elements via `createElement`,
 * `createTextNode`, `createDocumentFragment`, sets `textContent`, and
 * reads `tagName` / `childNodes`. The polyfill below supports exactly
 * that surface. It is intentionally tiny: importing jsdom for one
 * renderer would be the wrong trade.
 * ------------------------------------------------------------------------ */

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.childNodes = [];
    this.parentNode = null;
    this._text = '';
  }
  get textContent() {
    if (this._text) return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this._text = String(value);
    this.childNodes = [];
  }
  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    for (const n of nodes) this.appendChild(n);
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super(tag);
    this.isText = false;
  }
}

class FakeTextNode extends FakeNode {
  constructor(value) {
    super('#text');
    this._text = String(value);
    this.isText = true;
  }
}

const fakeDocument = {
  createElement(tag) {
    return new FakeElement(tag);
  },
  createTextNode(value) {
    return new FakeTextNode(value);
  },
  createDocumentFragment() {
    return new FakeElement('#document-fragment');
  },
};

/* --------------------------------------------------------------------------
 * Helpers.
 * ------------------------------------------------------------------------ */

function render(source) {
  return renderReleaseNotes(fakeDocument, source);
}

function collect(root) {
  // Flatten the rendered fragment into a list of `{ kind, tag, text }`
  // entries. Elements whose only children are text nodes (or whose
  // textContent was set directly) get the joined text on the element
  // itself and no separate text entries — that is what the assertions
  // care about. Elements with mixed children keep their inner
  // structure so inline runs of bold/italic show up.
  const out = [];
  function walk(node, depth) {
    if (node.isText) {
      out.push({ kind: 'text', value: node._text, depth });
      return;
    }
    const allText = node.childNodes.length > 0 && node.childNodes.every((c) => c.isText);
    if (allText) {
      out.push({
        kind: 'element',
        tag: node.tagName.toLowerCase(),
        depth,
        text: node.childNodes.map((c) => c._text).join(''),
      });
      return;
    }
    if (node.childNodes.length === 0 && node._text) {
      out.push({
        kind: 'element',
        tag: node.tagName.toLowerCase(),
        depth,
        text: node._text,
      });
      return;
    }
    out.push({
      kind: 'element',
      tag: node.tagName.toLowerCase(),
      depth,
      text: null,
    });
    for (const child of node.childNodes) walk(child, depth + 1);
  }
  for (const child of root.childNodes) walk(child, 0);
  return out;
}

/* --------------------------------------------------------------------------
 * Tests.
 * ------------------------------------------------------------------------ */

describe('renderReleaseNotes', () => {
  it('returns an empty fragment for empty input', () => {
    const frag = render('');
    expect(frag.childNodes.length).toBe(0);
  });

  it('returns an empty fragment for non-string input', () => {
    const frag = render(null);
    expect(frag.childNodes.length).toBe(0);
    const frag2 = render(undefined);
    expect(frag2.childNodes.length).toBe(0);
    const frag3 = render(42);
    expect(frag3.childNodes.length).toBe(0);
  });

  it('renders a heading, a paragraph, and a list', () => {
    const source = [
      '# Kingfisher 1.1.1',
      '',
      'A maintenance release on 1.1.0.',
      '',
      'What changed:',
      '',
      '- the evaluation bar keeps its verdict when the board is flipped',
      '- a surname finds the player you mean',
    ].join('\n');
    const out = collect(render(source));
    expect(out).toEqual([
      { kind: 'element', tag: 'h1', depth: 0, text: 'Kingfisher 1.1.1' },
      { kind: 'element', tag: 'p', depth: 0, text: 'A maintenance release on 1.1.0.' },
      { kind: 'element', tag: 'p', depth: 0, text: 'What changed:' },
      { kind: 'element', tag: 'ul', depth: 0, text: null },
      {
        kind: 'element',
        tag: 'li',
        depth: 1,
        text: 'the evaluation bar keeps its verdict when the board is flipped',
      },
      { kind: 'element', tag: 'li', depth: 1, text: 'a surname finds the player you mean' },
    ]);
  });

  it('renders **bold** and *italic* emphasis inline', () => {
    const out = collect(render('A **bold** claim and an *italic* note.'));
    // The paragraph contains a strong and an em with text nodes around them.
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: null },
      { kind: 'text', value: 'A ', depth: 1 },
      { kind: 'element', tag: 'strong', depth: 1, text: 'bold' },
      { kind: 'text', value: ' claim and an ', depth: 1 },
      { kind: 'element', tag: 'em', depth: 1, text: 'italic' },
      { kind: 'text', value: ' note.', depth: 1 },
    ]);
  });

  it('renders inline code with backticks', () => {
    const out = collect(render('Use `npm install` to update.'));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: null },
      { kind: 'text', value: 'Use ', depth: 1 },
      { kind: 'element', tag: 'code', depth: 1, text: 'npm install' },
      { kind: 'text', value: ' to update.', depth: 1 },
    ]);
  });

  it('renders ordered lists', () => {
    const source = ['Steps:', '1. First', '2. Second', '3. Third'].join('\n');
    const out = collect(render(source));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: 'Steps:' },
      { kind: 'element', tag: 'ol', depth: 0, text: null },
      { kind: 'element', tag: 'li', depth: 1, text: 'First' },
      { kind: 'element', tag: 'li', depth: 1, text: 'Second' },
      { kind: 'element', tag: 'li', depth: 1, text: 'Third' },
    ]);
  });

  it('joins hard-wrapped paragraph lines with a space', () => {
    const source = ['first line', 'second line', 'third line'].join('\n');
    const out = collect(render(source));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: 'first line second line third line' },
    ]);
  });

  it('never interprets HTML in the source', () => {
    // The hostile payload tries to inject a <script> tag and an inline
    // event handler. The renderer treats both as plain text.
    const source = '<script>alert(1)</script> and <img onerror=alert(1) src=x>';
    const frag = render(source);
    const html = frag.childNodes.map((c) => c.textContent).join('');
    expect(html).toBe('<script>alert(1)</script> and <img onerror=alert(1) src=x>');
    // No element of name 'script' or 'img' was ever created.
    const tags = new Set();
    function walk(n) {
      if (n.tagName && n.tagName !== '#text') tags.add(n.tagName.toLowerCase());
      for (const c of n.childNodes) walk(c);
    }
    walk(frag);
    expect(tags.has('script')).toBe(false);
    expect(tags.has('img')).toBe(false);
  });

  it('handles a stray asterisk by leaving it as literal text', () => {
    // A single `*` with no closing pair must not start an unterminated
    // italic run that swallows the rest of the line.
    const out = collect(render('A sentence with a * stray asterisk mid-word.'));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: 'A sentence with a * stray asterisk mid-word.' },
    ]);
  });

  it('renders nested emphasis: ***bold-italic***', () => {
    // GitHub renders ***text*** as bold+italic. We do too.
    const out = collect(render('A ***bold-italic*** span.'));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: null },
      { kind: 'text', value: 'A ', depth: 1 },
      { kind: 'element', tag: 'strong', depth: 1, text: null },
      { kind: 'element', tag: 'em', depth: 2, text: 'bold-italic' },
      { kind: 'text', value: ' span.', depth: 1 },
    ]);
  });

  it('does not re-enter bold/italic inside an inline code span', () => {
    // `**foo**` inside backticks must render as literal `**foo**`.
    const out = collect(render('A `**not bold**` snippet.'));
    expect(out).toEqual([
      { kind: 'element', tag: 'p', depth: 0, text: null },
      { kind: 'text', value: 'A ', depth: 1 },
      { kind: 'element', tag: 'code', depth: 1, text: '**not bold**' },
      { kind: 'text', value: ' snippet.', depth: 1 },
    ]);
  });
});

describe('appendInline', () => {
  it('emits a single text node when the input has no tokens', () => {
    const parent = new FakeElement('p');
    appendInline(fakeDocument, parent, 'hello world');
    expect(parent.childNodes).toHaveLength(1);
    expect(parent.childNodes[0]._text).toBe('hello world');
  });

  it('emits bold and italic siblings without leaking asterisks', () => {
    const parent = new FakeElement('p');
    appendInline(fakeDocument, parent, 'a **b** c *d* e');
    const text = parent.childNodes.map((c) => c.textContent).join('|');
    expect(text).toBe('a |b| c |d| e');
  });
});
