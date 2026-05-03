// game.js — cell state machine and localStorage persistence

// States: idle -> showing-question -> showing-answer -> used
// localStorage stores a JSON array of used question IDs for each board

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
  cell.querySelector('.points-display').classList.add('hidden');
  cell.querySelector('.text-display').classList.add('hidden');
}

function handleCellClick(cell) {
  const state = cell.dataset.state || 'idle';
  const pointsEl = cell.querySelector('.points-display');
  const textEl = cell.querySelector('.text-display');

  if (state === 'idle') {
    // Show question
    pointsEl.classList.add('hidden');
    textEl.textContent = cell.dataset.question;
    textEl.classList.remove('hidden');
    textEl.classList.add('question-text');
    textEl.classList.remove('answer-text');
    cell.dataset.state = 'showing-question';
    cell.classList.add('showing-question');
    cell.classList.remove('showing-answer');
  } else if (state === 'showing-question') {
    // Show answer
    textEl.textContent = cell.dataset.answer;
    textEl.classList.remove('question-text');
    textEl.classList.add('answer-text');
    cell.dataset.state = 'showing-answer';
    cell.classList.add('showing-answer');
    cell.classList.remove('showing-question');
  } else if (state === 'showing-answer') {
    // Mark as used
    setCellUsed(cell);
    markUsed(cell.dataset.id);
  }
}

function resetBoard() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  applyUsedState();

  document.querySelectorAll('.question-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      if (!cell.classList.contains('used')) {
        handleCellClick(cell);
      }
    });
  });
});
