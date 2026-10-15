'use strict';

const VALUES = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
const MAX_CODE = 8;

for (const value of VALUES.slice(1)) new Image().src = `images/${value}.png`;


const SOUNDS = {
  click: 'sounds/click.m4a',
  coin: 'sounds/coin.m4a',
  banknote: 'sounds/banknote.m4a',
};
const BANKNOTE_MIN_CODE = 6;


const LEVELS = [
  { cols: 6, rows: 9, table: [1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 5] },
  { cols: 6, rows: 9, table: [1, 2, 2, 3, 4, 4, 5] },
  { cols: 5, rows: 8, table: [1, 2, 3, 4, 5] },
];

const MERGE_DURATION = 180;
const HINT_DURATION = 3300;

const GAME_OVER_DELAY = 700;

const LEVEL_NAMES = ['Лёгкий', 'Средний', 'Сложный'];

const BOARD_MARGIN_Y = 8;
const MAX_BOARD_WIDTH = 480;

const COUNTER_DIGITS = 6;

const CHAIN_TILT = 0.8;

const HIT_TOLERANCE = 0.42;

function exchangeRate(code) {
  if (code >= MAX_CODE) return Infinity;
  return code % 2 === 0 ? 5 : 2;
}

const boardEl = document.getElementById('board');
const hudEl = document.querySelector('.hud');
const bottomBarEl = document.querySelector('.bottombar');
const appEl = document.querySelector('.app');
const coinsEl = document.getElementById('coins');
const chainSvg = document.getElementById('chain');
const chainLine = document.getElementById('chainLine');
const scoreCounter = createCounter(document.getElementById('score'), COUNTER_DIGITS);
const levelSelect = document.getElementById('level');
const restartBtn = document.getElementById('restart');
const bestCounter = createCounter(document.getElementById('best'), COUNTER_DIGITS);
const overlayEl = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const newRecordEl = document.getElementById('newRecord');
const playAgainBtn = document.getElementById('playAgain');
const undoBtn = document.getElementById('undo');
const hintBtn = document.getElementById('hint');
const redoBtn = document.getElementById('redo');
const undoLastBtn = document.getElementById('undoLast');
const startScreenEl = document.getElementById('startScreen');
const startGameBtn = document.getElementById('startGame');
const levelPickerBtns = [...document.querySelectorAll('.level-picker button')];

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const soundData = Object.fromEntries(Object.entries(SOUNDS).map(([name, src]) => [
  name,
  fetch(src).then((response) => {
    if (!response.ok) throw new Error(response.statusText);
    return response.arrayBuffer();
  }),
]));
const soundBuffers = {};
const soundFailed = {};
let audioCtx = null;
let audioWasRunning = false;

function createAudioContext() {
  if (audioCtx) audioCtx.close().catch(() => {});
  audioWasRunning = false;
  const ctx = new AudioContextClass();
  ctx.addEventListener('statechange', () => {
    if (ctx === audioCtx && ctx.state === 'running') audioWasRunning = true;
  });
  audioCtx = ctx;
}

function decodeSounds() {
  for (const [name, data] of Object.entries(soundData)) {
    data
      .then((buffer) => audioCtx.decodeAudioData(buffer))
      .then((decoded) => {
        soundBuffers[name] = decoded;
      })
      .catch(() => {
        soundFailed[name] = true;
      });
  }
}

function unlockAudio() {
  if (!AudioContextClass) return;
  if (!audioCtx) {
    createAudioContext();
    decodeSounds();
  } else if (audioCtx.state !== 'running' && audioWasRunning) {
    createAudioContext();
  }
  if (audioCtx.state === 'running') {
    audioWasRunning = true;
    return;
  }
  const silence = audioCtx.createBufferSource();
  silence.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
  silence.connect(audioCtx.destination);
  silence.start(0);
  audioCtx.resume().catch(() => {});
}

function playSound(name) {
  const buffer = soundBuffers[name];
  if (audioCtx && buffer) {
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } else if (!AudioContextClass || soundFailed[name]) {
    new Audio(SOUNDS[name]).play().catch(() => {});
  }
}

for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
  document.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

function createCounter(el, digits) {
  const drums = [];
  for (let i = 0; i < digits; i++) {
    const drum = document.createElement('span');
    drum.className = 'drum';
    const strip = document.createElement('span');
    strip.className = 'drum__strip';
    for (let n = 0; n < 20; n++) {
      const d = document.createElement('span');
      d.textContent = n % 10;
      strip.append(d);
    }
    drum.append(strip);

    const state = { drum, strip, pos: 0, shown: 0 };

    strip.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'transform' && state.shown >= 10) jumpTo(state, state.pos);
    });
    drums.push(state);
  }
  const unit = document.createElement('span');
  unit.className = 'register__unit';
  unit.textContent = '¥';
  el.replaceChildren(...drums.map((d) => d.drum), unit);
  for (const child of el.children) child.setAttribute('aria-hidden', 'true');
  el.setAttribute('role', 'img');

  function jumpTo(state, digit) {
    state.strip.style.transition = 'none';
    state.strip.style.setProperty('--pos', digit);
    state.shown = digit;
    void state.strip.offsetHeight;
    state.strip.style.transition = '';
  }

  function roll(state, digit, order) {
    if (state.shown !== state.pos) jumpTo(state, state.pos);
    const steps = (digit - state.pos + 10) % 10;
    if (steps === 0) return;

    state.strip.style.transition =
      `transform ${0.25 + 0.05 * steps}s cubic-bezier(0.3, 0.1, 0.25, 1) ${order * 0.05}s`;
    state.shown = state.pos + steps;
    state.pos = digit;
    state.strip.style.setProperty('--pos', state.shown);
  }

  return {
    set(value, { animate = true } = {}) {
      const text = String(Math.max(0, Math.floor(value)));
      const padded = text.padStart(digits, '0').slice(-digits);
      const leading = digits - text.length;
      drums.forEach((state, i) => {
        state.drum.classList.toggle('is-lead', i < leading);
        const digit = Number(padded[i]);
        if (animate) roll(state, digit, digits - 1 - i);
        else jumpTo(state, (state.pos = digit));
      });
      el.setAttribute('aria-label', formatYen(value));
    },
  };
}

let level;
let cols;
let rows;

let grid = [];

let chain = [];
let activePointer = null;
let score = 0;
let isOver = false;
let gameOverTimer = 0;

let isMerging = false;
let mergeTimer = 0;

let hintEl = null;
let hintTimer = 0;
let undoStack = [];

let redoStack = [];

const tiltedEls = new Set();
let tiltFrame = 0;
let pendingTiltEvent = null;

function randomCoin() {
  const table = LEVELS[level].table;
  return table[Math.floor(Math.random() * table.length)];
}

function createCoinEl(code, r, c) {
  const el = document.createElement('div');
  el.className = 'coin';
  el.dataset.code = code;
  el.style.setProperty('--c', c);
  el.style.setProperty('--r', r);
  const face = document.createElement('div');
  face.className = 'coin__face';
  const tex = document.createElement('div');
  tex.className = 'coin__tex';
  face.append(tex);
  el.append(face);
  coinsEl.append(el);
  return el;
}

function moveCoinTo(el, r, fromR) {
  const dist = Math.abs(r - fromR);
  el.style.setProperty('--fall', `${0.12 + 0.045 * dist}s`);
  el.style.setProperty('--r', r);
}

function dropNewCoins(spawns) {
  for (const s of spawns) {
    s.el = createCoinEl(s.code, s.fromR, s.c);
    grid[s.r][s.c] = { code: s.code, el: s.el };
  }

  void coinsEl.offsetHeight;
  for (const s of spawns) moveCoinTo(s.el, s.r, s.fromR);
}

const LEVEL_KEY = 'exchange-puzzle:level';

function loadLevel() {
  try {
    const value = Number(localStorage.getItem(LEVEL_KEY));
    return LEVELS[value] ? value : 0;
  } catch {
    return 0;
  }
}

function saveLevel(value) {
  try {
    localStorage.setItem(LEVEL_KEY, String(value));
  } catch {
  }
}

function pickLevel(value) {
  for (const btn of levelPickerBtns) {
    btn.setAttribute('aria-checked', String(Number(btn.dataset.level) === value));
  }
}

function startGame() {
  const picked = levelPickerBtns.find((btn) => btn.getAttribute('aria-checked') === 'true');
  levelSelect.value = picked ? picked.dataset.level : '0';
  saveLevel(Number(levelSelect.value));
  startScreenEl.hidden = true;
  newGame();
}

function bestKey() {
  return `exchange-puzzle:best:${level}`;
}

function loadBest() {
  try {
    return Number(localStorage.getItem(bestKey())) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(bestKey(), String(value));
  } catch {
  }
}

function formatYen(value) {
  return `${value.toLocaleString('ru-RU')} ¥`;
}

function findPath(codes, r, c, code, left, visited, path) {
  path.push([r, c]);
  if (left === 1) return true;
  visited[r][c] = true;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (visited[nr][nc] || codes[nr][nc] !== code) continue;
    if (findPath(codes, nr, nc, code, left - 1, visited, path)) {
      visited[r][c] = false;
      return true;
    }
  }
  visited[r][c] = false;
  path.pop();
  return false;
}

function findMove(codes, shuffled = false) {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push([r, c]);
  }
  if (shuffled) {
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
  }
  for (const [r, c] of cells) {
    const code = codes[r][c];
    const need = exchangeRate(code);
    if (need === Infinity) continue;
    const path = [];
    if (findPath(codes, r, c, code, need, visited, path)) return path;
  }
  return null;
}

function hasMoves(codes) {
  return findMove(codes) !== null;
}

function showHint() {
  if (isMerging || isOver || !startScreenEl.hidden) return;
  clearHint();
  const path = findMove(currentCodes(), true);
  if (!path) return;
  const [r, c] = path[path.length - 1];
  hintEl = grid[r][c].el;
  hintEl.classList.add('is-hint');
  hintTimer = setTimeout(clearHint, HINT_DURATION);
}

function clearHint() {
  clearTimeout(hintTimer);
  hintEl?.classList.remove('is-hint');
  hintEl = null;
}

function currentCodes() {
  return grid.map((row) => row.map((cell) => cell.code));
}

function newGame() {
  clearHint();
  clearTimeout(gameOverTimer);
  clearTimeout(mergeTimer);
  isOver = false;
  isMerging = false;
  overlayEl.hidden = true;
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();

  level = Number(levelSelect.value) || 0;
  ({ cols, rows } = LEVELS[level]);

  document.documentElement.style.setProperty('--cols', cols);
  document.documentElement.style.setProperty('--rows', rows);
  fitBoard();
  chainSvg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);

  coinsEl.replaceChildren();
  clearChain();

  let codes;
  do {
    codes = Array.from({ length: rows }, () => Array.from({ length: cols }, randomCoin));
  } while (!hasMoves(codes));

  grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const spawns = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      spawns.push({ code: codes[r][c], r, c, fromR: r - rows });
    }
  }
  dropNewCoins(spawns);
  updateScore();
  bestCounter.set(loadBest(), { animate: false });
}

function fitBoard() {
  const app = getComputedStyle(appEl);
  const frame = getComputedStyle(boardEl.parentElement);
  const px = (value) => parseFloat(value) || 0;
  const gutterX = px(app.paddingLeft) + px(app.paddingRight)
    + px(frame.paddingLeft) + px(frame.paddingRight);
  const gutterY = px(app.paddingTop) + px(app.paddingBottom) + 2 * px(app.rowGap)
    + px(frame.paddingTop) + px(frame.paddingBottom) + bottomBarEl.offsetHeight + BOARD_MARGIN_Y;

  for (let pass = 0; pass < 2; pass++) {
    const size = Math.floor(Math.min(
      (window.innerWidth - gutterX) / cols,
      (window.innerHeight - gutterY - hudEl.offsetHeight) / rows,
      MAX_BOARD_WIDTH / cols,
    ));
    document.documentElement.style.setProperty('--cell-size', `${Math.max(size, 1)}px`);
  }
  alignBoardToPixels();
}

function alignBoardToPixels() {
  boardEl.style.removeProperty('--nudge-x');
  boardEl.style.removeProperty('--nudge-y');
  const dpr = window.devicePixelRatio || 1;
  const { left, top } = boardEl.getBoundingClientRect();
  const nudge = (v) => (Math.round(v * dpr) - v * dpr) / dpr;
  boardEl.style.setProperty('--nudge-x', `${nudge(left)}px`);
  boardEl.style.setProperty('--nudge-y', `${nudge(top)}px`);
}

function updateScore() {
  score = 0;
  for (const row of grid) for (const cell of row) if (cell) score += VALUES[cell.code];
  scoreCounter.set(score);
}

function checkGameOver() {
  if (hasMoves(currentCodes())) return;
  isOver = true;
  gameOverTimer = setTimeout(showGameOver, GAME_OVER_DELAY);
}

function showGameOver() {
  const best = loadBest();
  const isRecord = score > best;
  if (isRecord) saveBest(score);

  finalScoreEl.textContent = formatYen(score);
  finalBestEl.textContent = `Рекорд (${LEVEL_NAMES[level]}): ${formatYen(Math.max(score, best))}`;
  newRecordEl.hidden = !isRecord;
  bestCounter.set(Math.max(score, best));
  overlayEl.hidden = false;
  playAgainBtn.focus();
}

function isChainValid() {
  if (chain.length === 0) return false;
  const { r, c } = chain[0];
  return chain.length === exchangeRate(grid[r][c].code);
}

function renderChain() {
  for (const row of grid) for (const cell of row) cell?.el.classList.remove('is-selected');
  for (const { r, c } of chain) grid[r][c].el.classList.add('is-selected');

  chainLine.setAttribute('points', chain.map(({ r, c }) => `${c + 0.5},${r + 0.5}`).join(' '));
  boardEl.classList.toggle('is-valid', isChainValid());
}

function clearChain() {
  chain = [];
  renderChain();
}

function cellAt(event, tolerance = 0.5) {
  const rect = boardEl.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * cols;
  const y = ((event.clientY - rect.top) / rect.height) * rows;
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
  if (Math.abs(x - c - 0.5) > tolerance || Math.abs(y - r - 0.5) > tolerance) return null;
  if (!grid[r][c]) return null;
  return { r, c };
}

function scheduleTilt(event) {
  pendingTiltEvent = event;
  if (!tiltFrame) {
    tiltFrame = requestAnimationFrame(() => {
      tiltFrame = 0;
      updateTilt(pendingTiltEvent);
    });
  }
}

function resetTilt() {
  cancelAnimationFrame(tiltFrame);
  tiltFrame = 0;
  for (const el of tiltedEls) {
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
  }
  tiltedEls.clear();
}

function updateTilt(event) {
  const rect = boardEl.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * cols;
  const y = ((event.clientY - rect.top) / rect.height) * rows;
  const c = Math.floor(x);
  const r = Math.floor(y);

  const next = new Map();

  if (event.pointerId === activePointer) {
    for (const p of chain) {
      const vx = x - (p.c + 0.5);
      const vy = y - (p.r + 0.5);
      const dist = Math.hypot(vx, vy);
      if (dist > 0) next.set(grid[p.r][p.c].el, [(vx / dist) * CHAIN_TILT, (vy / dist) * CHAIN_TILT]);
    }
  }

  const el = grid[r]?.[c]?.el;
  if (el && (event.pointerType === 'mouse' || next.has(el))) {
    next.set(el, [(x - c - 0.5) * 2, (y - r - 0.5) * 2]);
  }

  for (const old of tiltedEls) {
    if (!next.has(old)) {
      old.style.removeProperty('--tilt-x');
      old.style.removeProperty('--tilt-y');
    }
  }
  tiltedEls.clear();
  for (const [coin, [tx, ty]] of next) {
    coin.style.setProperty('--tilt-x', tx.toFixed(3));
    coin.style.setProperty('--tilt-y', ty.toFixed(3));
    tiltedEls.add(coin);
  }
}

function indexInChain(r, c) {
  return chain.findIndex((p) => p.r === r && p.c === c);
}

function extendChain(cell) {
  const last = chain[chain.length - 1];
  if (cell.r === last.r && cell.c === last.c) return;

  const idx = indexInChain(cell.r, cell.c);
  if (idx !== -1) {
    if (idx === chain.length - 2) {
      chain.pop();
      renderChain();
    }
    return;
  }

  const sameCode = grid[cell.r][cell.c].code === grid[last.r][last.c].code;
  const adjacent = Math.abs(cell.r - last.r) + Math.abs(cell.c - last.c) === 1;
  if (sameCode && adjacent) {
    chain.push(cell);
    renderChain();
    playSound('click');
  }
}

function commitChain() {
  if (isChainValid()) {
    undoStack.push(currentCodes());
    redoStack = [];
    const last = chain[chain.length - 1];
    const lastCell = grid[last.r][last.c];
    const newCode = lastCell.code + 1;

    const merging = [];
    for (const { r, c } of chain.slice(0, -1)) {
      const { el } = grid[r][c];
      el.classList.remove('is-selected');
      el.classList.add('is-merging');
      el.style.setProperty('--c', last.c);
      el.style.setProperty('--r', last.r);
      merging.push(el);
      grid[r][c] = null;
    }
    lastCell.el.classList.add('is-merge-target');

    isMerging = true;
    updateHistoryButtons();
    clearChain();

    mergeTimer = setTimeout(() => {
      for (const el of merging) el.remove();
      lastCell.el.remove();
      const el = createCoinEl(newCode, last.r, last.c);
      el.classList.add('is-born');
      grid[last.r][last.c] = { code: newCode, el };
      playSound(newCode >= BANKNOTE_MIN_CODE ? 'banknote' : 'coin');

      isMerging = false;
      applyGravity();
      updateScore();
      updateHistoryButtons();
      checkGameOver();
    }, MERGE_DURATION);
    return;
  }
  clearChain();
}

function updateHistoryButtons() {
  undoBtn.disabled = isMerging || undoStack.length === 0;
  redoBtn.disabled = isMerging || redoStack.length === 0;
  undoLastBtn.hidden = undoStack.length === 0;
}

function restoreCodes(codes) {
  clearHint();
  clearTimeout(gameOverTimer);
  isOver = false;
  overlayEl.hidden = true;
  resetTilt();
  clearChain();

  const before = currentCodes();
  coinsEl.replaceChildren();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const code = codes[r][c];
      const el = createCoinEl(code, r, c);
      if (before[r][c] !== code) el.classList.add('is-born');
      grid[r][c] = { code, el };
    }
  }
  updateScore();
  updateHistoryButtons();
  checkGameOver();
}

function undo() {
  if (isMerging || undoStack.length === 0) return;
  redoStack.push(currentCodes());
  restoreCodes(undoStack.pop());
}

function redo() {
  if (isMerging || redoStack.length === 0) return;
  undoStack.push(currentCodes());
  restoreCodes(redoStack.pop());
}

function applyGravity() {
  const spawns = [];
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (write !== r) {
        grid[write][c] = cell;
        grid[r][c] = null;
        moveCoinTo(cell.el, write, r);
      }
      write--;
    }

    const empty = write + 1;
    for (let r = 0; r < empty; r++) {
      spawns.push({ code: randomCoin(), r, c, fromR: r - empty });
    }
  }
  dropNewCoins(spawns);
}

boardEl.addEventListener('pointerdown', (e) => {
  if (isOver || isMerging || activePointer !== null || e.button > 0) return;
  const cell = cellAt(e);
  if (!cell) return;
  clearHint();
  activePointer = e.pointerId;
  boardEl.setPointerCapture(e.pointerId);
  chain = [cell];
  renderChain();
  playSound('click');
  updateTilt(e);
  e.preventDefault();
});

boardEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === activePointer && chain.length > 0) {
    const cell = cellAt(e, HIT_TOLERANCE);
    if (cell) extendChain(cell);
  }

  if (e.pointerType === 'mouse' || e.pointerId === activePointer) scheduleTilt(e);
});

function endPointer(e, commit) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;

  resetTilt();
  if (commit) commitChain();
  else clearChain();
}

boardEl.addEventListener('pointerleave', (e) => {
  if (e.pointerId !== activePointer) resetTilt();
});
boardEl.addEventListener('pointerup', (e) => endPointer(e, true));
boardEl.addEventListener('pointercancel', (e) => endPointer(e, false));
boardEl.addEventListener('lostpointercapture', (e) => endPointer(e, true));

window.addEventListener('resize', fitBoard);
restartBtn.addEventListener('click', newGame);
undoBtn.addEventListener('click', undo);
hintBtn.addEventListener('click', showHint);
redoBtn.addEventListener('click', redo);
undoLastBtn.addEventListener('click', undo);

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) undo();
  else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
  else return;
  e.preventDefault();
});
playAgainBtn.addEventListener('click', newGame);
levelSelect.addEventListener('change', () => {
  saveLevel(Number(levelSelect.value));
  newGame();
});
for (const btn of levelPickerBtns) {
  btn.addEventListener('click', () => pickLevel(Number(btn.dataset.level)));
}
startGameBtn.addEventListener('click', startGame);

levelSelect.value = String(loadLevel());
pickLevel(loadLevel());
newGame();
startGameBtn.focus();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
