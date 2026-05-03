// admin.js — boards saved to localStorage; export/import JSON; server save as fallback

const LS_KEY = `jeopardy-board-${BOARD_ID}`;

function serializeBoard() {
  const catTitleInputs = document.querySelectorAll('.cat-title-input');
  const categories = Array.from(catTitleInputs).map((titleInput, catIdx) => {
    const questions = [];
    for (let qIdx = 0; qIdx < 5; qIdx++) {
      const qInput = document.querySelector(`.q-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      const aInput = document.querySelector(`.a-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      const points = POINT_MULTIPLIER * (qIdx + 1);
      questions.push({
        id: `q-${catIdx}-${qIdx}`,
        points: points,
        question: qInput ? qInput.value.trim() : '',
        answer: aInput ? aInput.value.trim() : ''
      });
    }
    return {
      id: CATEGORIES_DATA[catIdx] ? CATEGORIES_DATA[catIdx].id : `cat-${catIdx}`,
      title: titleInput.value.trim(),
      questions: questions
    };
  });

  return {
    label: BOARD_LABEL,
    point_multiplier: POINT_MULTIPLIER,
    categories: categories
  };
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return;
  try {
    const board = JSON.parse(raw);
    board.categories.forEach((cat, catIdx) => {
      const titleInput = document.querySelector(`.cat-title-input[data-cat-index="${catIdx}"]`);
      if (titleInput) titleInput.value = cat.title;
      cat.questions.forEach((q, qIdx) => {
        const qInput = document.querySelector(`.q-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
        const aInput = document.querySelector(`.a-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
        if (qInput) qInput.value = q.question;
        if (aInput) aInput.value = q.answer;
      });
    });
  } catch (e) {
    console.warn('Could not load board from localStorage', e);
  }
}

async function saveBoard() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  const payload = serializeBoard();
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  showToast('Board saved to browser!');
  btn.disabled = false;
  btn.textContent = 'Save All Changes';
}

function resetBoard() {
  if (!confirm('Reset this board to defaults? This will clear all saved questions.')) return;
  localStorage.removeItem(LS_KEY);
  window.location.reload();
}

function exportBoard() {
  const payload = serializeBoard();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${BOARD_ID}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBoard(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const board = JSON.parse(e.target.result);
      // Always use this board's multiplier/label regardless of import source
      board.point_multiplier = POINT_MULTIPLIER;
      board.label = BOARD_LABEL;
      board.categories.forEach((cat, catIdx) => {
        cat.questions.forEach((q, qIdx) => {
          q.points = POINT_MULTIPLIER * (qIdx + 1);
          q.id = `q-${catIdx}-${qIdx}`;
        });
      });
      localStorage.setItem(LS_KEY, JSON.stringify(board));
      window.location.reload();
    } catch (err) {
      showToast('Invalid JSON file', true);
    }
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  const importInput = document.getElementById('import-input');
  if (importInput) {
    importInput.addEventListener('change', importBoard);
  }
});
