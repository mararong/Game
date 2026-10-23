'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');
const AI = require('../ai.js');
function make(n = 2, mode = 'individual') {
  return R.createGame({ mode, players: Array.from({ length: n }, (_, i) => ({ name: '참가자 ' + (i + 1), type: i ? 'ai' : 'human', team: i % 2 ? 'B' : 'A' })) });
}
function board(state, ownerIndex, number, history, groupId) {
  const token = state.tokens.find(t => t.ownerId === state.owners[ownerIndex].id && t.number === number);
  Object.assign(token, { status: 'board', position: history.at(-1), history: history.slice(), groupId: groupId || token.id });
  return token;
}
function results(state, names) {
  state.phase = 'move'; state.remainingThrows = 0;
  state.results = names.map((name, i) => ({ id: 'test-' + i, name, value: R.VALUES[name] }));
}
function action(state, token, destination, resultIndex = 0) {
  const found = R.legalActions(state).find(a => a.tokenId === token.id && a.destination === destination && a.resultId === state.results[resultIndex].id);
  assert.ok(found, 'expected legal action to ' + destination);
  return found;
}
function playThrow(state, name) { return R.applyThrow(state, R.outcomeFor(name)); }
function random(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
function invariants(state) {
  for (const owner of state.owners) {
    const pieces = state.tokens.filter(t => t.ownerId === owner.id);
    assert.equal(pieces.length, 4);
    for (const piece of pieces) {
      assert.ok(['waiting', 'board', 'finished'].includes(piece.status));
      if (piece.status === 'board') {
        assert.equal(piece.history[0], 'H');
        assert.equal(piece.position, piece.history.at(-1));
        assert.notEqual(piece.position, 'H');
        assert.ok(R.NODES[piece.position]);
        const mates = pieces.filter(t => t.groupId === piece.groupId);
        for (const mate of mates) { assert.equal(mate.position, piece.position); assert.deepEqual(mate.history, piece.history); }
      } else if (piece.status === 'waiting') { assert.equal(piece.position, null); assert.deepEqual(piece.history, []); assert.equal(piece.groupId, piece.id); }
    }
  }
  const occupancy = new Map();
  for (const token of state.tokens.filter(t => t.status === 'board')) {
    if (occupancy.has(token.position)) assert.equal(occupancy.get(token.position), token.ownerId);
    occupancy.set(token.position, token.ownerId);
  }
  if (state.winner) { assert.equal(R.stats(state, state.winner).finished, 4); assert.deepEqual(state.results, []); assert.equal(state.remainingThrows, 0); }
  else assert.ok(state.remainingThrows > 0 || R.legalActions(state).length > 0, 'game must have a next action');
}

test('2, 3, 4 player turns cycle in slot order and first NAK skips immediately', () => {
  for (const count of [2, 3, 4]) {
    const state = make(count);
    for (let i = 0; i < count * 3; i++) { assert.equal(state.turnIndex, i % count); playThrow(state, '낙'); }
    assert.equal(state.turnIndex, 0); assert.equal(state.turnNumber, count * 3 + 1);
  }
});
test('team order, shared ownership, human/AI mixes and team validation', () => {
  for (const humanCount of [1, 2, 3]) {
    const settings = { mode: 'team', players: Array.from({ length: 4 }, (_, i) => ({ name: ['A1', 'A2', 'B1', 'B2'][i], team: i < 2 ? 'A' : 'B', type: i < humanCount ? 'human' : 'ai' })) };
    const state = R.createGame(settings);
    assert.deepEqual(state.players.map(p => p.name), ['A1', 'B1', 'A2', 'B2']);
    assert.deepEqual(state.players.map(p => p.ownerId), ['teamA', 'teamB', 'teamA', 'teamB']);
    assert.equal(state.tokens.length, 8);
    for (let i = 0; i < 4; i++) { assert.equal(state.turnIndex, i); playThrow(state, '낙'); }
    playThrow(state, '도');
    assert.ok(R.legalActions(state).every(a => a.ownerId === 'teamA'));
  }
  const noHuman = { mode: 'individual', players: [{ type: 'ai' }, { type: 'ai' }] };
  assert.match(R.validateSettings(noHuman), /최소 1명/);
  assert.match(R.validateSettings({ mode: 'individual', players: [{ type: 'human' }, { type: null }] }), /미설정/);
  assert.match(R.validateSettings({ mode: 'team', players: [{ type: 'human', team: 'A' }, ...Array.from({ length: 3 }, () => ({ type: 'ai', team: 'B' }))] }), /정확히 2명/);
});
test('names trim, cap at ten Unicode characters, and receive defaults', () => {
  assert.equal(R.normalizeName('  가나다라  ', '기본'), '가나다라');
  assert.equal(R.normalizeName('1234567890뒤', '기본'), '1234567890');
  assert.equal(R.normalizeName('   ', '기본'), '기본');
});
test('all 16 face combinations yield exact probabilities and marked stick is unique', () => {
  const counts = {};
  for (let mask = 0; mask < 16; mask++) {
    const faces = Array.from({ length: 4 }, (_, i) => Boolean(mask & (1 << i)));
    const result = R.classifyFaces(faces);
    counts[result.name] = (counts[result.name] || 0) + 1;
    assert.deepEqual(result.faces, faces);
    if (result.name === '빽도') assert.deepEqual(faces, [true, false, false, false]);
  }
  assert.deepEqual(counts, { '모': 1, '빽도': 1, '도': 3, '개': 6, '걸': 4, '윷': 1 });
  assert.equal(R.NAK_PROBABILITY, .025);
  let calls = 0;
  assert.equal(R.generateThrow(() => { calls++; return .024999; }).nak, true);
  assert.equal(calls, 1);
  const draws = [.025, .1, .9, .9, .9];
  assert.equal(R.generateThrow(() => draws.shift()).name, '빽도');
  assert.equal(draws.length, 0);
});
test('new tokens start on O1 and corner shortcuts require starting at the corner', () => {
  const state = make(), token = state.tokens[0];
  assert.equal(R.pathsFor(token, 1)[0].destination, 'O1');
  assert.deepEqual(R.pathsFor(token, 4)[0].history, ['H', 'O1', 'O2', 'O3', 'O4']);
  board(state, 0, 1, ['H', 'O1', 'O2', 'O3', 'O4']);
  assert.deepEqual(R.pathsFor(token, 2).map(p => p.destination), ['O6']);
  board(state, 0, 1, ['H', 'O1', 'O2', 'O3', 'O4', 'O5']);
  assert.deepEqual(R.pathsFor(token, 3).map(p => p.destination), ['O8', 'C']);
  assert.equal(R.pathsFor(token, 5)[1].destination, 'L2');
});
test('both diagonals retain direction through center; starting at center allows either exit', () => {
  const state = make();
  const token = board(state, 0, 1, ['H', 'O5', 'R1', 'R2']);
  assert.equal(R.pathsFor(token, 3)[0].destination, 'L2');
  board(state, 0, 1, ['H', 'O10', 'T1', 'T2']);
  assert.equal(R.pathsFor(token, 3)[0].destination, 'B2');
  board(state, 0, 1, ['H', 'O5', 'R1', 'R2', 'C']);
  assert.deepEqual(R.pathsFor(token, 1).map(p => p.destination), ['L1', 'B1']);
  assert.equal(R.pathsFor(token, 3)[1].status, 'finished');
  assert.deepEqual(R.pathsFor(token, -1)[0].history, ['H', 'O5', 'R1', 'R2']);
});
test('consecutive yut/mo create separate retained results and NAK keeps them', () => {
  const state = make();
  playThrow(state, '윷'); playThrow(state, '모'); playThrow(state, '윷');
  assert.equal(state.remainingThrows, 1);
  assert.equal(new Set(state.results.map(r => r.id)).size, 3);
  playThrow(state, '낙');
  assert.equal(state.turnIndex, 0); assert.equal(state.phase, 'move');
  assert.deepEqual(state.results.map(r => r.name), ['윷', '모', '윷']);
  const token = state.tokens[0];
  R.applyMove(state, action(state, token, 'O4'));
  assert.equal(state.results.length, 2);
});
test('backdo is retained until a forward result launches a token', () => {
  const state = make();
  playThrow(state, '윷'); playThrow(state, '빽도');
  assert.equal(state.results.length, 2);
  assert.ok(!R.legalActions(state).some(a => a.value === -1));
  const token = state.tokens[0];
  R.applyMove(state, action(state, token, 'O4'));
  assert.deepEqual(state.results.map(r => r.name), ['빽도']);
  R.applyMove(state, action(state, token, 'O3'));
  assert.equal(token.position, 'O3'); assert.equal(state.turnIndex, 1);
});
test('unusable backdo is consumed without stalling; NAK never becomes a stored result', () => {
  const state = make(); playThrow(state, '빽도');
  assert.equal(state.turnIndex, 1); assert.equal(state.results.length, 0);
  playThrow(state, '낙'); assert.equal(state.turnIndex, 0); assert.equal(state.results.length, 0);
});
test('first-square backdo returns stacked pieces to waiting and splits them', () => {
  const state = make();
  const one = board(state, 0, 1, ['H', 'O1']);
  const two = board(state, 0, 2, ['H', 'O1'], one.id);
  results(state, ['빽도']);
  R.applyMove(state, action(state, one, 'H'));
  for (const token of [one, two]) { assert.equal(token.status, 'waiting'); assert.deepEqual(token.history, []); assert.equal(token.groupId, token.id); }
  assert.equal(R.stats(state, state.owners[0].id).finished, 0);
});
test('repeated backdo follows history rather than arbitrary center branches', () => {
  const state = make();
  const token = board(state, 0, 1, ['H', 'O1', 'O2', 'O3', 'O4', 'O5', 'R1', 'R2', 'C', 'B1', 'B2']);
  results(state, ['빽도', '빽도', '빽도', '빽도']);
  for (const destination of ['B1', 'C', 'R2', 'R1']) R.applyMove(state, action(state, token, destination));
  assert.equal(token.position, 'R1');
});
test('merging from different routes gives the incoming history to the entire stack', () => {
  const state = make();
  const one = board(state, 0, 1, ['H', 'O5', 'R1', 'R2']);
  const two = board(state, 0, 2, ['H', 'O10', 'T1', 'T2', 'C']);
  results(state, ['도', '빽도']);
  R.applyMove(state, action(state, one, 'C'));
  assert.equal(one.groupId, two.groupId);
  assert.deepEqual(two.history, ['H', 'O5', 'R1', 'R2', 'C']);
  R.applyMove(state, action(state, one, 'R2'));
  assert.equal(one.position, 'R2'); assert.equal(two.position, 'R2');
});
test('capturing a stack resets and separates all opponents, with only one bonus throw', () => {
  const state = make();
  const one = state.tokens[0];
  const enemy = board(state, 1, 1, ['H', 'O1', 'O2']);
  board(state, 1, 2, enemy.history, enemy.id); board(state, 1, 3, enemy.history, enemy.id);
  results(state, ['개']);
  const info = R.applyMove(state, action(state, one, 'O2'));
  assert.equal(info.captured, 3); assert.equal(state.remainingThrows, 1); assert.equal(state.turnIndex, 0);
  assert.equal(R.stats(state, state.owners[1].id).waiting, 4);
  for (const t of state.tokens.filter(t => t.ownerId === state.owners[1].id)) assert.equal(t.groupId, t.id);
});
test('yut/mo bonus and capture bonus both occur, and capture NAK never undoes movement', () => {
  const state = make(), token = state.tokens[0];
  const enemy = board(state, 1, 1, ['H', 'O1', 'O2', 'O3', 'O4']);
  playThrow(state, '윷'); assert.equal(state.remainingThrows, 1);
  playThrow(state, '낙');
  R.applyMove(state, action(state, token, 'O4'));
  assert.equal(state.remainingThrows, 1); assert.equal(enemy.status, 'waiting');
  playThrow(state, '낙');
  assert.equal(token.position, 'O4'); assert.equal(enemy.status, 'waiting'); assert.equal(state.turnIndex, 1);
});
test('backdo can capture and merge using the same rules', () => {
  const state = make();
  const one = board(state, 0, 1, ['H', 'O1', 'O2', 'O3']);
  const enemy = board(state, 1, 1, ['H', 'O1', 'O2']);
  board(state, 1, 2, enemy.history, enemy.id);
  results(state, ['빽도']);
  assert.equal(R.applyMove(state, action(state, one, 'O2')).captured, 2);
  assert.equal(state.remainingThrows, 1);
  const another = board(state, 0, 2, ['H', 'O1']);
  results(state, ['빽도']);
  R.applyMove(state, action(state, one, 'O1'));
  assert.equal(one.groupId, another.groupId);
});
test('team allies merge, both teammates control the shared group, opponents alone are captured', () => {
  const state = make(4, 'team');
  const one = board(state, 0, 1, ['H', 'O1']), two = state.tokens[1];
  results(state, ['도']); R.applyMove(state, action(state, two, 'O1'));
  assert.equal(one.groupId, two.groupId); assert.equal(state.remainingThrows, 1);
  // The one remaining throw belongs to the next team, not a friendly capture bonus.
  assert.equal(state.turnIndex, 1);
  playThrow(state, '낙'); assert.equal(state.turnIndex, 2);
  playThrow(state, '도');
  const alliedAction = R.legalActions(state).find(a => a.tokenIds.includes(one.id));
  assert.ok(alliedAction); assert.equal(alliedAction.tokenIds.length, 2);
});
test('exact finish and overshoot finish whole stacks and cancel all remaining results at victory', () => {
  for (const steps of ['도', '모']) {
    const state = make();
    const one = board(state, 0, 1, ['H', 'O19']);
    for (const n of [2, 3, 4]) board(state, 0, n, one.history, one.id);
    results(state, [steps, '개', '빽도']);
    const move = action(state, one, 'H');
    assert.equal(move.status, 'finished');
    R.applyMove(state, move);
    assert.equal(state.winner, state.owners[0].id); assert.equal(state.phase, 'finished');
    assert.equal(R.stats(state, state.winner).finished, 4); assert.equal(state.results.length, 0); assert.equal(state.remainingThrows, 0);
    assert.deepEqual(R.legalActions(state), []); assert.equal(R.pathsFor(one, -1).length, 0);
    assert.throws(() => playThrow(state, '도'));
  }
});
test('same-destination paths remain individually selectable with different history', () => {
  const state = make();
  const token = board(state, 0, 1, ['H', 'O10']);
  // At most five steps per result; all generated paths retain their own ID/history.
  results(state, ['모', '모']);
  const moves = R.legalActions(state).filter(a => a.tokenId === token.id);
  assert.equal(moves.length, 4); assert.equal(new Set(moves.map(a => a.id)).size, 4);
  assert.notDeepEqual(moves[0].history, moves[1].history);
});
test('illegal, stale and out-of-phase actions cannot mutate the game', () => {
  const state = make();
  assert.throws(() => R.applyMove(state, 'missing'));
  playThrow(state, '도');
  const move = R.legalActions(state)[0]; R.applyMove(state, move);
  const snapshot = JSON.stringify(state);
  assert.throws(() => R.applyMove(state, move)); assert.equal(JSON.stringify(state), snapshot);
});
test('AI prioritizes immediate victory over captures and chooses only common legal actions', () => {
  const state = make();
  const token = board(state, 0, 1, ['H', 'O19']);
  for (const n of [2, 3, 4]) { const t = state.tokens.find(t => t.ownerId === state.owners[0].id && t.number === n); Object.assign(t, { status: 'finished', position: null, history: ['H', 'O19', 'H'] }); }
  board(state, 1, 1, ['H', 'O18']); results(state, ['빽도', '도']);
  const choice = AI.chooseAction(state, () => 0);
  assert.equal(choice.status, 'finished'); assert.equal(choice.tokenId, token.id);
  assert.ok(R.legalActions(state).some(a => a.id === choice.id));
  const snapshot = JSON.stringify(state); AI.chooseAction(state, () => 0); assert.equal(JSON.stringify(state), snapshot);
});
test('AI captures before optimizing risk or remaining distance; risk uses weighted legal reachability', () => {
  const state = make(), token = state.tokens[0];
  board(state, 1, 1, ['H', 'O1', 'O2']); results(state, ['도', '개']);
  const chosen = AI.chooseAction(state, () => 0);
  assert.equal(chosen.destination, 'O2');
  const riskMove = action(state, token, 'O1');
  assert.ok(AI.captureRisk(state, riskMove) >= .0609375);
});
test('seeded complete games satisfy state invariants through victory in every mode', () => {
  let totalActions = 0;
  for (const [count, mode] of [[2, 'individual'], [3, 'individual'], [4, 'individual'], [4, 'team']]) {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = random(seed * 110351 + count), state = make(count, mode);
      let actions = 0;
      while (!state.winner && actions < 6000) {
        invariants(state);
        if (state.remainingThrows) R.applyThrow(state, R.generateThrow(rng));
        else { const choice = AI.chooseAction(state, rng); assert.ok(choice); R.applyMove(state, choice); }
        actions++;
      }
      assert.ok(state.winner, mode + ' ' + count + ' seed ' + seed + ' must finish');
      invariants(state); totalActions += actions;
    }
  }
  console.log('Completed 32 seeded games; ' + totalActions + ' legal actions checked.');
});


test('AI estimates re-entry threats from captured tokens after they split into waiting pieces', () => {
  const state = make(), token = state.tokens[0];
  const enemy = board(state, 1, 1, ['H', 'O1', 'O2']);
  board(state, 1, 2, enemy.history, enemy.id); board(state, 1, 3, enemy.history, enemy.id);
  results(state, ['개']);
  assert.ok(Math.abs(AI.captureRisk(state, action(state, token, 'O2')) - 4 * .365625) < 1e-10);
});
test('AI remaining-distance metric includes future legal shortcut choices from waiting', () => {
  assert.equal(R.shortestDistance(null, 'waiting'), 11);
  assert.equal(R.shortestDistance('C'), 3);
  assert.equal(R.shortestDistance('O19'), 1);
});
