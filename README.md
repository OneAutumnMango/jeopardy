# Jeopardy

A self-hosted Jeopardy board game built with Flask. Create two custom boards (100–500 and 200–1000 point values) and play them in your browser.

## Features

- Two boards, each with 5 categories and 5 questions
- Admin interface to set categories, questions, and answers
- Game board with click-to-reveal: click once for the question, again for the answer, again to mark as used
- Used cell state persisted in `localStorage` across page refreshes
- Reset Board button to start fresh
- Dark game-show theme

---

## Running Locally (Development)

### 1. Clone the repo

```bash
git clone <repo-url>
cd jeopardy
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Linux / macOS
# venv\Scripts\activate.bat     # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Start the development server

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

On first run, `data/boards.json` is created automatically with placeholder categories and questions.

---

## How to Play

1. **Edit a board** — click "Edit Board 1" or "Edit Board 2" in the navbar.
   - Fill in 5 category titles.
   - Fill in questions and answers for each point value.
   - Click **Save All Changes**.

2. **Start the game** — click "Play Board 1" or "Play Board 2".
   - Click a dollar amount to reveal the question.
   - Click again to reveal the answer.
   - Click once more to mark the cell as used (it goes dark).

3. **Reset** — click **Reset Board** to clear all used cells and start fresh.

---

## Deploying (Self-Hosted)

### Using Gunicorn (recommended for production)

```bash
pip install gunicorn
gunicorn app:app -b 0.0.0.0:8000
```

Access via `http://<your-server-ip>:8000`.

### Behind a reverse proxy (nginx example)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Data persistence

Board data is stored in `data/boards.json` on the host filesystem. Back it up separately — it is not tracked by git.

---

## Running Tests

```bash
pytest tests/ -v
```

Tests cover:
- All Flask routes (200/404 responses, correct content)
- Admin save endpoint (data written to disk)
- Data model (structure, point values, ID uniqueness)
- Load/save round-trip

---

## Project Structure

```
jeopardy/
├── app.py               # Flask application
├── data/
│   └── boards.json      # Board data (auto-generated, gitignored)
├── static/
│   ├── css/style.css    # Dark game-show theme
│   └── js/
│       ├── admin.js     # Admin form serialization
│       └── game.js      # Cell state machine + localStorage
├── templates/
│   ├── base.html
│   ├── index.html
│   ├── admin.html
│   └── game.html
├── tests/
│   ├── test_routes.py
│   └── test_data.py
├── requirements.txt
└── README.md
```
