// host.js — loaded on /host (setup page)

const socket = io();
let sessionCode = null;

// Update board choice labels from localStorage if boards are saved there
['board1', 'board2'].forEach(boardId => {
  const raw = localStorage.getItem(`jeopardy-board-${boardId}`);
  if (raw) {
    try {
      const board = JSON.parse(raw);
      const el = document.getElementById(`${boardId}-label`);
      if (el) {
        const m = board.point_multiplier || (boardId === 'board1' ? 100 : 200);
        el.textContent = `${board.label || boardId} (€${m}–€${m * 5})`;
      }
    } catch {}
  }
});

function createSession() {
  function loadBoard(boardId) {
    const raw = localStorage.getItem(`jeopardy-board-${boardId}`);
    if (raw) {
      try { return Promise.resolve(JSON.parse(raw)); } catch {}
    }
    return fetch(`/api/board/${boardId}`).then(r => r.json());
  }

  const rawFinal = localStorage.getItem('jeopardy-final');
  const finalSetup = rawFinal ? (() => { try { return JSON.parse(rawFinal); } catch { return null; } })() : null;

  Promise.all([loadBoard('board1'), loadBoard('board2')])
    .then(([board1, board2]) => {
      const payload = { boards: { board1, board2 } };
      if (finalSetup) payload.final_setup = finalSetup;
      socket.emit('host_create_session', payload);
    })
    .catch(() => {
      document.getElementById('error-msg').textContent = 'Could not load board data.';
      document.getElementById('error-msg').classList.remove('hidden');
    });
}

socket.on('session_created', ({ code, join_url }) => {
  sessionCode = code;
  document.getElementById('setup-form').classList.add('hidden');
  document.getElementById('lobby-panel').classList.remove('hidden');
  document.getElementById('session-code').textContent = code;
  const urlEl = document.getElementById('join-url');
  urlEl.textContent = join_url;
  urlEl.href = join_url;

  // Generate QR code
  const qrContainer = document.getElementById('join-qr');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: join_url,
    width: 320,
    height: 320,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  document.getElementById('join-qr-panel').style.display = 'block';
  if (typeof positionQrPanel === 'function') positionQrPanel();
});

socket.on('player_joined', ({ players }) => {
  const list = document.getElementById('player-list');
  const countEl = document.getElementById('player-count-lobby');
  const active = players.filter(p => p.active);
  countEl.textContent = `(${active.length})`;
  list.innerHTML = players.map(p =>
    `<li class="${p.active ? '' : 'inactive'}">${p.name}${p.active ? '' : ' (disconnected)'}</li>`
  ).join('');
});

socket.on('error', ({ message }) => {
  document.getElementById('error-msg').textContent = message;
  document.getElementById('error-msg').classList.remove('hidden');
});

function startGame() {
  if (!sessionCode) return;
  socket.emit('host_start_game', { code: sessionCode });
  window.location.href = `/host/${sessionCode}`;
}
