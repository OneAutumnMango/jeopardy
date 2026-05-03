import json
import os
import tempfile

import pytest
from app import default_boards, load_boards, save_boards


def test_default_boards_returns_two_boards():
    boards = default_boards()
    assert set(boards.keys()) == {"board1", "board2"}


def test_default_boards_have_five_categories():
    boards = default_boards()
    for board_id in ("board1", "board2"):
        assert len(boards[board_id]["categories"]) == 5


def test_default_boards_have_five_questions_per_category():
    boards = default_boards()
    for board_id in ("board1", "board2"):
        for cat in boards[board_id]["categories"]:
            assert len(cat["questions"]) == 5


def test_board1_point_values():
    boards = default_boards()
    cats = boards["board1"]["categories"]
    expected = [100, 200, 300, 400, 500]
    for cat in cats:
        actual_points = [q["points"] for q in cat["questions"]]
        assert actual_points == expected


def test_board2_point_values():
    boards = default_boards()
    cats = boards["board2"]["categories"]
    expected = [200, 400, 600, 800, 1000]
    for cat in cats:
        actual_points = [q["points"] for q in cat["questions"]]
        assert actual_points == expected


def test_board1_multiplier():
    boards = default_boards()
    assert boards["board1"]["point_multiplier"] == 100


def test_board2_multiplier():
    boards = default_boards()
    assert boards["board2"]["point_multiplier"] == 200


def test_question_ids_are_unique():
    boards = default_boards()
    for board_id, board in boards.items():
        ids = [q["id"] for cat in board["categories"] for q in cat["questions"]]
        assert len(ids) == len(set(ids)), f"Duplicate question IDs in {board_id}"


def test_category_ids_are_unique():
    boards = default_boards()
    for board_id, board in boards.items():
        ids = [cat["id"] for cat in board["categories"]]
        assert len(ids) == len(set(ids)), f"Duplicate category IDs in {board_id}"


def test_load_save_roundtrip(tmp_path, monkeypatch):
    import app
    test_file = str(tmp_path / "boards.json")
    monkeypatch.setattr(app, "DATA_FILE", test_file)

    original = default_boards()
    save_boards(original)

    loaded = load_boards()
    assert loaded == original


def test_load_creates_file_if_missing(tmp_path, monkeypatch):
    import app
    test_file = str(tmp_path / "boards.json")
    monkeypatch.setattr(app, "DATA_FILE", test_file)

    assert not os.path.exists(test_file)
    boards = load_boards()
    assert os.path.exists(test_file)
    assert set(boards.keys()) == {"board1", "board2"}


def test_save_boards_writes_valid_json(tmp_path, monkeypatch):
    import app
    test_file = str(tmp_path / "boards.json")
    monkeypatch.setattr(app, "DATA_FILE", test_file)

    data = default_boards()
    save_boards(data)

    with open(test_file) as f:
        parsed = json.load(f)
    assert parsed == data


def test_questions_have_required_fields():
    boards = default_boards()
    required = {"id", "points", "question", "answer"}
    for board_id, board in boards.items():
        for cat in board["categories"]:
            for q in cat["questions"]:
                assert required.issubset(q.keys()), f"Missing fields in {board_id}/{cat['id']}"
