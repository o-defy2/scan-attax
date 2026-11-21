/* Scan Attax — battle engine. Runs a full 1v1 battle per the PDF:
   faster Speed attacks first each round; Move 1 on odd rounds, Move 2 on even,
   the special once per battle (round 3 by default); dodge = Agility x 4% (cap 40%);
   damage = Strength + d6, x2/x0.5 by matchup, x2 for specials, x1.5 on a critical
   (Aura x 3%); effects per the fixed list; battle ends on KO or after 10 rounds
   (higher HP% wins). UMD: browser + server run the same code. */
(function (root, factory) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.SA_DATA;
  const B = factory(D);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.SA_BATTLE = B;
})(typeof self !== 'undefined' ? self : this, function (D) {
  const MAX_ROUNDS = 10;

  function defaultRng() { return Math.random(); }

  class Battle {
    constructor(cardA, cardB, rng) {
      this.rng = rng || defaultRng;
      this.fighters = [cardA, cardB].map((card) => ({
        card,
        hp: card.hp,
        maxHp: card.hp,
        specialUsed: false,
        smokescreen: false,
        brace: false,
        stun: false,
        slowRounds: 0,
        burnRounds: 0,
      }));
      this.round = 1;
      this.over = false;
      this.winner = null; // 0, 1 or 'draw'
      this.reason = '';
    }

    hps() { return this.fighters.map((f) => f.hp); }

    effectiveSpeed(i) {
      const f = this.fighters[i];
      return f.card.stats.spd + (f.slowRounds > 0 ? -3 : 0);
    }

    availableMoves(i) {
      const f = this.fighters[i];
      const moves = [0, 1];
      if (!f.specialUsed) moves.push(2);
      return moves;
    }

    // PDF default: Move 1 on odd rounds, Move 2 on even, special in round 3.
    defaultMove(i) {
      const f = this.fighters[i];
      if (this.round === 3 && !f.specialUsed) return 2;
      return this.round % 2 === 1 ? 0 : 1;
    }

    matchupOf(move, defenderCard) {
      const strong = D.MATCHUP_STRONG[move.property] || [];
      if (strong.includes(defenderCard.facts.material)) return { mult: 2, kind: 'strong' };
      const weak = D.MATCHUP_WEAK[move.property] || [];
      if (defenderCard.facts.properties.some((p) => weak.includes(p))) return { mult: 0.5, kind: 'weak' };
      return { mult: 1, kind: 'none' };
    }

    doAttack(actor, moveIdx) {
      const atk = this.fighters[actor];
      const def = this.fighters[1 - actor];
      const move = atk.card.moves[moveIdx];
      const ev = {
        type: 'attack', round: this.round, actor, moveIdx, move: JSON.parse(JSON.stringify(move)),
        hpAfter: this.hps(),
      };
      if (moveIdx === 2) atk.specialUsed = true;

      if (def.stun && this.rng() < 0.25) {
        def.stun = false;
        ev.stunned = true;
        return ev;
      }

      let dodgeChance = Math.min(0.40, def.card.stats.agi * 0.04) + (def.smokescreen ? 0.30 : 0);
      if (this.rng() < dodgeChance) {
        def.smokescreen = false;
        ev.dodged = true;
        return ev;
      }

      let dmg = atk.card.stats.str + (1 + Math.floor(this.rng() * 6));
      let m = this.matchupOf(move, def.card);
      let mult = m.mult;
      ev.matchup = m.kind;
      if (move.effect === 'extra_effective' && move.effectiveVs === def.card.facts.material) {
        mult = 2; // never stacks above double
        ev.matchup = m.kind === 'weak' ? 'weak' : 'extra';
      }
      if (moveIdx === 2) { mult *= 2; ev.special = true; }
      const crit = this.rng() < atk.card.stats.aura * 0.03;
      if (crit) { dmg *= 1.5; ev.crit = true; }
      if (def.brace) { dmg *= 0.5; def.brace = false; ev.braced = true; }
      dmg = Math.round(dmg);
      ev.mult = mult;
      ev.dmg = dmg;
      def.hp = Math.max(0, def.hp - dmg);
      ev.hpAfter = this.hps();

      switch (move.effect) {
        case 'smokescreen': atk.smokescreen = true; break;
        case 'brace': atk.brace = true; break;
        case 'slow': def.slowRounds = 2; break;
        case 'burn': def.burnRounds = 2; break;
        case 'patch': atk.hp = Math.min(atk.maxHp, atk.hp + 5); ev.healed = 5; ev.hpAfter = this.hps(); break;
        case 'stun': def.stun = true; break;
      }
      if (move.effect !== 'none') ev.effect = move.effect;

      if (def.hp <= 0) this.setOver(actor, 'knockout');
      return ev;
    }

    setOver(winner, reason) {
      this.over = true;
      this.winner = winner;
      this.reason = reason;
    }

    simulateRound(moveA, moveB) {
      if (this.over) return [];
      const events = [{ type: 'round', round: this.round }];
      const picks = [moveA, moveB];
      for (const i of [0, 1]) {
        if (!this.availableMoves(i).includes(picks[i])) picks[i] = this.defaultMove(i);
      }
      const s0 = this.effectiveSpeed(0), s1 = this.effectiveSpeed(1);
      const order = s0 === s1 ? (this.rng() < 0.5 ? [0, 1] : [1, 0]) : (s0 > s1 ? [0, 1] : [1, 0]);
      events.push({ type: 'order', order });

      for (const actor of order) {
        if (this.over) break;
        const ev = this.doAttack(actor, picks[actor]);
        events.push(ev);
        if (this.over) events.push({ type: 'ko', fighter: 1 - this.winner, winner: this.winner, hpAfter: this.hps() });
      }

      if (!this.over) {
        for (const i of [0, 1]) {
          const f = this.fighters[i];
          if (f.burnRounds > 0) {
            f.burnRounds--;
            f.hp = Math.max(0, f.hp - 3);
            events.push({ type: 'burn', target: i, dmg: 3, round: this.round, hpAfter: this.hps() });
            if (f.hp <= 0) {
              this.setOver(1 - i, 'burn');
              events.push({ type: 'ko', fighter: i, winner: 1 - i, hpAfter: this.hps() });
            }
          }
          if (f.slowRounds > 0) f.slowRounds--;
        }
      }

      if (!this.over && this.round >= MAX_ROUNDS) {
        const p0 = this.fighters[0].hp / this.fighters[0].maxHp;
        const p1 = this.fighters[1].hp / this.fighters[1].maxHp;
        if (p0 === p1) this.setOver('draw', 'time');
        else this.setOver(p0 > p1 ? 0 : 1, 'time');
        events.push({ type: 'timeup', winner: this.winner, hpAfter: this.hps() });
      }
      if (!this.over) this.round++;
      return events;
    }
  }

  return { Battle, MAX_ROUNDS };
});
