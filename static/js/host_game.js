// host_game.js — loaded on /host/<code>

const socket = io();
const SESSION_CODE = HOST_GAME_CODE;

let activeTile = null;   // {question_id, points}
let scores = [];
let currentBuzzQueue = [];   // latest queue from server
let overlayBuzzerIndex = 0;  // which buzzer is currently "up"

// ── Init ──────────────────────────────────────────────────────────────────────
socket.emit('host_join_room', { code: SESSION_CODE });

// ── SocketIO listeners ────────────────────────────────────────────────────────
socket.on('player_joined', ({ players }) => {
  const active = players.filter(p => p.active).length;
  document.getElementById('player-count').textContent = active;
});

socket.on('scores_updated', ({ scores: s }) => {
  scores = s;
  renderScores();
});

socket.on('restore_used', ({ used_tiles }) => {
  used_tiles.forEach(qid => {
    const cell = document.getElementById(qid);
    if (cell) setCellUsed(cell);
  });
});

socket.on('tile_revealed', ({ question_id, question, points }) => {
  activeTile = { question_id, question, points };
  overlayBuzzerIndex = 0;
  openHostOverlay(question, points);
});

socket.on('answer_revealed', ({ answer }) => {
  document.getElementById('host-overlay-text').textContent = answer;
  document.getElementById('host-overlay-text').className = 'overlay-text answer-text';
  document.getElementById('host-reveal-answer-btn').disabled = true;
});

socket.on('tile_used', ({ question_id }) => {
  const cell = document.getElementById(question_id);
  if (cell) setCellUsed(cell);
  activeTile = null;
  currentBuzzQueue = [];
  renderScores();
});

socket.on('buzz_update', ({ queue }) => {
  currentBuzzQueue = queue;
  renderOverlayBuzzQueue();
});

socket.on('round_complete', ({ round }) => {
  const modal = document.getElementById('round-modal');
  const title = document.getElementById('round-modal-title');
  const sub = document.getElementById('round-modal-subtitle');
  if (round === 1) {
    title.textContent = 'Round 2';
    sub.textContent = 'All tiles cleared! Ready for Round 2 (€200–€1000)?';
  } else {
    title.textContent = 'Final Jeopardy';
    sub.textContent = 'All tiles cleared! Time for Final Jeopardy.';
  }
  modal.classList.remove('hidden');
  modal.dataset.completedRound = round;
});

socket.on('round_changed', () => {
  window.location.reload();
});

socket.on('wager_submitted', ({ name }) => {
  updateFinalPlayerStatus(name, 'wager', true);
});

socket.on('all_wagers_in', () => {
  document.getElementById('reveal-final-q-btn').disabled = false;
  addFinalNote('✓ All wagers in — reveal the question');
});

socket.on('final_answer_submitted', ({ name }) => {
  updateFinalPlayerStatus(name, 'answer', true);
});

socket.on('all_answers_in', () => {
  addFinalNote('✓ All answers in — reveal them one by one');
});

socket.on('final_answer_revealed', ({ name, answer, wager }) => {
  updateFinalAnswerReveal(name, answer, wager);
});

socket.on('game_ended', ({ final_scores }) => {
  scores = final_scores;
  renderScores();
  document.getElementById('score-panel').classList.remove('hidden');
});

socket.on('final_setup', (setup) => {
  const catInput = document.getElementById('final-category-input');
  const qInput = document.getElementById('final-question-input');
  if (catInput && !catInput.value) catInput.value = setup.category || '';
  if (qInput && !qInput.value) qInput.value = setup.question || '';
});

// ── Overlay helpers ─────────────────────────────────────────────────────────
function openHostOverlay(question, points) {
  const overlay = document.getElementById('host-tile-overlay');
  document.getElementById('host-overlay-points').textContent = `€${points}`;
  document.getElementById('host-overlay-text').textContent = question;
  document.getElementById('host-overlay-text').className = 'overlay-text question-text';
  document.getElementById('host-reveal-answer-btn').disabled = false;
  overlay.classList.remove('hidden');
  overlay.offsetHeight;
  overlay.classList.add('active');
}

function closeHostOverlay() {
  const overlay = document.getElementById('host-tile-overlay');
  overlay.classList.remove('active');
  overlay.addEventListener('transitionend', () => {
    overlay.classList.add('hidden');
  }, { once: true });
}

function hostRevealAnswer() {
  if (!activeTile) return;
  socket.emit('host_reveal_answer', { code: SESSION_CODE, question_id: activeTile.question_id });
}

function hostMarkUsed() {
  if (!activeTile) return;
  socket.emit('host_mark_used', { code: SESSION_CODE, question_id: activeTile.question_id });
  closeHostOverlay();
}

function setCellUsed(cell) {
  cell.className = 'cell question-cell used';
  const pd = cell.querySelector('.points-display');
  if (pd) pd.classList.add('hidden');
}

// ── Round transition ──────────────────────────────────────────────────────────
function proceedRound() {
  const modal = document.getElementById('round-modal');
  const completedRound = parseInt(modal.dataset.completedRound || '0');
  modal.classList.add('hidden');
  if (completedRound === 1) {
    socket.emit('host_next_round', { code: SESSION_CODE });
    // round_changed will trigger page reload
  } else {
    // Show final jeopardy section, hide board
    document.getElementById('board-section').classList.add('hidden');
    document.getElementById('final-section').classList.remove('hidden');
    renderFinalPlayersList();
    // Auto-start with pre-configured data if available
    const catInput = document.getElementById('final-category-input');
    if (catInput && catInput.value.trim()) {
      startFinal();
    }
  }
}

// ── Overlay buzz queue ────────────────────────────────────────────────────────
function renderOverlayBuzzQueue() {
  const el = document.getElementById('overlay-buzz-queue');
  const ctrl = document.getElementById('overlay-score-controls');
  const nameEl = document.getElementById('overlay-buzzer-name');
  if (!el) return;

  const queue = currentBuzzQueue;
  if (!queue || queue.length === 0) {
    el.innerHTML = '';
    if (ctrl) ctrl.classList.add('hidden');
    return;
  }

  el.innerHTML = queue.map((name, i) => {
    let cls = 'overlay-buzz-entry';
    if (i < overlayBuzzerIndex) cls += ' overlay-buzz-wrong';
    else if (i === overlayBuzzerIndex) cls += ' overlay-buzz-first';
    else cls += ' overlay-buzz-waiting';
    const prefix = i < overlayBuzzerIndex ? '✗' : `${i + 1}.`;
    return `<div class="${cls}">${prefix} ${escHtml(name)}</div>`;
  }).join('');

  if (ctrl && nameEl) {
    if (overlayBuzzerIndex < queue.length) {
      nameEl.textContent = queue[overlayBuzzerIndex];
      ctrl.classList.remove('hidden');
    } else {
      ctrl.classList.add('hidden');
    }
  }
}

// ── Overlay scoring ───────────────────────────────────────────────────────────
function overlayScoreCorrect() {
  if (!activeTile) return;
  const name = currentBuzzQueue[overlayBuzzerIndex];
  if (!name) return;
  socket.emit('host_reveal_answer', { code: SESSION_CODE, question_id: activeTile.question_id });
  socket.emit('host_score_correct', { code: SESSION_CODE, player_name: name, points: activeTile.points });
  socket.emit('host_clear_buzz', { code: SESSION_CODE });
}

function overlayScoreWrong() {
  if (!activeTile) return;
  const name = currentBuzzQueue[overlayBuzzerIndex];
  if (!name) return;
  socket.emit('host_score_wrong', { code: SESSION_CODE, player_name: name, points: activeTile.points });
  // Advance to next buzzer without modifying server queue
  overlayBuzzerIndex++;
  renderOverlayBuzzQueue();
}

// ── Board clicks ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.question-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      if (cell.classList.contains('used')) return;
      socket.emit('host_reveal_tile', { code: SESSION_CODE, question_id: cell.dataset.id });
    });
  });
});

// ── Scores ────────────────────────────────────────────────────────────────────
function toggleScorePanel() {
  document.getElementById('score-panel').classList.toggle('hidden');
}

function renderScores() {
  const pts = activeTile ? activeTile.points : 0;
  const tbody = document.getElementById('score-table-body');
  if (!scores.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:var(--muted);font-size:0.8rem">No players yet</td></tr>';
    return;
  }
  tbody.innerHTML = scores.map(({ name, score }) => `
    <tr>
      <td>${escHtml(name)}</td>
      <td class="score-val">€${score}</td>
      <td style="display:flex;gap:3px;flex-wrap:wrap">
        <button class="btn btn-success btn-small"
          onclick="scoreCorrect('${escHtml(name)}',${pts})">+€${pts}</button>
        <button class="btn btn-danger btn-small"
          onclick="scoreWrong('${escHtml(name)}',${pts})">-€${pts}</button>
      </td>
    </tr>
  `).join('');
}

function scoreCorrect(name, pts) {
  socket.emit('host_score_correct', { code: SESSION_CODE, player_name: name, points: pts });
}
function scoreWrong(name, pts) {
  socket.emit('host_score_wrong', { code: SESSION_CODE, player_name: name, points: pts });
}

// ── Final Jeopardy ───────────────────────────────────────────────────────────
function startFinal() {
  const category = document.getElementById('final-category-input').value.trim() || 'Final Jeopardy';
  socket.emit('host_start_final', { code: SESSION_CODE, category });
  renderFinalPlayersList();
  document.getElementById('reveal-final-q-btn').disabled = true;
  addFinalNote(`Final Jeopardy started: "${category}"`);
}

function revealFinalQuestion() {
  const question = document.getElementById('final-question-input').value.trim();
  if (!question) return;
  socket.emit('host_reveal_final_question', { code: SESSION_CODE, question });
  document.getElementById('reveal-final-q-btn').disabled = true;
}

function renderFinalPlayersList() {
  const container = document.getElementById('final-players-list');
  if (!scores.length) { container.innerHTML = ''; return; }
  container.innerHTML = scores
    .filter(s => s.score >= 0)
    .map(({ name, score }) => `
      <div class="final-player-row" id="fpr-${cssId(name)}">
        <span class="final-player-name">${escHtml(name)}</span>
        <span class="status-badge waiting" id="fpr-wager-${cssId(name)}">wager?</span>
        <span class="status-badge waiting" id="fpr-answer-${cssId(name)}">answer?</span>
        <div class="final-player-answer hidden" id="fpr-ans-text-${cssId(name)}"></div>
        <div style="display:flex;gap:4px;margin-top:3px;width:100%">
          <button class="btn btn-secondary btn-small" onclick="revealFinalAnswer('${escHtml(name)}')">Reveal</button>
          <button class="btn btn-success btn-small" onclick="finalCorrect('${escHtml(name)}')">✓ Correct</button>
          <button class="btn btn-danger btn-small" onclick="finalWrong('${escHtml(name)}')">✗ Wrong</button>
        </div>
      </div>
    `).join('');
}

function updateFinalPlayerStatus(name, type, inStatus) {
  const id = cssId(name);
  const badge = document.getElementById(`fpr-${type === 'wager' ? 'wager' : 'answer'}-${id}`);
  if (badge) {
    badge.textContent = type === 'wager' ? 'wagered' : 'answered';
    badge.className = 'status-badge in';
  }
}

function updateFinalAnswerReveal(name, answer, wager) {
  const id = cssId(name);
  const ansDiv = document.getElementById(`fpr-ans-text-${id}`);
  if (ansDiv) {
    ansDiv.textContent = `"${answer}" — wagered €${wager}`;
    ansDiv.classList.remove('hidden');
  }
}

function revealFinalAnswer(name) {
  socket.emit('host_reveal_final_answer', { code: SESSION_CODE, player_name: name });
}

function finalCorrect(name) {
  socket.emit('host_final_correct', { code: SESSION_CODE, player_name: name });
}

function finalWrong(name) {
  socket.emit('host_final_wrong', { code: SESSION_CODE, player_name: name });
}

function endGame() {
  if (confirm('End the game and show final scores?')) {
    socket.emit('host_end_game', { code: SESSION_CODE });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function addFinalNote(msg) {
  const notes = document.getElementById('final-status-notes');
  if (!notes) return;
  const note = document.createElement('div');
  note.style.cssText = 'color:var(--muted);font-size:0.82rem;margin-bottom:0.3rem;';
  note.textContent = msg;
  notes.appendChild(note);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cssId(name) {
  return encodeURIComponent(name).replace(/%/g,'_');
}
