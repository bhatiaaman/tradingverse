import { KiteConnect } from 'kiteconnect';
import crypto from 'crypto';
import { kiteRedisGet, kiteRedisSet, kiteRedisDel } from './kite-redis.js';

// All Kite order-execution and auth operations in one place.
// Routes import getBroker() from providers/index.js — never instantiate this directly.

export class KiteBroker {
  constructor({ apiKey, accessToken }) {
    this._apiKey      = apiKey;
    this._accessToken = accessToken;
    this._kite = new KiteConnect({ api_key: apiKey });
    this._kite.setAccessToken(accessToken);
  }

  isConnected() {
    return !!(this._apiKey && this._accessToken);
  }

  // ── Order execution ─────────────────────────────────────────────────────────

  async placeOrder(variety, orderParams) {
    return this._kite.placeOrder(variety, orderParams);
  }

  async cancelOrder(variety, orderId) {
    return this._kite.cancelOrder(variety, orderId);
  }

  async modifyOrder(variety, orderId, params) {
    return this._kite.modifyOrder(variety, orderId, params);
  }

  async getOrders() {
    return this._kite.getOrders();
  }

  async getPositions() {
    return this._kite.getPositions();
  }

  async getHoldings() {
    return this._kite.getHoldings();
  }

  // Raw REST — returns the sliced orders array directly
  async getOrdersRaw(limit = 50) {
    const res = await fetch('https://api.kite.trade/orders', {
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kite orders error: ${err}`);
    }
    const data = await res.json();
    return (data.data || []).slice(0, limit);
  }

  // Raw REST positions — returns the full Kite JSON response
  async getPositionsRaw() {
    const res = await fetch('https://api.kite.trade/portfolio/positions', {
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kite positions error: ${err}`);
    }
    return res.json();
  }

  // Raw REST trades — returns today's executed trades
  async getTradesRaw() {
    const res = await fetch('https://api.kite.trade/trades', {
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kite trades error: ${err}`);
    }
    return res.json();
  }

  // LTP (same helper as DataProvider — kept here so broker routes don't need the data provider)
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

  // ── Margin estimation ───────────────────────────────────────────────────────
  // Wrapper over Kite margins endpoint for orders.
  // https://kite.trade/docs/connect/v3/margins/#order-margins
  async getOrderMargins(orders) {
    const payload = Array.isArray(orders) ? orders : [orders];
    const res = await fetch('https://api.kite.trade/margins/orders', {
      method: 'POST',
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kite margin error: ${err}`);
    }
    return res.json();
  }

  // ── Charges Estimation ──────────────────────────────────────────────────────
  // Uses the Kite Margins API with virtual COMPLETED orders to get precise charges breakdown.
  // https://kite.trade/docs/connect/v3/margins/#order-margins
  async getOrderCharges(orders) {
    const payload = Array.isArray(orders) ? orders : [orders];
    // Map kite orders to the minimal format expected by margins API
    const mapped = payload.map(o => ({
      exchange:         o.exchange,
      tradingsymbol:    o.tradingsymbol,
      transaction_type: o.transaction_type,
      variety:          o.variety || 'regular',
      product:          o.product,
      order_type:       o.order_type || 'MARKET',
      quantity:         o.quantity,
      price:            parseFloat(o.average_price || o.price || 0),
      trigger_price:    parseFloat(o.trigger_price || 0),
    }));

    const res = await fetch('https://api.kite.trade/margins/orders', {
      method: 'POST',
      headers: {
        'Authorization': `token ${this._apiKey}:${this._accessToken}`,
        'X-Kite-Version': '3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mapped),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kite charges error: ${err}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  // ── Static auth helpers (no live token needed) ───────────────────────────────

  static async getConnectionStatus(apiKey, accessToken) {
    if (!apiKey || !accessToken) return false;
    try {
      const res = await fetch('https://api.kite.trade/user/profile', {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${apiKey}:${accessToken}`,
        },
      });
      return res.ok;
    } catch { return false; }
  }

  static async saveApiKey(apiKey) {
    if (apiKey === '') return kiteRedisDel('api_key');
    return kiteRedisSet('api_key', apiKey);
  }

  static async saveAccessToken(token) {
    if (token === '') {
      await kiteRedisSet('access_token', '');
      await kiteRedisDel('token_refreshed_at');
      return kiteRedisSet('disconnected', '1');
    }
    await kiteRedisSet('access_token', token);
    await kiteRedisSet('token_refreshed_at', new Date().toISOString()); // track freshness
    return kiteRedisDel('disconnected');
  }

  static async disconnect() {
    return kiteRedisSet('disconnected', '1');
  }

  // SHA256(api_key + request_token + api_secret) → POST /session/token
  static async exchangeRequestToken({ requestToken, apiKey, apiSecret }) {
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + requestToken + apiSecret)
      .digest('hex');

    const res = await fetch('https://api.kite.trade/session/token', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
    });
    return res.json();
  }
}
