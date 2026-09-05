// Arena MTG — front vanilla, sem build. Fala WS com /arena/:sala.
(function () {
'use strict';
var m = location.pathname.match(/\/arena\/([^/?#]+)/);
var roomId = m ? m[1] : '';
var key = new URLSearchParams(location.search).get('key') || '';
var $ = function (id) { return document.getElementById(id); };
var ws = null, retry = 1000, me = '', active = '';

function status(msg, err) {
  var el = $('status');
  if (!msg) { el.className = ''; el.style.display = 'none'; return; }
  el.textContent = msg; el.className = 'show' + (err ? ' err' : ''); el.style.display = 'block';
}
function toast(msg) { status(msg); setTimeout(function () { status(''); }, 3500); }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function inspect(c) {
  if (!c) return;
  var img = $('inspImg');
  img.src = c.image_uri || ''; img.alt = c.name;
  $('inspName').textContent = c.name + (c.mana_cost ? '  ' + c.mana_cost : '');
  $('inspType').textContent = c.type_line || '';
  $('inspText').textContent = c.oracle_text || '';
  $('inspPT').textContent = (c.power && c.toughness) ? c.power + '/' + c.toughness : '';
}

function cardEl(c, opts) {
  var d = document.createElement('div');
  d.className = 'card ' + (opts.side || '') + (c.tapped ? ' tapped' : '');
  d.tabIndex = 0;
  var img = document.createElement('img');
  img.src = c.image_uri || ''; img.alt = c.name; img.loading = 'lazy'; img.draggable = false;
  d.appendChild(img);
  if (c.power && c.toughness) {
    var pt = document.createElement('span'); pt.className = 'ptbadge'; pt.textContent = c.power + '/' + c.toughness;
    d.appendChild(pt);
  }
  if (c.summoningSickness && !/land/i.test(c.type_line || '')) {
    var s = document.createElement('span'); s.className = 'sick'; s.textContent = 'Z'; s.title = 'Enjoo de invocação';
    d.appendChild(s);
  }
  if (opts.kill) {
    var k = document.createElement('button'); k.className = 'kill'; k.textContent = '✕'; k.title = 'Destruir ' + c.name;
    k.onclick = function (e) { e.stopPropagation(); if (confirm('Destruir ' + c.name + '?')) send({ t: 'destroy', card: c.instanceId }); };
    d.appendChild(k);
  }
  var show = function () { inspect(c); };
  d.addEventListener('mouseenter', show);
  d.addEventListener('focus', show);
  d.addEventListener('click', show);
  if (opts.onClick) d.addEventListener('click', function () { opts.onClick(c); });
  return d;
}

function manaText(mp) {
  var p = [];
  if (mp.W) p.push('☀️' + mp.W); if (mp.U) p.push('💧' + mp.U); if (mp.B) p.push('💀' + mp.B);
  if (mp.R) p.push('🔥' + mp.R); if (mp.G) p.push('🌳' + mp.G); if (mp.C) p.push('⚪' + mp.C);
  return p.join(' ') || 'vazia';
}

function render(s) {
  me = s.you.id; active = s.active;
  $('loading').style.display = s.ready ? 'none' : 'flex';
  $('turnBadge').textContent = 'Turno ' + s.turn + ' • ' + s.phase + (s.active === me ? ' • SUA VEZ' : ' • vez do oponente');
  var phaseBtn = $('bPhase'); if (phaseBtn) phaseBtn.disabled = !s.ready || s.active !== me;

  var ob = $('oppBar');
  ob.innerHTML = '';
  ob.appendChild(document.createTextNode('👹 ' + s.opp.name + '  '));
  var ol = document.createElement('span'); ol.className = 'life'; ol.textContent = '❤️ ' + s.opp.life; ob.appendChild(ol);
  var om = document.createElement('span'); om.className = 'mana'; om.textContent = 'Mana: ' + manaText(s.opp.mana); ob.appendChild(om);
  var oc = document.createElement('span'); oc.className = 'mana';
  oc.textContent = 'Grimório: ' + s.opp.libraryCount + ' • Cemitério: ' + s.opp.graveyard.length + ' • Exílio: ' + s.opp.exile.length;
  ob.appendChild(oc);

  var oh = $('oppHand'); oh.innerHTML = '';
  for (var i = 0; i < s.opp.handCount; i++) {
    var b = document.createElement('div'); b.className = 'cardback'; b.textContent = '🂠';
    oh.appendChild(b);
  }
  var of = $('oppField'); of.innerHTML = '';
  s.opp.battlefield.forEach(function (c) { of.appendChild(cardEl(c, { side: 'opp' })); });
  var oln = $('oppLands'); oln.innerHTML = '';
  s.opp.lands.forEach(function (c) { oln.appendChild(cardEl(c, { side: 'opp' })); });

  var sb = $('selfBar');
  sb.innerHTML = '';
  sb.appendChild(document.createTextNode('🧙 ' + s.you.name + '  '));
  var sl = document.createElement('span'); sl.className = 'life'; sl.textContent = '❤️ ' + s.you.life; sb.appendChild(sl);
  var sm = document.createElement('span'); sm.className = 'mana'; sm.textContent = 'Mana: ' + manaText(s.you.mana); sb.appendChild(sm);
  var sc = document.createElement('span'); sc.className = 'mana';
  sc.textContent = 'Grimório: ' + s.you.libraryCount + ' • Cemitério: ' + s.you.graveyard.length + ' • Exílio: ' + s.you.exile.length;
  sb.appendChild(sc);

  var sln = $('selfLands'); sln.innerHTML = '';
  s.you.lands.forEach(function (c) {
    sln.appendChild(cardEl(c, { side: 'me', onClick: function (x) { send({ t: 'tap', card: x.instanceId }); } }));
  });
  var sf = $('selfField'); sf.innerHTML = '';
  s.you.battlefield.forEach(function (c) {
    sf.appendChild(cardEl(c, { side: 'me', kill: true, onClick: function (x) { send({ t: 'tap', card: x.instanceId }); } }));
  });
  var sh = $('selfHandCards'); sh.innerHTML = '';
  s.you.hand.forEach(function (c) {
    sh.appendChild(cardEl(c, { side: 'me', onClick: function (x) { send({ t: 'play', card: x.instanceId }); } }));
  });

  var log = $('log'); log.innerHTML = '';
  s.log.slice().reverse().forEach(function (line) {
    var li = document.createElement('li'); li.textContent = line; log.appendChild(li);
  });
}

function diceFlash(v) {
  $('diceVal').textContent = String(v);
  var f = $('diceFlash'); f.style.display = 'flex';
  setTimeout(function () { f.style.display = 'none'; }, 950);
}

function connect() {
  if (!roomId || !key) { status('Link inválido. Peça um novo /arena no Discord.', true); return; }
  status('Conectando…');
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/arena/' + roomId + '?key=' + encodeURIComponent(key));
  ws.onopen = function () { status(''); retry = 1000; };
  ws.onmessage = function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.t === 'state') render(msg);
    else if (msg.t === 'dice') diceFlash(msg.value + (msg.kind === 'coin' ? '' : ''));
    else if (msg.t === 'error') toast('⚠️ ' + (msg.error || 'erro'));
  };
  ws.onclose = function () {
    status('Conexão caiu — reconectando…');
    setTimeout(connect, Math.min(retry, 10000)); retry *= 2;
  };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
}

$('bDraw').onclick = function () { send({ t: 'draw', n: 1 }); };
$('bUntap').onclick = function () { send({ t: 'untap' }); };
$('bPhase').onclick = function () { send({ t: 'phase' }); };
$('bD20').onclick = function () { send({ t: 'dice', kind: 'd20' }); };
$('bD6').onclick = function () { send({ t: 'dice', kind: 'd6' }); };
$('bCoin').onclick = function () { send({ t: 'dice', kind: 'coin' }); };
document.querySelectorAll('#lifeCtl button').forEach(function (btn) {
  btn.onclick = function () { send({ t: 'life', delta: parseInt(btn.getAttribute('data-d'), 10) }); };
});
connect();
})();
