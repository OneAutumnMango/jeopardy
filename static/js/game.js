// game.js — fullscreen overlay state machine + localStorage for used cells

const STORAGE_KEY = `jeopardy-used-${BOARD_ID}`;

function getUsedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markUsed(id) {
  const used = getUsedIds();
  used.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...used]));
}

function applyUsedState() {
  const used = getUsedIds();
  used.forEach(id => {
    const cell = document.getElementById(id);
    if (cell) setCellUsed(cell);
  });
}

function setCellUsed(cell) {
  cell.className = 'cell question-cell used';
  const pd = cell.querySelector('.points-display');
  if (pd) pd.classList.add('hidden');
}

function resetBoard() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

// ── Fullscreen overlay ─────────────────────────────────────────────────────────

let overlayState = 'idle';
let overlayCell = null;

function openOverlay(cell) {
  const overlay = document.getElementById('tile-overlay');
  document.getElementById('overlay-points').textContent = `€${cell.dataset.points}`;
  document.getElementById('overlay-text').textContent = cell.dataset.question;
  document.getElementById('overlay-text').className = 'overlay-text question-text';
  document.getElementById('overlay-hint').textContent = 'Click anywhere to reveal answer';

  overlay.classList.remove('hidden');
  // Force reflow before adding active class so transition fires
  overlay.offsetHeight;
  overlay.classList.add('active');

  overlayState = 'showing-question';
  overlayCell = cell;
}

function handleOverlayClick() {
  if (overlayState === 'showing-question') {
    document.getElementById('overlay-text').textContent = overlayCell.dataset.answer;
    document.getElementById('overlay-text').className = 'overlay-text answer-text';
    document.getElementById('overlay-hint').textContent = 'Click anywhere to close';
    overlayState = 'showing-answer';
  } else if (overlayState === 'showing-answer') {
    closeOverlay();
    setCellUsed(overlayCell);
    markUsed(overlayCell.dataset.id);
    overlayCell = null;
  }
}

function closeOverlay() {
  const overlay = document.getElementById('tile-overlay');
  overlay.classList.remove('active');
  overlay.addEventListener('transitionend', () => {
    overlay.classList.add('hidden');
    overlayState = 'idle';
  }, { once: true });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Inject overlay into body
  const overlayEl = document.createElement('div');
  overlayEl.id = 'tile-overlay';
  overlayEl.className = 'tile-overlay hidden';
  overlayEl.innerHTML = `
    <div class="tile-overlay-content">
      <div id="overlay-points" class="overlay-points"></div>
      <div id="overlay-text" class="overlay-text"></div>
      <div id="overlay-hint" class="overlay-hint"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener('click', handleOverlayClick);

  applyUsedState();

  document.querySelectorAll('.question-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      if (!cell.classList.contains('used')) openOverlay(cell);
    });
  });
});
