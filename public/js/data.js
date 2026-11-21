/* Scan Attax — fixed rules data (from "Scan Attax: how fighter stats work").
   UMD: usable in the browser (window.SA_DATA) and in Node (require). */
(function (root, factory) {
  const D = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else root.SA_DATA = D;
})(typeof self !== 'undefined' ? self : this, function () {
  const MATERIALS = ['metal', 'wood', 'ceramic', 'plastic', 'fabric', 'electronic', 'glass', 'paper', 'food', 'other'];
  const PROPERTIES = ['sharp', 'heavy', 'liquid', 'hot', 'electronic', 'glass', 'ceramic', 'metal', 'plastic', 'paper', 'fabric', 'flexible', 'food'];
  const CONDITIONS = ['new', 'used', 'worn', 'damaged'];
  const CONDITION_TAG = { new: 'Mint', used: 'None', worn: 'Battle-worn', damaged: 'Damaged' };
  const CONDITION_MOD = {
    new:     { dur: +1, aura: 0 },
    used:    { dur: 0,  aura: 0 },
    worn:    { dur: -1, aura: +1 },
    damaged: { dur: -2, aura: +1 },
  };
  const RANKS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const RANK_RANGE = { S: [43, 50], A: [37, 42], B: [31, 36], C: [25, 30], D: [19, 24], E: [13, 18], F: [5, 12] };
  const RANK_EXAMPLES = {
    S: 'Fire extinguisher, a car (very rare)', A: 'Toolbox, laptop', B: 'Kettle, umbrella',
    C: 'Mug, stapler', D: 'Phone charger, spoon', E: 'Pen, sock', F: 'Paperclip, tissue',
  };
  // weight upper bounds in grams (exclusive) -> [strength, speed]
  const WEIGHT_BANDS = [
    [10, 1, 10], [100, 2, 8], [500, 4, 6], [2000, 5, 5],
    [10000, 6, 3], [50000, 7, 2], [500000, 8, 1], [Infinity, 10, 1],
  ];
  // longest side upper bounds in cm (exclusive) -> agility
  const SIZE_BANDS = [[5, 9], [15, 7], [30, 5], [100, 3], [Infinity, 1]];
  const MATERIAL_DUR = { metal: 8, wood: 6, ceramic: 6, plastic: 5, fabric: 5, electronic: 4, other: 4, glass: 3, paper: 2, food: 1 };
  // attacker move property -> defender main materials it is strong against (x2)
  const MATCHUP_STRONG = {
    liquid: ['electronic', 'paper'],
    sharp: ['paper', 'fabric', 'plastic'],
    heavy: ['glass', 'ceramic'],
    hot: ['food', 'plastic'],
  };
  // attacker move property -> defender *properties* it is weak against (x0.5)
  const MATCHUP_WEAK = { sharp: ['flexible'] };
  const EFFECTS = {
    none: 'Just a plain hit',
    extra_effective: 'Double damage against one chosen material',
    smokescreen: '+30% dodge chance against the next incoming attack',
    brace: 'The next hit against this fighter does half damage',
    slow: "The opponent's Speed drops by 3 for 2 rounds",
    burn: 'The opponent takes 3 extra damage at the end of each of the next 2 rounds',
    patch: 'This fighter gets back 5 HP',
    stun: "25% chance the opponent misses its next attack",
  };
  const AURA_SCALE = [
    ['1-2', 'Forgettable, nobody would notice it', 'Paperclip, tissue, plain pen'],
    ['3-4', 'Ordinary everyday object', 'Spoon, stapler, phone charger'],
    ['5-6', 'Has some personality, used a lot', 'Favourite mug, umbrella, trainers'],
    ['7-8', 'Loved, personal or eye-catching', 'Teddy bear, gaming console, signed football'],
    ['9-10', 'Iconic or very strange', 'Lava lamp, rubber duck, traffic cone'],
  ];
  const MOVE_NAME_BANK = {
    sharp: ['Jab', 'Pierce', 'Stab', 'Point', 'Rip'],
    heavy: ['Slam', 'Crush', 'Body Drop', 'Hammerfall', 'Anvil'],
    liquid: ['Splash', 'Spill', 'Drench', 'Soak', 'Wave'],
    hot: ['Scorch', 'Sear', 'Blaze', 'Boil', 'Flare'],
    electronic: ['Zap', 'Short Circuit', 'Glitch', 'Overclock', 'Hack'],
    metal: ['Clank', 'Smash', 'Bash', 'Rattle', 'Ring'],
    plastic: ['Slap', 'Bounce', 'Flex', 'Crack', 'Squeak'],
    paper: ['Cut', 'Flutter', 'Paper Storm', 'Fold', 'Scratch'],
    fabric: ['Wrap', 'Tangle', 'Fling', 'Drape', 'Snap'],
    flexible: ['Whip', 'Snap', 'Swing', 'coil', 'Flick'],
    glass: ['Shatter', 'Chime', 'Prism', 'Crack', 'Glare'],
    ceramic: ['Clatter', 'Chip', 'Rattle', 'Clink', 'Crash'],
    food: ['Munch', 'Splat', 'Sauce', 'Bite', 'Crumb'],
    other: ['Poke', 'Toss', 'Whack', 'Bonk', 'Thunk'],
  };
  const SPECIAL_SUFFIX = ['Fury', 'Overdrive', 'Requiem', 'Nova', 'Rampage', 'Finale', 'Annihilation', 'Judgement'];
  const EFFECT_POOL = ['smokescreen', 'brace', 'slow', 'burn', 'patch', 'stun'];
  const SPECIAL_EFFECT_POOL = ['burn', 'stun', 'smokescreen', 'extra_effective'];

  // Preset fighters straight from the PDF example cards.
  const PRESETS = [
    {
      id: 'mug', name: 'Big Mugsy', emoji: '☕',
      facts: { weight: 350, size: 10, material: 'ceramic', properties: ['hot'], condition: 'worn', aura: 6, auraReason: 'Aura 7: chipped rim, clearly a daily companion', rank: 'C' },
      stats: { str: 5, dur: 5, spd: 6, agi: 7, aura: 7 }, hp: 45,
      moves: [
        { name: 'Splash', property: 'liquid', effect: 'none' },
        { name: 'Spill', property: 'liquid', effect: 'slow' },
        { name: 'Scalding Refill', property: 'hot', effect: 'burn' },
      ],
    },
    {
      id: 'laptop', name: 'Laptop', emoji: '💻',
      facts: { weight: 1500, size: 35, material: 'electronic', properties: ['electronic'], condition: 'used', aura: 10, auraReason: 'Aura 10: iconic machine', rank: 'A' },
      stats: { str: 8, dur: 6, spd: 8, agi: 5, aura: 10 }, hp: 50,
      moves: [
        { name: 'Screen Flash', property: 'electronic', effect: 'stun' },
        { name: 'Keyboard Slam', property: 'heavy', effect: 'none' },
        { name: 'Blue Screen', property: 'electronic', effect: 'stun' },
      ],
    },
    {
      id: 'extinguisher', name: 'Fire Extinguisher', emoji: '🧯',
      facts: { weight: 9000, size: 60, material: 'metal', properties: ['heavy'], condition: 'new', aura: 10, auraReason: 'Aura 10: instantly recognisable', rank: 'S' },
      stats: { str: 10, dur: 10, spd: 7, agi: 6, aura: 10 }, hp: 70,
      moves: [
        { name: 'Foam Blast', property: 'liquid', effect: 'smokescreen' },
        { name: 'Hose Whip', property: 'flexible', effect: 'slow' },
        { name: 'MAXIMUM PRESSURE', property: 'heavy', effect: 'stun' },
      ],
    },
    {
      id: 'car', name: 'Car', emoji: '🚗',
      facts: { weight: 1500000, size: 450, material: 'metal', properties: ['heavy'], condition: 'used', aura: 10, auraReason: 'Aura 10: pure icon', rank: 'S' },
      stats: null, hp: null,
      moves: [
        { name: 'Ram', property: 'heavy', effect: 'none' },
        { name: 'Burnout', property: 'heavy', effect: 'smokescreen' },
        { name: 'Full Throttle', property: 'heavy', effect: 'stun' },
      ],
    },
    {
      id: 'paperclip', name: 'Paperclip', emoji: '📎',
      facts: { weight: 1, size: 3, material: 'metal', properties: ['sharp', 'flexible'], condition: 'used', aura: 1, auraReason: 'Aura 1: forgettable', rank: 'F' },
      stats: { str: 1, dur: 3, spd: 4, agi: 3, aura: 1 }, hp: 35,
      moves: [
        { name: 'Jab', property: 'sharp', effect: 'none' },
        { name: 'Lockpick', property: 'metal', effect: 'extra_effective', effectiveVs: 'electronic' },
        { name: 'Unbend', property: 'sharp', effect: 'stun' },
      ],
    },
    {
      id: 'umbrella', name: 'Umbrella', emoji: '☂️',
      facts: { weight: 400, size: 100, material: 'fabric', properties: ['sharp', 'flexible'], condition: 'used', aura: 6, auraReason: 'Aura 6: a personality object', rank: 'B' },
      stats: null, hp: null,
      moves: [
        { name: 'Poke', property: 'sharp', effect: 'none' },
        { name: 'Open Up', property: 'fabric', effect: 'brace' },
        { name: 'Gale Spin', property: 'flexible', effect: 'stun' },
      ],
    },
    {
      id: 'tape', name: 'Roll of Tape', emoji: '🧵',
      facts: { weight: 200, size: 8, material: 'plastic', properties: ['plastic', 'flexible'], condition: 'new', aura: 4, auraReason: 'Aura 4: ordinary desk object', rank: 'D' },
      stats: null, hp: null,
      moves: [
        { name: 'Slap', property: 'plastic', effect: 'none' },
        { name: 'Quick Fix', property: 'plastic', effect: 'patch' },
        { name: 'Wrap Up', property: 'flexible', effect: 'slow' },
      ],
    },
    {
      id: 'kettle', name: 'Kettle', emoji: '🫖',
      facts: { weight: 1200, size: 25, material: 'plastic', properties: ['hot'], condition: 'used', aura: 7, auraReason: 'Aura 7: beloved kitchen veteran', rank: 'B' },
      stats: { str: 7, dur: 6, spd: 6, agi: 5, aura: 7 }, hp: 50,
      moves: [
        { name: 'Steam Jet', property: 'hot', effect: 'burn' },
        { name: 'Lid Rattle', property: 'metal', effect: 'none' },
        { name: 'Rolling Boil', property: 'liquid', effect: 'slow' },
      ],
    },
    {
      id: 'spoon', name: 'Spoon', emoji: '🥄',
      facts: { weight: 40, size: 17, material: 'metal', properties: ['metal'], condition: 'used', aura: 3, auraReason: 'Aura 3: ordinary cutlery', rank: 'D' },
      stats: { str: 2, dur: 7, spd: 7, agi: 5, aura: 3 }, hp: 55,
      moves: [
        { name: 'Poke', property: 'sharp', effect: 'none' },
        { name: 'Clatter', property: 'metal', effect: 'stun' },
        { name: 'Soup Splash', property: 'liquid', effect: 'none' },
      ],
    },
    {
      id: 'sock', name: 'Sock', emoji: '🧦',
      facts: { weight: 30, size: 25, material: 'fabric', properties: ['flexible', 'fabric'], condition: 'worn', aura: 3, auraReason: 'Aura 3: humble, well-used', rank: 'E' },
      stats: { str: 1, dur: 3, spd: 6, agi: 5, aura: 3 }, hp: 35,
      moves: [
        { name: 'Sock Slap', property: 'fabric', effect: 'none' },
        { name: 'Tangle', property: 'flexible', effect: 'slow' },
        { name: 'Stink Bomb', property: 'hot', effect: 'burn' },
      ],
    },
  ];

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  return {
    MATERIALS, PROPERTIES, CONDITIONS, CONDITION_TAG, CONDITION_MOD,
    RANKS, RANK_RANGE, RANK_EXAMPLES, WEIGHT_BANDS, SIZE_BANDS, MATERIAL_DUR,
    MATCHUP_STRONG, MATCHUP_WEAK, EFFECTS, AURA_SCALE,
    MOVE_NAME_BANK, SPECIAL_SUFFIX, EFFECT_POOL, SPECIAL_EFFECT_POOL,
    PRESETS, hashStr, mulberry32, pick,
  };
});
