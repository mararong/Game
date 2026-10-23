(function (global) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./rules.js') : global.YutRules;
  // Face combinations out of 16, weighted by the chance of a valid throw.
  const PROBABILITIES = [[1, 3], [2, 6], [3, 4], [4, 1], [5, 1], [-1, 1]]
    .map(([value, combinations]) => [value, (1 - R.NAK_PROBABILITY) * combinations / 16]);
  function captureRisk(state, action) {
    if (action.status !== 'board') return 0;
    let risk = 0;
    for (const owner of state.owners) {
      if (owner.id === action.ownerId) continue;
      for (const group of R.groups(state, owner.id)) {
        const sources = group.position === action.destination && group.status === 'board'
          ? group.tokenIds.map(() => ({ status: 'waiting', position: null, history: [] }))
          : [group];
        for (const source of sources) {
          for (const [value, probability] of PROBABILITIES) {
            if (R.pathsFor(source, value).some(p => p.status === 'board' && p.destination === action.destination)) risk += probability;
          }
        }
      }
    }
    return risk;
  }
  function scoreAction(state, action) {
    const finishCount = action.status === 'finished' ? action.tokenIds.length : 0;
    const captures = action.status === 'board' ? state.tokens.filter(t => t.ownerId !== action.ownerId && t.status === 'board' && t.position === action.destination).length : 0;
    const joining = action.status === 'board' ? state.tokens.filter(t => t.ownerId === action.ownerId && !action.tokenIds.includes(t.id) && t.status === 'board' && t.position === action.destination).length : 0;
    return [Number(R.stats(state, action.ownerId).finished + finishCount === 4), finishCount, captures, -captureRisk(state, action), -R.shortestDistance(action.destination, action.status), joining + action.tokenIds.length];
  }
  function compare(a, b) {
    for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-10) return a[i] > b[i] ? 1 : -1; }
    return 0;
  }
  function chooseAction(state, random = Math.random) {
    const actions = R.legalActions(state);
    let bestScore = null, best = [];
    for (const action of actions) {
      const score = scoreAction(state, action);
      const comparison = bestScore === null ? 1 : compare(score, bestScore);
      if (comparison > 0) { bestScore = score; best = [action]; }
      else if (comparison === 0) best.push(action);
    }
    return best.length ? best[Math.min(best.length - 1, Math.floor(random() * best.length))] : null;
  }
  const api = { captureRisk, scoreAction, chooseAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.YutAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
