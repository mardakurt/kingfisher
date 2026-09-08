/* Kingfisher landing page — hero board animation.
   Plays a small opening line, advances evaluation, swaps a piece,
   respects prefers-reduced-motion. No framework; no dependencies. */

(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board = document.querySelector('[data-board]');
  if (!board) return;

  const evValue = document.querySelector('[data-ev-value]');
  const evBar = document.querySelector('[data-ev-bar]');
  const pvValue = document.querySelector('[data-pv-value]');
  const depthValue = document.querySelector('[data-depth-value]');
  const npsValue = document.querySelector('[data-nps-value]');
  if (!evValue || !evBar || !pvValue || !depthValue || !npsValue) return;

  const findSq = (file, rank) => board.querySelector(`.sq[data-f="${file}"][data-r="${rank}"]`);

  const placePiece = (file, rank, kind, side) => {
    const sq = findSq(file, rank);
    if (!sq) return null;
    sq.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'piece entering';
    span.dataset.p = kind;
    span.dataset.side = side;
    span.textContent =
      side === 'w'
        ? { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }[kind]
        : { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }[kind];
    sq.appendChild(span);
    return span;
  };

  const removePiece = (file, rank) => {
    const sq = findSq(file, rank);
    if (sq) sq.innerHTML = '';
  };

  // Each frame: [from, to, kind, side, ev, pv[], depth, nps]
  // Coordinates use a–h and 1–8. from === to means just a board reset.
  const frames = [
    {
      mv: '1. e4 e5',
      apply: () => {
        placePiece('e', '2', 'p', 'w');
        placePiece('e', '7', 'p', 'b');
      },
      ev: 0.24,
      pv: ['e4', 'e5', 'Nf3', 'Nc6'],
      depth: 18,
      nps: '1.1 Mnps',
    },
    {
      mv: '1... Nc6',
      apply: () => placePiece('b', '8', 'n', 'b'),
      ev: 0.22,
      pv: ['Nf3', 'Nc6', 'Bb5', 'a6'],
      depth: 19,
      nps: '1.2 Mnps',
    },
    {
      mv: '2. Nf3 Nf6',
      apply: () => {
        placePiece('g', '1', 'n', 'w');
        placePiece('g', '8', 'n', 'b');
      },
      ev: 0.27,
      pv: ['Nf3', 'Nf6', 'Nc3', 'Bb4'],
      depth: 20,
      nps: '1.3 Mnps',
    },
    {
      mv: '3. Bb5 a6',
      apply: () => {
        placePiece('f', '1', 'b', 'w');
        placePiece('a', '7', 'p', 'b');
      },
      ev: 0.34,
      pv: ['Bb5', 'a6', 'Ba4', 'Nf6'],
      depth: 21,
      nps: '1.35 Mnps',
    },
    {
      mv: '3... Bb4',
      apply: () => placePiece('f', '8', 'b', 'b'),
      ev: 0.41,
      pv: ['c3', 'Bb4', 'O-O', 'O-O'],
      depth: 22,
      nps: '1.4 Mnps',
    },
    {
      mv: '4. O-O O-O',
      apply: () => {
        placePiece('e', '1', 'k', 'w');
        placePiece('h', '1', 'r', 'w');
        placePiece('a', '1', 'r', 'w');
        placePiece('e', '8', 'k', 'b');
      },
      ev: 0.32,
      pv: ['O-O', 'O-O', 'Re1', 'd6'],
      depth: 22,
      nps: '1.4 Mnps',
    },
    {
      mv: '4... d6',
      apply: () => placePiece('d', '7', 'p', 'b'),
      ev: 0.36,
      pv: ['Re1', 'd6', 'c3', 'Bd7'],
      depth: 23,
      nps: '1.5 Mnps',
    },
    {
      mv: '5. c3 Bd7',
      apply: () => {
        placePiece('c', '2', 'p', 'w');
        placePiece('c', '8', 'b', 'b');
      },
      ev: 0.3,
      pv: ['c3', 'Bd7', 'd4', 'Bb6'],
      depth: 23,
      nps: '1.45 Mnps',
    },
  ];

  const initialPieces = [
    ['a', '1', 'r', 'w'],
    ['e', '1', 'k', 'w'],
    ['h', '1', 'r', 'w'],
    ['f', '1', 'b', 'w'],
    ['c', '1', 'b', 'w'],
    ['g', '1', 'n', 'w'],
    ['b', '1', 'n', 'w'],
    ['d', '1', 'q', 'w'],
    ['a', '2', 'p', 'w'],
    ['b', '2', 'p', 'w'],
    ['c', '2', 'p', 'w'],
    ['d', '2', 'p', 'w'],
    ['e', '2', 'p', 'w'],
    ['f', '2', 'p', 'w'],
    ['g', '2', 'p', 'w'],
    ['h', '2', 'p', 'w'],
    ['a', '7', 'p', 'b'],
    ['c', '7', 'p', 'b'],
    ['d', '7', 'p', 'b'],
    ['e', '7', 'p', 'b'],
    ['f', '7', 'p', 'b'],
    ['g', '7', 'p', 'b'],
    ['h', '7', 'p', 'b'],
    ['a', '8', 'r', 'b'],
    ['b', '8', 'n', 'b'],
    ['c', '8', 'b', 'b'],
    ['d', '8', 'q', 'b'],
    ['e', '8', 'k', 'b'],
    ['f', '8', 'b', 'b'],
    ['g', '8', 'n', 'b'],
    ['h', '8', 'r', 'b'],
  ];

  const reset = () => {
    // Wipe, then place initial pieces (Ruy Lopez starting position).
    for (const sq of board.querySelectorAll('.sq')) sq.innerHTML = '';
    for (const [f, r, k, s] of initialPieces) placePiece(f, r, k, s);
  };

  const renderFrame = (frame) => {
    frame.apply();
    evValue.textContent = (frame.ev >= 0 ? '+' : '') + frame.ev.toFixed(2);
    const pct = Math.max(8, Math.min(92, 50 + frame.ev * 32));
    evBar.style.width = pct + '%';
    pvValue.innerHTML = frame.pv
      .map((m, i) =>
        i % 2 === 0
          ? `<span class="pv-move">${m}</span>`
          : `<span class="pv-move">${m}</span>`,
      )
      .join('<span class="pv-sep">·</span>');
    depthValue.textContent = String(frame.depth);
    npsValue.textContent = frame.nps;
  };

  if (reduce) {
    // No animation. Show the final position only.
    reset();
    renderFrame(frames[frames.length - 1]);
    return;
  }

  reset();
  let i = 0;
  const tick = () => {
    renderFrame(frames[i % frames.length]);
    i = (i + 1) % frames.length;
  };
  tick();
  setInterval(tick, 2200);
})();
