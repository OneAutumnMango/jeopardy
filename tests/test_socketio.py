import json
import pytest
import app as flask_app
from app import app, socketio, sessions, default_boards


@pytest.fixture(autouse=True)
def clear_sessions():
    """Clear in-memory sessions before each test."""
    sessions.clear()
    yield
    sessions.clear()


@pytest.fixture
def host():
    """A connected SocketIO test client acting as host."""
    app.config['TESTING'] = True
    client = socketio.test_client(app)
    yield client
    client.disconnect()


@pytest.fixture
def host_with_session(host):
    """Host that has already created a session."""
    board = default_boards()['board1']
    host.emit('host_create_session', {'board': board, 'board_id': 'board1'})
    received = host.get_received()
    event = next(e for e in received if e['name'] == 'session_created')
    code = event['args'][0]['code']
    return host, code


def make_player(code, name):
    """Connect a new player, join a session, return (client, code)."""
    client = socketio.test_client(app)
    client.emit('player_join', {'code': code, 'name': name})
    return client


# ── Session creation ──────────────────────────────────────────────────────────

def test_host_create_session_returns_code(host):
    board = default_boards()['board1']
    host.emit('host_create_session', {'board': board, 'board_id': 'board1'})
    received = host.get_received()
    event = next((e for e in received if e['name'] == 'session_created'), None)
    assert event is not None
    code = event['args'][0]['code']
    assert len(code) == 6
    assert code.isupper()
    assert code in sessions


def test_host_create_session_stores_board(host):
    board = default_boards()['board1']
    host.emit('host_create_session', {'board': board, 'board_id': 'board1'})
    received = host.get_received()
    code = next(e for e in received if e['name'] == 'session_created')['args'][0]['code']
    assert sessions[code]['board'] == board
    assert sessions[code]['phase'] == 'lobby'


def test_session_code_is_unique(host):
    board = default_boards()['board1']
    host.emit('host_create_session', {'board': board, 'board_id': 'board1'})
    host.get_received()
    host.emit('host_create_session', {'board': board, 'board_id': 'board1'})
    received = host.get_received()
    code2 = next(e for e in received if e['name'] == 'session_created')['args'][0]['code']
    assert len(sessions) == 2
    assert code2 in sessions


# ── Player join ───────────────────────────────────────────────────────────────

def test_player_join_valid(host_with_session):
    _, code = host_with_session
    player = make_player(code, 'Alice')
    received = player.get_received()
    event = next((e for e in received if e['name'] == 'join_confirmed'), None)
    assert event is not None
    assert event['args'][0]['name'] == 'Alice'
    player.disconnect()


def test_player_join_invalid_code(host):
    player = socketio.test_client(app)
    player.emit('player_join', {'code': 'XXXXXX', 'name': 'Alice'})
    received = player.get_received()
    event = next((e for e in received if e['name'] == 'error'), None)
    assert event is not None
    player.disconnect()


def test_player_join_empty_name(host_with_session):
    _, code = host_with_session
    player = socketio.test_client(app)
    player.emit('player_join', {'code': code, 'name': ''})
    received = player.get_received()
    event = next((e for e in received if e['name'] == 'error'), None)
    assert event is not None
    player.disconnect()


def test_player_join_after_game_started_fails(host_with_session):
    host, code = host_with_session
    host.emit('host_start_game', {'code': code})
    host.get_received()
    player = socketio.test_client(app)
    player.emit('player_join', {'code': code, 'name': 'Latecomer'})
    received = player.get_received()
    event = next((e for e in received if e['name'] == 'error'), None)
    assert event is not None
    player.disconnect()


# ── Game flow ─────────────────────────────────────────────────────────────────

def test_host_start_game_changes_phase(host_with_session):
    _, code = host_with_session
    assert sessions[code]['phase'] == 'lobby'
    host_with_session[0].emit('host_start_game', {'code': code})
    assert sessions[code]['phase'] == 'game'


def test_host_reveal_tile_sets_active(host_with_session):
    host, code = host_with_session
    host.emit('host_start_game', {'code': code})
    host.get_received()
    host.emit('host_reveal_tile', {'code': code, 'question_id': 'q-0-0'})
    assert sessions[code]['active_tile'] == 'q-0-0'


def test_host_mark_used_clears_active(host_with_session):
    host, code = host_with_session
    host.emit('host_start_game', {'code': code})
    host.get_received()
    host.emit('host_reveal_tile', {'code': code, 'question_id': 'q-0-0'})
    host.get_received()
    host.emit('host_mark_used', {'code': code, 'question_id': 'q-0-0'})
    assert sessions[code]['active_tile'] is None
    assert 'q-0-0' in sessions[code]['used_tiles']


# ── Buzz ─────────────────────────────────────────────────────────────────────

def test_buzz_ordering(host_with_session):
    host, code = host_with_session
    p1 = make_player(code, 'Alice')
    p1.get_received()
    p2 = make_player(code, 'Bob')
    p2.get_received()

    sessions[code]['active_tile'] = 'q-0-0'

    p1.emit('buzz', {'code': code})
    p2.emit('buzz', {'code': code})

    queue = sessions[code]['buzz_queue']
    assert queue[0]['name'] == 'Alice'
    assert queue[1]['name'] == 'Bob'

    p1.disconnect()
    p2.disconnect()


def test_buzz_no_duplicate(host_with_session):
    _, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    sessions[code]['active_tile'] = 'q-0-0'
    p.emit('buzz', {'code': code})
    p.emit('buzz', {'code': code})
    assert len(sessions[code]['buzz_queue']) == 1
    p.disconnect()


def test_clear_buzz(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    sessions[code]['active_tile'] = 'q-0-0'
    p.emit('buzz', {'code': code})
    host.get_received()
    host.emit('host_clear_buzz', {'code': code})
    assert sessions[code]['buzz_queue'] == []
    p.disconnect()


# ── Scoring ──────────────────────────────────────────────────────────────────

def _get_score(code, name):
    for p in sessions[code]['players'].values():
        if p['name'] == name:
            return p['score']
    return None


def test_score_correct(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_score_correct', {'code': code, 'player_name': 'Alice', 'points': 200})
    assert _get_score(code, 'Alice') == 200
    p.disconnect()


def test_score_wrong_deducts(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_score_correct', {'code': code, 'player_name': 'Alice', 'points': 300})
    host.emit('host_score_wrong', {'code': code, 'player_name': 'Alice', 'points': 200})
    assert _get_score(code, 'Alice') == 100
    p.disconnect()


def test_score_can_go_negative(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_score_wrong', {'code': code, 'player_name': 'Alice', 'points': 500})
    assert _get_score(code, 'Alice') == -500
    p.disconnect()


# ── Final Jeopardy ───────────────────────────────────────────────────────────

def test_start_final_changes_phase(host_with_session):
    host, code = host_with_session
    host.emit('host_start_final', {'code': code, 'category': 'Science'})
    assert sessions[code]['phase'] == 'final_jeopardy'
    assert sessions[code]['final']['category'] == 'Science'


def test_submit_wager_capped_at_score(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    # Give Alice 300 points
    host.emit('host_score_correct', {'code': code, 'player_name': 'Alice', 'points': 300})
    host.get_received()
    host.emit('host_start_final', {'code': code, 'category': 'Test'})
    host.get_received()
    p.emit('submit_wager', {'code': code, 'amount': 9999})
    # Wager should be capped at 300
    assert sessions[code]['final']['wagers'].get('Alice') == 300
    p.disconnect()


def test_submit_wager_minimum_zero(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_start_final', {'code': code, 'category': 'Test'})
    host.get_received()
    p.emit('submit_wager', {'code': code, 'amount': -50})
    assert sessions[code]['final']['wagers'].get('Alice') == 0
    p.disconnect()


def test_final_correct_adds_wager(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_score_correct', {'code': code, 'player_name': 'Alice', 'points': 500})
    host.get_received()
    host.emit('host_start_final', {'code': code, 'category': 'Test'})
    host.get_received()
    p.emit('submit_wager', {'code': code, 'amount': 200})
    sessions[code]['final']['answers']['Alice'] = 'Test answer'
    host.emit('host_final_correct', {'code': code, 'player_name': 'Alice'})
    assert _get_score(code, 'Alice') == 700  # 500 + 200
    p.disconnect()


def test_final_wrong_deducts_wager(host_with_session):
    host, code = host_with_session
    p = make_player(code, 'Alice')
    p.get_received()
    host.get_received()
    host.emit('host_score_correct', {'code': code, 'player_name': 'Alice', 'points': 500})
    host.get_received()
    host.emit('host_start_final', {'code': code, 'category': 'Test'})
    host.get_received()
    p.emit('submit_wager', {'code': code, 'amount': 300})
    sessions[code]['final']['answers']['Alice'] = 'Wrong answer'
    host.emit('host_final_wrong', {'code': code, 'player_name': 'Alice'})
    assert _get_score(code, 'Alice') == 200  # 500 - 300
    p.disconnect()


def test_end_game_changes_phase(host_with_session):
    host, code = host_with_session
    host.emit('host_end_game', {'code': code})
    assert sessions[code]['phase'] == 'ended'


# ── Round transitions ─────────────────────────────────────────────────────────

def test_session_has_both_boards(host_with_session):
    _, code = host_with_session
    assert 'boards' in sessions[code]
    assert 'board1' in sessions[code]['boards']
    assert 'board2' in sessions[code]['boards']
    assert sessions[code]['round'] == 1


def test_round_complete_emitted_after_all_tiles_used(host_with_session):
    host, code = host_with_session
    host.emit('host_start_game', {'code': code})
    host.get_received()
    board = sessions[code]['board']
    all_ids = [q['id'] for cat in board['categories'] for q in cat['questions']]
    # Mark all but last tile used
    for qid in all_ids[:-1]:
        sessions[code]['used_tiles'].add(qid)
    sessions[code]['active_tile'] = all_ids[-1]
    host.emit('host_mark_used', {'code': code, 'question_id': all_ids[-1]})
    received = host.get_received()
    event = next((e for e in received if e['name'] == 'round_complete'), None)
    assert event is not None
    assert event['args'][0]['round'] == 1


def test_host_next_round_changes_board(host_with_session):
    host, code = host_with_session
    host.emit('host_start_game', {'code': code})
    host.get_received()
    host.emit('host_next_round', {'code': code})
    assert sessions[code]['round'] == 2
    assert sessions[code]['board'] == sessions[code]['boards']['board2']
    assert len(sessions[code]['used_tiles']) == 0


def test_host_next_round_emits_round_changed(host_with_session):
    host, code = host_with_session
    host.emit('host_next_round', {'code': code})
    received = host.get_received()
    event = next((e for e in received if e['name'] == 'round_changed'), None)
    assert event is not None
    assert event['args'][0]['round'] == 2


def test_host_remove_buzzer_pops_first(host_with_session):
    host, code = host_with_session
    p1 = make_player(code, 'Alice')
    p1.get_received()
    p2 = make_player(code, 'Bob')
    p2.get_received()
    sessions[code]['active_tile'] = 'q-0-0'
    p1.emit('buzz', {'code': code})
    p2.emit('buzz', {'code': code})
    assert sessions[code]['buzz_queue'][0]['name'] == 'Alice'
    host.emit('host_remove_buzzer', {'code': code})
    assert len(sessions[code]['buzz_queue']) == 1
    assert sessions[code]['buzz_queue'][0]['name'] == 'Bob'
    p1.disconnect()
    p2.disconnect()
