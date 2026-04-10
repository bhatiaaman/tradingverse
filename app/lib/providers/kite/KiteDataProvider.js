import { KiteConnect } from 'kiteconnect';

// All Kite market-data operations in one place.
// Routes import getDataProvider() from providers/index.js — never instantiate this directly.

export class KiteDataProvider {
  constructor({ apiKey, accessToken }) {
    this._apiKey       = apiKey;
    this._accessToken  = accessToken;
    if (apiKey && accessToken) {
      this._kite = new KiteConnect({ api_key: apiKey });
      this._kite.setAccessToken(accessToken);
    }
  }

  isConnected() {
    return !!(this._apiKey && this._accessToken);
  }

  // ── SDK wrappers ────────────────────────────────────────────────────────────

  async getOHLC(instrumentKeys) {
    return this._kite.getOHLC(instrumentKeys);
  }

  async getQuote(instrumentKeys) {
    return this._kite.getQuote(instrumentKeys);
  }

  async getInstruments(exchange) {
    return this._kite.getInstruments(exchange);
  }

  // continuous=false is the default Kite SDK default; pass true for continuous contracts
  async getHistoricalData(token, interval, from, to, continuous = false) {
    return this._kite.getHistoricalData(token, interval, from, to, continuous);
  }

  // ── REST wrappers (for routes that call the REST API directly) ──────────────

  // Raw historical endpoint — returns the raw Kite JSON response
  async getHistoricalRaw(token, interval, from, to) {
    const res = await fetch(
      `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${from}&to=${to}`,
      {
        headers: {
          'Authorization': `token ${this._apiKey}:${this._accessToken}`,
          'X-Kite-Version': '3',
        },
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Kite historical error: ${res.status}`);
    }
    return res.json();
  }

  // LTP for one or many instruments — returns raw Kite JSON { data: { 'NSE:SYMBOL': { last_price } } }
  async getLTP(instruments) {
    const arr   = Array.isArray(instruments) ? instruments : [instruments];
    const query = arr.map(i => `i=${encodeURIComponent(i)}`).join('&');
    const res   = await fetch(`https://api.kite.trade/quote/ltp?${query}`, {
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
      },
    });
    if (!res.ok) throw new Error(`Kite LTP error: ${res.status}`);
    return res.json();
  }

  // NFO instruments CSV — used for building lot-size maps
  async getNFOInstrumentsCSV() {
    const res = await fetch('https://api.kite.trade/instruments/NFO', {
      headers: { 'Authorization': `token ${this._apiKey}:${this._accessToken}` },
    });
    if (!res.ok) throw new Error(`NFO instruments error: ${res.status}`);
    return res.text();
  }

  // Raw CSV for any exchange — used by search-instruments, behavioral-agent
  async getInstrumentsCSV(exchange) {
    const res = await fetch(`https://api.kite.trade/instruments/${exchange}`, {
      headers: { 'Authorization': `token ${this._apiKey}:${this._accessToken}` },
    });
    if (!res.ok) throw new Error(`Instruments CSV error for ${exchange}: ${res.status}`);
    return res.text();
  }

  // Escape hatch: returns raw credentials for routes that still build custom REST calls
  getAuth() {
    return { apiKey: this._apiKey, accessToken: this._accessToken };
  }
}
