// host_game.js — loaded on /host/<code>

const socket = io();
const SESSION_CODE = HOST_GAME_CODE;

let activeTile = null;   // {question_id, points}
let scores = [];
let currentBuzzQueue = [];   // latest queue from server
let overlayBuzzerIndex = 0;  // which buzzer is currently "up"

// Daily Double overlay state
let ddData = null;   // { question_id, points, eligible_player, player_names, max_cap }
let ddPhase = 'splash';

// Final Jeopardy overlay state
let foPhase = 'wager';        // 'wager' | 'answer'
let foIntroPhase = 'title';   // 'title' | 'category' | 'active'
let foWagered = new Set();
let foAnswered = new Set();
let foRevealed = new Set();
let foScored = new Set();
let foCategory = '';

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
  const foScores = document.getElementById('fo-final-scores');
  if (!foScores) return;
  const eligible = scores.filter(p => p.score >= 0);
  const allDone = foRevealed.size > 0
    && foScored.size >= foRevealed.size
    && foRevealed.size >= eligible.length;
  if (!foScores.classList.contains('hidden')) {
    renderFoFinalScores();
  } else if (allDone) {
    renderFoFinalScores();
  }
});

socket.on('restore_used', ({ used_tiles }) => {
  used_tiles.forEach(qid => {
    const cell = document.getElementById(qid);
    if (cell) setCellUsed(cell);
  });
});

socket.on('daily_double_revealed', (data) => {
  ddData = data;
  activeTile = { question_id: data.question_id, points: data.points };
  overlayBuzzerIndex = 0;
  openDdOverlay(data);
});

socket.on('dd_tiles_set', ({ question_ids }) => {
  question_ids.forEach(qid => {
    const cell = document.getElementById(qid);
    if (cell && !cell.classList.contains('used')) {
      cell.classList.add('daily-double');
    }
  });
});

socket.on('tile_revealed', ({ question_id, question, points, is_daily_double, dd_player, dd_wager }) => {
  if (is_daily_double) {
    activeTile = { question_id, question, points: dd_wager, is_daily_double: true, dd_player };
  } else {
    activeTile = { question_id, question, points };
  }
  overlayBuzzerIndex = 0;
  openHostOverlay(question, is_daily_double ? dd_wager : points, is_daily_double, dd_player, dd_wager);
});

socket.on('answer_revealed', ({ answer }) => {
  renderQuestionContent(answer, document.getElementById('host-overlay-text'));
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

socket.on('tile_restored', ({ question_id }) => {
  const cell = document.getElementById(question_id);
  if (cell) setCellOpen(cell);
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
  foWagered.add(name);
  const badge = document.getElementById(`fo-w-${cssId(name)}`);
  if (badge) { badge.textContent = '✓ wagered'; badge.className = 'status-badge in'; }
  updateFinalPlayerStatus(name, 'wager', true);
});

socket.on('all_wagers_in', () => {
  document.getElementById('fo-proceed-btn').disabled = false;
  document.getElementById('fo-phase-label').textContent = 'All wagers in — proceed when ready';
  addFinalNote('✓ All wagers in');
});

socket.on('final_answer_submitted', ({ name }) => {
  foAnswered.add(name);
  const badge = document.getElementById(`fo-a-${cssId(name)}`);
  if (badge) { badge.textContent = '✓ answered'; badge.className = 'status-badge in'; }
  updateFinalPlayerStatus(name, 'answer', true);
});

socket.on('all_answers_in', () => {
  document.getElementById('fo-phase-label').textContent = 'All answers in — reveal one by one';
  addFinalNote('✓ All answers in');
  // Enable all reveal buttons now that everyone has answered
  document.querySelectorAll('[id^="fo-reveal-btn-"]').forEach(btn => btn.disabled = false);
});

socket.on('final_answer_revealed', ({ name, answer, wager }) => {
  updateFinalAnswerReveal(name, answer, wager);
  const id = cssId(name);
  const ansDiv = document.getElementById(`fo-ans-text-${id}`);
  if (ansDiv) { ansDiv.textContent = `"${answer}" — wagered €${wager}`; ansDiv.classList.remove('hidden'); }
  const revealBtn = document.getElementById(`fo-reveal-btn-${id}`);
  if (revealBtn) revealBtn.classList.add('hidden');
  const scoreBtns = document.getElementById(`fo-score-btns-${id}`);
  if (scoreBtns) scoreBtns.classList.remove('hidden');
  foRevealed.add(name);
});

socket.on('final_jeopardy_started', ({ category }) => {
  openFinalOverlay(category);
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

socket.on('restore_state', ({ phase, final }) => {
  if (phase !== 'final_jeopardy' && phase !== 'ended') return;

  // Switch UI from board view to final section
  document.getElementById('board-section').classList.add('hidden');
  document.getElementById('final-section').classList.remove('hidden');

  if (phase === 'ended') return;  // game already over, scores panel sufficient

  const category = final.category || 'Final Jeopardy';

  // Restore JS state
  foCategory = category;
  foWagered = new Set(final.wagers || []);
  foAnswered = new Set(final.answers || []);
  foRevealed = new Set(final.revealed || []);
  foScored   = new Set(final.revealed || []);  // already scored if revealed
  foPhase    = final.question ? 'answer' : 'wager';
  foIntroPhase = 'active';

  // Populate category labels
  document.getElementById('fo-category').textContent = category;
  document.getElementById('fo-category-label').textContent = category;

  // Skip intro screens, go straight to the active panel
  document.getElementById('fo-title-screen').classList.add('hidden');
  document.getElementById('fo-category-screen').classList.add('hidden');
  document.getElementById('fo-main-screen').classList.remove('hidden');
  document.getElementById('fo-players').classList.remove('hidden');
  document.getElementById('fo-phase-label').classList.remove('hidden');
  document.getElementById('fo-final-scores').classList.add('hidden');

  // Show overlay
  const overlay = document.getElementById('final-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('active');

  if (foPhase === 'wager') {
    document.getElementById('fo-question-wrap').classList.add('hidden');
    document.getElementById('fo-proceed-btn').disabled = foWagered.size === 0;
    document.getElementById('fo-phase-label').textContent =
      foWagered.size > 0 ? 'All wagers in — proceed when ready' : 'Waiting for wagers…';
    renderFoPlayers();
  } else {
    // Answer phase — question already revealed
    document.getElementById('fo-question-wrap').classList.remove('hidden');
    document.getElementById('fo-question').textContent = final.question || '';
    document.getElementById('fo-proceed-btn').classList.add('hidden');
    // Determine label
    const allAnswered = scores.filter(s => s.score >= 0).every(s => foAnswered.has(s.name));
    if (foRevealed.size > 0) {
      document.getElementById('fo-phase-label').textContent = 'Reveal answers one by one';
    } else if (allAnswered) {
      document.getElementById('fo-phase-label').textContent = 'All answers in — reveal one by one';
    } else {
      document.getElementById('fo-phase-label').textContent = 'Waiting for answers…';
    }
    renderFoPlayers();
    // Re-apply revealed state for each player
    (final.revealed || []).forEach(name => {
      const id = cssId(name);
      const ansDiv = document.getElementById(`fo-ans-text-${id}`);
      const answer = (final.answer_map || {})[name] || '';
      const wager  = (final.wager_map  || {})[name] || 0;
      if (ansDiv) { ansDiv.textContent = `"${answer}" — wagered €${wager}`; ansDiv.classList.remove('hidden'); }
      const revealBtn = document.getElementById(`fo-reveal-btn-${id}`);
      if (revealBtn) revealBtn.classList.add('hidden');
      const scoreBtns = document.getElementById(`fo-score-btns-${id}`);
      if (scoreBtns) scoreBtns.classList.add('hidden');  // already scored
    });
    // Enable reveal buttons for players who answered but weren't revealed yet
    (final.answers || []).forEach(name => {
      if (!foRevealed.has(name)) {
        const revealBtn = document.getElementById(`fo-reveal-btn-${cssId(name)}`);
        if (revealBtn) revealBtn.disabled = false;
      }
    });
  }
});

// ── Question content renderer ─────────────────────────────────────────────────

function renderQuestionContent(text, el) {
  if (text && text.startsWith('[img]')) {
    el.textContent = '';
    const raw = text.slice(5); // strip [img]
    const capIdx = raw.indexOf('[cap]');
    const src = capIdx === -1 ? raw : raw.slice(0, capIdx);
    const caption = capIdx === -1 ? '' : raw.slice(capIdx + 5).trim();
    const img = document.createElement('img');
    img.src = src;
    img.className = 'overlay-question-img';
    el.appendChild(img);
    if (caption) {
      const cap = document.createElement('div');
      cap.className = 'overlay-img-caption';
      cap.textContent = caption;
      el.appendChild(cap);
    }
  } else {
    el.textContent = text || '';
  }
}

// ── Overlay helpers ─────────────────────────────────────────────────────────
function openHostOverlay(question, points, isDailyDouble, ddPlayer) {
  const overlay = document.getElementById('host-tile-overlay');
  const pointsEl = document.getElementById('host-overlay-points');
  if (isDailyDouble) {
    pointsEl.textContent = `DAILY DOUBLE — ${ddPlayer} wagered €${points}`;
  } else {
    pointsEl.textContent = `€${points}`;
  }
  const textEl = document.getElementById('host-overlay-text');
  renderQuestionContent(question, textEl);
  textEl.className = 'overlay-text question-text';
  document.getElementById('host-reveal-answer-btn').disabled = false;

  // For DD, hide the buzz queue and pre-populate score controls
  const buzzQueue = document.getElementById('overlay-buzz-queue');
  const ctrl = document.getElementById('overlay-score-controls');
  const nameEl = document.getElementById('overlay-buzzer-name');
  if (isDailyDouble) {
    if (buzzQueue) buzzQueue.innerHTML = '';
    if (ctrl && nameEl) {
      nameEl.textContent = ddPlayer || '';
      ctrl.classList.remove('hidden');
    }
  }

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

function setCellOpen(cell) {
  cell.className = 'cell question-cell';
  const pd = cell.querySelector('.points-display');
  if (pd) pd.classList.remove('hidden');
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
    // Skip the setup screen and go straight to the Final Jeopardy overlay
    document.getElementById('board-section').classList.add('hidden');
    document.getElementById('final-section').classList.remove('hidden');
    renderFinalPlayersList();
    startFinal();
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
  const name = activeTile.is_daily_double ? activeTile.dd_player : currentBuzzQueue[overlayBuzzerIndex];
  if (!name) return;
  socket.emit('host_reveal_answer', { code: SESSION_CODE, question_id: activeTile.question_id });
  socket.emit('host_score_correct', { code: SESSION_CODE, player_name: name, points: activeTile.points });
  if (activeTile.is_daily_double) {
    hostMarkUsed();
  } else {
    socket.emit('host_clear_buzz', { code: SESSION_CODE });
  }
}

function overlayScoreWrong() {
  if (!activeTile) return;
  const name = activeTile.is_daily_double ? activeTile.dd_player : currentBuzzQueue[overlayBuzzerIndex];
  if (!name) return;
  socket.emit('host_score_wrong', { code: SESSION_CODE, player_name: name, points: activeTile.points });
  if (activeTile.is_daily_double) {
    hostMarkUsed();
  } else {
    // Advance to next buzzer without modifying server queue
    overlayBuzzerIndex++;
    renderOverlayBuzzQueue();
  }
}

// ── Board clicks ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.question-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.shiftKey) {
        if (cell.classList.contains('used')) {
          socket.emit('host_unmark_tile', { code: SESSION_CODE, question_id: cell.dataset.id });
        } else {
          socket.emit('host_mark_used', { code: SESSION_CODE, question_id: cell.dataset.id });
        }
        return;
      }
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
  const pts = activeTile ? activeTile.points : 100;
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
}

// ── Final Jeopardy Overlay ────────────────────────────────────────────────────
function openFinalOverlay(category) {
  foCategory = category;
  foPhase = 'wager';
  foIntroPhase = 'title';
  foWagered = new Set();
  foAnswered = new Set();
  foRevealed = new Set();
  foScored = new Set();

  // Reset screens
  document.getElementById('fo-title-screen').classList.remove('hidden');
  document.getElementById('fo-category-screen').classList.add('hidden');
  document.getElementById('fo-main-screen').classList.add('hidden');

  // Populate category text in both screens
  document.getElementById('fo-category').textContent = category;
  document.getElementById('fo-category-label').textContent = category;

  // Reset main-screen state
  document.getElementById('fo-question-wrap').classList.add('hidden');
  document.getElementById('fo-final-scores').classList.add('hidden');
  document.getElementById('fo-players').classList.remove('hidden');
  document.getElementById('fo-phase-label').classList.remove('hidden');
  document.getElementById('fo-phase-label').textContent = 'Waiting for wagers…';
  document.getElementById('fo-proceed-btn').disabled = true;

  const overlay = document.getElementById('final-overlay');
  overlay.classList.remove('hidden');
  overlay.offsetHeight;
  overlay.classList.add('active');
}

function foAdvanceIntro() {
  if (foIntroPhase === 'title') {
    document.getElementById('fo-title-screen').classList.add('hidden');
    document.getElementById('fo-category-screen').classList.remove('hidden');
    foIntroPhase = 'category';
  } else if (foIntroPhase === 'category') {
    document.getElementById('fo-category-screen').classList.add('hidden');
    document.getElementById('fo-main-screen').classList.remove('hidden');
    foIntroPhase = 'active';
    renderFoPlayers();
  }
}

function foProceedToQuestion() {
  const question = document.getElementById('final-question-input').value.trim();
  socket.emit('host_reveal_final_question', { code: SESSION_CODE, question });
  foPhase = 'answer';
  foAnswered = new Set();
  document.getElementById('fo-question').textContent = question;
  document.getElementById('fo-question-wrap').classList.remove('hidden');
  document.getElementById('fo-phase-label').textContent = 'Waiting for answers…';
  document.getElementById('fo-proceed-btn').classList.add('hidden');
  renderFoPlayers();
}

function renderFoPlayers() {
  const el = document.getElementById('fo-players');
  const eligible = scores.filter(s => s.score >= 0);
  if (!eligible.length) { el.innerHTML = ''; return; }

  if (foPhase === 'wager') {
    el.innerHTML = eligible.map(({ name }) => `
      <div class="fo-player-row">
        <span class="fo-player-name">${escHtml(name)}</span>
        <span class="status-badge ${foWagered.has(name) ? 'in' : 'waiting'}" id="fo-w-${cssId(name)}">
          ${foWagered.has(name) ? '✓ wagered' : '⋯ waiting'}
        </span>
      </div>
    `).join('');
  } else {
    el.innerHTML = eligible.map(({ name }) => `
      <div class="fo-player-row" id="fo-row-${cssId(name)}">
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem">
          <span class="fo-player-name">${escHtml(name)}</span>
          <span class="status-badge ${foAnswered.has(name) ? 'in' : 'waiting'}" id="fo-a-${cssId(name)}">
            ${foAnswered.has(name) ? '✓ answered' : '⋯ waiting'}
          </span>
        </div>
        <button id="fo-reveal-btn-${cssId(name)}" class="btn btn-secondary"
          style="width:100%;padding:0.75rem;font-size:1rem;margin-bottom:0.5rem"
          disabled
          onclick="revealFinalAnswer('${escHtml(name)}')">▶ Reveal Answer</button>
        <div id="fo-ans-text-${cssId(name)}" class="fo-answer-reveal hidden"
          style="padding:0.75rem;background:rgba(255,255,255,0.07);border-radius:8px;text-align:center;margin-bottom:0.5rem"></div>
        <div id="fo-score-btns-${cssId(name)}" class="hidden" style="display:flex;gap:0.5rem">
          <button class="btn btn-success" style="flex:1" onclick="finalCorrect('${escHtml(name)}')">✓ Correct</button>
          <button class="btn btn-danger" style="flex:1" onclick="finalWrong('${escHtml(name)}')">✗ Wrong</button>
        </div>
      </div>
    `).join('');
  }
}

function renderFinalPlayersList() {
  const container = document.getElementById('final-players-list');
  if (!scores.length) { container.innerHTML = ''; return; }
  container.innerHTML = scores
    .filter(s => s.score >= 0)
    .map(({ name }) => `
      <div class="final-player-row" id="fpr-${cssId(name)}">
        <span class="final-player-name">${escHtml(name)}</span>
        <span class="status-badge waiting" id="fpr-wager-${cssId(name)}">wager?</span>
        <span class="status-badge waiting" id="fpr-answer-${cssId(name)}">answer?</span>
        <div class="final-player-answer hidden" id="fpr-ans-text-${cssId(name)}"></div>
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

function renderFoFinalScores() {
  const wrap = document.getElementById('fo-final-scores');
  const list = document.getElementById('fo-final-scores-list');
  if (!wrap || !list) return;
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  list.innerHTML = sorted.map((s, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:0.4rem 0.75rem;background:rgba(255,255,255,0.06);border-radius:6px">
      <span style="color:var(--muted);font-size:0.85rem;min-width:1.5rem">${i + 1}.</span>
      <span style="flex:1;font-family:'Oswald',sans-serif;color:var(--text)">${escHtml(s.name)}</span>
      <span style="font-family:'Oswald',sans-serif;color:var(--gold);font-size:1.1rem">€${s.score}</span>
    </div>
  `).join('');
  // Hide player rows and show final scores as the new screen
  document.getElementById('fo-players').classList.add('hidden');
  document.getElementById('fo-question-wrap').classList.add('hidden');
  document.getElementById('fo-phase-label').classList.add('hidden');
  wrap.classList.remove('hidden');
}

function revealFinalAnswer(name) {
  socket.emit('host_reveal_final_answer', { code: SESSION_CODE, player_name: name });
}

function finalCorrect(name) {
  foScored.add(name);
  document.getElementById(`fo-score-btns-${cssId(name)}`)?.classList.add('hidden');
  socket.emit('host_final_correct', { code: SESSION_CODE, player_name: name });
}

function finalWrong(name) {
  foScored.add(name);
  document.getElementById(`fo-score-btns-${cssId(name)}`)?.classList.add('hidden');
  socket.emit('host_final_wrong', { code: SESSION_CODE, player_name: name });
}

function endGame() {
  if (confirm('End the game and show final scores?')) {
    socket.emit('host_end_game', { code: SESSION_CODE });
  }
}

// ── Daily Double Overlay ──────────────────────────────────────────────────────
function openDdOverlay(data) {
  ddPhase = 'splash';
  document.getElementById('dd-splash-screen').classList.remove('hidden');
  document.getElementById('dd-wager-screen').classList.add('hidden');

  // Pre-populate wager screen
  document.getElementById('dd-tile-points').textContent = `Tile value: €${data.points}`;
  const sel = document.getElementById('dd-player-select');
  sel.innerHTML = data.player_names.map(n =>
    `<option value="${escHtml(n)}" ${n === data.eligible_player ? 'selected' : ''}>${escHtml(n)}</option>`
  ).join('');
  document.getElementById('dd-wager-input').value = '';
  updateDdWagerLimits();

  const overlay = document.getElementById('dd-overlay');
  overlay.classList.remove('hidden');
  overlay.offsetHeight;
  overlay.classList.add('active');
}

function ddAdvance() {
  if (ddPhase !== 'splash') return;
  ddPhase = 'wager';
  document.getElementById('dd-splash-screen').classList.add('hidden');
  document.getElementById('dd-wager-screen').classList.remove('hidden');
}

function updateDdWagerLimits() {
  if (!ddData) return;
  const playerName = document.getElementById('dd-player-select').value;
  const playerScore = (scores.find(s => s.name === playerName) || {}).score || 0;
  const cap = ddData.max_cap;
  const maxWager = playerScore > 0 ? Math.max(cap, playerScore) : cap;
  document.getElementById('dd-wager-limits').textContent = `Min: €5  |  Max: €${maxWager}`;
  document.getElementById('dd-wager-input').max = maxWager;
}

function ddConfirmWager() {
  if (!ddData) return;
  const playerName = document.getElementById('dd-player-select').value;
  const wager = parseInt(document.getElementById('dd-wager-input').value) || 5;
  socket.emit('host_dd_set_wager', { code: SESSION_CODE, player_name: playerName, wager });
  closeDdOverlay();
}

function closeDdOverlay() {
  const overlay = document.getElementById('dd-overlay');
  overlay.classList.remove('active');
  overlay.addEventListener('transitionend', () => {
    overlay.classList.add('hidden');
  }, { once: true });
  ddData = null;
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
