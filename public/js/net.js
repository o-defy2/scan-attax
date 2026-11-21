/* Scan Attax — multiplayer client. Talks to server.js over WebSocket.
   Rooms use a 5-letter code; the server runs the authoritative battle sim and
   streams round events, which the client plays as the anime episode. */
(function (root) {
  class Net {
    constructor() {
      this.ws = null;
      this.handlers = {};
      this.seq = 0;
      this.pending = {};
    }

    connect(url) {
      return new Promise((resolve, reject) => {
        const wsUrl = url || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => resolve();
        this.ws.onerror = () => reject(new Error('Could not reach the game server. Is `node server.js` running?'));
        this.ws.onclose = () => this._emit('disconnected', {});
        this.ws.onmessage = (e) => {
          let msg;
          try { msg = JSON.parse(e.data); } catch (err) { return; }
          if (msg.id && this.pending[msg.id]) {
            const { resolve: res, reject: rej } = this.pending[msg.id];
            delete this.pending[msg.id];
            if (msg.ok) res(msg); else rej(new Error(msg.error || 'Server error'));
          } else {
            this._emit(msg.t, msg);
          }
        };
      });
    }

    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    _emit(type, msg) { (this.handlers[type] || []).forEach((fn) => fn(msg)); }

    send(msg) {
      return new Promise((resolve, reject) => {
        if (!this.ws || this.ws.readyState !== 1) return reject(new Error('Not connected'));
        const id = ++this.seq;
        this.pending[id] = { resolve, reject };
        this.ws.send(JSON.stringify({ ...msg, id }));
        setTimeout(() => {
          if (this.pending[id]) { delete this.pending[id]; reject(new Error('Timeout')); }
        }, 8000);
      });
    }

    sendEvent(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }

    createRoom() { return this.send({ t: 'create' }); }
    joinRoom(code) { return this.send({ t: 'join', code: code.toUpperCase().trim() }); }
    scan(card) { return this.send({ t: 'scan', card }); }
    ready() { return this.send({ t: 'ready' }); }
    move(idx) { this.sendEvent({ t: 'move', idx }); }
    rematch() { return this.send({ t: 'rematch' }); }
    leave() { this.sendEvent({ t: 'leave' }); if (this.ws) this.ws.close(); }
  }

  root.SA_NET = { Net };
})(typeof self !== 'undefined' ? self : this);
