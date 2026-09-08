/* Kingfisher landing — hero stage animation.
   Plays one short opening line and switches the Explorer source
   between Elite OTB, Recent Theory, High-Rated Online, and
   Kingfisher Starter. The values are illustrative, not real
   queries. prefers-reduced-motion is honoured. */

(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board = document.querySelector('[data-board]');
  if (!board) return;

  const stageTitle = document.querySelector('[data-stage-title]');
  const sourceTag = document.querySelector('[data-source-tag]');
  const rowEls = document.querySelectorAll('[data-explorer-rows] .hero-stage-row');
  const evalVal = document.querySelector('[data-eval]');
  const evalBar = document.querySelector('[data-eval-bar]');
  const pv = document.querySelector('[data-pv]');
  const depth = document.querySelector('[data-depth]');
  const nps = document.querySelector('[data-nps]');
  const explorerCount = document.querySelector('[data-explorer-count]');
  const explorerProvenance = document.querySelector('[data-explorer-provenance]');

  const findSq = (f, r) => board.querySelector(`.hero-sq[data-f="${f}"][data-r="${r}"]`);

  const placePiece = (f, r, kind, side) => {
    const sq = findSq(f, r);
    if (!sq) return;
    sq.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'hero-piece entering';
    span.dataset.side = side;
    span.dataset.p = kind;
    const g =
      side === 'w'
        ? { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }
        : { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
    span.textContent = g[kind];
    sq.appendChild(span);
  };

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
    for (const sq of board.querySelectorAll('.hero-sq')) sq.innerHTML = '';
    for (const [f, r, k, s] of initialPieces) placePiece(f, r, k, s);
  };

  // Illustrative frame. Not a real query result.
  const explorerFrames = [
    {
      source: 'Elite OTB',
      count: '407,538 games',
      prov: 'Lichess broadcast archive, 2020&ndash;',
      title: 'Kingfisher · Opening Explorer',
      rows: [
        { move: 'e4', pct: '41%', bar: 41, games: '165,402' },
        { move: 'Nf3', pct: '22%', bar: 22, games: '88,761' },
        { move: 'd4', pct: '19%', bar: 19, games: '76,506' },
        { move: 'c4', pct: '11%', bar: 11, games: '44,333' },
      ],
      active: 0,
    },
    {
      source: 'Recent Theory',
      count: '44,200 games',
      prov: 'Lichess broadcast archive, last 2 years',
      title: 'Kingfisher · Opening Explorer',
      rows: [
        { move: 'e4', pct: '38%', bar: 38, games: '16,796' },
        { move: 'd4', pct: '24%', bar: 24, games: '10,608' },
        { move: 'Nf3', pct: '20%', bar: 20, games: '8,840' },
        { move: 'c4', pct: '11%', bar: 11, games: '4,862' },
      ],
      active: 1,
    },
    {
      source: 'High-Rated Online',
      count: '305,169 games',
      prov: 'Lichess standard, 2400+ classical/rapid/blitz',
      title: 'Kingfisher · Opening Explorer',
      rows: [
        { move: 'e4', pct: '47%', bar: 47, games: '143,429' },
        { move: 'd4', pct: '23%', bar: 23, games: '70,189' },
        { move: 'Nf3', pct: '15%', bar: 15, games: '45,775' },
        { move: 'c4', pct: '9%', bar: 9, games: '27,465' },
      ],
      active: 0,
    },
    {
      source: 'Kingfisher Starter',
      count: '172,376 games',
      prov: 'Bundled. Lichess broadcast archive, 2023&ndash;',
      title: 'Kingfisher · Analysis',
      rows: [
        { move: 'e4', pct: '39%', bar: 39, games: '67,226' },
        { move: 'Nf3', pct: '21%', bar: 21, games: '36,199' },
        { move: 'd4', pct: '20%', bar: 20, games: '34,475' },
        { move: 'c4', pct: '13%', bar: 13, games: '22,409' },
      ],
      active: 1,
    },
  ];

  const evFrames = [
    { ev: 0.24, pv: 'e4 · e5 · Nf3 · Nc6', depth: 18, nps: '1.1 Mnps' },
    { ev: 0.32, pv: 'Nc6 · Nf3 · Bb5 · a6', depth: 22, nps: '1.4 Mnps' },
    { ev: 0.27, pv: 'Bb5 · a6 · Ba4 · Nf6', depth: 20, nps: '1.3 Mnps' },
    { ev: 0.41, pv: 'O-O · O-O · Re1 · d6', depth: 23, nps: '1.5 Mnps' },
  ];

  const renderExplorer = (frame) => {
    if (sourceTag) sourceTag.textContent = frame.source;
    if (explorerCount) explorerCount.textContent = frame.count;
    if (explorerProvenance) explorerProvenance.innerHTML = frame.prov;
    if (stageTitle) stageTitle.textContent = frame.title;
    rowEls.forEach((row, i) => {
      const data = frame.rows[i];
      if (!data) return;
      const move = row.querySelector('.hero-stage-move');
      const pct = row.querySelector('.hero-stage-pct');
      const bar = row.querySelector('[data-bar]');
      const games = row.querySelector('.hero-stage-games');
      if (move) move.textContent = data.move;
      if (pct) pct.textContent = data.pct;
      if (bar) bar.style.width = data.bar + '%';
      if (games) games.textContent = data.games;
      row.dataset.active = i === frame.active ? 'true' : 'false';
    });
  };

  const renderEngine = (ev) => {
    if (evalVal) evalVal.textContent = (ev.ev >= 0 ? '+' : '') + ev.ev.toFixed(2);
    if (evalBar) evalBar.style.width = Math.max(8, Math.min(92, 50 + ev.ev * 32)) + '%';
    if (pv) pv.textContent = ev.pv;
    if (depth) depth.textContent = String(ev.depth);
    if (nps) nps.textContent = ev.nps;
  };

  if (reduce) {
    reset();
    renderExplorer(explorerFrames[0]);
    renderEngine(evFrames[1]);
    return;
  }

  reset();
  let i = 0;
  const tick = () => {
    const frame = explorerFrames[i % explorerFrames.length];
    const ev = evFrames[i % evFrames.length];
    renderExplorer(frame);
    renderEngine(ev);
    i = (i + 1) % explorerFrames.length;
  };
  tick();
  setInterval(tick, 3200);
})();
