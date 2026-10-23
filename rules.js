/* Shared, deterministic rules for human players and the AI. No DOM dependencies. */
(function (global) {
  'use strict';
  const NAK_PROBABILITY = 0.025;
  const COLORS = ['#B42318', '#175CD3', '#067647', '#6941C6'];
  const VALUES = { '도': 1, '개': 2, '걸': 3, '윷': 4, '모': 5, '빽도': -1 };
  const HOME = 'H';
  const NODES = { H: { x: 60, y: 520, label: '출발 / 완주' } };
  for (let n = 1; n <= 19; n++) {
    let x, y;
    if (n <= 5) { x = 60 + n * 92; y = 520; }
    else if (n <= 10) { x = 520; y = 520 - (n - 5) * 92; }
    else if (n <= 15) { x = 520 - (n - 10) * 92; y = 60; }
    else { x = 60; y = 60 + (n - 15) * 92; }
    const corners = { 5: '오른쪽 아래', 10: '오른쪽 위', 15: '왼쪽 위' };
    NODES['O' + n] = { x, y, label: corners[n] || (n < 5 ? '아랫길 ' + n : n < 10 ? '오른쪽 길 ' + (n - 5) : n < 15 ? '윗길 ' + (n - 10) : '왼쪽 길 ' + (n - 15)) };
  }
  Object.assign(NODES, {
    R1: { x: 443.333, y: 443.333, label: '오른쪽 아래 지름길 1' },
    R2: { x: 366.667, y: 366.667, label: '오른쪽 아래 지름길 2' },
    C: { x: 290, y: 290, label: '중앙' },
    L1: { x: 213.333, y: 213.333, label: '왼쪽 위 지름길 1' },
    L2: { x: 136.667, y: 136.667, label: '왼쪽 위 지름길 2' },
    T1: { x: 443.333, y: 136.667, label: '오른쪽 위 지름길 1' },
    T2: { x: 366.667, y: 213.333, label: '오른쪽 위 지름길 2' },
    B1: { x: 213.333, y: 366.667, label: '완주 지름길 1' },
    B2: { x: 136.667, y: 443.333, label: '완주 지름길 2' }
  });
  const DIAGONAL_NEXT = { R1: 'R2', R2: 'C', L1: 'L2', L2: 'O15', T1: 'T2', T2: 'C', B1: 'B2', B2: HOME };
  function defaultNext(node, previous) {
    if (node === HOME) return 'O1';
    if (node === 'C') return previous === 'R2' ? 'L1' : 'B1';
    if (DIAGONAL_NEXT[node]) return DIAGONAL_NEXT[node];
    const n = Number(node.slice(1));
    return n === 19 ? HOME : 'O' + (n + 1);
  }
  function startBranches(node) {
    if (node === 'O5') return [{ next: 'O6', label: '바깥길' }, { next: 'R1', label: '중앙 경유' }];
    if (node === 'O10') return [{ next: 'O11', label: '바깥길' }, { next: 'T1', label: '중앙 경유' }];
    if (node === 'C') return [{ next: 'L1', label: '왼쪽 위 방향' }, { next: 'B1', label: '완주 방향' }];
    return [{ next: null, label: '앞으로' }];
  }
  function pathsFor(token, value) {
    if (token.status === 'finished') return [];
    if (value === -1) {
      if (token.status !== 'board' || token.history.length < 2) return [];
      const history = token.history.slice(0, -1);
      const destination = history[history.length - 1];
      return [{ destination, status: destination === HOME ? 'waiting' : 'board', history: destination === HOME ? [] : history, path: [token.position, destination], route: destination === HOME ? '대기로 돌아가기' : '지나온 길로 한 칸 뒤로' }];
    }
    const start = token.status === 'waiting' ? HOME : token.position;
    return startBranches(start).map(branch => {
      const history = token.status === 'waiting' ? [HOME] : token.history.slice();
      const path = [start];
      let current = start;
      let finished = false;
      for (let i = 0; i < value; i++) {
        const previous = history[history.length - 2];
        current = i === 0 && branch.next ? branch.next : defaultNext(current, previous);
        history.push(current);
        path.push(current);
        if (current === HOME) { finished = true; break; }
      }
      return { destination: current, status: finished ? 'finished' : 'board', history, path, route: branch.label };
    });
  }
  function groups(state, ownerId) {
    const seen = new Set();
    return state.tokens.filter(t => t.ownerId === ownerId && t.status !== 'finished').filter(t => {
      if (seen.has(t.groupId)) return false;
      seen.add(t.groupId); return true;
    }).map(t => ({ ...t, tokenIds: state.tokens.filter(m => m.groupId === t.groupId && m.ownerId === ownerId && m.status === t.status).map(m => m.id) }));
  }
  function currentPlayer(state) { return state.players[state.turnIndex]; }
  function ownerFor(state, id) { return state.owners.find(o => o.id === id); }
  function stats(state, ownerId) {
    const tokens = state.tokens.filter(t => t.ownerId === ownerId);
    return { waiting: tokens.filter(t => t.status === 'waiting').length, board: tokens.filter(t => t.status === 'board').length, finished: tokens.filter(t => t.status === 'finished').length };
  }
  function legalActions(state) {
    if (state.winner || state.remainingThrows > 0) return [];
    const ownerId = currentPlayer(state).ownerId;
    const availableGroups = groups(state, ownerId);
    return state.results.flatMap(result => availableGroups.flatMap(group => pathsFor(group, result.value).map((path, i) => ({
      ...path, id: result.id + ':' + group.id + ':' + i, resultId: result.id, value: result.value,
      tokenId: group.id, tokenIds: group.tokenIds.slice(), ownerId
    }))));
  }
  function log(state, message) {
    state.logs.unshift({ id: ++state.sequence, message });
    state.logs.length = Math.min(state.logs.length, 50);
  }
  function normalizeName(name, fallback) { return Array.from(String(name || '').trim()).slice(0, 10).join('') || fallback; }
  function validateSettings(settings) {
    const players = settings.players || [];
    if (settings.mode !== 'individual' && settings.mode !== 'team') return '게임 방식을 선택하세요.';
    if (settings.mode === 'team' ? players.length !== 4 : players.length < 2 || players.length > 4) return '참가 인원을 확인하세요.';
    if (players.some(p => !['human', 'ai'].includes(p.type))) return '미설정 참가자를 사람 또는 AI로 지정하세요.';
    if (!players.some(p => p.type === 'human')) return '사람 참가자가 최소 1명 필요합니다';
    if (settings.mode === 'team' && ['A', 'B'].some(team => players.filter(p => p.team === team).length !== 2)) return '각 팀은 정확히 2명이어야 합니다.';
    return null;
  }
  function createGame(settings) {
    const error = validateSettings(settings);
    if (error) throw new Error(error);
    let players = settings.players.map((p, i) => ({ id: 'p' + (i + 1), ...p, name: normalizeName(p.name, p.type === 'ai' ? 'AI ' + (i + 1) : '플레이어 ' + (i + 1)) }));
    if (settings.mode === 'team') {
      const a = players.filter(p => p.team === 'A'), b = players.filter(p => p.team === 'B');
      players = [a[0], b[0], a[1], b[1]];
    }
    const owners = settings.mode === 'team' ? ['A', 'B'].map((team, i) => ({ id: 'team' + team, name: team + '팀', symbol: team, color: COLORS[i] })) : players.map((p, i) => ({ id: p.id, name: p.name, symbol: String(i + 1), color: COLORS[i] }));
    players.forEach(p => { p.ownerId = settings.mode === 'team' ? 'team' + p.team : p.id; });
    const tokens = owners.flatMap(o => Array.from({ length: 4 }, (_, i) => ({ id: o.id + '-' + (i + 1), number: i + 1, ownerId: o.id, status: 'waiting', position: null, history: [], groupId: o.id + '-' + (i + 1) })));
    const state = { settings: JSON.parse(JSON.stringify(settings)), players, owners, tokens, turnIndex: 0, turnNumber: 1, remainingThrows: 1, results: [], phase: 'throw', winner: null, lastThrow: null, logs: [], sequence: 0, notice: '' };
    log(state, players[0].name + '의 차례로 게임을 시작합니다.');
    return state;
  }
  function classifyFaces(faces) {
    if (!Array.isArray(faces) || faces.length !== 4 || faces.some(x => typeof x !== 'boolean')) throw new Error('윷 면은 네 개의 boolean 값이어야 합니다.');
    const count = faces.filter(Boolean).length;
    const name = count === 0 ? '모' : count === 1 ? faces[0] ? '빽도' : '도' : ({ 2: '개', 3: '걸', 4: '윷' })[count];
    return { name, value: VALUES[name], faces: faces.slice(), nak: false };
  }
  function generateThrow(random = Math.random) {
    if (random() < NAK_PROBABILITY) return { name: '낙', value: 0, faces: null, nak: true };
    return classifyFaces(Array.from({ length: 4 }, () => random() < 0.5));
  }
  // Deterministic outcomes for development/tests; never offered in the player UI.
  function outcomeFor(name) {
    if (name === '낙') return { name, value: 0, faces: null, nak: true };
    const faces = { '도': [false, true, false, false], '개': [true, true, false, false], '걸': [true, true, true, false], '윷': [true, true, true, true], '모': [false, false, false, false], '빽도': [true, false, false, false] }[name];
    if (!faces) throw new Error('알 수 없는 결과');
    return classifyFaces(faces);
  }
  function nextTurn(state) {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    state.turnNumber++;
    state.remainingThrows = 1;
    state.phase = 'throw';
    log(state, currentPlayer(state).name + '의 차례입니다.');
  }
  function settle(state) {
    if (state.winner) { state.phase = 'finished'; return; }
    if (state.remainingThrows > 0) { state.phase = 'throw'; return; }
    if (legalActions(state).length) { state.phase = 'move'; return; }
    if (state.results.length) {
      state.notice = '뒤로 이동할 말이 없어 빽도를 소진하고 차례를 넘깁니다.';
      log(state, state.notice);
      state.results = [];
    }
    nextTurn(state);
  }
  function applyThrow(state, outcome) {
    if (state.winner || state.phase !== 'throw' || state.remainingThrows < 1) throw new Error('지금은 던질 수 없습니다.');
    const canonical = outcome.nak ? outcomeFor('낙') : classifyFaces(outcome.faces);
    state.remainingThrows--;
    state.lastThrow = canonical;
    state.notice = '';
    const player = currentPlayer(state);
    if (canonical.nak) {
      state.notice = state.results.length ? '낙입니다. 남은 결과로 이동하세요.' : '낙입니다. 이번 던지기는 무효입니다.';
      log(state, player.name + ': 낙 · 이번 던지기 무효');
    } else {
      state.results.push({ id: 'r' + (++state.sequence), name: canonical.name, value: canonical.value });
      if (canonical.value >= 4) state.remainingThrows++;
      log(state, player.name + ': ' + canonical.name + (canonical.value >= 4 ? ' · 한 번 더 던집니다.' : ''));
    }
    settle(state);
    return canonical;
  }
  function applyMove(state, actionId) {
    if (state.phase !== 'move' || state.winner) throw new Error('지금은 이동할 수 없습니다.');
    const action = legalActions(state).find(a => a.id === (typeof actionId === 'string' ? actionId : actionId.id));
    if (!action) throw new Error('허용되지 않은 이동입니다.');
    const owner = ownerFor(state, action.ownerId);
    const result = state.results.find(r => r.id === action.resultId);
    state.results = state.results.filter(r => r.id !== action.resultId);
    let captured = 0, joined = 0;
    if (action.status === 'board') {
      for (const token of state.tokens) {
        if (token.status === 'board' && token.position === action.destination && token.ownerId !== action.ownerId) {
          token.status = 'waiting'; token.position = null; token.history = []; token.groupId = token.id; captured++;
        }
      }
    }
    const moving = new Set(action.tokenIds);
    const targetGroup = state.tokens.filter(t => moving.has(t.id) || (action.status === 'board' && t.ownerId === action.ownerId && t.status === 'board' && t.position === action.destination));
    joined = targetGroup.length - action.tokenIds.length;
    for (const token of targetGroup) {
      token.status = action.status;
      token.position = action.status === 'board' ? action.destination : null;
      token.history = action.status === 'waiting' ? [] : action.history.slice();
      token.groupId = action.status === 'waiting' ? token.id : action.tokenId;
    }
    if (captured) state.remainingThrows++;
    const description = action.status === 'finished' ? action.tokenIds.length + '개 완주!' : action.status === 'waiting' ? '대기로 돌아갑니다.' : NODES[action.destination].label + ' 이동';
    let message = owner.name + ' · ' + result.name + ' → ' + description;
    if (captured) message += ' · 상대 말 ' + captured + '개 잡기!';
    if (joined) message += ' · ' + targetGroup.length + '개 업기';
    log(state, message);
    state.notice = captured ? '상대 말을 잡았습니다! 한 번 더 던지세요.' : joined ? targetGroup.length + '개의 말이 함께 이동합니다.' : '';
    if (stats(state, action.ownerId).finished === 4) {
      state.winner = action.ownerId; state.results = []; state.remainingThrows = 0; state.phase = 'finished';
      log(state, owner.name + ' 승리! 모든 말이 완주했습니다.');
    } else settle(state);
    return { action, captured, joined, finished: action.status === 'finished' ? action.tokenIds.length : 0 };
  }
  function shortestDistance(node, status = 'board') {
    if (status === 'finished') return 0;
    if (status === 'waiting') node = HOME;
    const queue = [[node, 0]], seen = new Set([node]);
    while (queue.length) {
      const [current, d] = queue.shift();
      const nexts = current === 'C' ? ['L1', 'B1'] : current === 'O5' ? ['O6', 'R1'] : current === 'O10' ? ['O11', 'T1'] : [defaultNext(current)];
      for (const next of nexts) {
        if (next === HOME) return d + 1;
        if (!seen.has(next)) { seen.add(next); queue.push([next, d + 1]); }
      }
    }
    return 20;
  }
  const api = { NAK_PROBABILITY, COLORS, VALUES, HOME, NODES, pathsFor, groups, currentPlayer, ownerFor, stats, legalActions, normalizeName, validateSettings, createGame, classifyFaces, generateThrow, outcomeFor, applyThrow, applyMove, shortestDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.YutRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
