/* Scan Attax — UI controller: home → scan → (solo battle | room lobby) → anime battle. */
(function () {
  const D = window.SA_DATA, ST = window.SA_STATS, B = window.SA_BATTLE;
  const $ = (id) => document.getElementById(id);
  const screens = ['home', 'scan', 'lobby', 'battle', 'help'];

  const App = {
    mode: 'solo',
    net: null,
    room: null,
    you: 0,
    myCard: null,
    battle: null,
    ep: null,
    voice: new window.SA_VOICE.VoicePicker(),
    pickResolve: null,
    pickTimer: null,
    clientState: { round: 1, specialUsed: false },
    stream: null,
  };

  function show(name) {
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(msg, ms = 3000) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function log(msg) {
    const el = $('battle-log');
    const div = document.createElement('div');
    div.textContent = msg;
    el.prepend(div);
    while (el.children.length > 40) el.removeChild(el.lastChild);
  }

  /* ---------- card rendering ---------- */
  const STAT_LABEL = { str: '💪 STR', dur: '🛡️ DUR', spd: '⚡ SPD', agi: '🌀 AGI', aura: '✨ AURA' };
  function cardHtml(card) {
    const rows = Object.entries(card.stats).map(([k, v]) =>
      `<div class="stat-row"><span>${STAT_LABEL[k]}</span><div class="bar"><div style="width:${v * 10}%"></div></div><b>${v}</b></div>`).join('');
    const moves = card.moves.map((m, i) => {
      const fx = m.effect === 'none' ? 'plain hit' : D.EFFECTS[m.effect] + (m.effectiveVs ? ` (${m.effectiveVs})` : '');
      const tag = i === 2 ? '<span class="special-tag">SPECIAL ×2</span>' : '';
      return `<div class="move"><b>${i + 1}. ${m.name}</b> <span class="prop">${m.property}</span> ${tag}<br><small>${fx}</small></div>`;
    }).join('');
    return `<div class="card rank-${card.rank}">
      <div class="card-head"><span class="card-emoji">${card.emoji}</span>
        <div><div class="card-name">${card.name}</div>
        <div><span class="rank-badge">${card.rank}</span> <span class="cond-tag">${card.tag}</span> <span class="hp-tag">❤ ${card.hp} HP</span></div></div>
      </div>
      ${rows}
      <div class="stat-row total"><span>TOTAL</span><b>${card.total}</b></div>
      ${card.facts.auraReason ? `<div class="aura-reason">${card.facts.auraReason}</div>` : ''}
      <div class="moves">${moves}</div>
    </div>`;
  }

  /* ---------- scan screen ---------- */
  function buildScanForm() {
    const mat = $('sel-material');
    mat.innerHTML = D.MATERIALS.map((m) => `<option>${m}</option>`).join('');
    $('sel-condition').innerHTML = D.CONDITIONS.map((c) => `<option value="${c}">${c}</option>`).join('');
    $('sel-rank').innerHTML = D.RANKS.map((r) => `<option value="${r}" title="${D.RANK_EXAMPLES[r]}">${r} (${D.RANK_RANGE[r][0]}–${D.RANK_RANGE[r][1]})</option>`).join('');
    $('prop-checks').innerHTML = D.PROPERTIES.map((p) =>
      `<label class="chip"><input type="checkbox" value="${p}"> ${p}</label>`).join('');
    $('inp-aura').oninput = () => { $('aura-val').textContent = $('inp-aura').value; };

    $('preset-grid').innerHTML = '';
    for (const p of D.PRESETS) {
      const b = document.createElement('button');
      b.className = 'preset-btn';
      b.innerHTML = `<span class="preset-emoji">${p.emoji}</span><span>${p.name}</span>`;
      b.onclick = () => {
        App.myCard = ST.presetCard(p.id);
        $('card-preview').innerHTML = cardHtml(App.myCard);
        $('btn-to-battle').hidden = false;
        toast(`${p.name} card ready!`);
      };
      $('preset-grid').appendChild(b);
    }
  }

  function selectedProps() {
    return Array.from(document.querySelectorAll('#prop-checks input:checked')).map((i) => i.value).slice(0, 3);
  }

  function formFacts() {
    return {
      weight: parseFloat($('inp-weight').value) || 350,
      size: parseFloat($('inp-size').value) || 10,
      material: $('sel-material').value,
      properties: selectedProps(),
      condition: $('sel-condition').value,
      aura: parseInt($('inp-aura').value, 10),
      auraReason: $('inp-aura-reason').value,
      rank: $('sel-rank').value,
    };
  }

  function autoRank(facts) {
    // Suggest the rank whose range the raw total lands in (or nearest), like the strict AI ranker.
    const probe = ST.computeCard('probe', '📦', { ...facts, rank: 'C', aura: facts.aura, moves: null });
    const total = ['str', 'dur', 'spd', 'agi', 'aura'].reduce((s, k) => s + probe.stats[k], 0);
    let best = 'C', bestDist = Infinity;
    for (const r of D.RANKS) {
      const [lo, hi] = D.RANK_RANGE[r];
      const dist = total < lo ? lo - total : total > hi ? total - hi : 0;
      if (dist < bestDist) { bestDist = dist; best = r; }
    }
    return best;
  }

  function genscan() {
    const name = $('inp-name').value.trim() || 'Mystery Object';
    const known = D.PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const rng = D.mulberry32(D.hashStr(name.toLowerCase()));
    if (known) {
      $('inp-weight').value = known.facts.weight;
      $('inp-size').value = known.facts.size;
      $('sel-material').value = known.facts.material;
      $('sel-condition').value = known.facts.condition;
      $('inp-aura').value = known.facts.aura;
      $('aura-val').textContent = known.facts.aura;
      $('inp-aura-reason').value = known.facts.auraReason;
      document.querySelectorAll('#prop-checks input').forEach((i) => { i.checked = known.facts.properties.includes(i.value); });
      $('sel-rank').value = known.facts.rank;
      toast(`Scanner recognised: ${known.name}!`);
      return;
    }
    const weight = Math.round(Math.pow(10, rng() * 6.3)); // 1 g .. ~2000 kg
    const size = Math.round(2 + rng() * 198);
    $('inp-weight').value = weight;
    $('inp-size').value = size;
    $('sel-material').value = D.pick(rng, D.MATERIALS);
    $('sel-condition').value = D.pick(rng, D.CONDITIONS);
    const aura = 1 + Math.floor(rng() * 10);
    $('inp-aura').value = aura;
    $('aura-val').textContent = aura;
    const scaleRow = D.AURA_SCALE.find((r) => {
      const [lo, hi] = r[0].split('-').map(Number); return aura >= lo && aura <= hi;
    });
    $('inp-aura-reason').value = `Aura ${aura}: ${scaleRow ? scaleRow[1].toLowerCase() : ''}`;
    const nProps = Math.floor(rng() * 4);
    const props = new Set();
    while (props.size < nProps) props.add(D.pick(rng, D.PROPERTIES));
    document.querySelectorAll('#prop-checks input').forEach((i) => { i.checked = props.has(i.value); });
    const facts = formFacts();
    $('sel-rank').value = autoRank(facts);
    toast('Scanner reported facts about "' + name + '"');
  }

  function makeCardFromForm() {
    const name = $('inp-name').value.trim() || 'Mystery Object';
    const facts = formFacts();
    App.myCard = ST.computeCard(name, '📦', facts);
    $('card-preview').innerHTML = cardHtml(App.myCard);
    $('btn-to-battle').hidden = false;
  }

  function openScan(mode) {
    App.mode = mode;
    buildScanForm();
    show('scan');
  }

  /* ---------- camera ---------- */
  async function toggleCamera() {
    if (App.stream) {
      App.stream.getTracks().forEach((t) => t.stop());
      App.stream = null;
      $('camera-wrap').hidden = true;
      $('btn-camera').textContent = 'Enable camera';
      return;
    }
    try {
      App.stream = await navigator.mediaDevices.getUserMedia({ video: true });
      $('camera').srcObject = App.stream;
      $('camera-wrap').hidden = false;
      $('btn-camera').textContent = 'Disable camera';
    } catch (e) {
      toast('Camera unavailable — use the form instead.');
    }
  }

  /* ---------- battle: shared round driver ---------- */
  function eventText(ev) {
    if (ev.type === 'attack') {
      const who = ev.actor === 0 ? 'P1' : 'P2';
      if (ev.stunned) return `${who} is stunned — attack missed!`;
      if (ev.dodged) return `${who} used ${ev.move.name}… DODGED!`;
      let s = `${who} used ${ev.move.name} → ${ev.dmg} damage`;
      if (ev.crit) s += ' (CRITICAL!)';
      if (ev.matchup === 'strong' || ev.matchup === 'extra') s += ' — super effective!';
      if (ev.matchup === 'weak') s += ' — not very effective…';
      if (ev.braced) s += ' (braced)';
      if (ev.effect && ev.effect !== 'none') s += ` [${ev.effect}]`;
      return s;
    }
    if (ev.type === 'burn') return `🔥 P${ev.target + 1} takes ${ev.dmg} burn damage`;
    if (ev.type === 'ko') return `💥 K.O.! P${ev.winner + 1} wins!`;
    if (ev.type === 'timeup') return '⏱ Time up after 10 rounds!';
    return '';
  }

  function setupMoveButtons(available, moves) {
    const wrap = $('move-btns');
    wrap.innerHTML = '';
    moves.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'move-btn' + (i === 2 ? ' special' : '');
      b.innerHTML = `<b>${i === 2 ? '🌟' : i + 1} ${m.name}</b><small>${m.property} · ${m.effect === 'none' ? 'plain' : m.effect}${i === 2 ? ' · ×2' : ''}</small>`;
      b.disabled = !available.includes(i);
      b.onclick = () => resolvePick(i);
      wrap.appendChild(b);
    });
  }

  function resolvePick(idx) {
    if (!App.pickResolve) return;
    const r = App.pickResolve;
    App.pickResolve = null;
    clearInterval(App.pickTimer);
    App.voice.stop();
    $('btn-mic').textContent = '🎙️ Voice: off';
    $('pick-bar').hidden = true;
    r(idx);
  }

  function pickPhase(available, moves, defaultIdx, timeoutMs) {
    return new Promise((resolve) => {
      App.pickResolve = resolve;
      $('pick-bar').hidden = false;
      $('pick-title').textContent = '🎙️ Say your attack — or tap:';
      setupMoveButtons(available, moves);
      // voice
      $('btn-mic').onclick = () => {
        if (App.voice.listening) {
          App.voice.stop();
          $('btn-mic').textContent = '🎙️ Voice: off';
          $('voice-status').textContent = '—';
          return;
        }
        const ok = App.voice.start(moves);
        if (ok) {
          $('btn-mic').textContent = '🎙️ Voice: ON 🔴';
          $('voice-status').textContent = 'listening… say a move name, "one/two/three", or "special"';
        } else {
          $('voice-status').textContent = 'voice not supported in this browser — tap a move';
        }
      };
      App.voice.onTranscript = (text, isFinal) => {
        if (isFinal) $('voice-status').textContent = '🗣 “' + text.trim() + '”';
      };
      App.voice.onMatch = (m) => {
        if (!available.includes(m.idx)) {
          $('voice-status').textContent = `“${m.label}” isn't available this round`;
          return;
        }
        $('voice-status').textContent = `🎙️ picked: ${m.label}!`;
        setTimeout(() => resolvePick(m.idx), 350);
      };
      // timer
      const fill = $('pick-timer-fill');
      const t0 = Date.now();
      fill.style.width = '100%';
      clearInterval(App.pickTimer);
      App.pickTimer = setInterval(() => {
        const left = timeoutMs - (Date.now() - t0);
        fill.style.width = Math.max(0, (left / timeoutMs) * 100) + '%';
        if (left <= 0) resolvePick(defaultIdx);
      }, 100);
    });
  }

  async function runBattleLoop(getPick, cards, you) {
    const ep = App.ep;
    await ep.intro();
    while (!App.battle.over) {
      const round = App.battle.round;
      await ep.roundBanner(round);
      const available = App.battle.availableMoves(you);
      const idx = await getPick(available, cards[you].moves, App.battle.defaultMove(you));
      if (App.clientState.specialUsed === false && idx === 2) App.clientState.specialUsed = true;
      const events = App.battle.simulateRound(idx, App.battle.defaultMove(1 - you));
      for (const ev of events) { const t = eventText(ev); if (t) log(`R${round} · ${t}`); }
      if (events.some((e) => e.type === 'attack' && e.actor === you && e.moveIdx === 2)) App.clientState.specialUsed = true;
      await ep.playEvents(events);
    }
    await ep.outro(App.battle.winner, App.battle.reason);
    showResult(App.battle.winner, App.battle.reason, cards);
  }

  function showResult(winner, reason, cards) {
    const title = $('overlay-title'), text = $('overlay-text');
    if (winner === 'draw') { title.textContent = 'DRAW!'; text.textContent = '10 rounds up and both fighters are still standing on equal HP%.'; }
    else {
      const w = cards[winner];
      title.textContent = `${w.emoji} ${w.name} WINS!`;
      text.textContent = reason === 'burn' ? 'Knocked out by burn damage.' : reason === 'time' ? '10 rounds over — decided on HP remaining.' : 'Knocked out cold. Episode complete!';
    }
    $('overlay').hidden = false;
  }

  /* ---------- solo ---------- */
  async function startSoloBattle() {
    if (!App.myCard) { toast('Scan a fighter first!'); return; }
    const presets = D.PRESETS.map((p) => p.id);
    const cpuId = presets[Math.floor(Math.random() * presets.length)];
    let cpuCard = ST.presetCard(cpuId);
    if (cpuCard.name === App.myCard.name) cpuCard = ST.presetCard(presets[(presets.indexOf(cpuId) + 1) % presets.length]);
    beginBattleScreen([App.myCard, cpuCard], 0, false);
    App.battle = new B.Battle(App.myCard, cpuCard, Math.random);
    show('battle');
    $('battle-log').innerHTML = '';
    try {
      await runBattleLoop(
        (available, moves, def) => pickPhase(available, moves, def, 12000),
        [App.myCard, cpuCard], 0
      );
    } catch (e) { console.error(e); toast('Battle error: ' + e.message); }
  }

  /* ---------- multiplayer ---------- */
  function wireNet() {
    const net = App.net;
    net.on('room', (m) => {
      App.room = m.code; App.you = m.you;
      $('room-code').textContent = m.code;
      $('room-code-wrap').hidden = false;
      $('lobby-room').hidden = false;
      $('lobby-setup').hidden = true;
      $('lobby-status').textContent = 'Waiting for a friend to join with the code…';
      updateSlots(m.players || []);
    });
    net.on('players', (m) => { updateSlots(m.players); });
    net.on('peer_card', (m) => { updateSlots(m.players); });
    net.on('peer_left', () => {
      toast('Your opponent left the room.');
      $('lobby-status').textContent = 'Opponent left. Waiting for a new friend…';
    });
    net.on('start', (m) => {
      beginBattleScreen(m.cards, m.you, true);
      $('battle-log').innerHTML = '';
      show('battle');
      toast('Battle start!');
    });
    net.on('pick', async (m) => {
      const cards = App.netCards;
      if (!App.introPlayed) { App.introPlayed = true; await App.ep.intro(); }
      await App.ep.roundBanner(m.round);
      const idx = await pickPhase(m.available[App.you], cards[App.you].moves, m.round === 3 ? 2 : (m.round % 2 === 1 ? 0 : 1), 12000);
      App.net.move(idx);
      log(`R${m.round} · you picked ${cards[App.you].moves[idx].name}`);
      $('lobby-status').textContent = '';
    });
    net.on('events', async (m) => {
      for (const ev of m.events) { const t = eventText(ev); if (t) log(`R${m.round} · ${t}`); }
      await App.ep.playEvents(m.events);
    });
    net.on('over', async (m) => {
      await App.ep.outro(m.winner, m.reason);
      showResult(m.winner, m.reason, App.netCards);
    });
    net.on('rematch_start', (m) => {
      $('overlay').hidden = true;
      beginBattleScreen(m.cards, App.you, true);
      $('battle-log').innerHTML = '';
      show('battle');
    });
    net.on('error_msg', (m) => toast(m.msg));
    net.on('disconnected', () => { $('net-status').textContent = 'disconnected from server'; });
  }

  function updateSlots(players) {
    players.forEach((p, i) => {
      const slot = $('slot-' + i);
      if (!slot) return;
      slot.querySelector('.slot-body').innerHTML = p && p.card
        ? cardHtml(p.card) + (p.ready ? '<div class="ready-tag">✔ READY</div>' : '')
        : (p ? 'connected, scanning…' : 'waiting…');
    });
    const me = players[App.you];
    $('btn-ready').disabled = !(me && me.card && !me.ready);
    if (players.length === 2 && players.every((p) => p && p.card)) {
      $('lobby-status').textContent = 'Both fighters scanned! Press Ready when you\'re set.';
    }
  }

  async function openLobby() {
    App.mode = 'multi';
    show('lobby');
    $('net-status').textContent = 'connecting…';
    if (!App.net) {
      App.net = new window.SA_NET.Net();
      wireNet();
    }
    try {
      await App.net.connect();
      $('net-status').textContent = 'connected ✔ — create a room or join with a code';
    } catch (e) {
      $('net-status').textContent = e.message + ' (Solo mode works without the server.)';
    }
  }

  /* ---------- battle screen ---------- */
  function beginBattleScreen(cards, you, isNet) {
    if (App.ep) App.ep.stop();
    App.netCards = cards;
    App.you = you;
    App.clientState = { round: 1, specialUsed: false };
    App.introPlayed = false;
    App.ep = new window.SA_EPISODE.Episode($('arena'), cards[0], cards[1]);
    $('overlay').hidden = true;
  }

  /* ---------- wiring ---------- */
  function init() {
    $('btn-solo').onclick = () => { openScan('solo'); };
    $('btn-multi').onclick = () => openLobby();
    $('btn-help').onclick = () => show('help');
    $('btn-help-back').onclick = () => show('home');
    $('btn-scan-back').onclick = () => {
      if (App.mode === 'multi' && App.room) show('lobby'); else show('home');
    };
    $('btn-camera').onclick = toggleCamera;
    $('btn-snap').onclick = () => { $('snap-note').textContent = 'Photo captured! The demo scanner reports facts in the form →'; genscan(); };
    $('btn-genscan').onclick = genscan;
    $('btn-makecard').onclick = makeCardFromForm;
    $('btn-to-battle').onclick = () => {
      if (App.mode === 'multi') {
        if (!App.room) { toast('Create or join a room first (from the lobby).'); openLobby(); return; }
        App.net.scan(App.myCard).then(() => {
          $('btn-ready').disabled = false;
          show('lobby');
          $('lobby-status').textContent = 'Card sent! Press Ready when both fighters are scanned.';
        }).catch((e) => toast(e.message));
      } else {
        startSoloBattle();
      }
    };

    $('btn-create-room').onclick = async () => {
      try { await App.net.createRoom(); } catch (e) { toast(e.message); }
    };
    $('btn-join').onclick = async () => {
      const code = $('inp-code').value.trim();
      if (code.length !== 5) { toast('Room codes are 5 letters.'); return; }
      try { await App.net.joinRoom(code); } catch (e) { toast(e.message); }
    };
    $('btn-copy-code').onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText($('room-code').textContent);
      toast('Code copied!');
    };
    $('btn-lobby-scan').onclick = () => openScan('multi');
    $('btn-ready').onclick = async () => {
      try { await App.net.ready(); $('btn-ready').disabled = true; $('lobby-status').textContent = 'Ready! Waiting for the other fighter…'; }
      catch (e) { toast(e.message); }
    };
    $('btn-lobby-back').onclick = () => { if (App.net) App.net.leave(); App.room = null; show('home'); };

    $('btn-leave-battle').onclick = () => {
      if (App.ep) App.ep.stop();
      if (App.voice) App.voice.stop();
      if (App.mode === 'multi' && App.net) { App.net.leave(); App.room = null; show('home'); }
      else show('home');
    };
    $('btn-overlay-menu').onclick = () => {
      $('overlay').hidden = true;
      if (App.ep) App.ep.stop();
      if (App.mode === 'multi' && App.net) { show('lobby'); } else show('home');
    };
    $('btn-rematch').onclick = async () => {
      $('overlay').hidden = true;
      if (App.mode === 'multi' && App.net) {
        try { await App.net.rematch(); } catch (e) { toast(e.message); }
      } else {
        startSoloBattle();
      }
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
