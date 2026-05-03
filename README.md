# Jeopardy

A self-hosted, real-time multiplayer Jeopardy web app built with Flask and Socket.IO.

## Features

- **Multiplayer**: Host a game with a 6-letter code; players join on their phones
- **Real-time**: All actions (tile reveals, buzzes, scores) sync instantly
- **Buzz queue**: Tracks buzz order so second-in-line can answer if first is wrong
- **Scoring**: Host marks answers correct/wrong; € scoring system
- **Final Jeopardy**: Players wager secretly, type answers on phone, host reveals one by one
- **Two boards**: Board 1 (€100–€500) and Board 2 (€200–€1000), 5 categories × 5 questions each
- **Tile animation**: Clicking a tile expands it fullscreen to reveal the question, then answer
- **Board editor**: Admin UI with per-browser localStorage save, JSON export/import
- **Solo play**: Play either board locally without multiplayer

---

## Quick Start (Local Development)

### 1. Clone and set up

```bash
git clone <repo-url>
cd jeopardy
python -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate.bat     # Windows
pip install -r requirements.txt
```

### 2. Run the server

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000).

---

## How to Play (Multiplayer)

### Host

1. Go to **Edit Board 1** or **Edit Board 2** in the navbar.
2. Fill in your category titles, questions, and answers.
3. Click **Save All Changes** (saved to your browser).
4. Click **Host Game** → select the board → **Create Session**.
5. Share the **6-letter code** (or the join URL) with players.
6. When everyone has joined, click **Start Game**.
7. On the board:
   - Click a tile → question appears fullscreen on all screens
   - Click **Reveal Answer** to show the answer
   - Click **Mark Used & Close** to close the tile (it goes dark)
8. **Buzz Panel**: shows who buzzed first; click **Clear Buzz** after an answer
9. **Scores Panel**: click a player's ± buttons to adjust their score (uses the current tile's point value)
10. **Final Jeopardy**: enter the category + question in the sidebar, click **Start Final Jeopardy**, then **Reveal Question** when all wagers are in. Reveal each player's answer one by one.

### Players (on phones)

1. Go to the site → **Join Game** → enter the 6-letter code and your name.
2. Wait for host to start.
3. When a question is revealed: press **BUZZ!** to buzz in.
4. Your position in the buzz queue is shown on screen.
5. For Final Jeopardy: enter your wager, then your answer when the question appears.

### Solo Play

Click **Solo Play** on the home page or visit `/game/board1` / `/game/board2` directly.

---

## Board Editor

- Boards are saved in **your browser's localStorage** — they persist across page refreshes on the same device.
- **Export JSON**: download your board as a `.json` file (for backup or sharing).
- **Import JSON**: load a `.json` file you previously exported.
- The server has default placeholder boards; your saved boards override them.

> **Note**: Board data lives in your browser, not the server. Clearing browser data will reset boards to defaults.

---

## Deploying (Self-Hosted)

### Using Gunicorn (recommended)

```bash
pip install gunicorn
gunicorn app:app --worker-class=gthread --threads=4 -b 0.0.0.0:8000
```

Access via `http://<your-server-ip>:8000`.

### Set a secret key in production

```bash
export SECRET_KEY="your-random-secret-here"
gunicorn app:app --worker-class=gthread --threads=4 -b 0.0.0.0:8000
```

### Important notes

- **Sessions are in-memory**: restarting the server clears all active game sessions. Games in progress will need to be restarted.
- **Board data is per-browser**: players' phones don't need to store any board data; only the host's browser needs it.
- For HTTPS (required for LAN or internet play), put the app behind nginx with a TLS certificate.

### nginx reverse proxy example

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

The `Upgrade` / `Connection` headers are required for WebSocket (Socket.IO) support.

---

## Running Tests

```bash
pytest tests/ -v
```

Tests cover:
- All HTTP routes (200/404 responses)
- Admin board save endpoint
- Board data model (point values, structure, ID uniqueness, load/save)
- SocketIO events: session creation, player join/reconnect, game flow, buzz ordering, scoring, Final Jeopardy wager caps and score adjustments

---

## Project Structure

```
jeopardy/
├── app.py                    # Flask app: HTTP routes + all SocketIO handlers
├── data/
│   └── boards.json           # Default board data (auto-generated; gitignored)
├── static/
│   ├── css/style.css         # Dark game-show theme
│   └── js/
│       ├── admin.js          # Admin: localStorage save + export/import
│       ├── game.js           # Solo game: fullscreen overlay + used-tile state
│       ├── host.js           # Host setup page: create session, lobby
│       ├── host_game.js      # Host game: board control, buzz, scoring, final
│       └── player.js         # Player phone view: buzz, scores, final
├── templates/
│   ├── base.html             # Shared layout + navbar
│   ├── index.html            # Landing page
│   ├── admin.html            # Board editor
│   ├── game.html             # Solo game board
│   ├── host_setup.html       # Host setup + lobby
│   ├── host_game.html        # Host game view
│   ├── join.html             # Player join page
│   └── player.html           # Player phone view
├── tests/
│   ├── test_routes.py        # HTTP route tests
│   ├── test_data.py          # Board data model tests
│   └── test_socketio.py      # SocketIO event handler tests
├── requirements.txt
├── .gitignore
└── README.md
```
