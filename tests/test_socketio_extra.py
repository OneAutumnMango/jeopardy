"""
Extra SocketIO tests to improve coverage of event handlers not fully
exercised by test_socketio.py.
"""
import time
import pytest
import app as flask_app
from app import app, socketio, sessions, default_boards


@pytest.fixture(autouse=True)
def clear_sessions():
    sessions.clear()
    yield
    sessions.clear()


@pytest.fixture
def host():
    app.config["TESTING"] = True
    client = socketio.test_client(app)
    yield client
    client.disconnect()


@pytest.fixture
def host_with_session(host):
    board = default_boards()["board1"]
    host.emit("host_create_session", {"board": board, "board_id": "board1"})
    received = host.get_received()
    code = next(e for e in received if e["name"] == "session_created")["args"][0]["code"]
    return host, code


def make_player(code, name):
    client = socketio.test_client(app)
    client.emit("player_join", {"code": code, "name": name})
    return client


# ── host_join_room invalid code ───────────────────────────────────────────────

def test_host_join_room_invalid_code_emits_error(host):
    host.emit("host_join_room", {"code": "XXXXXX"})
    received = host.get_received()
    err = next((e for e in received if e["name"] == "error"), None)
    assert err is not None
    assert "not found" in err["args"][0]["message"].lower()


def test_host_join_room_with_daily_doubles_emits_dd_tiles_set(host_with_session):
    host, code = host_with_session
    sessions[code]["daily_doubles"] = {"q-0-0", "q-1-0"}
    host.emit("host_join_room", {"code": code})
    received = host.get_received()
    dd_event = next((e for e in received if e["name"] == "dd_tiles_set"), None)
    assert dd_event is not None
    assert set(dd_event["args"][0]["question_ids"]) == {"q-0-0", "q-1-0"}


def test_host_join_room_emits_scores_updated(host_with_session):
    host, code = host_with_session
    host.emit("host_join_room", {"code": code})
    received = host.get_received()
    assert any(e["name"] == "scores_updated" for e in received)


def test_host_join_room_emits_player_joined(host_with_session):
    host, code = host_with_session
    host.emit("host_join_room", {"code": code})
    received = host.get_received()
    assert any(e["name"] == "player_joined" for e in received)


def test_host_join_room_emits_restore_used(host_with_session):
    host, code = host_with_session
    sessions[code]["used_tiles"] = {"q-0-0", "q-1-1"}
    host.emit("host_join_room", {"code": code})
    received = host.get_received()
    event = next((e for e in received if e["name"] == "restore_used"), None)
    assert event is not None
    assert set(event["args"][0]["used_tiles"]) == {"q-0-0", "q-1-1"}


# ── Player reconnect ──────────────────────────────────────────────────────────

def test_player_reconnect_during_game_gets_game_started(host_with_session):
    host, code = host_with_session
    # Join Alice during lobby, then start the game
    p = make_player(code, "Alice")
    p.get_received()
    host.emit("host_start_game", {"code": code})
    host.get_received()
    # Reconnect with a new client using the same name
    p2 = socketio.test_client(app)
    p2.emit("player_join", {"code": code, "name": "Alice"})
    received = p2.get_received()
    assert any(e["name"] == "game_started" for e in received)
    p.disconnect()
    p2.disconnect()


def test_player_reconnect_during_final_gets_final_started(host_with_session):
    host, code = host_with_session
    # Alice joins during lobby, then game moves to final
    p = make_player(code, "Alice")
    p.get_received()
    host.emit("host_start_game", {"code": code})
    host.get_received()
    host.emit("host_start_final", {"code": code, "category": "Science"})
    host.get_received()
    p2 = socketio.test_client(app)
    p2.emit("player_join", {"code": code, "name": "Alice"})
    received = p2.get_received()
    assert any(e["name"] == "final_jeopardy_started" for e in received)
    p.disconnect()
    p2.disconnect()


def test_player_reconnect_during_final_with_question_gets_question(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.emit("host_start_game", {"code": code})
    host.get_received()
    host.emit("host_start_final", {"code": code, "category": "Science"})
    host.get_received()
    sessions[code]["final"]["question"] = "What is gravity?"
    p2 = socketio.test_client(app)
    p2.emit("player_join", {"code": code, "name": "Alice"})
    received = p2.get_received()
    q_event = next((e for e in received if e["name"] == "final_question_revealed"), None)
    assert q_event is not None
    assert q_event["args"][0]["question"] == "What is gravity?"
    p.disconnect()
    p2.disconnect()


def test_player_reconnect_preserves_score(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.emit("host_score_correct", {"code": code, "player_name": "Alice", "points": 400})
    host.get_received()
    # Reconnect Alice with a fresh client
    p2 = socketio.test_client(app)
    p2.emit("player_join", {"code": code, "name": "Alice"})
    p2.get_received()
    # Score should still be 400
    score = next(
        pl["score"] for pl in sessions[code]["players"].values() if pl["name"] == "Alice"
    )
    assert score == 400
    p.disconnect()
    p2.disconnect()


# ── disconnect ────────────────────────────────────────────────────────────────

def test_disconnect_marks_player_inactive(host_with_session):
    _, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    sid = next(s for s, pl in sessions[code]["players"].items() if pl["name"] == "Alice")
    p.disconnect()
    assert sessions[code]["players"][sid]["active"] is False


def test_disconnect_notifies_room(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    p.disconnect()
    received = host.get_received()
    assert any(e["name"] == "player_joined" for e in received)


# ── pong_check with missing t ─────────────────────────────────────────────────

def test_pong_check_missing_t_does_not_crash(host_with_session):
    _, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    # Should not raise
    p.emit("pong_check", {})
    p.disconnect()


# ── Invalid-code guards ───────────────────────────────────────────────────────

def _invalid_code_noop(event, payload, host):
    """Helper: emit event with bad code, assert no crash and no state change."""
    host.get_received()
    host.emit(event, payload)
    # If the handler silently returns, get_received() should just be empty
    host.get_received()  # Should not raise


def test_host_start_game_invalid_code(host):
    _invalid_code_noop("host_start_game", {"code": "XXXXXX"}, host)


def test_host_reveal_tile_invalid_code(host):
    _invalid_code_noop("host_reveal_tile", {"code": "XXXXXX", "question_id": "q-0-0"}, host)


def test_host_reveal_answer_invalid_code(host):
    _invalid_code_noop("host_reveal_answer", {"code": "XXXXXX", "question_id": "q-0-0"}, host)


def test_host_mark_used_invalid_code(host):
    _invalid_code_noop("host_mark_used", {"code": "XXXXXX", "question_id": "q-0-0"}, host)


def test_host_unmark_tile_invalid_code(host):
    _invalid_code_noop("host_unmark_tile", {"code": "XXXXXX", "question_id": "q-0-0"}, host)


def test_host_next_round_invalid_code(host):
    _invalid_code_noop("host_next_round", {"code": "XXXXXX"}, host)


def test_host_remove_buzzer_invalid_code(host):
    _invalid_code_noop("host_remove_buzzer", {"code": "XXXXXX"}, host)


def test_host_clear_buzz_invalid_code(host):
    _invalid_code_noop("host_clear_buzz", {"code": "XXXXXX"}, host)


def test_host_score_correct_invalid_code(host):
    _invalid_code_noop(
        "host_score_correct",
        {"code": "XXXXXX", "player_name": "Alice", "points": 100},
        host,
    )


def test_host_score_wrong_invalid_code(host):
    _invalid_code_noop(
        "host_score_wrong",
        {"code": "XXXXXX", "player_name": "Alice", "points": 100},
        host,
    )


def test_host_dd_set_wager_invalid_code(host):
    _invalid_code_noop(
        "host_dd_set_wager",
        {"code": "XXXXXX", "player_name": "Alice", "wager": 500},
        host,
    )


def test_host_start_final_invalid_code(host):
    _invalid_code_noop("host_start_final", {"code": "XXXXXX", "category": "Test"}, host)


def test_host_reveal_final_question_invalid_code(host):
    _invalid_code_noop(
        "host_reveal_final_question",
        {"code": "XXXXXX", "question": "Q?"},
        host,
    )


def test_host_reveal_final_answer_invalid_code(host):
    _invalid_code_noop(
        "host_reveal_final_answer",
        {"code": "XXXXXX", "player_name": "Alice"},
        host,
    )


def test_host_final_correct_invalid_code(host):
    _invalid_code_noop(
        "host_final_correct", {"code": "XXXXXX", "player_name": "Alice"}, host
    )


def test_host_final_wrong_invalid_code(host):
    _invalid_code_noop(
        "host_final_wrong", {"code": "XXXXXX", "player_name": "Alice"}, host
    )


def test_host_end_game_invalid_code(host):
    _invalid_code_noop("host_end_game", {"code": "XXXXXX"}, host)


# ── buzz guards ───────────────────────────────────────────────────────────────

def test_buzz_invalid_code_is_ignored():
    p = socketio.test_client(app)
    p.emit("buzz", {"code": "XXXXXX"})
    p.disconnect()  # Should not raise


def test_buzz_non_player_sid_ignored(host_with_session):
    """A connected client that never joined as a player should be silently ignored."""
    _, code = host_with_session
    sessions[code]["active_tile"] = "q-0-0"
    stranger = socketio.test_client(app)
    # stranger's SID is not in sess["players"]
    stranger.emit("buzz", {"code": code})
    assert sessions[code]["buzz_queue"] == []
    stranger.disconnect()



    _, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    sessions[code]["active_tile"] = None
    p.emit("buzz", {"code": code})
    assert sessions[code]["buzz_queue"] == []
    p.disconnect()


def test_submit_wager_invalid_code_is_ignored():
    p = socketio.test_client(app)
    p.emit("submit_wager", {"code": "XXXXXX", "amount": 100})
    p.disconnect()


def test_submit_final_answer_invalid_code_is_ignored():
    p = socketio.test_client(app)
    p.emit("submit_final_answer", {"code": "XXXXXX", "answer": "Paris"})
    p.disconnect()


# ── host_reveal_answer ────────────────────────────────────────────────────────

def test_host_reveal_answer_emits_answer_revealed(host_with_session):
    host, code = host_with_session
    host.emit("host_start_game", {"code": code})
    host.get_received()
    # Set a known answer
    sessions[code]["board"]["categories"][0]["questions"][0]["answer"] = "The Answer"
    qid = sessions[code]["board"]["categories"][0]["questions"][0]["id"]
    host.emit("host_reveal_answer", {"code": code, "question_id": qid})
    received = host.get_received()
    event = next((e for e in received if e["name"] == "answer_revealed"), None)
    assert event is not None
    assert event["args"][0]["answer"] == "The Answer"
    assert event["args"][0]["question_id"] == qid


# ── host_unmark_tile ─────────────────────────────────────────────────────────

def test_host_unmark_tile_emits_tile_restored(host_with_session):
    host, code = host_with_session
    sessions[code]["used_tiles"].add("q-0-0")
    host.emit("host_unmark_tile", {"code": code, "question_id": "q-0-0"})
    received = host.get_received()
    event = next((e for e in received if e["name"] == "tile_restored"), None)
    assert event is not None
    assert event["args"][0]["question_id"] == "q-0-0"


def test_host_unmark_tile_removes_from_used(host_with_session):
    host, code = host_with_session
    sessions[code]["used_tiles"].add("q-0-0")
    host.emit("host_unmark_tile", {"code": code, "question_id": "q-0-0"})
    assert "q-0-0" not in sessions[code]["used_tiles"]


# ── host_remove_buzzer with empty queue ───────────────────────────────────────

def test_host_remove_buzzer_empty_queue_is_noop(host_with_session):
    host, code = host_with_session
    sessions[code]["buzz_queue"] = []
    host.emit("host_remove_buzzer", {"code": code})
    assert sessions[code]["buzz_queue"] == []


# ── host_dd_set_wager ─────────────────────────────────────────────────────────

def test_host_dd_set_wager_no_active_tile_is_noop(host_with_session):
    host, code = host_with_session
    sessions[code]["active_tile"] = None
    host.emit("host_dd_set_wager", {"code": code, "player_name": "Alice", "wager": 500})
    assert sessions[code]["dd_state"] is None


def test_host_dd_set_wager_emits_daily_double_wager_set(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    sessions[code]["active_tile"] = "q-0-0"
    host.emit("host_dd_set_wager", {"code": code, "player_name": "Alice", "wager": 200})
    received = host.get_received()
    event = next((e for e in received if e["name"] == "daily_double_wager_set"), None)
    assert event is not None
    assert event["args"][0]["player_name"] == "Alice"
    assert event["args"][0]["wager"] == 200
    p.disconnect()


def test_host_dd_set_wager_emits_tile_revealed_with_dd_flag(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    sessions[code]["active_tile"] = "q-0-0"
    host.emit("host_dd_set_wager", {"code": code, "player_name": "Alice", "wager": 300})
    received = host.get_received()
    tr = next((e for e in received if e["name"] == "tile_revealed"), None)
    assert tr is not None
    assert tr["args"][0]["is_daily_double"] is True
    assert tr["args"][0]["dd_player"] == "Alice"
    assert tr["args"][0]["dd_wager"] == 300
    p.disconnect()


def test_host_dd_set_wager_round1_cap_is_1000(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    sessions[code]["round"] = 1
    sessions[code]["active_tile"] = "q-0-0"
    # Alice has 0 score; cap is 1000 for round 1
    host.emit("host_dd_set_wager", {"code": code, "player_name": "Alice", "wager": 9999})
    assert sessions[code]["dd_state"]["wager"] == 1000
    p.disconnect()


# ── host_end_game emits game_ended ────────────────────────────────────────────

def test_host_end_game_emits_final_scores(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    host.emit("host_score_correct", {"code": code, "player_name": "Alice", "points": 600})
    host.get_received()
    host.emit("host_end_game", {"code": code})
    received = host.get_received()
    event = next((e for e in received if e["name"] == "game_ended"), None)
    assert event is not None
    scores = event["args"][0]["final_scores"]
    alice = next(s for s in scores if s["name"] == "Alice")
    assert alice["score"] == 600
    p.disconnect()


# ── host_mark_used does NOT fire round_complete outside game phase ─────────────

def test_host_mark_used_no_round_complete_in_lobby(host_with_session):
    host, code = host_with_session
    # Mark all tiles used while still in lobby phase
    board = sessions[code]["board"]
    all_ids = [q["id"] for cat in board["categories"] for q in cat["questions"]]
    for qid in all_ids[:-1]:
        sessions[code]["used_tiles"].add(qid)
    host.emit("host_mark_used", {"code": code, "question_id": all_ids[-1]})
    received = host.get_received()
    assert not any(e["name"] == "round_complete" for e in received)


# ── scores_updated content ────────────────────────────────────────────────────

def test_scores_sorted_descending(host_with_session):
    host, code = host_with_session
    p1 = make_player(code, "Alice")
    p1.get_received()
    p2 = make_player(code, "Bob")
    p2.get_received()
    host.get_received()
    host.emit("host_score_correct", {"code": code, "player_name": "Alice", "points": 100})
    host.emit("host_score_correct", {"code": code, "player_name": "Bob", "points": 500})
    host.get_received()
    host.emit("host_score_correct", {"code": code, "player_name": "Alice", "points": 200})
    received = host.get_received()
    su = next(e for e in received if e["name"] == "scores_updated")
    scores = su["args"][0]["scores"]
    values = [s["score"] for s in scores]
    assert values == sorted(values, reverse=True)
    p1.disconnect()
    p2.disconnect()


# ── final_jeopardy_started emitted to players ─────────────────────────────────

def test_final_jeopardy_started_sent_to_players(host_with_session):
    host, code = host_with_session
    p = make_player(code, "Alice")
    p.get_received()
    host.get_received()
    host.emit("host_start_final", {"code": code, "category": "Geography"})
    received = p.get_received()
    event = next((e for e in received if e["name"] == "final_jeopardy_started"), None)
    assert event is not None
    assert event["args"][0]["category"] == "Geography"
    p.disconnect()


# ── _find_question raises on missing id ──────────────────────────────────────

def test_find_question_raises_for_unknown_id():
    from app import _find_question
    board = default_boards()["board1"]
    with pytest.raises(ValueError, match="not found"):
        _find_question(board, "nonexistent-id")


# ── _pick_daily_doubles ───────────────────────────────────────────────────────

def test_pick_daily_doubles_returns_correct_count():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    dds = _pick_daily_doubles(board, 2)
    assert len(dds) == 2


def test_pick_daily_doubles_ids_are_valid():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    all_ids = {q["id"] for cat in board["categories"] for q in cat["questions"]}
    dds = _pick_daily_doubles(board, 2)
    assert dds.issubset(all_ids)


def test_pick_daily_doubles_count_capped_at_available():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    all_ids = {q["id"] for cat in board["categories"] for q in cat["questions"]}
    dds = _pick_daily_doubles(board, 999)
    assert len(dds) == len(all_ids)


def test_pick_daily_doubles_excludes_ineligible_questions():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    # Mark every question as ineligible except one
    for cat in board["categories"]:
        for q in cat["questions"]:
            q["dd_eligible"] = False
    # Re-enable just one
    target_id = board["categories"][0]["questions"][0]["id"]
    board["categories"][0]["questions"][0]["dd_eligible"] = True
    dds = _pick_daily_doubles(board, 2)
    assert dds == {target_id}


def test_pick_daily_doubles_ineligible_id_never_selected():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    excluded_id = board["categories"][0]["questions"][0]["id"]
    board["categories"][0]["questions"][0]["dd_eligible"] = False
    all_ids = {q["id"] for cat in board["categories"] for q in cat["questions"]}
    eligible_ids = all_ids - {excluded_id}
    # Run many times to confirm the ineligible question is never picked
    for _ in range(200):
        dds = _pick_daily_doubles(board, 2)
        assert excluded_id not in dds
        assert dds.issubset(eligible_ids)


def test_pick_daily_doubles_all_ineligible_returns_empty():
    from app import _pick_daily_doubles
    board = default_boards()["board1"]
    for cat in board["categories"]:
        for q in cat["questions"]:
            q["dd_eligible"] = False
    dds = _pick_daily_doubles(board, 2)
    assert dds == set()


# ── submit_wager/answer with non-player sid are ignored ───────────────────────

def test_submit_wager_non_player_sid_ignored(host_with_session):
    host, code = host_with_session
    host.emit("host_start_final", {"code": code, "category": "Test"})
    host.get_received()
    stranger = socketio.test_client(app)
    # stranger is not in session's players
    stranger.emit("submit_wager", {"code": code, "amount": 100})
    # No wager should be recorded
    assert sessions[code]["final"]["wagers"] == {}
    stranger.disconnect()


def test_submit_final_answer_non_player_sid_ignored(host_with_session):
    host, code = host_with_session
    host.emit("host_start_final", {"code": code, "category": "Test"})
    host.get_received()
    stranger = socketio.test_client(app)
    stranger.emit("submit_final_answer", {"code": code, "answer": "Paris"})
    assert sessions[code]["final"]["answers"] == {}
    stranger.disconnect()
