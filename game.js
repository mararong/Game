(function () {
  'use strict';
  const R = window.YutRules;
  const AI = window.YutAI;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const config = { mode: 'individual', count: 2, slots: [
    { name: '플레이어 1', type: 'human' }, { name: 'AI 1', type: 'ai' },
    { name: '', type: null }, { name: '', type: null }
  ] };
  let state = null;
  let selectedResult = null;
  let selectedToken = null;
  let rolling = false;
  let runId = 0;
  let pending = null;
  let dialogKind = null;
  let returnFocus = null;
  let winnerShown = -1;
  const dialog = $('game-dialog');
  function schedule(fn, delay) {
    if (pending) clearTimeout(pending.id);
    pending = { fn, remaining: delay, due: 0, id: null, run: runId };
    if (!dialog.open) armTimer();
  }
  function armTimer() {
    if (!pending || dialog.open) return;
    const task = pending;
    task.due = performance.now() + task.remaining;
    task.id = setTimeout(() => {
      if (pending !== task || task.run !== runId) return;
      pending = null;
      task.fn();
    }, task.remaining);
  }
  function pauseTimer() {
    if (pending && pending.id !== null) {
      clearTimeout(pending.id);
      pending.remaining = Math.max(0, pending.due - performance.now());
      pending.id = null;
    }
  }
  function cancelTimers() {
    if (pending) clearTimeout(pending.id);
    pending = null;
    runId++;
  }
  function isHuman() { return state && R.currentPlayer(state).type === 'human' && !state.winner; }
  function canMove() { return isHuman() && !rolling && state.phase === 'move' && !dialog.open; }
  function selectedActions() {
    if (!state || !selectedResult || !selectedToken) return [];
    return R.legalActions(state).filter(a => a.resultId === selectedResult && a.tokenId === selectedToken);
  }
  function renderParticipant(index, teamMode) {
    const slot = config.slots[index];
    const team = index % 2 === 0 ? 'A' : 'B';
    const color = R.COLORS[teamMode ? index % 2 : index];
    const symbol = teamMode ? team + (Math.floor(index / 2) + 1) : index + 1;
    const typeButtons = '<div class="type-options" role="group" aria-label="참가자 ' + symbol + ' 조작 방식">' + ['human', 'ai'].map(type => '<button type="button" data-slot="' + index + '" data-type="' + type + '" class="' + (slot.type === type ? 'selected' : '') + '" aria-pressed="' + (slot.type === type) + '">' + (type === 'human' ? '사람' : 'AI') + '</button>').join('') + '</div>';
    return '<div class="participant-row ' + (!slot.type ? 'unset' : '') + '" style="--player-color:' + color + '">' +
      '<span class="participant-number" aria-hidden="true">' + symbol + '</span><div class="name-field"><label class="sr-only" for="name-' + index + '">참가자 ' + symbol + ' 이름</label><input id="name-' + index + '" data-name="' + index + '" type="text" value="' + escape(slot.name) + '" placeholder="이름 입력" maxlength="10" autocomplete="off">' + (!slot.type ? '<small class="unset-hint">미설정 · 사람 또는 AI를 선택하세요</small>' : '') + '</div>' +
      (teamMode ? '<div class="team-controls">' + typeButtons + '<button class="swap-team" type="button" data-swap="' + index + '" aria-label="참가자 ' + symbol + ', 상대 팀의 같은 순서 참가자와 교환">⇄ 팀 이동</button></div>' : typeButtons) + '</div>';
  }
  function renderSetup() {
    document.querySelectorAll('[data-mode]').forEach(b => { const active = b.dataset.mode === config.mode; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', active); });
    document.querySelectorAll('[data-count]').forEach(b => { const active = Number(b.dataset.count) === config.count; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', active); });
    const teamMode = config.mode === 'team';
    $('count-options').hidden = teamMode;
    $('team-description').hidden = !teamMode;
    $('count-label').textContent = teamMode ? '팀 구성' : '참가 인원';
    $('participant-list').innerHTML = teamMode ? '<div class="team-grid">' + ['A', 'B'].map((team, i) => '<section class="team-card" aria-label="' + team + '팀 참가자"><div class="team-card-header" style="--player-color:' + R.COLORS[i] + '"><span class="team-dot" aria-hidden="true"></span><strong>' + team + '팀</strong><small>말 4개 공유</small></div>' + [i, i + 2].map(index => renderParticipant(index, true)).join('') + '</section>').join('') + '</div>' : Array.from({ length: config.count }, (_, i) => renderParticipant(i, false)).join('');
    $('setup-error').hidden = true;
  }
  function gameSettings() {
    return { mode: config.mode, players: config.slots.slice(0, config.mode === 'team' ? 4 : config.count).map((slot, index) => ({ ...slot, team: index % 2 === 0 ? 'A' : 'B' })) };
  }
  $('mode-options').addEventListener('click', event => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    config.mode = button.dataset.mode;
    renderSetup();
  });
  $('count-options').addEventListener('click', event => {
    const button = event.target.closest('[data-count]');
    if (!button) return;
    config.count = Number(button.dataset.count);
    renderSetup();
  });
  $('participant-list').addEventListener('input', event => {
    if (event.target.matches('[data-name]')) config.slots[Number(event.target.dataset.name)].name = Array.from(event.target.value).slice(0, 10).join('');
  });
  $('participant-list').addEventListener('click', event => {
    const typeButton = event.target.closest('[data-type]');
    const swapButton = event.target.closest('[data-swap]');
    if (typeButton) {
      const index = Number(typeButton.dataset.slot), slot = config.slots[index];
      slot.type = typeButton.dataset.type;
      if (!slot.name.trim() || /^(AI \d+|플레이어 \d+)$/.test(slot.name)) slot.name = slot.type === 'ai' ? 'AI ' + (index + 1) : '플레이어 ' + (index + 1);
      renderSetup();
      document.querySelector('[data-slot="' + index + '"][data-type="' + slot.type + '"]').focus();
    } else if (swapButton) {
      const index = Number(swapButton.dataset.swap), other = index ^ 1;
      [config.slots[index], config.slots[other]] = [config.slots[other], config.slots[index]];
      renderSetup();
      document.querySelector('[data-swap="' + other + '"]').focus();
    }
  });
  $('fill-ai').addEventListener('click', () => {
    const count = config.mode === 'team' ? 4 : config.count;
    for (let i = 0; i < count; i++) if (!config.slots[i].type) { config.slots[i].type = 'ai'; if (!config.slots[i].name.trim()) config.slots[i].name = 'AI ' + (i + 1); }
    renderSetup();
  });
  $('setup-form').addEventListener('submit', event => {
    event.preventDefault();
    const settings = gameSettings(), error = R.validateSettings(settings);
    if (error) { $('setup-error').textContent = error; $('setup-error').hidden = false; return; }
    startGame(settings);
  });
  function startGame(settings) {
    cancelTimers();
    state = R.createGame(settings);
    selectedResult = null; selectedToken = null; rolling = false; winnerShown = -1;
    if (dialog.open) dialog.close();
    $('setup-screen').hidden = true;
    $('game-screen').hidden = false;
    $('restart-button').hidden = false;
    $('game-mode-label').textContent = state.settings.mode === 'team' ? '2대2 팀전 · 팀당 말 4개 공유' : '개인전 · ' + state.players.length + '인';
    renderGame();
    $('main').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    continuePlay();
  }
  function returnToSetup() {
    cancelTimers();
    state = null; rolling = false; selectedResult = null; selectedToken = null;
    if (dialog.open) dialog.close();
    $('setup-screen').hidden = false; $('game-screen').hidden = true; $('restart-button').hidden = true;
    renderSetup(); $('main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function hint() {
    if (state.winner) return R.ownerFor(state, state.winner).name + '이 승리했습니다!';
    const player = R.currentPlayer(state);
    if (rolling) return player.name + '이 윷을 던지고 있습니다.';
    if (player.type === 'ai') return player.name + (state.phase === 'throw' ? '이 윷을 던질 준비를 하고 있습니다.' : '이 이동할 말을 고르고 있습니다.');
    if (state.phase === 'throw') return state.notice || (state.results.length ? '한 번 더 던지세요. 이전 결과는 보관됩니다.' : player.name + ' 차례입니다. 윷을 던지세요.');
    if (!selectedResult) return state.notice || '사용할 이동 결과를 선택하세요.';
    if (!selectedToken) return '이동할 말을 선택하세요.';
    return '보드의 도착점이나 아래 경로를 선택하세요.';
  }
  function renderTurn() {
    const player = R.currentPlayer(state), owner = R.ownerFor(state, player.ownerId);
    const next = state.players[(state.turnIndex + 1) % state.players.length];
    $('turn-counter').textContent = state.turnNumber + '번째 차례';
    $('turn-banner').innerHTML = '<div class="turn-person"><span class="turn-avatar">' + owner.symbol + '</span><div><h2>' + (state.settings.mode === 'team' ? escape(owner.name) + ' · ' : '') + escape(player.name) + (player.type === 'ai' ? '<span class="ai-badge">AI</span>' : '') + (state.winner ? ' · 게임 종료' : ' 차례') + '</h2><p>' + (state.winner ? '모든 말이 집에 도착했어요. 멋진 한 판이었어요!' : player.type === 'ai' ? 'AI가 자동으로 플레이하고 있어요' : '천천히 생각하고, 원하는 말을 움직여보세요') + '</p></div></div><div class="next-player">' + (state.winner ? '축하합니다!' : '다음 차례<strong>' + escape(next.name) + (next.type === 'ai' ? ' · AI' : '') + '</strong>') + '</div>';
    $('action-hint').textContent = hint();
  }
  function renderScores() {
    const activeOwner = R.currentPlayer(state).ownerId;
    const scoreboard = $('scoreboard');
    scoreboard.style.setProperty('--owners', state.owners.length);
    scoreboard.classList.toggle('many', state.owners.length > 2);
    scoreboard.innerHTML = state.owners.map(owner => {
      const counts = R.stats(state, owner.id), members = state.players.filter(p => p.ownerId === owner.id);
      return '<section class="score-card ' + (activeOwner === owner.id ? 'active' : '') + '" style="--player-color:' + owner.color + '" aria-label="' + escape(owner.name) + ', 완주 ' + counts.finished + '개, 대기 ' + counts.waiting + '개, 이동 중 ' + counts.board + '개' + (activeOwner === owner.id ? ', 현재 차례' : '') + '"><div class="score-name"><span class="score-symbol">' + owner.symbol + '</span><span>' + escape(owner.name) + (state.settings.mode !== 'team' && members[0].type === 'ai' ? '<span class="ai-badge">AI</span>' : '') + '</span></div><div class="score-finished"><strong>' + counts.finished + '</strong><span>/ 4</span><small>완주</small></div><div class="progress-track" aria-hidden="true">' + [0, 1, 2, 3].map(n => '<span class="' + (n < counts.finished ? 'complete' : '') + '"></span>').join('') + '</div><div class="score-details"><span>대기 ' + counts.waiting + '</span><span>이동 중 ' + counts.board + '</span>' + (activeOwner === owner.id ? '<span>● 현재 차례</span>' : '') + '</div>' + (state.settings.mode === 'team' ? '<div class="score-members">' + members.map(p => '<span class="' + (p.id === R.currentPlayer(state).id ? 'current-member' : '') + '">' + escape(p.name) + (p.type === 'ai' ? '<span class="ai-badge">AI</span>' : '') + '</span>').join('<span>·</span>') + '</div>' : '') + '</section>';
    }).join('');
  }
  function renderSticks() {
    const outcome = state.lastThrow;
    const display = $('stick-display');
    display.classList.toggle('rolling', rolling);
    display.classList.toggle('nak', Boolean(outcome && outcome.nak && !rolling));
    const faces = outcome && !outcome.nak ? outcome.faces : [false, true, false, true];
    display.innerHTML = faces.map((flat, i) => '<span class="yut-stick ' + (flat ? 'flat' : '') + '" style="--tilt:' + [-10, -3, 5, 13][i] + 'deg"><i class="pattern"></i>' + (i === 0 ? '<b class="star">★</b>' : '') + '</span>').join('');
    const last = $('last-result');
    last.className = 'last-result' + (outcome ? outcome.nak ? ' nak' : '' : ' empty');
    if (rolling) last.innerHTML = '<strong>두근두근</strong><span>어떤 결과가 나올까요?</span>';
    else if (!outcome) last.textContent = '첫 번째 윷을 던져볼까요?';
    else last.innerHTML = '<strong>' + outcome.name + '</strong><span>' + (outcome.nak ? '낙 · 이번 던지기 무효' : outcome.value === -1 ? '빽도 · 뒤로 1칸' : outcome.name + ' · ' + outcome.value + '칸') + '</span>' + (outcome.value >= 4 ? '<span class="bonus-label">한 번 더 던지는 행운!</span>' : '');
    const button = $('throw-button');
    button.disabled = !isHuman() || rolling || state.phase !== 'throw';
    button.innerHTML = rolling ? '<span class="button-loader" aria-hidden="true"></span> 윷을 던지는 중' : state.winner ? '게임이 끝났습니다' : !isHuman() ? '<span class="button-loader" aria-hidden="true"></span> AI 플레이 중' : state.phase !== 'throw' ? '남은 결과로 이동하세요' : '<span aria-hidden="true">↟</span> ' + (state.results.length || state.notice.includes('잡았') ? '한 번 더 던지기' : '윷 던지기');
  }
  function renderResults() {
    const legal = R.legalActions(state);
    $('result-count').textContent = state.results.length;
    $('result-list').innerHTML = state.results.length ? state.results.map(result => {
      const possible = legal.some(a => a.resultId === result.id);
      const noBack = result.value === -1 && !possible && state.remainingThrows === 0;
      return '<button class="result-chip ' + (selectedResult === result.id ? 'selected' : '') + '" data-result="' + result.id + '" type="button" aria-pressed="' + (selectedResult === result.id) + '"' + (!canMove() || !possible ? ' disabled' : '') + (noBack ? ' aria-describedby="back-unavailable-' + result.id + '"' : '') + '>' + result.name + '<span>' + (result.value > 0 ? '+' : '') + result.value + '</span>' + (selectedResult === result.id ? '<span aria-hidden="true">✓</span>' : '') + '</button>' + (noBack ? '<small class="result-unavailable" id="back-unavailable-' + result.id + '">빽도: 현재 이동 가능한 말 없음</small>' : '');
    }).join('') : '<p class="empty-list">' + (state.winner ? '멋진 한 판이었어요!' : '윷을 던지면 이동 결과가 여기에 쌓여요.') + '</p>';
  }
  function pieceTitle(group) {
    const numbers = group.tokenIds.map(id => state.tokens.find(t => t.id === id).number);
    return '말 ' + numbers.join('·') + (numbers.length > 1 ? ' (' + numbers.length + '개)' : '');
  }
  function renderPieces() {
    const ownerId = R.currentPlayer(state).ownerId, owner = R.ownerFor(state, ownerId);
    const groups = R.groups(state, ownerId), actions = R.legalActions(state);
    $('selection-owner').textContent = state.settings.mode === 'team' ? owner.name + ' 공유 말' : owner.name;
    $('piece-list').innerHTML = groups.length ? groups.map(group => {
      const enabled = canMove() && selectedResult && actions.some(a => a.resultId === selectedResult && a.tokenId === group.id);
      return '<button class="piece-option ' + (selectedToken === group.id ? 'selected' : '') + '" data-piece="' + group.id + '" type="button" aria-pressed="' + (selectedToken === group.id) + '" style="--player-color:' + owner.color + '"' + (!enabled ? ' disabled' : '') + '><span class="piece-dot" aria-hidden="true">' + group.number + (group.tokenIds.length > 1 ? '×' + group.tokenIds.length : '') + '</span><span><strong>' + pieceTitle(group) + '</strong><small>' + (group.status === 'waiting' ? '대기 중' : escape(R.NODES[group.position].label)) + '</small></span></button>';
    }).join('') : '<p class="empty-list">모든 말이 완주했어요.</p>';
    const candidates = selectedActions();
    $('destination-section').hidden = !candidates.length;
    $('destination-list').innerHTML = candidates.map((action, i) => {
      const destination = action.status === 'finished' ? '완주하기' : action.status === 'waiting' ? '대기로 돌아가기' : R.NODES[action.destination].label;
      return '<button class="destination-option" type="button" data-action="' + action.id + '"' + (!canMove() ? ' disabled' : '') + '><span class="destination-number">' + (i + 1) + '</span><span><strong>' + escape(destination) + '</strong><small>' + escape(action.route) + (action.status === 'finished' ? ' · ' + action.tokenIds.length + '개 완주' : '') + '</small></span><span aria-hidden="true">→</span></button>';
    }).join('');
  }
  function svgToken(group, owner, selectable) {
    const point = R.NODES[group.position];
    const chosen = selectedToken === group.id;
    const symbol = owner.symbol;
    return '<g class="piece-on-board ' + (chosen ? 'token-selected ' : '') + (!selectable ? 'disabled' : '') + '" transform="translate(' + point.x + ' ' + point.y + ')"' + (selectable ? ' data-board-piece="' + group.id + '" role="button" tabindex="0"' : '') + ' aria-label="' + escape(owner.name + ' ' + pieceTitle(group) + ', ' + point.label + (chosen ? ', 선택함' : '')) + '">' + (selectable || chosen ? '<circle class="token-outline" r="25"' + (!chosen ? ' stroke-dasharray="3 3"' : '') + '/>' : '') + '<circle class="token-circle" r="20" fill="' + owner.color + '"/><text class="token-text" y="-1">' + group.number + '</text><text class="token-small-symbol" y="12">' + symbol + '</text>' + (group.tokenIds.length > 1 ? '<g transform="translate(19 -17)"><rect class="stack-badge" x="-13" y="-8" width="26" height="17" rx="8"/><text class="stack-label" y="1">×' + group.tokenIds.length + '</text></g>' : '') + (chosen ? '<circle cx="-17" cy="-19" r="8" fill="#243B64"/><text x="-17" y="-16" font-size="10" text-anchor="middle" fill="white">✓</text>' : '') + '</g>';
  }
  function renderBoard() {
    const candidates = selectedActions(), legal = R.legalActions(state), ownerId = R.currentPlayer(state).ownerId;
    const destinations = [...new Set(candidates.map(a => a.destination))];
    const routes = candidates.map(action => '<polyline class="route-line" points="' + action.path.map(id => R.NODES[id].x + ',' + R.NODES[id].y).join(' ') + '" marker-end="url(#arrow)"/>').join('');
    const nodes = Object.entries(R.NODES).map(([id, point]) => {
      const corner = ['H', 'O5', 'O10', 'O15'].includes(id), center = id === 'C';
      let html = '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (center ? 24 : corner ? 22 : 11) + '" class="board-node' + (corner ? ' corner' : center ? ' center' : '') + '"/>';
      if (corner) html += '<circle cx="' + point.x + '" cy="' + point.y + '" r="15" class="corner-decoration"/>';
      if (id === 'C') html += '<text x="' + point.x + '" y="' + (point.y + 4) + '" class="board-label" style="fill:#78988d;font-size:12px">중앙</text>';
      if (id === 'H') html += '<g transform="translate(' + point.x + ' ' + point.y + ')"><path d="M-9 3v-9l9-7 9 7v9h-6v-7h-6v7z" fill="none" stroke="#8191a8" stroke-width="1.5" stroke-linejoin="round"/><text class="home-label" x="0" y="-38">출발 / 완주</text></g>';
      return html;
    }).join('');
    const tokens = state.owners.flatMap(owner => R.groups(state, owner.id).filter(g => g.status === 'board').map(group => svgToken(group, owner, canMove() && Boolean(selectedResult) && owner.id === ownerId && legal.some(a => a.resultId === selectedResult && a.tokenId === group.id)))).join('');
    const hints = destinations.map(destination => {
      const actions = candidates.filter(a => a.destination === destination), action = actions[0], p = R.NODES[destination];
      const i = candidates.indexOf(action) + 1;
      const text = action.status === 'finished' ? '완주' : action.status === 'waiting' ? '대기' : '도착 ' + i;
      // A coincident destination never silently picks between distinct history paths.
      const click = actions.length === 1 && canMove() ? ' data-board-action="' + action.id + '" tabindex="0" role="button" aria-label="' + escape(text + ', ' + (R.NODES[destination].label)) + '"' : '';
      return '<g' + click + '><circle class="destination-ring" cx="' + p.x + '" cy="' + p.y + '" r="28"/><rect x="' + (p.x - 25) + '" y="' + (p.y + 30) + '" width="50" height="17" rx="6" fill="#e5f3ed"/><text class="destination-label" x="' + p.x + '" y="' + (p.y + 42) + '">' + text + '</text></g>';
    }).join('');
    $('board-caption').textContent = candidates.length ? candidates.length + '개의 경로 중 선택하세요' : state.winner ? '완주를 축하해요!' : '말 4개를 먼저 완주하세요';
    $('board-container').innerHTML = '<svg class="board-svg" viewBox="0 0 580 590" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="윷판. 왼쪽 아래에서 출발해 오른쪽 아래, 오른쪽 위, 왼쪽 위 순서로 진행합니다. 말과 도착점은 아래 버튼으로도 선택할 수 있습니다."><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#358377"/></marker></defs><path class="board-edge" d="M60 520H520V60H60Z"/><path class="board-diagonal" d="M60 60 520 520M520 60 60 520"/>' + routes + nodes + '<text class="board-watermark" x="290" y="405">한 걸음씩, 함께</text>' + tokens + hints + '</svg>';
  }
  function renderGame() {
    if (!state) return;
    renderTurn(); renderScores(); renderSticks(); renderResults(); renderPieces(); renderBoard();
    $('history-list').innerHTML = state.logs.slice(0, 5).map(item => '<li>' + escape(item.message) + '</li>').join('');
  }
  function beginThrow() {
    if (!state || state.winner || rolling || state.phase !== 'throw') return;
    rolling = true; selectedResult = null; selectedToken = null;
    renderGame();
    schedule(() => {
      if (!state || state.winner) return;
      rolling = false;
      R.applyThrow(state, R.generateThrow());
      renderGame(); continuePlay();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 500);
  }
  function performMove(actionId) {
    if (!state || state.winner || rolling) return;
    const previousOwner = R.currentPlayer(state).ownerId;
    R.applyMove(state, actionId);
    selectedResult = null; selectedToken = null;
    renderGame();
    if (state.winner) {
      cancelTimers();
      if (winnerShown !== runId) { winnerShown = runId; openDialog('winner'); }
    } else {
      if (R.currentPlayer(state).ownerId !== previousOwner && isHuman()) $('action-hint').focus({ preventScroll: true });
      continuePlay();
    }
  }
  function continuePlay() {
    if (!state || state.winner || rolling || pending || dialog.open || R.currentPlayer(state).type !== 'ai') return;
    if (state.phase === 'throw') schedule(beginThrow, 600);
    else if (state.phase === 'move') {
      schedule(() => {
        const action = AI.chooseAction(state);
        if (!action) return;
        selectedResult = action.resultId; selectedToken = action.tokenId;
        renderGame();
        schedule(() => performMove(action.id), 600);
      }, 600);
    }
  }
  $('throw-button').addEventListener('click', () => { if (isHuman() && !dialog.open) beginThrow(); });
  $('result-list').addEventListener('click', event => {
    const button = event.target.closest('[data-result]');
    if (!button || button.disabled || !canMove()) return;
    selectedResult = button.dataset.result; selectedToken = null;
    renderGame();
    document.querySelector('[data-result="' + selectedResult + '"]').focus({ preventScroll: true });
  });
  function selectPiece(id, focusList) {
    if (!canMove() || !selectedResult || !R.legalActions(state).some(a => a.resultId === selectedResult && a.tokenId === id)) return;
    selectedToken = id; renderGame();
    if (focusList) document.querySelector('[data-piece="' + id + '"]')?.focus({ preventScroll: true });
  }
  $('piece-list').addEventListener('click', event => {
    const button = event.target.closest('[data-piece]');
    if (button && !button.disabled) selectPiece(button.dataset.piece, true);
  });
  $('destination-list').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled && canMove()) performMove(button.dataset.action);
  });
  function handleBoard(event) {
    if (!canMove()) return;
    const piece = event.target.closest('[data-board-piece]'), action = event.target.closest('[data-board-action]');
    if (piece) selectPiece(piece.dataset.boardPiece, true);
    else if (action) performMove(action.dataset.boardAction);
  }
  $('board-container').addEventListener('click', handleBoard);
  $('board-container').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleBoard(event); }
  });
  const rulesBody = '<h3>먼저, 네 개의 말을 집으로</h3><p>자신의 말 4개를 모두 완주하면 승리해요. 개인전은 각자 4개, 팀전은 팀당 4개의 말을 함께 움직여요. 사람은 한 기기에서 번갈아 조작하고 AI는 자동으로 진행해요.</p><div class="rule-values">' + [['도', '+1'], ['개', '+2'], ['걸', '+3'], ['윷', '+4'], ['모', '+5'], ['빽도', '−1']].map(v => '<span>' + v[0] + '<small>' + v[1] + '칸</small></span>').join('') + '</div><h3>한 차례는 이렇게 진행해요</h3><p>윷 던지기 → 이동 결과 선택 → 말 선택 → 도착점 선택. 윷·모가 나오면 한 번 더 던져요. 쌓인 결과는 순서를 골라 하나씩 사용하며, 더해서 한 번에 이동하지 않아요.</p><h3>잡고, 업고, 함께 가요</h3><ul><li>상대 말이 있는 칸에 도착하면 그 칸의 상대 말을 모두 대기로 보내고 한 번 더 던져요. 여러 개를 잡아도 보상은 1회예요.</li><li>윷·모를 사용해 잡아도 잡기 보상은 별도로 받아요.</li><li>자신이나 같은 팀의 말은 자동으로 업어요. 업힌 말은 분리 없이 함께 움직이고 완주해요. 잡히면 대기에서 개별 말로 나뉘어요.</li></ul><h3>지름길은 멈춘 다음에 선택해요</h3><p>오른쪽 아래·오른쪽 위·중앙에서 전진을 시작하면 경로를 고를 수 있어요. 한 번의 이동으로 중앙을 통과할 때는 들어온 대각선 방향을 유지해요. 출발점에 돌아오거나 넘으면 즉시 완주해요.</p><h3>빽도 · 지나온 길로 한 칸</h3><p>★ 표시 윷 하나만 평평한 면이면 빽도예요. 보드 위 말이 실제 지나온 길을 한 칸 되짚어요. 첫 칸에서 빽도면 대기로 돌아가고 업힌 말은 분리돼요. 대기·완주 말에는 사용할 수 없어요.</p><p>다른 경로로 온 자기 말과 업히면 이동해 온 말의 경로를 함께 사용해요. 전진 결과가 남았다면 말을 먼저 출발시킨 뒤 빽도를 쓸 수 있어요. 쓸 말도 다른 결과도 없으면 빽도는 자동 소진돼요.</p><h3>낙 · 이번 던지기만 무효</h3><p>매 던지기는 ' + (R.NAK_PROBABILITY * 100) + '% 확률로 낙이 돼요. 낙은 새 결과나 추가 던지기를 주지 않지만, 보관한 결과는 사라지지 않아요. 남은 결과가 있으면 그 결과로 이동하세요.</p><div class="rule-note">낙 ' + (R.NAK_PROBABILITY * 100) + '%는 이 게임의 설계값이에요. 그 외에는 네 윷의 앞·뒷면을 각각 독립적으로 50% 확률로 뽑아요. 사람과 AI의 확률은 같고, AI는 다음 결과를 알 수 없어요.</div><h3>우리 게임의 고정 규칙</h3><p>첫 차례는 개인전 첫 참가자, 팀전 A1이에요. 팀전은 A1 → B1 → A2 → B2 순서로 진행해요. 마지막 말 완주 즉시 종료하며 추가 행동은 취소돼요. 온라인 대전과 저장 기능은 없고 새로고침하면 초기화돼요.</p>';
  function openDialog(kind) {
    if (dialog.open) return;
    pauseTimer(); dialogKind = kind; returnFocus = document.activeElement;
    document.body.classList.add('modal-open');
    let content;
    if (kind === 'winner') {
      const owner = R.ownerFor(state, state.winner), members = state.players.filter(p => p.ownerId === owner.id);
      content = '<div class="winner-content"><div class="winner-icon" aria-hidden="true">♛</div><span class="eyebrow">네 개의 말이 모두 집으로!</span><h2 id="dialog-title">' + escape(owner.name) + ' 승리!</h2>' + (state.settings.mode === 'team' ? '<p class="winner-members">' + members.map(p => escape(p.name) + (p.type === 'ai' ? ' · AI' : '')).join(' &amp; ') + '</p>' : '') + '<p>함께해서 더 즐거운 한 판이었어요.<br>다음 판도 함께할까요?</p></div><div class="winner-actions"><button type="button" class="button primary" data-dialog-action="replay">같은 설정으로 다시 하기 <span aria-hidden="true">↻</span></button><button type="button" class="button" data-dialog-action="setup">설정으로 돌아가기</button><button type="button" class="text-button" data-dialog-action="close">최종 보드 보기</button></div>';
    } else {
      const isRules = kind === 'rules';
      const title = isRules ? '함께 보는 윷놀이 규칙' : kind === 'leave' ? '메인으로 돌아갈까요?' : '새로운 한 판을 시작할까요?';
      content = '<div class="dialog-header"><h2 id="dialog-title">' + title + '</h2><button type="button" class="dialog-close" data-dialog-action="close" aria-label="대화상자 닫기">×</button></div><div class="dialog-body">' + (isRules ? rulesBody : '<p>' + (kind === 'leave' ? '진행 중인 게임을 끝내고 메인으로 돌아갈까요?' : '진행 중인 게임을 끝내고 같은 설정으로 다시 시작할까요?') + '</p>') + '</div><div class="dialog-footer">' + (isRules ? '<button type="button" class="button primary" data-dialog-action="close">알겠어요</button>' : '<button type="button" class="button" data-dialog-action="close">이어서 하기</button><button type="button" class="button primary" data-dialog-action="' + (kind === 'leave' ? 'setup' : 'replay') + '">' + (kind === 'leave' ? '메인으로' : '다시 시작') + '</button>') + '</div>';
    }
    $('dialog-content').innerHTML = content;
    dialog.showModal();
    dialog.scrollTop = 0;
    (kind === 'winner' ? dialog.querySelector('[data-dialog-action="replay"]') : dialog.querySelector('[data-dialog-action="close"]'))?.focus();
  }
  $('rules-button').addEventListener('click', () => openDialog('rules'));
  $('restart-button').addEventListener('click', () => { if (state) state.winner ? startGame(state.settings) : openDialog('restart'); });
  function requestMainMenu() {
    if (state && !state.winner) openDialog('leave');
    else returnToSetup();
  }
  $('main-menu-button').addEventListener('click', requestMainMenu);
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    requestMainMenu();
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-dialog-action]');
    if (!button) return;
    if (button.dataset.dialogAction === 'close') dialog.close();
    else if (button.dataset.dialogAction === 'replay') startGame(state.settings);
    else if (button.dataset.dialogAction === 'setup') returnToSetup();
  });
  dialog.addEventListener('close', () => {
    dialogKind = null; document.body.classList.remove('modal-open');
    if (returnFocus && document.contains(returnFocus) && !returnFocus.disabled && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    if (pending && pending.id === null) armTimer();
    else continuePlay();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseTimer();
    else if (!dialog.open) { if (pending && pending.id === null) armTimer(); else continuePlay(); }
  });
  window.addEventListener('pagehide', cancelTimers);
  renderSetup();
})();
