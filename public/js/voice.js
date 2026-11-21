/* Scan Attax — voice input for picking attacks. Uses the Web Speech API.
   Say the move name ("Splash!"), a number ("one", "two", "three"), or
   "special" / "ultimate" / "finisher". Falls back silently when unsupported. */
(function (root) {
  const SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition;

  const WORD_NUM = {
    one: 0, two: 1, three: 2, first: 0, second: 1, third: 2,
    'move one': 0, 'move two': 1, 'move three': 2, 'attack one': 0, 'attack two': 1, 'attack three': 2,
  };
  const SPECIAL_WORDS = ['special', 'ultimate', 'ult', 'finisher', 'super', 'final', 'ex', 'skill'];
  const GO_WORDS = ['go', 'now', 'attack', 'fight', 'yes', 'do it', 'hit'];

  function matchMove(text, moves) {
    const t = ' ' + text.toLowerCase().trim().replace(/[.!?,]+/g, ' ') + ' ';
    for (let i = 0; i < moves.length; i++) {
      const name = moves[i].name.toLowerCase();
      if (t.includes(' ' + name + ' ') || name.split(' ').every((w) => w.length > 2 && t.includes(w))) {
        return { idx: i, label: moves[i].name };
      }
    }
    if (moves.length > 2 && SPECIAL_WORDS.some((w) => t.includes(w))) return { idx: 2, label: moves[2].name };
    for (const [phrase, idx] of Object.entries(WORD_NUM)) {
      if (t.includes(' ' + phrase + ' ')) return { idx, label: moves[idx] ? moves[idx].name : String(idx + 1) };
    }
    const m = t.match(/\b([123])\b/);
    if (m) return { idx: Number(m[1]) - 1, label: moves[Number(m[1]) - 1] ? moves[Number(m[1]) - 1].name : m[1] };
    return null;
  }

  function isGo(text) {
    const t = text.toLowerCase();
    return GO_WORDS.some((w) => t.includes(w));
  }

  class VoicePicker {
    constructor() {
      this.supported = !!SpeechRecognition;
      this.rec = null;
      this.listening = false;
      this.onTranscript = null; // (text, isFinal)
      this.onMatch = null;      // ({idx,label})
    }

    start(moves) {
      if (!this.supported) return false;
      this.stop();
      this.moves = moves;
      this.rec = new SpeechRecognition();
      this.rec.lang = 'en-US';
      this.rec.continuous = true;
      this.rec.interimResults = true;
      this.rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0].transcript;
          if (this.onTranscript) this.onTranscript(text, res.isFinal);
          if (res.isFinal) {
            const m = matchMove(text, this.moves);
            if (m && m.idx < this.moves.length && this.onMatch) this.onMatch(m);
          }
        }
      };
      this.rec.onerror = () => {};
      this.rec.onend = () => { this.listening = false; };
      try { this.rec.start(); this.listening = true; } catch (e) { return false; }
      return true;
    }

    stop() {
      if (this.rec) { try { this.rec.stop(); } catch (e) {} this.rec = null; }
      this.listening = false;
    }
  }

  root.SA_VOICE = { VoicePicker, matchMove, supported: !!SpeechRecognition };
})(typeof self !== 'undefined' ? self : this);
