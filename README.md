> This is 100% vibe coded so don't expect it to be perfect, well coded, or lacking security vulnerabilities. Theres a reason I haven't opened up my domain for others.

# Jeopardy

A self-hosted, real-time multiplayer Jeopardy web app built with Flask and Socket.IO.

## Features

- **Multiplayer**: Host a game with a 6-letter code; players join on their phones
- **Real-time**: All actions (tile reveals, buzzes, scores) sync instantly
- **Buzz queue**: Tracks buzz order so second-in-line can answer if first is wrong
- **Daily Double**: 1 hidden DD in round 1, 2 in round 2 — host sets wager, scores by wager amount
- **Scoring**: Host marks answers correct/wrong; € scoring system
- **Final Jeopardy**: Players wager secretly, type answers on phone, host reveals one by one
- **Two boards**: Board 1 (€100–€500) and Board 2 (€200–€1000), 5 categories × 5 questions each
- **Tile animation**: Clicking a tile expands it fullscreen to reveal the question, then answer
- **Board editor**: Admin UI with per-browser localStorage save, JSON export/import
- **Solo play**: Play either board locally without multiplayer

---

## Running with Docker

The image is published to GitHub Container Registry on every push to `main`. You only need two files — no local clone required:

```bash
# Download the compose file and example env
curl -O https://raw.githubusercontent.com/oneautumnmango/jeopardy/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/oneautumnmango/jeopardy/main/.env.example

# Copy and edit the env file
cp .env.example .env
# edit .env and set SECRET_KEY

docker compose up -d
docker compose down   # to stop
```

The app will be available at `http://localhost:5000`. Docker pulls `ghcr.io/oneautumnmango/jeopardy:latest` automatically — no local build needed.

To get the latest image after an update:

```bash
docker compose pull && docker compose up -d
```

**Secret key** — copy `.env.example` to `.env` and set `SECRET_KEY` to a random string:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> **Note**: Board data is persisted via the `./data` volume mount. Uploaded images are persisted via the `./uploads` volume mount. Sessions (active games) are in-memory and are lost if the container restarts.

---

## Development

```bash
git clone <repo-url>
cd jeopardy
python -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate.bat     # Windows
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000). The built-in Flask dev server is fine for local testing but not suitable for LAN play with multiple devices.

For a production-like local run using the gevent worker (required for WebSocket support with multiple users):

```bash
gunicorn app:app --worker-class=geventwebsocket.gunicorn.workers.GeventWebSocketWorker --workers=1 -b 0.0.0.0:5000
```

---

## How to Play (Multiplayer)

### Host

1. Go to **Edit Boards** to fill in your categories, questions, and answers (saved to your browser).
2. Click **Host Game** → **Create Session**.
3. Share the **6-letter code** (or the join URL) with players.
4. When everyone has joined, click **Start Game**.
5. On the board:
   - Click a tile → question appears fullscreen on all screens
   - **Shift-click** a tile → toggle it used/unused without opening it
   - Click **Reveal Answer** to show the answer
   - Click **Mark Used & Close** to close the tile (it goes dark)
6. **Daily Double**: when a DD tile is clicked, a splash screen appears — click through to enter the wager, then proceed as normal
7. **Buzz Panel**: shows who buzzed first; Correct/Wrong buttons adjust score and clear the queue
8. **Scores Panel**: manual ± buttons if you need to adjust outside of a question
9. **Final Jeopardy**: enter the category + question in the sidebar, click **Start Final Jeopardy**, then **Reveal Question** when all wagers are in; reveal each player's answer one by one

### Players (on phones)

1. Go to the site → **Join Game** → enter the 6-letter code and your name.
2. Wait for host to start.
3. When a question is revealed: press **BUZZ!** to buzz in.
4. Your position in the buzz queue is shown on screen.
5. For Final Jeopardy: enter your wager, then your answer when the question appears.

### Solo Play

Visit `/game/board1` or `/game/board2` directly.

---

## Board Editor

- Boards are saved in **your browser's localStorage** — they persist across page refreshes on the same device.
- **Export JSON**: download your board as a `.json` file (for backup or sharing).
- **Import JSON**: load a `.json` file you previously exported.
- The server has default placeholder boards; your saved boards override them on the host setup page.

> **Note**: Board data lives in your browser. Clearing browser data will reset boards to defaults.

---

## Running Tests

```bash
pytest tests/ -v
```

Tests cover:
- All HTTP routes (200/404 responses)
- Admin board save endpoint
- Board data model (point values, structure, ID uniqueness, load/save)
- SocketIO events: session creation, player join/reconnect, game flow, buzz ordering, scoring, Daily Double wager caps, Final Jeopardy wager caps and score adjustments

---

## Project Structure

```
jeopardy/
├── app.py                    # Flask app: HTTP routes + all SocketIO handlers
├── Dockerfile
├── docker-compose.yml
├── data/
│   └── boards.json           # Default board data
├── uploads/                  # Uploaded question images (auto-created; gitignored)
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
