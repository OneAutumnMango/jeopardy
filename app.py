import json
import os
from flask import Flask, render_template, request, jsonify, abort

app = Flask(__name__)
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "boards.json")


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
                    "answer": f"Edit this answer in the admin panel."
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


@app.route("/")
def index():
    boards = load_boards()
    return render_template("index.html", boards=boards)


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


if __name__ == "__main__":
    app.run(debug=True)
