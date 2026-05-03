import json
import os
import pytest

import app as flask_app
from app import default_boards


@pytest.fixture
def data_file(tmp_path):
    """Write default boards to a temp file and return its path."""
    f = tmp_path / "boards.json"
    f.write_text(json.dumps(default_boards()))
    return str(f)


@pytest.fixture
def client(data_file, monkeypatch):
    monkeypatch.setattr(flask_app, "DATA_FILE", data_file)
    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


def test_index_returns_200(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Jeopardy" in res.data


def test_admin_board1_loads(client):
    res = client.get("/admin/board1")
    assert res.status_code == 200
    assert b"Board 1" in res.data


def test_admin_board2_loads(client):
    res = client.get("/admin/board2")
    assert res.status_code == 200
    assert b"Board 2" in res.data


def test_admin_invalid_board_returns_404(client):
    res = client.get("/admin/board99")
    assert res.status_code == 404


def test_game_board1_loads(client):
    res = client.get("/game/board1")
    assert res.status_code == 200
    assert b"board" in res.data.lower()


def test_game_board2_loads(client):
    res = client.get("/game/board2")
    assert res.status_code == 200


def test_game_invalid_board_returns_404(client):
    res = client.get("/game/board99")
    assert res.status_code == 404


def test_api_board_returns_json(client):
    res = client.get("/api/board/board1")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["label"] == "Board 1"
    assert "categories" in data


def test_api_board_invalid_returns_404(client):
    res = client.get("/api/board/notexist")
    assert res.status_code == 404


def test_admin_save_updates_board(client, data_file, monkeypatch):
    monkeypatch.setattr(flask_app, "DATA_FILE", data_file)
    boards = default_boards()
    boards["board1"]["categories"][0]["title"] = "NEW CATEGORY"
    payload = boards["board1"]

    res = client.post(
        "/admin/board1/save",
        data=json.dumps(payload),
        content_type="application/json"
    )
    assert res.status_code == 200
    result = json.loads(res.data)
    assert result["status"] == "ok"

    # Verify the file was updated
    with open(data_file) as f:
        saved = json.load(f)
    assert saved["board1"]["categories"][0]["title"] == "NEW CATEGORY"


def test_admin_save_invalid_board_returns_404(client):
    res = client.post(
        "/admin/invalidboard/save",
        data=json.dumps({}),
        content_type="application/json"
    )
    assert res.status_code == 404


def test_game_board_shows_point_values(client):
    res = client.get("/game/board1")
    assert b"100" in res.data
    assert b"500" in res.data


def test_game_board2_shows_double_point_values(client):
    res = client.get("/game/board2")
    assert b"200" in res.data
    assert b"1000" in res.data
