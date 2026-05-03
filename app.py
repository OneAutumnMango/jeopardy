import json
import os
import random
import string

from flask import Flask, render_template, request, jsonify, abort
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins='*')

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "boards.json")

# ── In-memory session store ──────────────────────────────────────────────────
# WARNING: cleared on server restart.
sessions: dict = {}


# ── Board data helpers ───────────────────────────────────────────────────────

def default_boards():
    boards = {}
    for board_num, multiplier in [("board1", 100), ("board2", 200)]:
        label = "Board 1" if board_num == "board1" else "Board 2"
        category_names = ["History", "Science", "Pop Culture", "Geography", "Sports"]
        categories = []
        for cat_idx, cat_name in enumerate(category_names):
            questions = []
            for q_idx in range(5):
                points = multiplier * (q_idx + 1)
                questions.append({
                    "id": f"q-{cat_idx}-{q_idx}",
                    "points": points,
                    "question": f"[{cat_name} for {points}] Enter your question here.",
                    "answer": "Edit this answer in the admin panel."
                })
            categories.append({
                "id": f"cat-{cat_idx}",
                "title": cat_name,
                "questions": questions
            })
        boards[board_num] = {
            "label": label,
            "point_multiplier": multiplier,
            "categories": categories
        }
    return boards


def load_boards():
    if not os.path.exists(DATA_FILE):
        data = default_boards()
        save_boards(data)
        return data
    with open(DATA_FILE) as f:
        return json.load(f)


def save_boards(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Session helpers ──────────────────────────────────────────────────────────

def _gen_code() -> str:
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=6))
        if code not in sessions:
            return code


def _find_question(board: dict, qid: str) -> dict:
    for cat in board.get("categories", []):
        for q in cat.get("questions", []):
            if q["id"] == qid:
                return q
    raise ValueError(f"Question {qid} not found")


def _session_players_list(sess: dict) -> list:
    return [
        {"name": p["name"], "score": p["score"], "active": p["active"]}
        for p in sess["players"].values()
    ]


def _scores_list(sess: dict) -> list:
    return sorted(
        [{"name": p["name"], "score": p["score"]} for p in sess["players"].values()],
        key=lambda x: x["score"],
        reverse=True
    )


def _adjust_score(sess: dict, name: str, delta: int):
    for p in sess["players"].values():
        if p["name"] == name:
            p["score"] += delta
            return


# ── HTTP Routes ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/host")
def host_setup():
    return render_template("host_setup.html")


@app.route("/host/<code>")
def host_game(code):
    if code not in sessions:
        abort(404)
    sess = sessions[code]
    board = sess["board"]
    round_num = sess.get("round", 1)
    return render_template("host_game.html", code=code, board=board, round_num=round_num)


@app.route("/join")
def join():
    code = request.args.get("code", "")
    return render_template("join.html", code=code)


@app.route("/player/<code>")
def player(code):
    if code not in sessions:
        abort(404)
    return render_template("player.html", code=code)


@app.route("/admin/<board_id>")
def admin(board_id):
    boards = load_boards()
    if board_id not in boards:
        abort(404)
    return render_template("admin.html", board=boards[board_id], board_id=board_id)


@app.route("/admin/<board_id>/save", methods=["POST"])
def admin_save(board_id):
    boards = load_boards()
    if board_id not in boards:
        abort(404)
    payload = request.get_json(force=True)
    if not payload:
        return jsonify({"status": "error", "message": "No JSON payload"}), 400
    boards[board_id] = payload
    save_boards(boards)
    return jsonify({"status": "ok"})


@app.route("/final")
def final_edit():
    return render_template("final_edit.html")


@app.route("/edit")
def edit_boards():
    boards = load_boards()
    return render_template("edit.html", boards=boards)


@app.route("/edit/save", methods=["POST"])
def edit_boards_save():
    boards = load_boards()
    payload = request.get_json(force=True)
    if not payload:
        return jsonify({"status": "error", "message": "No JSON payload"}), 400
    for bid in ("board1", "board2"):
        if bid in payload:
            boards[bid] = payload[bid]
    save_boards(boards)
    return jsonify({"status": "ok"})


@app.route("/game/<board_id>")
def game(board_id):
    boards = load_boards()
    if board_id not in boards:
        abort(404)
    return render_template("game.html", board=boards[board_id], board_id=board_id)


@app.route("/api/board/<board_id>")
def api_board(board_id):
    boards = load_boards()
    if board_id not in boards:
        abort(404)
    return jsonify(boards[board_id])


# ── SocketIO: Session lifecycle ───────────────────────────────────────────────

@socketio.on("host_create_session")
def on_host_create_session(data):
    code = _gen_code()
    sid = request.sid
    # Accept either boards={board1:...,board2:...} or legacy board=...
    if "boards" in data:
        boards_data = data["boards"]
        board1 = boards_data.get("board1") or next(iter(boards_data.values()))
        board2 = boards_data.get("board2") or board1
    else:
        board1 = data["board"]
        board2 = board1
    sessions[code] = {
        "board": board1,
        "boards": {"board1": board1, "board2": board2},
        "board_id": "board1",
        "round": 1,
        "players": {},
        "host_sid": sid,
        "used_tiles": set(),
        "buzz_queue": [],
        "active_tile": None,
        "phase": "lobby",
        "final_setup": data.get("final_setup", {"category": "Final Jeopardy", "question": "", "answer": ""}),
        "final": {
            "category": "",
            "question": "",
            "wagers": {},
            "answers": {},
            "revealed": []
        }
    }
    join_room(code)
    join_url = request.host_url.rstrip("/") + f"/join?code={code}"
    emit("session_created", {"code": code, "join_url": join_url})


@socketio.on("host_join_room")
def on_host_join_room(data):
    code = data.get("code", "")
    if code not in sessions:
        emit("error", {"message": "Session not found"})
        return
    sess = sessions[code]
    sess["host_sid"] = request.sid
    join_room(code)
    emit("player_joined", {"players": _session_players_list(sess)})
    emit("scores_updated", {"scores": _scores_list(sess)})
    emit("restore_used", {"used_tiles": list(sess["used_tiles"])})
    emit("final_setup", sess.get("final_setup", {"category": "Final Jeopardy", "question": "", "answer": ""}))


@socketio.on("player_join")
def on_player_join(data):
    code = data.get("code", "")
    name = data.get("name", "").strip()

    if code not in sessions:
        emit("error", {"message": "Invalid session code"})
        return
    sess = sessions[code]

    if not name:
        emit("error", {"message": "Name is required"})
        return

    # Check for reconnect (existing name)
    existing_sid = next(
        (s for s, p in sess["players"].items() if p["name"] == name), None
    )
    if existing_sid:
        player_data = sess["players"].pop(existing_sid)
        player_data["active"] = True
        sess["players"][request.sid] = player_data
        join_room(code)
        emit("join_confirmed", {"name": name, "code": code})
        socketio.emit("player_joined", {"players": _session_players_list(sess)}, room=code)
        emit("scores_updated", {"scores": _scores_list(sess)})
        if sess["phase"] == "game":
            emit("game_started", {})
        elif sess["phase"] == "final_jeopardy":
            emit("game_started", {})
            emit("final_jeopardy_started", {"category": sess["final"]["category"]})
            if sess["final"]["question"]:
                emit("final_question_revealed", {"question": sess["final"]["question"]})
        return

    if sess["phase"] != "lobby":
        emit("error", {"message": "Game already in progress"})
        return

    sess["players"][request.sid] = {"name": name, "score": 0, "active": True}
    join_room(code)
    emit("join_confirmed", {"name": name, "code": code})
    socketio.emit("player_joined", {"players": _session_players_list(sess)}, room=code)


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    for code, sess in sessions.items():
        if sid in sess["players"]:
            sess["players"][sid]["active"] = False
            socketio.emit(
                "player_joined", {"players": _session_players_list(sess)}, room=code
            )
            break


# ── SocketIO: Game flow ───────────────────────────────────────────────────────

@socketio.on("host_start_game")
def on_host_start_game(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sessions[code]["phase"] = "game"
    socketio.emit("game_started", {}, room=code)


@socketio.on("host_reveal_tile")
def on_host_reveal_tile(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    qid = data["question_id"]
    sess["active_tile"] = qid
    q_data = _find_question(sess["board"], qid)
    socketio.emit("tile_revealed", {
        "question_id": qid,
        "question": q_data["question"],
        "points": q_data["points"]
    }, room=code)


@socketio.on("host_reveal_answer")
def on_host_reveal_answer(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    qid = data["question_id"]
    q_data = _find_question(sess["board"], qid)
    socketio.emit("answer_revealed", {
        "question_id": qid,
        "answer": q_data["answer"]
    }, room=code)


@socketio.on("host_mark_used")
def on_host_mark_used(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    qid = data["question_id"]
    sess["used_tiles"].add(qid)
    sess["active_tile"] = None
    sess["buzz_queue"] = []
    socketio.emit("tile_used", {"question_id": qid}, room=code)
    socketio.emit("buzz_update", {"queue": []}, room=code)
    # Check if all tiles on current board are used
    total = sum(len(cat["questions"]) for cat in sess["board"]["categories"])
    if len(sess["used_tiles"]) >= total and sess["phase"] == "game":
        socketio.emit("round_complete", {"round": sess["round"]}, room=code)


@socketio.on("host_next_round")
def on_host_next_round(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sess["round"] = 2
    sess["board"] = sess["boards"]["board2"]
    sess["board_id"] = "board2"
    sess["used_tiles"] = set()
    sess["active_tile"] = None
    sess["buzz_queue"] = []
    socketio.emit("round_changed", {"round": 2}, room=code)


@socketio.on("host_remove_buzzer")
def on_host_remove_buzzer(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    if sess["buzz_queue"]:
        sess["buzz_queue"].pop(0)
    socketio.emit("buzz_update", {
        "queue": [e["name"] for e in sess["buzz_queue"]]
    }, room=code)


# ── SocketIO: Buzz ────────────────────────────────────────────────────────────

@socketio.on("buzz")
def on_buzz(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sid = request.sid
    if sid not in sess["players"]:
        return
    if sess["active_tile"] is None:
        return
    already_in = any(entry["sid"] == sid for entry in sess["buzz_queue"])
    if not already_in:
        player = sess["players"][sid]
        sess["buzz_queue"].append({"name": player["name"], "sid": sid})
        socketio.emit("buzz_update", {
            "queue": [e["name"] for e in sess["buzz_queue"]]
        }, room=code)


@socketio.on("host_clear_buzz")
def on_host_clear_buzz(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sessions[code]["buzz_queue"] = []
    socketio.emit("buzz_update", {"queue": []}, room=code)


# ── SocketIO: Scoring ─────────────────────────────────────────────────────────

@socketio.on("host_score_correct")
def on_host_score_correct(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    _adjust_score(sess, data["player_name"], data["points"])
    socketio.emit("scores_updated", {"scores": _scores_list(sess)}, room=code)


@socketio.on("host_score_wrong")
def on_host_score_wrong(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    _adjust_score(sess, data["player_name"], -data["points"])
    socketio.emit("scores_updated", {"scores": _scores_list(sess)}, room=code)


# ── SocketIO: Final Jeopardy ──────────────────────────────────────────────────

@socketio.on("host_start_final")
def on_host_start_final(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sess["phase"] = "final_jeopardy"
    category = data.get("category", "Final Jeopardy")
    sess["final"]["category"] = category
    socketio.emit("final_jeopardy_started", {"category": category}, room=code)


@socketio.on("host_reveal_final_question")
def on_host_reveal_final_question(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    question = data.get("question", "")
    sess["final"]["question"] = question
    socketio.emit("final_question_revealed", {"question": question}, room=code)


@socketio.on("submit_wager")
def on_submit_wager(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sid = request.sid
    if sid not in sess["players"]:
        return
    name = sess["players"][sid]["name"]
    score = sess["players"][sid]["score"]
    max_wager = max(score, 0)
    amount = max(0, min(int(data.get("amount", 0)), max_wager))
    sess["final"]["wagers"][name] = amount
    emit("wager_locked", {"amount": amount})
    host_sid = sess["host_sid"]
    socketio.emit("wager_submitted", {"name": name}, room=host_sid)
    eligible = [
        p["name"] for p in sess["players"].values()
        if p["score"] >= 0 and p["active"]
    ]
    if all(n in sess["final"]["wagers"] for n in eligible):
        socketio.emit("all_wagers_in", {}, room=host_sid)


@socketio.on("submit_final_answer")
def on_submit_final_answer(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sid = request.sid
    if sid not in sess["players"]:
        return
    name = sess["players"][sid]["name"]
    sess["final"]["answers"][name] = data.get("answer", "")
    host_sid = sess["host_sid"]
    socketio.emit("final_answer_submitted", {"name": name}, room=host_sid)
    eligible = [
        p["name"] for p in sess["players"].values()
        if p["score"] >= 0 and p["active"]
    ]
    if all(n in sess["final"]["answers"] for n in eligible):
        socketio.emit("all_answers_in", {}, room=host_sid)


@socketio.on("host_reveal_final_answer")
def on_host_reveal_final_answer(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    name = data["player_name"]
    sess["final"]["revealed"].append(name)
    socketio.emit("final_answer_revealed", {
        "name": name,
        "answer": sess["final"]["answers"].get(name, ""),
        "wager": sess["final"]["wagers"].get(name, 0)
    }, room=code)


@socketio.on("host_final_correct")
def on_host_final_correct(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    name = data["player_name"]
    wager = sess["final"]["wagers"].get(name, 0)
    _adjust_score(sess, name, wager)
    socketio.emit("scores_updated", {"scores": _scores_list(sess)}, room=code)


@socketio.on("host_final_wrong")
def on_host_final_wrong(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    name = data["player_name"]
    wager = sess["final"]["wagers"].get(name, 0)
    _adjust_score(sess, name, -wager)
    socketio.emit("scores_updated", {"scores": _scores_list(sess)}, room=code)


@socketio.on("host_end_game")
def on_host_end_game(data):
    code = data.get("code", "")
    if code not in sessions:
        return
    sess = sessions[code]
    sess["phase"] = "ended"
    socketio.emit("game_ended", {"final_scores": _scores_list(sess)}, room=code)


if __name__ == "__main__":
    socketio.run(app, debug=True)
