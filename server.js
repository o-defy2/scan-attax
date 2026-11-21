/* Scan Attax — game server.
   Serves the website (public/) and runs 1v1 rooms over WebSocket (/ws).
   Rooms use a 5-letter code. The server re-computes every card from its facts
   and runs the authoritative battle, streaming round events that both players
   watch as the same anime episode.

   Run:  npm install && npm start   →   http://localhost:8080            */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const D = require('./public/js/data.js');
const ST = require('./public/js/stats.js');
const { Battle } = require('./public/js/battle.js');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------------- rooms ---------------- */
const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw.facts || {};
  const facts = {
    weight: Math.min(1e9, Math.max(0.1, Number(f.weight) || 350)),
    size: Math.min(1e5, Math.max(0.1, Number(f.size) || 10)),
    material: D.MATERIALS.includes(f.material) ? f.material : 'other',
    properties: (Array.isArray(f.properties) ? f.properties : []).filter((p) => D.PROPERTIES.includes(p)).slice(0, 3),
    condition: D.CONDITIONS.includes(f.condition) ? f.condition : 'used',
    aura: Math.min(10, Math.max(1, parseInt(f.aura, 10) || 5)),
    auraReason: String(f.auraReason || '').slice(0, 120),
    rank: D.RANKS.includes(f.rank) ? f.rank : 'C',
  };
  const name = String(raw.name || 'Mystery Object').slice(0, 40) || 'Mystery Object';
  const emoji = String(raw.emoji || '📦').slice(0, 8);
  const moves = (Array.isArray(raw.moves) ? raw.moves : []).slice(0, 3).map((m, i) => ({
    name: String(m && m.name || 'Move ' + (i + 1)).slice(0, 30),
    property: D.PROPERTIES.includes(m && m.property) ? m.property : 'other',
    effect: Object.keys(D.EFFECTS).includes(m && m.effect) ? m.effect : 'none',
    effectiveVs: D.MATERIALS.includes(m && m.effectiveVs) ? m.effectiveVs : undefined,
  }));
  while (moves.length < 3) moves.push({ name: 'Move ' + (moves.length + 1), property: 'other', effect: 'none' });
  return ST.computeCard(name, emoji, { ...facts, moves });
}

function playerSummary(p) {
  if (!p) return null;
  return { card: p.card, ready: p.ready };
}
function broadcastPlayers(room) {
  send(room.players[0], { t: 'players', players: [playerSummary(room.players[0]), playerSummary(room.players[1])] });
  send(room.players[1], { t: 'players', players: [playerSummary(room.players[0]), playerSummary(room.players[1])] });
}
function send(p, msg) {
  if (p && p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}
function sendTo(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function startBattle(room) {
  room.battle = new Battle(room.players[0].card, room.players[1].card, Math.random);
  room.phase = 'pick';
  send(room.players[0], { t: 'start', cards: [room.players[0].card, room.players[1].card], you: 0 });
  send(room.players[1], { t: 'start', cards: [room.players[0].card, room.players[1].card], you: 1 });
  sendPick(room);
}

function sendPick(room) {
  const b = room.battle;
  if (!b || b.over) return;
  room.picks = [null, null];
  room.phase = 'pick';
  const available = { 0: b.availableMoves(0), 1: b.availableMoves(1) };
  room.players.forEach((p, i) => send(p, { t: 'pick', round: b.round, available }));
  clearTimeout(room.pickTimeout);
  room.pickTimeout = setTimeout(() => {
    if (room.picks[0] === null) room.picks[0] = b.defaultMove(0);
    if (room.picks[1] === null) room.picks[1] = b.defaultMove(1);
    resolveRound(room);
  }, 15000);
}

function resolveRound(room) {
  if (room.phase !== 'pick') return;
  room.phase = 'anim';
  clearTimeout(room.pickTimeout);
  const b = room.battle;
  const round = b.round;
  const events = b.simulateRound(room.picks[0], room.picks[1]);
  room.players.forEach((p) => send(p, { t: 'events', round, events }));
  if (b.over) {
    room.phase = 'over';
    room.players.forEach((p) => send(p, { t: 'over', winner: b.winner, reason: b.reason }));
  } else {
    setTimeout(() => sendPick(room), 400);
  }
}

function handleMessage(ws, msg) {
  const room = ws._room;
  switch (msg.t) {
    case 'create': {
      const code = genCode();
      const r = { code, players: [{ ws, card: null, ready: false }, null], battle: null, phase: 'lobby', picks: [null, null] };
      ws._room = r; ws._slot = 0;
      rooms.set(code, r);
      sendTo(ws, { t: 'room', code, you: 0, players: [playerSummary(r.players[0]), null] });
      return { ok: true };
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').toUpperCase());
      if (!r) return { ok: false, error: 'No room with that code.' };
      if (r.players[0] && r.players[1]) return { ok: false, error: 'Room is full (1v1).' };
      const slot = r.players[0] ? 1 : 0;
      r.players[slot] = { ws, card: null, ready: false };
      ws._room = r; ws._slot = slot;
      sendTo(ws, { t: 'room', code: r.code, you: slot, players: [playerSummary(r.players[0]), playerSummary(r.players[1])] });
      broadcastPlayers(r);
      return { ok: true };
    }
    case 'scan': {
      if (!room) return { ok: false, error: 'Join a room first.' };
      const card = sanitizeCard(msg.card);
      if (!card) return { ok: false, error: 'Bad card.' };
      room.players[ws._slot].card = card;
      room.players[ws._slot].ready = false;
      broadcastPlayers(room);
      return { ok: true };
    }
    case 'ready': {
      if (!room) return { ok: false, error: 'Join a room first.' };
      const p = room.players[ws._slot];
      if (!p.card) return { ok: false, error: 'Scan a fighter first.' };
      p.ready = true;
      broadcastPlayers(room);
      if (room.players[0] && room.players[1] && room.players[0].card && room.players[1].card &&
          room.players[0].ready && room.players[1].ready && room.phase !== 'pick' && room.phase !== 'anim') {
        startBattle(room);
      }
      return { ok: true };
    }
    case 'move': {
      if (!room || room.phase !== 'pick') return { ok: true };
      const idx = Number(msg.idx);
      if (![0, 1, 2].includes(idx)) return { ok: true };
      if (!room.battle.availableMoves(ws._slot).includes(idx)) return { ok: true };
      room.picks[ws._slot] = idx;
      if (room.picks[0] !== null && room.picks[1] !== null) resolveRound(room);
      return { ok: true };
    }
    case 'rematch': {
      if (!room || !room.players[0] || !room.players[1]) return { ok: false, error: 'Need two players.' };
      if (!room.players[0].card || !room.players[1].card) return { ok: false, error: 'Scan fighters first.' };
      room.players[0].ready = true; room.players[1].ready = true;
      room.players.forEach((p, i) => send(p, { t: 'rematch_start', cards: [room.players[0].card, room.players[1].card], you: i }));
      room.battle = new Battle(room.players[0].card, room.players[1].card, Math.random);
      room.phase = 'pick';
      setTimeout(() => sendPick(room), 600);
      return { ok: true };
    }
    case 'leave': {
      leaveRoom(ws);
      return { ok: true };
    }
  }
  return { ok: true };
}

function leaveRoom(ws) {
  const room = ws._room;
  if (!room) return;
  const slot = ws._slot;
  if (room.players[slot] && room.players[slot].ws === ws) {
    room.players[slot] = null;
    clearTimeout(room.pickTimeout);
    const other = room.players[1 - slot];
    if (other) send(other, { t: 'peer_left' });
    if (!room.players[0] && !room.players[1]) rooms.delete(room.code);
    else broadcastPlayers(room);
  }
  ws._room = null;
}

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    const reply = handleMessage(ws, msg);
    if (msg.id !== undefined) sendTo(ws, { ...reply, id: msg.id, t: reply.t || 'ack' });
  });
  ws.on('close', () => leaveRoom(ws));
});

server.listen(PORT, () => {
  console.log(`Scan Attax running → http://localhost:${PORT}`);
  console.log('Friends on your network can open that address and join your room code.');
});
