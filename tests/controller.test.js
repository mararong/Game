'use strict';
// Controller unit tests use small DOM doubles and a virtual clock. They do not
// claim to verify browser layout, native focus trapping, or CSS rendering.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../rules.js');
const AI = require('../ai.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
function harness() {
  let now = 0, nextId = 0, document;
  const tasks = new Map();
  class Element {
    constructor(id = '') { this.id = id; this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false; this.innerHTML = ''; this.textContent = ''; this.listeners = {}; this.classes = new Set(); this.style = { setProperty() {} }; this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), toggle: (c, yes) => yes ? this.classes.add(c) : this.classes.delete(c) }; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, target = this) { const event = { target, key: '', preventDefault() {} }; for (const fn of this.listeners[type] || []) fn(event); }
    setAttribute(key, value) { this[key] = String(value); }
    focus() { document.activeElement = this; }
    closest(selector) {
      if (selector === '[hidden]') return this.hidden ? this : null;
      const attr = selector.match(/^\[data-([^\]]+)\]$/);
      if (attr) { const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return key in this.dataset ? this : null; }
      return null;
    }
    querySelector(selector) { return document.querySelector(selector); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const selectors = new Map();
  document = {
    body: new Element('body'), activeElement: new Element(), hidden: false, listeners: {},
    getElementById(id) { assert.ok(elements[id], 'known element ' + id); return elements[id]; },
    querySelector(selector) { if (!selectors.has(selector)) selectors.set(selector, new Element()); return selectors.get(selector); },
    querySelectorAll(selector) { return selector === '[data-mode]' ? ['individual', 'team'].map(mode => target({ mode })) : selector === '[data-count]' ? [2, 3, 4].map(count => target({ count: String(count) })) : []; },
    contains() { return true; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  };
  function target(dataset = {}, disabled = false) { const element = new Element(); element.dataset = dataset; element.disabled = disabled; return element; }
  const context = {
    document, console, performance: { now: () => now },
    setTimeout(fn, delay) { const id = ++nextId; tasks.set(id, { fn, due: now + delay }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    YutRules: { ...Rules, generateThrow: () => Rules.outcomeFor('도') }, YutAI: AI,
    matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {}
  };
  context.window = context;
  const script = source.replace(/\}\)\(\);\s*$/, 'globalThis.controller = { get state(){return state;}, get config(){return config;}, get rolling(){return rolling;}, get pending(){return pending;}, renderGame, startGame }; })();');
  vm.createContext(context); vm.runInContext(script, context);
  function tick(ms) {
    const until = now + ms; let count = 0;
    while (true) {
      const next = [...tasks.entries()].filter(([, task]) => task.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      assert.ok(count++ < 1000, 'timer loop must make progress');
      now = next[1].due; tasks.delete(next[0]); next[1].fn();
    }
    now = until;
  }
  function click(id, dataset) { elements[id].emit('click', dataset ? target(dataset) : elements[id]); }
  function submit() { elements['setup-form'].emit('submit'); }
  function setupDefault() { submit(); return context.controller.state; }
  function forceMove(name, destination = name === '개' ? 'O2' : 'O1') {
    const state = context.controller.state;
    Rules.applyThrow(state, Rules.outcomeFor(name)); context.controller.renderGame();
    const resultId = state.results[0].id, token = Rules.groups(state, Rules.currentPlayer(state).ownerId)[0];
    const move = Rules.legalActions(state).find(a => a.resultId === resultId && a.tokenId === token.id && a.destination === destination);
    click('result-list', { result: resultId }); click('piece-list', { piece: token.id });
    if (!elements['destination-section'].hidden) click('destination-list', { action: move.id });
  }
  return { context, controller: context.controller, elements, tick, click, submit, setupDefault, forceMove, tasks, target };
}

test('settings retain names, new slots are unset, and all-AI games are rejected', () => {
  const h = harness();
  assert.match(h.elements['participant-list'].innerHTML, /플레이어 1/);
  h.click('count-options', { count: '4' });
  assert.match(h.elements['participant-list'].innerHTML, /미설정/);
  h.submit(); assert.match(h.elements['setup-error'].textContent, /미설정/);
  h.click('fill-ai');
  h.click('participant-list', { slot: '0', type: 'ai' });
  h.submit(); assert.match(h.elements['setup-error'].textContent, /최소 1명/);
  assert.equal(h.controller.state, null);
});
test('team setup fills empty seats and swaps participants while retaining shared ownership', () => {
  const h = harness(); h.click('mode-options', { mode: 'team' });
  assert.equal(h.controller.config.slots[2].type, null);
  h.click('fill-ai'); h.click('participant-list', { swap: '0' }); h.submit();
  const state = h.controller.state;
  assert.equal(state.owners.length, 2); assert.equal(state.tokens.length, 8);
  assert.equal(state.players[0].type, 'ai'); assert.equal(state.players[1].type, 'human');
  assert.equal(h.tasks.size, 1);
});
test('human result selection waits for a piece, then a single route moves immediately', () => {
  const h = harness(), state = h.setupDefault();
  Rules.applyThrow(state, Rules.outcomeFor('도')); h.controller.renderGame();
  h.click('result-list', { result: state.results[0].id });
  assert.ok(state.tokens.every(token => token.status === 'waiting'));
  assert.equal(h.elements['destination-section'].hidden, true);
  const token = state.tokens[1];
  h.click('piece-list', { piece: token.id });
  assert.equal(token.position, 'O1'); assert.equal(state.turnIndex, 1);
  assert.equal(state.tokens[0].status, 'waiting');
  assert.equal(state.results.length, 0);
  assert.equal(h.elements['destination-section'].hidden, true);
  assert.equal(h.elements['destination-list'].innerHTML, '');
  const snapshot = JSON.stringify(state);
  h.click('piece-list', { piece: token.id });
  assert.equal(JSON.stringify(state), snapshot);
});

test('single-route board selections move immediately, including backdo to waiting', () => {
  for (const name of ['도', '빽도']) {
    const h = harness(), state = h.setupDefault(), token = state.tokens[0];
    Object.assign(token, { status: 'board', position: 'O1', history: ['H', 'O1'] });
    Rules.applyThrow(state, Rules.outcomeFor(name)); h.controller.renderGame();
    h.click('result-list', { result: state.results[0].id });
    h.click('board-container', { boardPiece: token.id });
    assert.equal(token.status, name === '빽도' ? 'waiting' : 'board');
    assert.equal(token.position, name === '빽도' ? null : 'O2');
    assert.equal(state.turnIndex, 1);
    assert.equal(h.elements['destination-section'].hidden, true);
  }
});

test('multiple routes wait for an explicit destination choice', () => {
  const h = harness(), state = h.setupDefault(), token = state.tokens[0];
  Object.assign(token, { status: 'board', position: 'O5', history: ['H', 'O1', 'O2', 'O3', 'O4', 'O5'] });
  Rules.applyThrow(state, Rules.outcomeFor('도')); h.controller.renderGame();
  const resultId = state.results[0].id;
  h.click('result-list', { result: resultId }); h.click('piece-list', { piece: token.id });
  assert.equal(token.position, 'O5'); assert.equal(state.turnIndex, 0);
  assert.equal(state.results.length, 1);
  assert.equal(h.elements['destination-section'].hidden, false);
  assert.equal((h.elements['destination-list'].innerHTML.match(/data-action=/g) || []).length, 2);
  const shortcut = Rules.legalActions(state).find(action => action.resultId === resultId && action.tokenId === token.id && action.destination === 'R1');
  h.click('destination-list', { action: shortcut.id });
  assert.equal(token.position, 'R1'); assert.equal(state.turnIndex, 1);
  assert.equal(h.elements['destination-section'].hidden, true);
});
test('throw animation locks duplicate inputs and commits exactly one result', () => {
  const h = harness(), state = h.setupDefault();
  h.click('throw-button'); h.click('throw-button');
  assert.equal(h.tasks.size, 1); assert.equal(h.elements['throw-button'].disabled, true);
  h.tick(499); assert.equal(state.results.length, 0); assert.equal(h.controller.rolling, true);
  h.tick(1); assert.equal(state.results.length, 1); assert.equal(state.results[0].name, '도');
  assert.equal(h.controller.rolling, false);
});
test('AI performs throw, result, token and destination steps automatically; human inputs are blocked', () => {
  const h = harness(), state = h.setupDefault(); h.forceMove('개');
  assert.equal(state.turnIndex, 1);
  const before = JSON.stringify(state); h.click('throw-button'); h.click('result-list', { result: 'fake' }); h.click('piece-list', { piece: 'p2-1' });
  assert.equal(JSON.stringify(state), before);
  h.tick(2300);
  assert.equal(state.turnIndex, 0); assert.equal(state.tokens.find(t => t.ownerId === 'p2' && t.number === 1).status === 'board' || state.tokens.some(t => t.ownerId === 'p2' && t.status === 'board'), true);
  assert.equal(h.tasks.size, 0);
});
test('rules dialog pauses an imminent AI action and resumes it once with its remaining delay', () => {
  const h = harness(), state = h.setupDefault(); h.forceMove('개'); h.tick(599);
  h.click('rules-button'); const snapshot = JSON.stringify(state);
  assert.equal(h.elements['game-dialog'].open, true); assert.equal(h.tasks.size, 0);
  h.tick(3000); assert.equal(JSON.stringify(state), snapshot);
  h.elements['game-dialog'].close(); assert.equal(h.tasks.size, 1);
  h.tick(1); assert.equal(h.controller.rolling, true); assert.equal(h.tasks.size, 1);
  h.tick(1700); assert.equal(state.turnIndex, 0); assert.equal(h.tasks.size, 0);
});
test('rules dialog can pause and resume the in-flight 500ms human throw', () => {
  const h = harness(), state = h.setupDefault(); h.click('throw-button'); h.tick(250); h.click('rules-button');
  h.tick(2000); assert.equal(state.lastThrow, null); assert.equal(h.controller.rolling, true);
  h.elements['game-dialog'].close(); h.tick(249); assert.equal(state.lastThrow, null);
  h.tick(1); assert.equal(state.results.length, 1); assert.equal(h.controller.rolling, false);
});
test('restart confirmation cancellation resumes; confirmation cancels every old AI action', () => {
  const h = harness(), oldState = h.setupDefault(); h.forceMove('개'); h.tick(500);
  h.click('restart-button'); const snapshot = JSON.stringify(oldState);
  h.tick(3000); assert.equal(JSON.stringify(oldState), snapshot);
  h.elements['game-dialog'].close(); h.tick(50); assert.equal(h.controller.rolling, false);
  h.click('restart-button');
  h.click('game-dialog', { dialogAction: 'replay' });
  assert.notEqual(h.controller.state, oldState); assert.equal(h.controller.state.turnNumber, 1);
  h.tick(10000); assert.equal(h.controller.state.turnNumber, 1); assert.equal(h.controller.state.results.length, 0); assert.equal(h.tasks.size, 0);
});
test('victory preserves final board, opens result dialog, and replay fully resets state', () => {
  const h = harness(), state = h.setupDefault();
  for (const token of state.tokens.filter(t => t.ownerId === 'p1')) Object.assign(token, { status: 'board', position: 'O19', history: ['H', 'O19'], groupId: 'p1-1' });
  state.results = [{ id: 'finish', name: '도', value: 1 }, { id: 'unused', name: '개', value: 2 }]; state.remainingThrows = 0; state.phase = 'move'; h.controller.renderGame();
  h.click('result-list', { result: 'finish' }); h.click('piece-list', { piece: 'p1-1' });
  assert.equal(state.winner, 'p1'); assert.equal(state.results.length, 0); assert.equal(h.tasks.size, 0);
  assert.match(h.elements['dialog-content'].innerHTML, /승리!/);
  h.click('game-dialog', { dialogAction: 'close' }); assert.equal(h.elements['game-dialog'].open, false); assert.equal(state.winner, 'p1');
  h.click('restart-button'); assert.equal(h.controller.state.winner, null); assert.equal(h.controller.state.tokens.filter(t => t.status === 'waiting').length, 8);
});
test('large result lists, four-piece stacks and escaped names render without collapsing identities', () => {
  const h = harness(); h.controller.config.slots[0].name = '<b>이름</b>'; const state = h.setupDefault();
  state.results = Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i, name: '개', value: 2 })); state.remainingThrows = 0; state.phase = 'move';
  for (const token of state.tokens.filter(t => t.ownerId === 'p1')) Object.assign(token, { status: 'board', position: 'O5', history: ['H', 'O1', 'O2', 'O3', 'O4', 'O5'], groupId: 'p1-1' });
  h.controller.renderGame();
  assert.equal((h.elements['result-list'].innerHTML.match(/data-result=/g) || []).length, 12);
  assert.match(h.elements['piece-list'].innerHTML, /말 1·2·3·4 \(4개\)/);
  assert.match(h.elements['board-container'].innerHTML, /×4/);
  assert.match(h.elements['turn-banner'].innerHTML, /&lt;b&gt;/);
  h.click('result-list', { result: 'r0' }); h.click('piece-list', { piece: 'p1-1' });
  assert.match(h.elements['destination-list'].innerHTML, /바깥길/); assert.match(h.elements['destination-list'].innerHTML, /중앙 경유/);
});
