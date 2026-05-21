// edit.js — combined board editor (Board 1, Board 2, Final Jeopardy)

const LS_KEYS = {
  board1: 'jeopardy-board-board1',
  board2: 'jeopardy-board-board2',
  final:  'jeopardy-final'
};

// ── Tab switching ──────────────────────────────────────────────────────────────

function switchTab(btn) {
  document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.remove('hidden');
  const tab = btn.dataset.tab;
  const tb1 = document.getElementById('test-board1-btn');
  const tb2 = document.getElementById('test-board2-btn');
  if (tb1) tb1.classList.toggle('hidden', tab !== 'tab-board1');
  if (tb2) tb2.classList.toggle('hidden', tab !== 'tab-board2');
}

// ── Serialize ─────────────────────────────────────────────────────────────────

function serializeBoard(boardId) {
  const meta = BOARDS_DATA[boardId];
  const catInputs = document.querySelectorAll(`.cat-title-input[data-board="${boardId}"]`);
  const categories = Array.from(catInputs).map((titleInput, catIdx) => {
    const questions = [];
    for (let qIdx = 0; qIdx < 5; qIdx++) {
      const qInput = document.querySelector(`.q-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      const aInput = document.querySelector(`.a-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      questions.push({
        id: `q-${catIdx}-${qIdx}`,
        points: meta.point_multiplier * (qIdx + 1),
        question: qInput ? qInput.value.trim() : '',
        answer:   aInput ? aInput.value.trim() : ''
      });
    }
    const origCat = meta.categories[catIdx];
    return {
      id: origCat ? origCat.id : `cat-${catIdx}`,
      title: titleInput.value.trim(),
      questions
    };
  });
  return { label: meta.label, point_multiplier: meta.point_multiplier, categories };
}

function serializeFinal() {
  return {
    category: document.getElementById('final-category').value.trim(),
    question: document.getElementById('final-question').value.trim(),
    answer:   document.getElementById('final-answer').value.trim()
  };
}

// ── Load from localStorage ────────────────────────────────────────────────────

function loadBoard(boardId) {
  const raw = localStorage.getItem(LS_KEYS[boardId]);
  if (!raw) return;
  try {
    const board = JSON.parse(raw);
    board.categories.forEach((cat, catIdx) => {
      const titleInput = document.querySelector(`.cat-title-input[data-board="${boardId}"][data-cat-index="${catIdx}"]`);
      if (titleInput) titleInput.value = cat.title;
      cat.questions.forEach((q, qIdx) => {
        const qInput = document.querySelector(`.q-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
        const aInput = document.querySelector(`.a-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
        if (qInput) qInput.value = q.question;
        if (aInput) aInput.value = q.answer;
      });
    });
  } catch {}
}

function loadFinal() {
  const raw = localStorage.getItem(LS_KEYS.final);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    document.getElementById('final-category').value = d.category || '';
    document.getElementById('final-question').value = d.question || '';
    document.getElementById('final-answer').value   = d.answer   || '';
  } catch {}
}

// ── Save All ──────────────────────────────────────────────────────────────────

function saveAll() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const b1 = serializeBoard('board1');
  const b2 = serializeBoard('board2');
  const fin = serializeFinal();

  localStorage.setItem(LS_KEYS.board1, JSON.stringify(b1));
  localStorage.setItem(LS_KEYS.board2, JSON.stringify(b2));
  localStorage.setItem(LS_KEYS.final, JSON.stringify(fin));

  showToast('All boards saved!');
  btn.disabled = false;
  btn.textContent = 'Save All';
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportAll() {
  const data = {
    board1: serializeBoard('board1'),
    board2: serializeBoard('board2'),
    final:  serializeFinal()
  };
  downloadJson(data, 'jeopardy-all.json');
}

function exportOne(which) {
  let data, filename;
  if (which === 'final') {
    data = serializeFinal();
    filename = 'jeopardy-final.json';
  } else {
    data = serializeBoard(which);
    filename = `jeopardy-${which}.json`;
  }
  downloadJson(data, filename);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      // Combined format: has board1 or board2 or final keys
      let imported = false;
      if (data.board1 && data.board1.categories) {
        normalizeBoard(data.board1, 'board1');
        localStorage.setItem(LS_KEYS.board1, JSON.stringify(data.board1));
        imported = true;
      }
      if (data.board2 && data.board2.categories) {
        normalizeBoard(data.board2, 'board2');
        localStorage.setItem(LS_KEYS.board2, JSON.stringify(data.board2));
        imported = true;
      }
      if (data.final && (data.final.category !== undefined || data.final.question !== undefined)) {
        localStorage.setItem(LS_KEYS.final, JSON.stringify(data.final));
        imported = true;
      }
      // Single board format: has categories key directly
      if (!imported && data.categories) {
        // Can't tell which board — import into active tab's board
        const activeTab = document.querySelector('.edit-tab.active');
        const tabId = activeTab ? activeTab.dataset.tab : 'tab-board1';
        if (tabId === 'tab-board1') {
          normalizeBoard(data, 'board1');
          localStorage.setItem(LS_KEYS.board1, JSON.stringify(data));
        } else if (tabId === 'tab-board2') {
          normalizeBoard(data, 'board2');
          localStorage.setItem(LS_KEYS.board2, JSON.stringify(data));
        }
        imported = true;
      }
      // Single final format
      if (!imported && (data.category !== undefined || data.question !== undefined)) {
        localStorage.setItem(LS_KEYS.final, JSON.stringify(data));
        imported = true;
      }
      if (imported) {
        window.location.reload();
      } else {
        showToast('Unrecognized JSON format', true);
      }
    } catch {
      showToast('Invalid JSON file', true);
    }
  };
  reader.readAsText(file);
  // Reset so same file can be re-imported
  event.target.value = '';
}

function normalizeBoard(board, boardId) {
  const meta = BOARDS_DATA[boardId];
  board.point_multiplier = meta.point_multiplier;
  board.label = meta.label;
  board.categories.forEach((cat, catIdx) => {
    cat.questions.forEach((q, qIdx) => {
      q.points = meta.point_multiplier * (qIdx + 1);
      q.id = `q-${catIdx}-${qIdx}`;
    });
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetOne(which) {
  if (!confirm(`Reset ${which === 'final' ? 'Final Jeopardy' : which === 'board1' ? 'Board 1' : 'Board 2'} to defaults?`)) return;
  localStorage.removeItem(LS_KEYS[which]);
  window.location.reload();
}

function resetAll() {
  if (!confirm('Reset all boards and Final Jeopardy to defaults?')) return;
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const wasHidden = menu.classList.contains('hidden');
  closeDropdowns();
  if (wasHidden) menu.classList.remove('hidden');
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown-wrap')) closeDropdowns();
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

// ── Image drag-and-drop for question inputs ───────────────────────────────────

const IMG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function showQImgPreview(textarea) {
  let preview = textarea.parentElement.querySelector('.q-img-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'q-img-preview';
    textarea.parentElement.insertBefore(preview, textarea.nextSibling);
  }
  const src = textarea.value.slice(5); // strip [img]
  preview.innerHTML = `
    <img src="${src}" class="q-img-thumb" alt="Question image">
    <button type="button" class="q-img-clear" title="Remove image">✕</button>
  `;
  preview.querySelector('.q-img-clear').addEventListener('click', () => {
    textarea.value = '';
    preview.remove();
    textarea.style.display = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  textarea.style.display = 'none';
}

function initImageDrop() {
  document.querySelectorAll('.q-input').forEach(textarea => {
    // Show preview for any already-loaded image values (e.g. from localStorage)
    if (textarea.value.startsWith('[img]')) showQImgPreview(textarea);

    textarea.addEventListener('dragover', (e) => {
      e.preventDefault();
      textarea.classList.add('drag-over');
    });
    textarea.addEventListener('dragleave', () => {
      textarea.classList.remove('drag-over');
    });
    textarea.addEventListener('drop', (e) => {
      e.preventDefault();
      textarea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Only image files can be dropped here', true);
        return;
      }
      if (file.size > IMG_MAX_BYTES) {
        showToast(`Image too large — max 10 MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`, true);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        textarea.value = `[img]${ev.target.result}`;
        showQImgPreview(textarea);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };
      reader.readAsDataURL(file);
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function handleImportTargeted(event, target) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (target === 'final') {
        // Accept {category,question,answer} directly or {final:{...}}
        const fin = data.final || data;
        localStorage.setItem(LS_KEYS.final, JSON.stringify(fin));
      } else {
        // Accept board data directly or combined {board1/board2: {...}}
        const board = data[target] || data;
        normalizeBoard(board, target);
        localStorage.setItem(LS_KEYS[target], JSON.stringify(board));
      }
      window.location.reload();
    } catch {
      showToast('Invalid JSON file', true);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  loadBoard('board1');
  loadBoard('board2');
  loadFinal();
  initImageDrop();

  // ── Auto-save on every change ───────────────────────────────────────────────
  let autoSaveTimer = null;
  function scheduleAutoSave(boardId) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (boardId === 'final') {
        localStorage.setItem(LS_KEYS.final, JSON.stringify(serializeFinal()));
      } else {
        localStorage.setItem(LS_KEYS[boardId], JSON.stringify(serializeBoard(boardId)));
      }
    }, 300);
  }

  ['board1', 'board2'].forEach(boardId => {
    document.getElementById(`admin-grid-${boardId}`)
      .addEventListener('input', () => scheduleAutoSave(boardId));
  });

  ['final-category', 'final-question', 'final-answer'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => scheduleAutoSave('final'));
  });
  // ───────────────────────────────────────────────────────────────────────────

  document.getElementById('import-input').addEventListener('change', handleImport);
  ['board1', 'board2', 'final'].forEach(target => {
    const el = document.getElementById(`import-${target}`);
    if (el) el.addEventListener('change', (ev) => handleImportTargeted(ev, target));
  });
});
