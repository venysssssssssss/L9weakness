// Arena MTG — cliente vanilla, estado sempre vem do servidor.
(function () {
  'use strict';
  var match = location.pathname.match(/\/arena\/([^/?#]+)/);
  var roomId = match ? match[1] : '';
  var key = new URLSearchParams(location.search).get('key') || '';
  var $ = function (id) { return document.getElementById(id); };
  var ws = null, retry = 1000, state = null, me = '', selectedAttackers = [], selectedAttacker = '', selectedBlocker = '', targetId = '';
  var phases = ['mulligan', 'untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];
  var labels = { mulligan: 'MÃO', untap: 'DESVIRAR', upkeep: 'MANUTENÇÃO', draw: 'COMPRAR', main1: 'MAIN 1', combat: 'COMBATE', main2: 'MAIN 2', end: 'FIM' };

  function status(msg, err) {
    var el = $('status');
    if (!msg) { el.className = ''; el.style.display = 'none'; return; }
    el.textContent = msg; el.className = 'show' + (err ? ' err' : ''); el.style.display = 'block';
  }
  function toast(msg, err) { status(msg, err); setTimeout(function () { status(''); }, 3500); }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function isTargetSpell(c) { return /target|any target/i.test(c.oracle_text || '') || /lightning bolt|shock|giant growth|fatal push|swords to plowshares|unsummon/i.test(c.name || ''); }
  function textNode(parent, text, className) { var el = document.createElement('span'); el.textContent = text; if (className) el.className = className; parent.appendChild(el); return el; }

  function inspect(c) {
    if (!c) return;
    var wrap = $('inspImgWrap'), img = $('inspImg');
    if (!img) { img = document.createElement('img'); img.id = 'inspImg'; img.alt = ''; wrap.appendChild(img); }
    img.src = c.image_uri || ''; img.alt = c.name;
    $('inspName').textContent = c.name + (c.mana_cost ? '  ' + c.mana_cost : '');
    $('inspType').textContent = c.type_line || '';
    $('inspText').textContent = c.oracle_text || 'Sem texto de regras.';
    $('inspPT').textContent = (c.power && c.toughness) ? c.power + '/' + c.toughness : '';
  }

  function cardEl(c, opts) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'card ' + (opts.side || '') + (c.tapped ? ' tapped' : '') + (opts.attacker ? ' opp-attacker' : '') + (opts.selected ? ' selected' : '');
    b.setAttribute('aria-label', c.name + (c.mana_cost ? ', custo ' + c.mana_cost : '') + (c.power && c.toughness ? ', ' + c.power + ' por ' + c.toughness : ''));
    var img = document.createElement('img'); img.src = c.image_uri || ''; img.alt = c.name; img.loading = 'lazy'; img.draggable = false; b.appendChild(img);
    if (c.power && c.toughness) textNode(b, c.power + '/' + c.toughness, 'ptbadge');
    if (c.summoningSickness && !/land/i.test(c.type_line || '')) textNode(b, 'NOVO', 'state-mark');
    else if (c.tapped) textNode(b, 'VIRADA', 'state-mark');
    b.addEventListener('mouseenter', function () { inspect(c); });
    b.addEventListener('focus', function () { inspect(c); });
    b.addEventListener('click', function () { inspect(c); if (opts.onClick) opts.onClick(c); });
    return b;
  }

  function manaText(mp) {
    var order = [['W', 'W'], ['U', 'U'], ['B', 'B'], ['R', 'R'], ['G', 'G'], ['C', 'C']], out = [];
    (order || []).forEach(function (x) { if (mp && mp[x[0]]) out.push(x[1] + mp[x[0]]); });
    return out.join(' ') || '—';
  }

  function playerBar(el, p, role, active) {
    el.innerHTML = ''; el.className = 'playerbar' + (active ? ' active' : '');
    textNode(el, p.name, 'player-name'); textNode(el, role, 'player-role');
    textNode(el, 'Vida ' + p.life, 'life'); textNode(el, 'Mana ' + manaText(p.mana), 'mana');
    textNode(el, 'Grimório ' + p.libraryCount + ' · Cemitério ' + p.graveyard.length + ' · Exílio ' + p.exile.length, 'stat');
    if (state.priority === p.id) textNode(el, 'PRIORIDADE', 'player-role');
  }

  function renderCueRail(s) {
    var rail = $('cueCells'); rail.innerHTML = '';
    phases.forEach(function (phase) {
      var el = document.createElement('span'); el.className = 'cue' + (s.phase === phase ? ' active' : '') + (s.priority === s.you.id && s.phase === phase ? ' priority' : ''); el.textContent = labels[phase]; rail.appendChild(el);
    });
    $('turnBadge').textContent = s.phase === 'game-over' ? 'PARTIDA ENCERRADA' : 'TURNO ' + s.turn + ' · ' + (s.active === me ? 'SUA VEZ' : 'OPONENTE');
  }

  function renderCards(id, cards, opts) {
    var el = $(id); el.innerHTML = '';
    cards.forEach(function (c) { el.appendChild(cardEl(c, opts(c))); });
  }

  function fieldClick(c, own) {
    if (!state) return;
    if (state.phase === 'combat') {
      if (own && state.active === me) {
        if (c.tapped || c.summoningSickness) return toast('Esta criatura não pode atacar agora.', true);
        var i = selectedAttackers.indexOf(c.instanceId);
        if (i >= 0) selectedAttackers.splice(i, 1); else selectedAttackers.push(c.instanceId);
      } else if (!own && state.active !== me && state.combat.attackers.indexOf(c.instanceId) >= 0) {
        selectedAttacker = c.instanceId;
      } else if (own && state.active !== me) {
        selectedBlocker = c.instanceId;
      } else targetId = c.instanceId;
      render(state);
      return;
    }
    targetId = c.instanceId; inspect(c); render(state);
  }

  function playHand(c) {
    if (isTargetSpell(c) && !targetId) return toast('Selecione um alvo antes de conjurar.', true);
    var action = /land/i.test(c.type_line || '') ? { t: 'play', card: c.instanceId } : { t: 'cast', card: c.instanceId };
    if (targetId) action.target = targetId;
    send(action); targetId = '';
  }

  function renderStack(s) {
    var stack = $('stack'); stack.innerHTML = '';
    s.stack.slice().reverse().forEach(function (item) { textNode(stack, item.card.name, 'stack-item'); });
    $('stackState').textContent = s.stack.length ? s.stack.length + ' pendente(s)' : 'vazia';
    $('combatLabel').textContent = s.combat.attackers.length ? s.combat.attackers.length + ' atacante(s) declarado(s)' : 'Nenhum combate ativo';
    $('combatText').textContent = s.phase === 'combat' ? (s.active === me ? 'Selecione atacantes' : 'Selecione atacante e bloqueador') : 'Aguardando declaração';
  }

  function renderActions(s) {
    var mine = s.active === me && s.priority === me && s.phase !== 'game-over';
    $('bMulligan').disabled = s.phase !== 'mulligan' || s.you.kept;
    $('bKeep').disabled = s.phase !== 'mulligan' || s.you.kept;
    $('bAttack').disabled = s.phase !== 'combat' || s.active !== me || !selectedAttackers.length;
    $('bBlock').disabled = s.phase !== 'combat' || s.active === me || !selectedAttacker || !selectedBlocker;
    $('bPass').disabled = s.priority !== me || s.phase === 'game-over';
    $('bPhase').disabled = !mine || s.stack.length > 0 || s.phase === 'mulligan';
    $('bConcede').disabled = s.phase === 'game-over';
    var hint = s.phase === 'mulligan' ? (s.you.kept ? 'Aguardando oponente.' : 'Mantenha ou troque sua mão inicial.') : s.priority === me ? 'Sua prioridade. Escolha uma ação.' : 'Aguardando prioridade do oponente.';
    $('actionHint').textContent = s.winner ? 'Vencedor: ' + (s.winner === me ? 'você' : s.opp.name) : hint;
  }

  function render(s) {
    state = s; me = s.you.id;
    $('loading').style.display = s.ready ? 'none' : 'flex';
    $('connectionStatus').textContent = 'ao vivo';
    renderCueRail(s); playerBar($('oppBar'), s.opp, 'OPONENTE', s.active === s.opp.id); playerBar($('selfBar'), s.you, 'VOCÊ', s.active === me);
    $('oppHandCount').textContent = s.opp.handCount + ' carta(s)';
    var back = $('oppHand'); back.innerHTML = '';
    for (var i = 0; i < s.opp.handCount; i++) textNode(back, 'ARENA', 'cardback');
    renderCards('oppField', s.opp.battlefield, function (c) { return { side: 'opp', attacker: s.combat.attackers.indexOf(c.instanceId) >= 0, onClick: function () { fieldClick(c, false); } }; });
    renderCards('oppLands', s.opp.lands, function (c) { return { side: 'opp', onClick: function () { inspect(c); } }; });
    renderCards('selfField', s.you.battlefield, function (c) { return { side: 'me', selected: selectedAttackers.indexOf(c.instanceId) >= 0 || selectedBlocker === c.instanceId, onClick: function () { fieldClick(c, true); } }; });
    renderCards('selfLands', s.you.lands, function (c) { return { side: 'me', onClick: function () { send({ t: 'tap', card: c.instanceId }); } }; });
    renderCards('selfHandCards', s.you.hand, function (c) { return { side: 'me', onClick: function () { playHand(c); } }; });
    renderStack(s);
    var log = $('log'); log.innerHTML = ''; s.log.slice().reverse().forEach(function (line) { var li = document.createElement('li'); li.textContent = line; log.appendChild(li); });
    renderActions(s);
  }

  function eventFlash(evt) {
    if (!evt || !evt.type) return;
    var cls = 'event-' + evt.type;
    document.body.classList.remove(cls); void document.body.offsetWidth; document.body.classList.add(cls);
    setTimeout(function () { document.body.classList.remove(cls); }, 500);
  }

  function diceFlash(v) { $('diceVal').textContent = String(v); var el = $('diceFlash'); el.style.display = 'flex'; setTimeout(function () { el.style.display = 'none'; }, 700); }

  function connect() {
    if (!roomId || !key) { status('Link inválido. Peça um novo /arena no Discord.', true); return; }
    status('Conectando à mesa…'); $('connectionStatus').textContent = 'conectando';
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/arena/' + roomId + '?key=' + encodeURIComponent(key));
    ws.onopen = function () { status(''); $('connectionStatus').textContent = 'ao vivo'; retry = 1000; };
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'state') render(msg); else if (msg.t === 'event') eventFlash(msg); else if (msg.t === 'dice') diceFlash(msg.value); else if (msg.t === 'error') toast('Ação recusada: ' + (msg.error || 'erro'), true);
    };
    ws.onclose = function () { if (!state) $('loading').style.display = 'none'; $('connectionStatus').textContent = 'reconectando'; status('Conexão indisponível — confira o link da sala.', true); setTimeout(connect, Math.min(retry, 10000)); retry *= 2; };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  $('bD20').onclick = function () { send({ t: 'dice', kind: 'd20' }); };
  $('bD6').onclick = function () { send({ t: 'dice', kind: 'd6' }); };
  $('bCoin').onclick = function () { send({ t: 'dice', kind: 'coin' }); };
  $('bMulligan').onclick = function () { send({ t: 'mulligan' }); };
  $('bKeep').onclick = function () { send({ t: 'keep' }); };
  $('bAttack').onclick = function () { send({ t: 'attackers', cards: selectedAttackers }); selectedAttackers = []; };
  $('bBlock').onclick = function () { var assignments = {}; assignments[selectedAttacker] = selectedBlocker; send({ t: 'blockers', assignments: assignments }); selectedAttacker = ''; selectedBlocker = ''; };
  $('bPass').onclick = function () { send({ t: 'pass' }); };
  $('bPhase').onclick = function () { send({ t: 'phase' }); };
  $('bConcede').onclick = function () { if (window.confirm('Conceder esta partida?')) send({ t: 'concede' }); };
  connect();
})();
