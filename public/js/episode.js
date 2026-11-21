/* Scan Attax — anime episode renderer. Draws the whole battle as an animated
   "episode" on a canvas: VS intro, round banners, attack lunges, dodges,
   critical hits, damage numbers, dialogue bubbles, and a full-screen cutscene
   for special moves (letterbox bars, speed lines, zoom, title card, impact). */
(function (root) {
  const W = 960, H = 540;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const LINES = {
    attack: ['{move}!', 'Take this!', 'Hyaa!', '{move}, now!', 'Feel this!'],
    special: ['Now... the ultimate move!', 'Witness my true power!', 'This ends it!', 'Unleash... {move}!'],
    dodge: ['Too slow!', 'Missed me!', 'Not today!', 'Heh. Dodged!'],
    crit: ['CRITICAL HIT!!', 'A perfect strike!'],
    strong: ['SUPER EFFECTIVE!'],
    extra: ['EXTRA EFFECTIVE!'],
    weak: ['Not very effective...'],
    ko: ["I'm... done for...", 'No way...', 'This... can\'t be happening...'],
    win: ['I win!', 'Victory is mine!', 'The episode ends with me!'],
    burn: ['Argh, the burn!'],
    stunned: ['I can\'t... move...'],
  };
  const EFFECT_TEXT = {
    smokescreen: 'SMOKESCREEN!', brace: 'BRACING!', slow: 'SLOWED!',
    burn: 'BURNING!', patch: '+5 HP!', stun: 'STUN CHARGE!',
    extra_effective: 'EXTRA EFFECTIVE!',
  };

  class Episode {
    constructor(canvas, cardA, cardB) {
      this.canvas = canvas;
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.cards = [cardA, cardB];
      this.fighters = [
        { emoji: cardA.emoji, name: cardA.name, x: 220, baseX: 220, y: 330, scale: 1, rot: 0, flash: 0, alpha: 1, hp: cardA.hp, maxHp: cardA.hp, side: 0 },
        { emoji: cardB.emoji, name: cardB.name, x: 740, baseX: 740, y: 330, scale: 1, rot: 0, flash: 0, alpha: 1, hp: cardB.hp, maxHp: cardB.hp, side: 1 },
      ];
      this.shake = 0;
      this.popups = [];   // {text,x,y,t,life,size,color,stroke}
      this.bubbles = [];  // {text,side,t,life}
      this.bars = 0;      // letterbox height
      this.speedlines = false;
      this.banner = null; // {big, small, t, life}
      this.title = null;  // cutscene title {text, t, life}
      this.flashAll = 0;
      this.time = 0;
      this.over = false;
      this.running = true;
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    say(side, text) { this.bubbles.push({ text, side, t: 0, life: 1100 }); }
    popup(text, opts = {}) {
      this.popups.push({
        text, x: opts.x ?? W / 2, y: opts.y ?? 200, t: 0, life: opts.life ?? 900,
        size: opts.size ?? 34, color: opts.color ?? '#fff', stroke: opts.stroke ?? '#000',
      });
    }
    line(side, key, move) {
      const arr = LINES[key];
      const s = arr[Math.floor(Math.random() * arr.length)].replace('{move}', move ? move.name : '');
      this.say(side, s);
    }

    async _loop(t) {
      if (!this.running) return;
      const dt = Math.min(50, t - (this._last || t)); this._last = t;
      this.time += dt;
      for (const p of this.popups) p.t += dt;
      for (const b of this.bubbles) b.t += dt;
      this.popups = this.popups.filter((p) => p.t < p.life);
      this.bubbles = this.bubbles.filter((b) => b.t < b.life);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
      if (this.title) { this.title.t += dt; if (this.title.t > this.title.life) this.title = null; }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.03);
      if (this.flashAll > 0) this.flashAll = Math.max(0, this.flashAll - dt * 0.004);
      for (const f of this.fighters) if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 0.006);
      this._draw();
      requestAnimationFrame(this._loop);
    }

    _draw() {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

      // background
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (this.speedlines) { g.addColorStop(0, '#0a0a1a'); g.addColorStop(1, '#1a0a2a'); }
      else { g.addColorStop(0, '#1b2a6b'); g.addColorStop(0.6, '#7a2ea0'); g.addColorStop(1, '#e0608a'); }
      ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, H + 60);

      if (this.speedlines) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + this.time * 0.002;
          const r0 = 60 + (this.time * 0.15 + i * 37) % 120;
          const r1 = r0 + 160 + (i * 53) % 200;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // floor
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-30, 420, W + 60, H - 420 + 30);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-30, 420, W + 60, 4);

      // fighters
      for (const f of this.fighters) {
        const bob = this.over ? 0 : Math.sin(this.time * 0.004 + f.side * 2) * 6;
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.translate(f.x, f.y + bob);
        ctx.rotate(f.rot);
        ctx.scale(f.side === 0 ? f.scale : -f.scale, f.scale);
        // shadow
        ctx.save();
        ctx.scale(1, 0.25); ctx.translate(0, (110 - bob) / 1);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(0, 430 - f.y, 55, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.font = `${Math.round(110 * f.scale)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.emoji, 0, 0);
        if (f.flash > 0) {
          ctx.globalAlpha = f.alpha * f.flash;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, 70 * f.scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      this._drawHud(ctx);
      this._drawBubbles(ctx);
      this._drawPopups(ctx);
      if (this.banner) this._drawBanner(ctx);
      if (this.title) this._drawTitle(ctx);

      // letterbox bars
      if (this.bars > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(-30, -30, W + 60, this.bars + 30);
        ctx.fillRect(-30, H - this.bars, W + 60, this.bars + 30);
      }
      if (this.flashAll > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flashAll)})`;
        ctx.fillRect(-30, -30, W + 60, H + 60);
      }
      ctx.restore();
    }

    _drawHud(ctx) {
      const drawBar = (f, left) => {
        const x = left ? 30 : W - 330, y = 24, w = 300, h = 22;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - 4, y - 22, w + 8, h + 46);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif'; ctx.textAlign = left ? 'left' : 'right';
        const label = `${f.name}  [${this.cards[f.side].rank}${this.cards[f.side].tag !== 'None' ? ' · ' + this.cards[f.side].tag : ''}]`;
        ctx.fillText(label, left ? x : x + w, y - 6);
        ctx.fillStyle = '#400'; ctx.fillRect(x, y, w, h);
        const pct = Math.max(0, f.hp / f.maxHp);
        ctx.fillStyle = pct > 0.5 ? '#3ddc5a' : pct > 0.25 ? '#ffb52e' : '#ff4040';
        ctx.fillRect(x, y, w * pct, h);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.max(0, f.hp)} / ${f.maxHp}`, x + w / 2, y + 16);
      };
      drawBar(this.fighters[0], true);
      drawBar(this.fighters[1], false);
    }

    _drawBubbles(ctx) {
      for (const b of this.bubbles) {
        const f = this.fighters[b.side];
        const x = f.x, y = f.y - 110;
        ctx.font = 'bold 18px sans-serif';
        const w = ctx.measureText(b.text).width + 28;
        const a = Math.min(1, b.t / 120, (b.life - b.t) / 200);
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
        const bx = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
        ctx.beginPath(); ctx.roundRect(bx - w / 2, y - 20, w, 34, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center';
        ctx.fillText(b.text, bx, y + 3);
        ctx.globalAlpha = 1;
      }
    }

    _drawPopups(ctx) {
      for (const p of this.popups) {
        const k = p.t / p.life;
        const y = p.y - k * 70;
        const a = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = `900 ${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = p.stroke;
        ctx.strokeText(p.text, p.x, y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, y);
        ctx.globalAlpha = 1;
      }
    }

    _drawBanner(ctx) {
      const b = this.banner;
      const k = Math.min(1, b.t / 180);
      const scale = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
      const a = b.t > b.life - 300 ? (b.life - b.t) / 300 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(W / 2, H / 2 - 40);
      ctx.scale(scale, scale);
      ctx.rotate(-0.04);
      ctx.font = '900 84px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 12; ctx.strokeStyle = '#000';
      ctx.strokeText(b.big, 0, 0);
      ctx.fillStyle = b.color || '#ffe93d';
      ctx.fillText(b.big, 0, 0);
      if (b.small) {
        ctx.font = '900 34px sans-serif';
        ctx.lineWidth = 8;
        ctx.strokeText(b.small, 0, 56);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.small, 0, 56);
      }
      ctx.restore();
    }

    _drawTitle(ctx) {
      const t = this.title;
      const pulse = 1 + Math.sin(this.time * 0.02) * 0.04;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 30);
      ctx.scale(pulse, pulse);
      ctx.font = '900 58px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 14; ctx.strokeStyle = '#000';
      ctx.strokeText(t.text, 0, 0);
      const g = ctx.createLinearGradient(0, -40, 0, 20);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#ff3d3d');
      ctx.fillStyle = g;
      ctx.fillText(t.text, 0, 0);
      ctx.font = '900 22px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('— SPECIAL ATTACK —', 0, 44);
      ctx.restore();
    }

    _setHp(ev) {
      if (ev.hpAfter) {
        this.fighters[0].hp = ev.hpAfter[0];
        this.fighters[1].hp = ev.hpAfter[1];
      }
    }

    async intro() {
      const [a, b] = this.cards;
      this.banner = { big: 'SCAN ATTAX', small: 'THE OBJECT BATTLE EPISODE', t: 0, life: 1600, color: '#fff' };
      await sleep(1700);
      this.banner = { big: 'VS', t: 0, life: 1200, color: '#ff4040' };
      await sleep(1300);
      this.popup(`${a.name}  vs  ${b.name}`, { y: 90, size: 30, life: 1800 });
      await sleep(1900);
    }

    async roundBanner(n) {
      this.banner = { big: `ROUND ${n}`, small: n === 3 ? 'SPECIAL ROUND!' : 'FIGHT!', t: 0, life: 1100, color: '#ffe93d' };
      await sleep(1150);
    }

    async playEvents(events) {
      for (const ev of events) {
        if (ev.type === 'round') { /* handled by roundBanner */ }
        else if (ev.type === 'attack') await this._playAttack(ev);
        else if (ev.type === 'burn') {
          this._setHp(ev);
          const f = this.fighters[ev.target];
          this.line(ev.target, 'burn');
          this.popup(`-${ev.dmg} BURN`, { x: f.x, y: f.y - 90, size: 26, color: '#ff8c2e' });
          await sleep(650);
        } else if (ev.type === 'ko') {
          this._setHp(ev);
          await this._playKo(ev);
        } else if (ev.type === 'timeup') {
          this._setHp(ev);
          this.banner = { big: 'TIME UP!', t: 0, life: 1400, color: '#7dd8ff' };
          await sleep(1500);
        }
      }
    }

    async _playAttack(ev) {
      const atk = this.fighters[ev.actor];
      const def = this.fighters[1 - ev.actor];
      this._setHp(ev);
      const move = ev.move;

      if (ev.stunned) {
        this.line(1 - ev.actor, 'stunned');
        this.popup('STUNNED! MISS!', { x: def.x, y: def.y - 100, size: 30, color: '#c07dff' });
        atk.flash = 0;
        await sleep(800);
        return;
      }

      if (ev.dodged) {
        this.line(ev.actor, 'dodge', move);
        const dir = atk.side === 0 ? 1 : -1;
        for (let i = 0; i < 8; i++) { def.x += dir * 14; await sleep(16); }
        this.popup('DODGED!', { x: def.x, y: def.y - 110, size: 30, color: '#7dd8ff' });
        await sleep(450);
        for (let i = 0; i < 8; i++) { def.x -= dir * 14; await sleep(16); }
        def.x = def.baseX;
        return;
      }

      if (ev.special) {
        await this._cutscene(ev, atk, def, move);
        return;
      }

      // normal attack lunge
      this.line(ev.actor, 'attack', move);
      const dir = atk.side === 0 ? 1 : -1;
      const targetX = def.x - dir * 130;
      for (let i = 0; i < 10; i++) { atk.x += (targetX - atk.x) * 0.35; await sleep(16); }
      // impact
      def.flash = 1;
      this.shake = Math.max(this.shake, ev.crit ? 18 : 9);
      const dmgTxt = `${ev.crit ? 'CRIT! ' : ''}-${ev.dmg}`;
      this.popup(dmgTxt, { x: def.x, y: def.y - 110, size: ev.crit ? 46 : 34, color: ev.crit ? '#ffe93d' : '#fff' });
      if (ev.crit) { this.line(ev.actor, 'crit'); this.popup('CRITICAL HIT!', { y: 120, size: 30, color: '#ffe93d', life: 700 }); }
      if (ev.matchup === 'strong') this.popup(LINES.strong[0], { y: 150, size: 26, color: '#7dff8a', life: 800 });
      if (ev.matchup === 'extra') this.popup(LINES.extra[0], { y: 150, size: 26, color: '#7dff8a', life: 800 });
      if (ev.matchup === 'weak') this.popup(LINES.weak[0], { y: 150, size: 24, color: '#aaa', life: 800 });
      if (ev.braced) this.popup('BRACED — half damage', { y: 180, size: 20, color: '#9ab', life: 700 });
      def.x += dir * 26;
      await sleep(500);
      for (let i = 0; i < 10; i++) { atk.x += (atk.baseX - atk.x) * 0.3; def.x += (def.baseX - def.x) * 0.3; await sleep(16); }
      atk.x = atk.baseX; def.x = def.baseX;

      if (ev.effect && EFFECT_TEXT[ev.effect]) {
        const target = (ev.effect === 'smokescreen' || ev.effect === 'brace' || ev.effect === 'patch') ? atk : def;
        this.popup(EFFECT_TEXT[ev.effect], { x: target.x, y: target.y - 140, size: 22, color: '#ff9df3', life: 800 });
        await sleep(500);
      }
    }

    async _cutscene(ev, atk, def, move) {
      const dir = atk.side === 0 ? 1 : -1;
      // letterbox + speed lines
      for (let i = 0; i < 10; i++) { this.bars += 8; await sleep(16); }
      this.speedlines = true;
      this.line(ev.actor, 'special', move);
      await sleep(400);
      // zoom on attacker
      const startX = atk.x, startScale = atk.scale;
      for (let i = 0; i < 24; i++) {
        atk.x += (W / 2 - dir * 60 - atk.x) * 0.18;
        atk.scale = startScale + (1.7 - startScale) * (i / 24);
        await sleep(16);
      }
      await sleep(250);
      this.title = { text: move.name, t: 0, life: 1300 };
      await sleep(1350);
      // white flash then impact
      this.flashAll = 1;
      await sleep(120);
      this.flashAll = 0;
      this.shake = 26;
      def.flash = 1;
      def.x += dir * 220;
      def.rot += dir * 0.5;
      const dmgTxt = `${ev.crit ? 'CRIT! ' : ''}-${ev.dmg}`;
      this.popup(dmgTxt, { x: W / 2, y: H / 2 + 40, size: 64, color: ev.crit ? '#ffe93d' : '#ff5a3d', life: 1200 });
      this.popup('IMPACT!', { y: 110, size: 40, color: '#fff', life: 900 });
      if (ev.crit) this.popup('CRITICAL HIT!', { y: 160, size: 30, color: '#ffe93d', life: 900 });
      if (ev.matchup === 'strong' || ev.matchup === 'extra') this.popup(LINES.strong[0], { y: 200, size: 26, color: '#7dff8a', life: 900 });
      await sleep(900);
      // return to neutral
      for (let i = 0; i < 14; i++) { this.bars -= 8; await sleep(16); }
      this.speedlines = false;
      atk.x = startX; atk.scale = startScale;
      def.x = def.baseX; def.rot = 0;
      if (ev.effect && EFFECT_TEXT[ev.effect]) {
        const target = (ev.effect === 'smokescreen' || ev.effect === 'brace' || ev.effect === 'patch') ? atk : def;
        this.popup(EFFECT_TEXT[ev.effect], { x: target.x, y: target.y - 140, size: 22, color: '#ff9df3', life: 800 });
        await sleep(450);
      }
    }

    async _playKo(ev) {
      const loser = this.fighters[ev.fighter];
      this.over = true;
      this.line(ev.fighter, 'ko');
      this.banner = { big: 'K.O.!', t: 0, life: 2200, color: '#ff4040' };
      this.shake = 20;
      for (let i = 0; i < 30; i++) {
        loser.rot += (Math.PI / 2 - loser.rot) * 0.2;
        loser.y += 2.2;
        await sleep(16);
      }
      await sleep(1400);
    }

    async outro(winner, reason) {
      const w = winner === 'draw' ? null : this.fighters[winner];
      if (w) { this.line(winner, 'win'); }
      this.banner = {
        big: winner === 'draw' ? 'DRAW!' : `${this.cards[winner].name} WINS!`,
        small: reason === 'burn' ? 'KO BY BURN' : reason === 'time' ? 'DECIDED ON HP LEFT AFTER 10 ROUNDS' : 'KNOCKOUT',
        t: 0, life: 3200, color: '#7dff8a',
      };
      await sleep(3300);
    }

    stop() { this.running = false; }
  }

  root.SA_EPISODE = { Episode };
})(typeof self !== 'undefined' ? self : this);
