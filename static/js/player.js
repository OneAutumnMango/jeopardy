// player.js — loaded on /player/<code>

const socket = io();
const SESSION_CODE = PLAYER_CODE;

let myName = sessionStorage.getItem(`jeopardy-name-${SESSION_CODE}`) || '';
let myScore = 0;
let canBuzz = false;
let hasSubmittedWager = false;
let hasSubmittedAnswer = false;

// ── Connect / (re)join ────────────────────────────────────────────────────────
socket.on('connect', () => {
  if (myName) {
    socket.emit('player_join', { code: SESSION_CODE, name: myName });
  }
});

socket.on('join_confirmed', ({ name }) => {
  myName = name;
  sessionStorage.setItem(`jeopardy-name-${SESSION_CODE}`, name);
  document.getElementById('player-name-display').textContent = name;
});

socket.on('ping_check', ({ t }) => {
  socket.emit('pong_check', { t });
});

socket.on('error', ({ message }) => {
  const el = document.getElementById('error-msg');
  el.textContent = message;
  el.classList.remove('hidden');
});

// ── Game flow ─────────────────────────────────────────────────────────────────
socket.on('game_started', () => {
  showPhase('game');
});

socket.on('round_complete', ({ round }) => {
  const title = document.getElementById('round-transition-title');
  const sub = document.getElementById('round-transition-subtitle');
  if (round === 1) {
    title.textContent = 'Round 2';
    sub.textContent = 'Get ready for the next round…';
  } else {
    title.textContent = 'Final Jeopardy';
    sub.textContent = 'Final Jeopardy is coming up!';
  }
  showPhase('round-transition');
});

socket.on('round_changed', () => {
  showPhase('game');
});

socket.on('daily_double_revealed', ({ eligible_player }) => {
  document.getElementById('question-display').classList.add('hidden');
  document.getElementById('answer-display').classList.add('hidden');
  canBuzz = false;
  document.getElementById('buzz-btn').disabled = true;
  document.getElementById('dd-player-announcement').textContent =
    eligible_player ? `${eligible_player}'s Daily Double` : 'Daily Double!';
  document.getElementById('dd-wager-announcement').textContent = 'Waiting for wager…';
  document.getElementById('dd-announcement').classList.remove('hidden');
});

socket.on('daily_double_wager_set', ({ player_name, wager }) => {
  document.getElementById('dd-player-announcement').textContent = `${player_name}'s Daily Double`;
  document.getElementById('dd-wager-announcement').textContent = `Wager: €${wager}`;
});

socket.on('tile_revealed', ({ question, points, is_daily_double, dd_player, dd_wager }) => {
  document.getElementById('dd-announcement').classList.add('hidden');
  document.getElementById('current-points').textContent = is_daily_double
    ? `DAILY DOUBLE — €${dd_wager}`
    : `€${points}`;
  document.getElementById('current-question').textContent = question;
  document.getElementById('question-display').classList.remove('hidden');
  document.getElementById('answer-display').classList.add('hidden');
  canBuzz = !is_daily_double;
  const btn = document.getElementById('buzz-btn');
  btn.disabled = !!is_daily_double;
  btn.classList.remove('buzzed');
  document.getElementById('buzz-status').textContent = '';
  document.getElementById('buzz-status').className = 'buzz-status';
});

socket.on('answer_revealed', ({ answer }) => {
  document.getElementById('current-answer').textContent = answer;
  document.getElementById('answer-display').classList.remove('hidden');
  canBuzz = false;
  document.getElementById('buzz-btn').disabled = true;
});

socket.on('tile_used', () => {
  document.getElementById('dd-announcement').classList.add('hidden');
  document.getElementById('question-display').classList.add('hidden');
  document.getElementById('answer-display').classList.add('hidden');
  canBuzz = false;
  const btn = document.getElementById('buzz-btn');
  btn.disabled = true;
  btn.classList.remove('buzzed');
  document.getElementById('buzz-status').textContent = '';
  document.getElementById('buzz-status').className = 'buzz-status';
});

socket.on('buzz_update', ({ queue }) => {
  const pos = queue.indexOf(myName);
  const statusEl = document.getElementById('buzz-status');
  if (pos === -1) {
    statusEl.textContent = '';
    statusEl.className = 'buzz-status';
  } else if (pos === 0) {
    statusEl.textContent = '⚡ YOU ARE FIRST!';
    statusEl.className = 'buzz-status first';
  } else {
    statusEl.textContent = `#${pos + 1} in queue`;
    statusEl.className = 'buzz-status queued';
  }
});

socket.on('scores_updated', ({ scores }) => {
  const me = scores.find(s => s.name === myName);
  if (me) {
    myScore = me.score;
    document.getElementById('my-score').textContent = `€${myScore}`;
    document.getElementById('wager-my-score').textContent = `€${myScore}`;
    document.getElementById('wager-max-display').textContent = `€${Math.max(myScore, 0)}`;
    const wagerInput = document.getElementById('wager-input');
    wagerInput.max = Math.max(myScore, 0);
  }
  renderLeaderboard(scores, 'leaderboard');
  renderLeaderboard(scores, 'final-leaderboard');
  renderLeaderboard(scores, 'final-scores');
});

// ── Buzz action ───────────────────────────────────────────────────────────────
function buzz() {
  if (!canBuzz) return;
  socket.emit('buzz', { code: SESSION_CODE });
  document.getElementById('buzz-btn').classList.add('buzzed');
}

// ── Final Jeopardy ────────────────────────────────────────────────────────────
socket.on('final_jeopardy_started', ({ category }) => {
  showPhase('final');
  document.getElementById('final-category-text').textContent = category;
  document.getElementById('wager-my-score').textContent = `€${myScore}`;
  document.getElementById('wager-max-display').textContent = `€${Math.max(myScore, 0)}`;
  document.getElementById('wager-input').max = Math.max(myScore, 0);

  // Only eligible players (score >= 0) can wager
  if (myScore >= 0) {
    document.getElementById('wager-section').classList.remove('hidden');
  } else {
    document.getElementById('wager-section').classList.add('hidden');
    document.getElementById('wager-submitted-msg').textContent = 'Your score is below €0 — you cannot participate in Final Jeopardy.';
    document.getElementById('wager-submitted-msg').classList.remove('hidden');
  }
});

socket.on('final_question_revealed', ({ question }) => {
  document.getElementById('final-question-text').textContent = question;
  document.getElementById('final-question-display').classList.remove('hidden');
  if (!hasSubmittedAnswer && myScore >= 0) {
    document.getElementById('answer-section').classList.remove('hidden');
  }
});

socket.on('wager_locked', ({ amount }) => {
  document.getElementById('wager-section').classList.add('hidden');
  document.getElementById('wager-submitted-msg').textContent = `Wager locked: €${amount}. Waiting for question…`;
  document.getElementById('wager-submitted-msg').classList.remove('hidden');
});

socket.on('final_answer_revealed', ({ name, answer, wager }) => {
  // Lock answer submission once reveals begin
  document.getElementById('answer-section').classList.add('hidden');
  // Append revealed card to final leaderboard area
  const container = document.getElementById('final-leaderboard');
  const card = document.createElement('div');
  card.className = 'final-reveal-card' + (name === myName ? ' lb-me' : '');
  card.innerHTML = `
    <div class="final-reveal-name">${escHtml(name)}</div>
    <div class="final-reveal-answer">${escHtml(answer)}</div>
    <div class="final-reveal-wager">Wagered: €${wager}</div>
  `;
  container.prepend(card);
});

socket.on('game_ended', ({ final_scores }) => {
  showPhase('ended');
  renderLeaderboard(final_scores, 'final-scores');
});

// ── Final actions ─────────────────────────────────────────────────────────────
function submitWager() {
  if (hasSubmittedWager) return;
  const raw = document.getElementById('wager-input').value;
  const amount = Math.max(0, Math.min(parseInt(raw) || 0, Math.max(myScore, 0)));
  socket.emit('submit_wager', { code: SESSION_CODE, amount });
  hasSubmittedWager = true;
  // The server will send back wager_locked event
}

function submitFinalAnswer() {
  if (hasSubmittedAnswer) return;
  const answer = document.getElementById('final-answer-input').value.trim();
  if (!answer) return;
  socket.emit('submit_final_answer', { code: SESSION_CODE, answer });
  hasSubmittedAnswer = true;
  document.getElementById('answer-section').classList.add('hidden');
  document.getElementById('answer-submitted-msg').classList.remove('hidden');
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showPhase(phase) {
  ['lobby', 'round-transition', 'game', 'final', 'ended'].forEach(p => {
    const el = document.getElementById(`phase-${p}`);
    if (el) el.classList.toggle('hidden', p !== phase);
  });
}

function renderLeaderboard(scores, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = scores.map((s, i) => `
    <div class="lb-row ${s.name === myName ? 'lb-me' : ''}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${escHtml(s.name)}</span>
      <span class="lb-score">€${s.score}</span>
    </div>
  `).join('');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// If name not found in sessionStorage, show error
document.addEventListener('DOMContentLoaded', () => {
  if (!myName) {
    document.getElementById('error-msg').textContent =
      'Session not found. Please join again.';
    document.getElementById('error-msg').classList.remove('hidden');
  }
});
