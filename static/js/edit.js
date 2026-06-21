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
  const tbf = document.getElementById('test-final-btn');
  if (tb1) tb1.classList.toggle('hidden', tab !== 'tab-board1');
  if (tb2) tb2.classList.toggle('hidden', tab !== 'tab-board2');
  if (tbf) tbf.classList.toggle('hidden', tab !== 'tab-final');
  autoResizeAll();
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
      const nddInput = document.querySelector(`.no-dd-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      questions.push({
        id: `q-${catIdx}-${qIdx}`,
        points: meta.point_multiplier * (qIdx + 1),
        question: qInput ? qInput.value.trim() : '',
        answer:   aInput ? aInput.value.trim() : '',
        dd_eligible: nddInput ? !nddInput.checked : true
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
        const nddInput = document.querySelector(`.no-dd-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
        if (qInput) qInput.value = q.question;
        if (aInput) aInput.value = q.answer;
        if (nddInput) nddInput.checked = q.dd_eligible === false;
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

  localStorage.setItem(LS_KEYS.board1, JSON.stringify(serializeBoard('board1')));
  localStorage.setItem(LS_KEYS.board2, JSON.stringify(serializeBoard('board2')));
  localStorage.setItem(LS_KEYS.final,  JSON.stringify(serializeFinal()));

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

function openImgLightbox(src) {
  const lb = document.getElementById('img-lightbox');
  document.getElementById('img-lightbox-img').src = src;
  lb.classList.add('active');
}

function closeImgLightbox() {
  const lb = document.getElementById('img-lightbox');
  lb.classList.remove('active');
  document.getElementById('img-lightbox-img').src = '';
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

// ── Image drag-and-drop for question inputs ───────────────────────────────────

const IMG_MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches server MAX_CONTENT_LENGTH

function uploadImageToTextarea(file, textarea) {
  if (!file.type.startsWith('image/')) {
    showToast('Only image files can be used here', true);
    return;
  }
  if (file.size > IMG_MAX_BYTES) {
    showToast(`Image too large — max ${IMG_MAX_BYTES / 1024 / 1024} MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`, true);
    return;
  }
  const existingText = textarea.value.trim();
  const preCaption = (existingText && !existingText.startsWith('[img]')) ? existingText : '';
  const formData = new FormData();
  formData.append('file', file);
  showToast('Uploading image…');
  fetch('/upload/image', { method: 'POST', body: formData })
    .then(r => r.json())
    .then(data => {
      if (data.error) { showToast(data.error, true); return; }
      textarea.value = preCaption ? `[img]${data.url}[cap]${preCaption}` : `[img]${data.url}`;
      showQImgPreview(textarea);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    })
    .catch(() => showToast('Upload failed', true));
}

function showQImgPreview(textarea) {
  // Check if the preview already exists immediately after this textarea
  let preview = (textarea.nextElementSibling && textarea.nextElementSibling.classList.contains('q-img-preview'))
    ? textarea.nextElementSibling
    : null;
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'q-img-preview';
    textarea.parentElement.insertBefore(preview, textarea.nextSibling);
  }
  const raw = textarea.value.slice(5); // strip [img]
  const capIdx = raw.indexOf('[cap]');
  const src = capIdx === -1 ? raw : raw.slice(0, capIdx);
  const caption = capIdx === -1 ? '' : raw.slice(capIdx + 5);
  preview.innerHTML = `
    <img src="${src}" class="q-img-thumb" alt="Question image">
    <button type="button" class="q-img-clear" title="Remove image">✕</button>
    <textarea class="q-img-caption-input" rows="1" placeholder="Optional caption / question text…">${caption.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
  `;
  // Keep textarea value in sync when caption changes
  const capInput = preview.querySelector('.q-img-caption-input');
  capInput.addEventListener('input', (e) => {
    autoResize(e.target);
    const cap = e.target.value;
    const base = `[img]${src}`;
    textarea.value = cap ? `${base}[cap]${cap}` : base;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Set initial value and resize
  capInput.value = caption;
  requestAnimationFrame(() => autoResize(capInput));
  preview.querySelector('.q-img-thumb').addEventListener('click', () => openImgLightbox(src));
  preview.querySelector('.q-img-clear').addEventListener('click', () => {
    textarea.value = '';
    preview.remove();
    textarea.style.display = '';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  textarea.style.display = 'none';
}

function initImageDrop() {
  const allDropTargets = [
    ...document.querySelectorAll('.q-input'),
    ...document.querySelectorAll('.a-input'),
    ...['final-question', 'final-answer'].map(id => document.getElementById(id)).filter(Boolean)
  ];

  allDropTargets.forEach(textarea => {
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
      uploadImageToTextarea(file, textarea);
    });
    textarea.addEventListener('paste', (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (!imgItem) return; // let normal paste happen
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) uploadImageToTextarea(file, textarea);
    });
  });
}
// ── Auto-resize textareas ─────────────────────────────────────────────────────

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function autoResizeAll() {
  document.querySelectorAll('.q-input, .a-input, .q-img-caption-input').forEach(el => {
    // If the element is inside a hidden panel, temporarily reveal it to measure
    const panel = el.closest('.tab-panel.hidden');
    if (panel) {
      panel.style.cssText = 'display:block;visibility:hidden;position:absolute;pointer-events:none';
      autoResize(el);
      panel.style.cssText = '';
      panel.classList.add('hidden');
    } else {
      autoResize(el);
    }
  });
}
// ── Cell drag-to-swap ────────────────────────────────────────────────────────

let _dragSourceCell = null;
let _dragSourceCat  = null; // { boardId, catIdx }

function _getCellValues(cell) {
  const qInput  = cell.querySelector('.q-input');
  const aInput  = cell.querySelector('.a-input');
  const nddInput = cell.querySelector('.no-dd-input');
  return {
    question:    qInput  ? qInput.value  : '',
    answer:      aInput  ? aInput.value  : '',
    dd_eligible: nddInput ? !nddInput.checked : true
  };
}

function _setCellValues(cell, vals) {
  const qInput   = cell.querySelector('.q-input');
  const aInput   = cell.querySelector('.a-input');
  const nddInput = cell.querySelector('.no-dd-input');
  // Remove any existing image preview before changing value
  const oldPreview = cell.querySelector('.q-img-preview');
  if (oldPreview) oldPreview.remove();
  if (qInput) {
    qInput.style.display = '';
    qInput.value = vals.question;
    if (vals.question.startsWith('[img]')) showQImgPreview(qInput);
    qInput.dispatchEvent(new Event('input', { bubbles: true }));
    autoResize(qInput);
  }
  if (aInput) {
    aInput.value = vals.answer;
    aInput.dispatchEvent(new Event('input', { bubbles: true }));
    autoResize(aInput);
  }
  if (nddInput) nddInput.checked = !vals.dd_eligible;
}

function _getCategoryValues(boardId, catIdx) {
  const titleInput = document.querySelector(`.cat-title-input[data-board="${boardId}"][data-cat-index="${catIdx}"]`);
  const questions = [];
  for (let qIdx = 0; qIdx < 5; qIdx++) {
    const qInput   = document.querySelector(`.q-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
    const aInput   = document.querySelector(`.a-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
    const nddInput = document.querySelector(`.no-dd-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
    questions.push({
      question:    qInput   ? qInput.value        : '',
      answer:      aInput   ? aInput.value        : '',
      dd_eligible: nddInput ? !nddInput.checked   : true
    });
  }
  return { title: titleInput ? titleInput.value : '', questions };
}

function _setCategoryValues(boardId, catIdx, vals) {
  const titleInput = document.querySelector(`.cat-title-input[data-board="${boardId}"][data-cat-index="${catIdx}"]`);
  if (titleInput) {
    titleInput.value = vals.title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  for (let qIdx = 0; qIdx < 5; qIdx++) {
    const qInput = document.querySelector(`.q-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
    if (!qInput) continue;
    const cell = qInput.closest('.admin-cell');
    if (cell) _setCellValues(cell, vals.questions[qIdx]);
  }
}

function _highlightCol(boardId, catIdx, cls, add) {
  for (let qIdx = 0; qIdx < 5; qIdx++) {
    const q = document.querySelector(`.q-input[data-board="${boardId}"][data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
    if (q) q.closest('.admin-cell')?.classList.toggle(cls, add);
  }
  const t = document.querySelector(`.cat-title-input[data-board="${boardId}"][data-cat-index="${catIdx}"]`);
  if (t) t.closest('.admin-cell')?.classList.toggle(cls, add);
}

function initCellSwap() {
  document.querySelectorAll('.admin-cell.question-cell').forEach(cell => {
    if (cell.dataset.swapInit) return;
    cell.dataset.swapInit = '1';
    cell.setAttribute('draggable', 'true');

    // Toggle draggable off when mousedown lands on an interactive child,
    // so text selection / checkbox clicks don't accidentally start a drag.
    cell.addEventListener('mousedown', (e) => {
      const interactive = e.target.closest('textarea, input, label:not(.cell-label), button, .q-img-thumb, .q-img-clear');
      cell.setAttribute('draggable', interactive ? 'false' : 'true');
    });
    cell.addEventListener('mouseup', () => cell.setAttribute('draggable', 'true'));

    cell.addEventListener('dragstart', (e) => {
      // Secondary guard in case mousedown toggle didn't fire
      const interactive = e.target.closest('textarea, input, label:not(.cell-label), button, .q-img-preview, .q-img-thumb, .q-img-clear, .q-img-caption-input');
      if (interactive) { e.preventDefault(); return; }
      _dragSourceCell = cell;
      cell.classList.add('drag-source');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });

    cell.addEventListener('dragend', () => {
      _dragSourceCell = null;
      document.querySelectorAll('.admin-cell.question-cell').forEach(c => {
        c.classList.remove('drag-source', 'drag-over');
      });
    });

    cell.addEventListener('dragover', (e) => {
      if (!_dragSourceCell || _dragSourceCell === cell) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cell.classList.add('drag-over');
    });

    cell.addEventListener('dragleave', (e) => {
      if (!cell.contains(e.relatedTarget)) {
        cell.classList.remove('drag-over');
      }
    });

    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (!_dragSourceCell || _dragSourceCell === cell) return;
      const srcVals  = _getCellValues(_dragSourceCell);
      const destVals = _getCellValues(cell);
      _setCellValues(_dragSourceCell, destVals);
      _setCellValues(cell, srcVals);
    });
  });

  // Drag-over tab buttons to auto-switch board (600 ms hover delay)
  let _tabSwitchTimer = null;
  document.querySelectorAll('.edit-tab[data-tab="tab-board1"], .edit-tab[data-tab="tab-board2"]').forEach(tab => {
    if (tab.dataset.dragTabInit) return;
    tab.dataset.dragTabInit = '1';

    tab.addEventListener('dragover', (e) => {
      if (!_dragSourceCell && !_dragSourceCat) return;
      e.preventDefault();
      tab.classList.add('drag-tab-hover');
      if (!_tabSwitchTimer) {
        _tabSwitchTimer = setTimeout(() => {
          if (_dragSourceCell || _dragSourceCat) switchTab(tab);
          _tabSwitchTimer = null;
        }, 600);
      }
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-tab-hover');
      clearTimeout(_tabSwitchTimer);
      _tabSwitchTimer = null;
    });

    tab.addEventListener('drop', () => {
      tab.classList.remove('drag-tab-hover');
      clearTimeout(_tabSwitchTimer);
      _tabSwitchTimer = null;
    });
  });
}

function initCategorySwap() {
  document.querySelectorAll('.admin-cell.header-cell:not(.corner-cell)').forEach(headerCell => {
    if (headerCell.dataset.catSwapInit) return;
    const titleInput = headerCell.querySelector('.cat-title-input');
    if (!titleInput) return; // points-label cells have no title input
    headerCell.dataset.catSwapInit = '1';
    headerCell.setAttribute('draggable', 'true');

    headerCell.addEventListener('mousedown', (e) => {
      headerCell.setAttribute('draggable', e.target.closest('input, label:not(.cell-label)') ? 'false' : 'true');
    });
    headerCell.addEventListener('mouseup', () => headerCell.setAttribute('draggable', 'true'));

    headerCell.addEventListener('dragstart', (e) => {
      if (e.target.closest('input, label:not(.cell-label)')) { e.preventDefault(); return; }
      const boardId = titleInput.dataset.board;
      const catIdx  = parseInt(titleInput.dataset.catIndex, 10);
      _dragSourceCat = { boardId, catIdx };
      _highlightCol(boardId, catIdx, 'col-drag-source', true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });

    headerCell.addEventListener('dragend', () => {
      if (_dragSourceCat) _highlightCol(_dragSourceCat.boardId, _dragSourceCat.catIdx, 'col-drag-source', false);
      _dragSourceCat = null;
      document.querySelectorAll('.admin-cell.col-drag-over').forEach(c => c.classList.remove('col-drag-over'));
    });

    headerCell.addEventListener('dragover', (e) => {
      if (!_dragSourceCat) return;
      const destBoard  = titleInput.dataset.board;
      const destCatIdx = parseInt(titleInput.dataset.catIndex, 10);
      if (_dragSourceCat.boardId === destBoard && _dragSourceCat.catIdx === destCatIdx) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.admin-cell.col-drag-over').forEach(c => c.classList.remove('col-drag-over'));
      _highlightCol(destBoard, destCatIdx, 'col-drag-over', true);
    });

    headerCell.addEventListener('dragleave', (e) => {
      if (!headerCell.contains(e.relatedTarget)) {
        _highlightCol(titleInput.dataset.board, parseInt(titleInput.dataset.catIndex, 10), 'col-drag-over', false);
      }
    });

    headerCell.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!_dragSourceCat) return;
      const destBoard  = titleInput.dataset.board;
      const destCatIdx = parseInt(titleInput.dataset.catIndex, 10);
      if (_dragSourceCat.boardId === destBoard && _dragSourceCat.catIdx === destCatIdx) return;
      const srcVals  = _getCategoryValues(_dragSourceCat.boardId, _dragSourceCat.catIdx);
      const destVals = _getCategoryValues(destBoard, destCatIdx);
      _setCategoryValues(_dragSourceCat.boardId, _dragSourceCat.catIdx, destVals);
      _setCategoryValues(destBoard, destCatIdx, srcVals);
      _highlightCol(destBoard, destCatIdx, 'col-drag-over', false);
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
        const fin = data.final || data;
        localStorage.setItem(LS_KEYS.final, JSON.stringify(fin));
      } else {
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
  initCellSwap();
  initCategorySwap();
  autoResizeAll();

  // Re-run after fonts finish loading — scrollHeight can be wrong if measured
  // before web fonts are ready (DOMContentLoaded fires before font load).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => autoResizeAll());
  }
  window.addEventListener('load', () => autoResizeAll());

  // Keep textareas expanded as the user types
  document.addEventListener('input', (e) => {
    if (e.target.matches('.q-input, .a-input')) autoResize(e.target);
  });

  // Lightbox close on backdrop click or Escape
  document.getElementById('img-lightbox-backdrop').addEventListener('click', closeImgLightbox);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImgLightbox(); });

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
