/* Scan Attax — turns scanned facts into a fighter card, exactly per the PDF:
   weight -> Strength/Speed, material -> Durability, size -> Agility, properties
   add bonuses, rank caps the total (stats are scaled evenly to fit), condition
   is applied last, HP = 20 + Durability x 5. Also generates the 3 moves. */
(function (root, factory) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.SA_DATA;
  const S = factory(D);
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.SA_STATS = S;
})(typeof self !== 'undefined' ? self : this, function (D) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function bandStats(bands, value) {
    for (const b of bands) if (value < b[0]) return b.slice(1);
    return bands[bands.length - 1].slice(1);
  }

  // Fit stats into the rank's total range: if the raw total is inside the
  // range nothing changes; otherwise every stat is scaled evenly to the
  // nearest bound, then rounding drift is fixed on the biggest stat.
  function fitToRank(stats, rank) {
    const [lo, hi] = D.RANK_RANGE[rank];
    const keys = ['str', 'dur', 'spd', 'agi', 'aura'];
    let total = keys.reduce((s, k) => s + stats[k], 0);
    if (total >= lo && total <= hi) return { stats, total };
    const target = total > hi ? hi : lo;
    const scaled = {};
    for (const k of keys) scaled[k] = clamp(Math.round((stats[k] * target) / total), 1, 10);
    let sum = keys.reduce((s, k) => s + scaled[k], 0);
    let guard = 0;
    while (sum !== target && guard++ < 200) {
      let best = keys[0];
      for (const k of keys) if (Math.abs(scaled[k] - stats[k] * target / total) > Math.abs(scaled[best] - stats[best] * target / total)) best = k;
      if (sum < target && scaled[best] < 10) { scaled[best]++; sum++; }
      else if (sum > target && scaled[best] > 1) { scaled[best]--; sum--; }
      else {
        for (const k of keys) {
          if (sum < target && scaled[k] < 10) { scaled[k]++; sum++; break; }
          if (sum > target && scaled[k] > 1) { scaled[k]--; sum--; break; }
        }
      }
    }
    return { stats: scaled, total: sum };
  }

  function computeCard(name, emoji, facts) {
    const props = facts.properties || [];
    let [str, spd] = bandStats(D.WEIGHT_BANDS, facts.weight);
    let dur = D.MATERIAL_DUR[facts.material] || 4;
    let agi = bandStats(D.SIZE_BANDS, facts.size)[0];
    let aura = clamp(Math.round(facts.aura || 5), 1, 10);
    if (props.includes('sharp')) str += 2;
    if (props.includes('hot')) str += 1;
    if (props.includes('flexible')) agi += 2;
    str = clamp(str, 1, 10); dur = clamp(dur, 1, 10); spd = clamp(spd, 1, 10);
    agi = clamp(agi, 1, 10);

    let { stats, total } = fitToRank({ str, dur, spd, agi, aura }, facts.rank);

    const cond = D.CONDITION_MOD[facts.condition] || D.CONDITION_MOD.used;
    stats.dur = clamp(stats.dur + cond.dur, 1, 10);
    stats.aura = clamp(stats.aura + cond.aura, 1, 10);
    total = stats.str + stats.dur + stats.spd + stats.agi + stats.aura;

    const card = {
      name, emoji: emoji || '📦',
      facts: {
        weight: facts.weight, size: facts.size, material: facts.material,
        properties: props.slice(), condition: facts.condition,
        aura: facts.aura, auraReason: facts.auraReason || '', rank: facts.rank,
      },
      rank: facts.rank,
      stats, total,
      hp: 20 + stats.dur * 5,
      condition: facts.condition,
      tag: D.CONDITION_TAG[facts.condition] || 'None',
      moves: null,
    };
    card.moves = generateMoves(card, facts.moves);
    return card;
  }

  function dominantProperty(card) {
    const p = card.facts.properties;
    for (const key of ['sharp', 'heavy', 'liquid', 'hot', 'electronic', 'metal', 'plastic', 'paper', 'fabric', 'flexible', 'glass', 'ceramic', 'food']) {
      if (p.includes(key)) return key;
    }
    return card.facts.material;
  }

  function generateMoves(card, presetMoves) {
    if (presetMoves && presetMoves.length === 3) return presetMoves.map(m => ({ ...m }));
    const rng = D.mulberry32(D.hashStr(card.name + '|' + card.facts.material + '|' + card.facts.weight));
    const prop1 = dominantProperty(card);
    const prop2 = D.pick(rng, card.facts.properties.length ? card.facts.properties : [card.facts.material]);
    const nameOf = (prop) => D.pick(rng, D.MOVE_NAME_BANK[prop] || D.MOVE_NAME_BANK.other);
    const m1 = { name: nameOf(prop1), property: prop1, effect: 'none' };
    const m2 = { name: nameOf(prop2 === prop1 ? prop1 : prop2), property: prop2, effect: D.pick(rng, D.EFFECT_POOL) };
    if (m2.effect === 'extra_effective') m2.effectiveVs = D.pick(rng, D.MATERIALS);
    const specialProp = prop1;
    const s = {
      name: (card.name.split(' ').pop() + ' ' + D.pick(rng, D.SPECIAL_SUFFIX)).toUpperCase(),
      property: specialProp,
      effect: D.pick(rng, D.SPECIAL_EFFECT_POOL),
    };
    if (s.effect === 'extra_effective') s.effectiveVs = D.pick(rng, D.MATERIALS);
    return [m1, m2, s];
  }

  function presetCard(id) {
    const p = D.PRESETS.find((x) => x.id === id);
    if (!p) return null;
    return computeCard(p.name, p.emoji, { ...p.facts, moves: p.moves });
  }

  return { computeCard, generateMoves, presetCard, fitToRank, bandStats, clamp };
});
