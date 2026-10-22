// WebSocket client with auto-reconnect. Talks to the matchmaking server.

export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.name = null;
    this.handlers = {};
    this.connected = false;
    this.retries = 0;
    this.closedByUs = false;
    this.queue = [];
  }

  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
    return this;
  }

  emit(type, msg) {
    for (const fn of this.handlers[type] || []) fn(msg);
    for (const fn of this.handlers['*'] || []) fn(type, msg);
  }

  connect() {
    this.closedByUs = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.retries = 0;
      this.emit('open', {});
      this.send({ t: 'hello', name: this.name });
      for (const m of this.queue) this.ws.send(m);
      this.queue.length = 0;
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg && msg.t) {
        if (msg.t === 'welcome') {
          this.id = msg.id;
          this.name = msg.name;
        }
        this.emit(msg.t, msg);
      }
    };

    this.ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      if (was) this.emit('close', {});
      if (!this.closedByUs) this.scheduleReconnect();
    };

    this.ws.onerror = () => {};
  }

  scheduleReconnect() {
    if (this.closedByUs) return;
    this.retries++;
    const delay = Math.min(1000 * Math.pow(1.6, Math.min(this.retries, 6)), 12000);
    clearTimeout(this._re);
    this._re = setTimeout(() => this.connect(), delay);
  }

  send(msg) {
    const raw = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(raw);
    } else {
      this.queue.push(raw);
      if (this.queue.length > 40) this.queue.shift();
    }
  }

  setName(name) {
    this.name = name;
    if (this.connected) this.send({ t: 'hello', name });
  }
}
