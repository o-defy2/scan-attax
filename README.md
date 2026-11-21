# ⚔️ Scan Attax — Object Battle Arena

Scan any object → get a fighter card → battle 1v1 → the whole fight plays out as an
**anime episode**, with **voice-picked attacks** and **special-move cutscenes**.

The rules are implemented exactly from the design doc *"Scan Attax: how fighter stats
work"* (see `public/js/data.js`, `stats.js`, `battle.js`):

- **5 stats (1–10):** Strength (damage, from weight + sharp/hot), Durability
  (HP = 20 + Dur × 5, from material + condition), Speed (who goes first, from weight),
  Agility (dodge = Agility × 4%, cap 40%, from size + flexible), Aura (crit = Aura × 3%,
  ×1.5 damage, scored by the scanner).
- **Ranks S–F** set the total stat points (S 43–50 … F 5–12); stats are scaled evenly
  to fit. Condition is applied last (New/Mint +1 DUR, Worn −1 DUR +1 Aura, Damaged
  −2 DUR +1 Aura).
- **Moves:** 3 per fighter — Move 1 on odd rounds, Move 2 on even, the **special once
  per battle (round 3), double damage**. Damage = Strength + d6, ×2/×0.5 by matchup
  (liquid>electronic/paper, sharp>paper/fabric/plastic, heavy>glass/ceramic,
  hot>food/plastic, sharp halved vs flexible), ×1.5 on crit. Effects: smokescreen,
  brace, slow, burn, patch up, stun, extra effective.
- **Battle:** faster Speed attacks first each round; KO or 10 rounds (higher HP% wins).

## Run it

```bash
cd scan-attax
npm install
npm start
# open http://localhost:8080
```

Solo mode also works offline by just opening `public/index.html` in a browser.

## Play with a friend (1v1 rooms)

1. One of you runs `npm start` (on your machine, or on any host with Node).
2. Open the site → **Multiplayer 1v1** → **Create room** → share the **5-letter code**.
3. Your friend opens the same site address → **Multiplayer 1v1** → types the code → **Join**.
4. Both scan a fighter (preset or custom), press **Ready!** → the server runs the
   authoritative battle and both players watch the same animated episode.

If you host it somewhere with a public address, friends anywhere can join with the code.

## 🎙️ Voice attacks

During each round the pick bar listens: press **🎙️ Voice: ON** and say the move name
("Splash!"), a number ("one", "two", "three"), or "special" / "ultimate". Chrome/Edge
support the Web Speech API; elsewhere, tap the move buttons (keys work too).

## 🎬 Anime episode mode

Battles render on a canvas as an episode: VS intro, "ROUND n — FIGHT!" banners, attack
lunges, dodges, critical hits, damage numbers, dialogue bubbles, screen shake — and when
a fighter uses their **special**, a full-screen cutscene: letterbox bars, speed lines,
zoom on the attacker, the move's title card, white flash, and a huge impact.

## Project layout

```
server.js            Node server: static hosting + WebSocket rooms (authoritative sim)
public/index.html    screens: home / scan / lobby / battle / help
public/js/data.js    fixed rules tables + preset fighters (shared browser/Node)
public/js/stats.js   facts → card (stats, rank fit, HP, moves)
public/js/battle.js  round-by-round battle engine (shared browser/Node)
public/js/episode.js canvas anime-episode renderer
public/js/voice.js   Web Speech API attack picker
public/js/net.js     WebSocket client
public/js/app.js     UI flow
```

Note: the "AI scan" is a demo scanner (no vision model is bundled) — presets match the
doc's example cards exactly, and custom scans report facts via the form, which the
code then turns into stats using the fixed rules.
