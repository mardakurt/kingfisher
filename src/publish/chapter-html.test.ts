import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { setQuestion } from '@/chess/tree/questions';
import { mainlinePath } from '@/chess/tree/tree';
import type { ChapterRecord, StudyRecord } from '@/persistence/types';

import { publishHtml } from './chapter-html';

const PGN =
  '[Event "?"]\n\n' +
  '1. e4 {A first word.} e5 2. Nf3 $1 (2. Bc4 {The Italian.} Nf6) 2... Nc6 3. Bb5 a6 *';

const study: StudyRecord = {
  id: 'study-1' as StudyRecord['id'],
  title: 'Open games',
  description: 'What I play after 1.e4 e5.',
  createdAt: 1,
  updatedAt: 1,
};

function chapter(overrides: Partial<ChapterRecord> = {}): ChapterRecord {
  const tree = parsePgn(PGN).games[0]!.tree;
  return {
    id: 'chapter-1' as ChapterRecord['id'],
    studyId: study.id,
    title: 'Ruy Lopez, the main road',
    order: 0,
    tree,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    ...overrides,
  };
}

const published = (chapters = [chapter()], options = {}) =>
  publishHtml({ study, chapters, options: { now: Date.UTC(2026, 8, 22), ...options } });

describe('publishHtml', () => {
  it('is one file: no script, no stylesheet, no external image — diagrams included', () => {
    const base = chapter();
    const path = mainlinePath(base.tree);
    const marked = path[3]!;
    const withDiagram: ChapterRecord = {
      ...base,
      tree: {
        ...base.tree,
        nodes: {
          ...base.tree.nodes,
          [marked]: {
            ...base.tree.nodes[marked]!,
            meta: { ...base.tree.nodes[marked]!.meta, critical: 'opening' },
          },
        },
      },
    };
    // With the diagrams on, because that is when an SVG enters the document
    // and is the case an "is it self-contained?" check has to cover.
    const html = published([withDiagram], { diagrams: true });
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    /*
      Nothing the browser would fetch. An SVG's `xmlns` is an XML namespace
      name spelled as a URL and never resolved; `src` and `href` are the
      attributes that would actually reach the network.
    */
    expect(html).not.toMatch(/(?:src|href)\s*=\s*"[^"]*:\/\//i);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('prints the study, the chapter and the date it was published', () => {
    const html = published();
    expect(html).toContain('<h1>Open games</h1>');
    expect(html).toContain('What I play after 1.e4 e5.');
    expect(html).toContain('<h2>Ruy Lopez, the main road</h2>');
    expect(html).toContain('1 chapter · published 2026-09-22');
  });

  it('prints the moves as a reader expects, with numbers where they are needed', () => {
    const html = published();
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('1.e4');
    expect(text).toContain('A first word.');
    // A number is repeated after a comment or a variation, as in a book.
    expect(text).toContain('2.Nf3');
    expect(text).toContain('2…Nc6');
    expect(text).toContain('3.Bb5');
  });

  it('nests a variation after the move it replaces, with its own comment', () => {
    const text = published().replace(/<[^>]+>/g, '');
    expect(text).toContain('(2.Bc4');
    expect(text).toContain('The Italian.');
    expect(text).toContain('Nf6)');
  });

  it('keeps the author’s glyphs and escapes their prose', () => {
    const html = published([
      chapter({
        tree: parsePgn('[Event "?"]\n\n1. e4 {A <b>bold</b> & "quoted" note.} *').games[0]!.tree,
      }),
    ]);
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;');
    expect(published()).toContain('!');
  });

  it('draws a diagram only where the author marked the position, and only when asked', () => {
    const base = chapter();
    const path = mainlinePath(base.tree);
    // Path: root, e4, e5, Nf3 — index 3 is 2.Nf3, White's second move.
    const marked = path[3]!;
    const withMark: ChapterRecord = {
      ...base,
      tree: {
        ...base.tree,
        nodes: {
          ...base.tree.nodes,
          [marked]: {
            ...base.tree.nodes[marked]!,
            meta: { ...base.tree.nodes[marked]!.meta, critical: 'opening' },
          },
        },
      },
    };
    expect(published([withMark])).not.toContain('<figure>');
    const withDiagrams = published([withMark], { diagrams: true });
    expect(withDiagrams).toContain('<figure>');
    expect(withDiagrams).toContain('<svg');
    expect(withDiagrams).toContain('After 2. Nf3');
    // One mark, one diagram.
    expect(withDiagrams.match(/<figure>/g)).toHaveLength(1);
  });

  it('says where it came from and what an engine figure in it means', () => {
    expect(published()).toContain('Published from Kingfisher');
    expect(published()).toContain('a measurement taken at the moment it was');
  });

  it('publishes several chapters in order, with their tags', () => {
    const html = published([
      chapter({ title: 'First', tags: ['najdorf'] }),
      chapter({ id: 'chapter-2' as ChapterRecord['id'], title: 'Second', order: 1 }),
    ]);
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html).toContain('Tags: najdorf');
    expect(html).toContain('2 chapters');
  });

  it('prints a worksheet: the questions as positions, the game withheld, solutions last', () => {
    const base = chapter();
    const path = mainlinePath(base.tree);
    let tree = setQuestion(base.tree, path[3]!, 'Develop with a threat.', {
      points: 2,
      seconds: 30,
    });
    tree = setQuestion(tree, path[5]!, '');
    const html = published(
      [
        { ...base, tree },
        chapter({ id: 'chapter-2' as ChapterRecord['id'], title: 'No questions' }),
      ],
      { worksheet: true },
    );
    expect(html).toContain('Worksheet · 2 questions');
    expect(html).toContain(
      '<strong>1.</strong> White to play. Develop with a threat. <em>(2 points · 30 s)</em>',
    );
    // No points and no clock set: none printed.
    expect(html).toContain('<strong>2.</strong> White to play. Find the move.</figcaption>');
    expect(html.match(/<svg/g)).toHaveLength(2);
    // The chapter's moves and comments are not printed before the solutions.
    const [questions, solutions] = html.split('<section class="solutions">');
    expect(questions).not.toContain('A first word.');
    expect(questions).not.toContain('No questions');
    // Nf3 is marked $1 and its sibling Bc4 is not: one answer; Bb5 is the other.
    expect(solutions).toContain('<li value="1"><span class="m">2. Nf3</span>');
    expect(solutions).toContain('<li value="2"><span class="m">3. Bb5</span>');
    expect(html).not.toMatch(/<script|<link|<img/);
  });
});
