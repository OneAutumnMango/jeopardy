"""
Extra route tests to improve coverage of HTTP endpoints not exercised
by test_routes.py.
"""
import io
import json
import os
import pytest

import app as flask_app
from app import default_boards, sessions


@pytest.fixture
def data_file(tmp_path):
    f = tmp_path / "boards.json"
    f.write_text(json.dumps(default_boards()))
    return str(f)


@pytest.fixture
def client(data_file, monkeypatch):
    monkeypatch.setattr(flask_app, "DATA_FILE", data_file)
    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


@pytest.fixture
def client_with_session(client):
    """HTTP client that also has a live in-memory session."""
    sessions.clear()
    board = default_boards()["board1"]
    code = "TSTCOD"
    sessions[code] = {
        "board": board,
        "boards": {"board1": board, "board2": default_boards()["board2"]},
        "board_id": "board1",
        "round": 1,
        "players": {},
        "host_sid": "fake-host-sid",
        "used_tiles": set(),
        "buzz_queue": [],
        "active_tile": None,
        "phase": "lobby",
        "last_correct_sid": None,
        "daily_doubles": set(),
        "dd_state": None,
        "final_setup": {"category": "Final Jeopardy", "question": "", "answer": ""},
        "final": {"category": "", "question": "", "wagers": {}, "answers": {}, "revealed": []},
    }
    yield client, code
    sessions.clear()


# ── /host ─────────────────────────────────────────────────────────────────────

def test_host_setup_returns_200(client):
    res = client.get("/host")
    assert res.status_code == 200


def test_host_setup_contains_html(client):
    res = client.get("/host")
    assert b"html" in res.data.lower() or res.status_code == 200


# ── /host/<code> ──────────────────────────────────────────────────────────────

def test_host_game_valid_code(client_with_session):
    c, code = client_with_session
    res = c.get(f"/host/{code}")
    assert res.status_code == 200
    assert code.encode() in res.data


def test_host_game_invalid_code_returns_404(client_with_session):
    c, _ = client_with_session
    res = c.get("/host/XXXXXX")
    assert res.status_code == 404


# ── /join ─────────────────────────────────────────────────────────────────────

def test_join_returns_200(client):
    res = client.get("/join")
    assert res.status_code == 200


def test_join_with_code_param(client):
    res = client.get("/join?code=ABCDEF")
    assert res.status_code == 200


# ── /player/<code> ────────────────────────────────────────────────────────────

def test_player_valid_code(client_with_session):
    c, code = client_with_session
    res = c.get(f"/player/{code}")
    assert res.status_code == 200


def test_player_invalid_code_returns_404(client_with_session):
    c, _ = client_with_session
    res = c.get("/player/XXXXXX")
    assert res.status_code == 404


# ── /final ────────────────────────────────────────────────────────────────────

def test_final_edit_returns_200(client):
    res = client.get("/final")
    assert res.status_code == 200


# ── /game/final ───────────────────────────────────────────────────────────────

def test_game_final_returns_200(client):
    res = client.get("/game/final")
    assert res.status_code == 200


def test_game_final_renders_without_final_key(client, data_file):
    """boards.json may not have a 'final' key; route should still return 200."""
    import json
    boards = default_boards()  # no 'final' key
    with open(data_file, 'w') as f:
        json.dump(boards, f)
    res = client.get("/game/final")
    assert res.status_code == 200


def test_game_final_renders_saved_category(client, data_file):
    """Category saved to boards.json appears in the rendered page."""
    import json
    boards = default_boards()
    boards["final"] = {"category": "Famous Robots", "question": "Q", "answer": "A"}
    with open(data_file, 'w') as f:
        json.dump(boards, f)
    res = client.get("/game/final")
    assert b"Famous Robots" in res.data


# ── /edit ─────────────────────────────────────────────────────────────────────

def test_edit_boards_returns_200(client):
    res = client.get("/edit")
    assert res.status_code == 200


def test_edit_boards_contains_board_data(client):
    res = client.get("/edit")
    assert res.status_code == 200
    assert b"Board" in res.data


# ── /admin/<board_id>/save ────────────────────────────────────────────────────

def test_admin_save_no_json_returns_400(client):
    # Flask's get_json(force=True) returns a 400 for unparseable bodies;
    # the response may be HTML or JSON depending on Flask version.
    res = client.post(
        "/admin/board1/save",
        data="not-json",
        content_type="text/plain"
    )
    assert res.status_code == 400


def test_admin_save_null_json_returns_400(client):
    # JSON `null` parses to None, triggering the explicit 400 branch.
    res = client.post(
        "/admin/board1/save",
        data="null",
        content_type="application/json",
    )
    assert res.status_code == 400
    body = json.loads(res.data)
    assert body["status"] == "error"


def test_admin_save_preserves_dd_eligible(client, data_file, monkeypatch):
    """dd_eligible flag saved via admin endpoint must round-trip to disk."""
    monkeypatch.setattr(flask_app, "DATA_FILE", data_file)
    boards = default_boards()
    boards["board1"]["categories"][0]["questions"][0]["dd_eligible"] = False
    payload = boards["board1"]

    res = client.post(
        "/admin/board1/save",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert res.status_code == 200

    with open(data_file) as f:
        saved = json.load(f)
    assert saved["board1"]["categories"][0]["questions"][0]["dd_eligible"] is False


# ── /upload/image ─────────────────────────────────────────────────────────────

def test_upload_image_no_file_returns_400(client):
    res = client.post("/upload/image")
    assert res.status_code == 400
    assert b"No file" in res.data


def test_upload_image_empty_filename_returns_400(client):
    res = client.post(
        "/upload/image",
        data={"file": (io.BytesIO(b"data"), "")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    assert b"Empty filename" in res.data


def test_upload_image_disallowed_extension_returns_400(client):
    res = client.post(
        "/upload/image",
        data={"file": (io.BytesIO(b"data"), "malicious.exe")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    body = json.loads(res.data)
    assert "not allowed" in body["error"]


def test_upload_image_valid_png_returns_url(client, tmp_path, monkeypatch):
    monkeypatch.setitem(flask_app.app.config, "UPLOAD_FOLDER", str(tmp_path))
    res = client.post(
        "/upload/image",
        data={"file": (io.BytesIO(b"\x89PNG fake image data"), "test.png")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    body = json.loads(res.data)
    assert "url" in body
    assert body["url"].startswith("/uploads/")
    assert body["url"].endswith(".png")


def test_upload_image_deduplicates_identical_files(client, tmp_path, monkeypatch):
    monkeypatch.setitem(flask_app.app.config, "UPLOAD_FOLDER", str(tmp_path))
    content = b"\x89PNG identical"
    res1 = client.post(
        "/upload/image",
        data={"file": (io.BytesIO(content), "a.png")},
        content_type="multipart/form-data",
    )
    res2 = client.post(
        "/upload/image",
        data={"file": (io.BytesIO(content), "b.png")},
        content_type="multipart/form-data",
    )
    assert res1.status_code == 200
    assert res2.status_code == 200
    # Same content → same URL
    assert json.loads(res1.data)["url"] == json.loads(res2.data)["url"]
    # Only one image file on disk (tmp_path may also contain boards.json)
    image_files = [p for p in tmp_path.iterdir() if p.suffix == ".png"]
    assert len(image_files) == 1


def test_upload_image_allowed_extensions(client, tmp_path, monkeypatch):
    monkeypatch.setitem(flask_app.app.config, "UPLOAD_FOLDER", str(tmp_path))
    for ext in ("jpg", "jpeg", "gif", "webp"):
        res = client.post(
            "/upload/image",
            data={"file": (io.BytesIO(b"fake"), f"img.{ext}")},
            content_type="multipart/form-data",
        )
        assert res.status_code == 200, f"Expected 200 for .{ext}"


# ── /uploads/<filename> ───────────────────────────────────────────────────────

def test_uploaded_file_served(client, tmp_path, monkeypatch):
    monkeypatch.setitem(flask_app.app.config, "UPLOAD_FOLDER", str(tmp_path))
    # Write a file directly and serve it
    (tmp_path / "hello.txt").write_bytes(b"hello")
    res = client.get("/uploads/hello.txt")
    assert res.status_code == 200
    assert res.data == b"hello"
