import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { KiteDataProvider } from '../kite/KiteDataProvider.js';
import { redis } from '@/app/lib/redis';

const PAPER_ORDERS_KEY = 'tradingverse:paper_orders';
const MAX_ORDERS = 500;

export class PaperBroker {
  constructor() {
    this.brokerType = 'paper';
  }

  isConnected() {
    return true; // Always connected
  }

  async placeOrder(variety, orderParams) {
    // Fetch LTP for MARKET orders to get fill price
    let fillPrice = 0;

    if (orderParams.order_type === 'MARKET') {
      try {
        const { apiKey, accessToken } = await getKiteCredentials();
        const dp = new KiteDataProvider({ apiKey, accessToken });
        const exch = orderParams.exchange || 'NSE';
        const key = `${exch}:${orderParams.tradingsymbol}`;
        const ltpData = await dp.getLTP(key);
        fillPrice = ltpData?.data?.[key]?.last_price || 0;
      } catch (e) {
        console.error('Paper broker: failed to fetch LTP', e);
        fillPrice = 0;
      }
    } else if (orderParams.price) {
      // For LIMIT orders, use the limit price
      fillPrice = orderParams.price;
    }

    const paperId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const paperOrder = {
      order_id: paperId,
      paper: true,
      brokerType: 'paper',
      ts: Date.now(),
      status: 'COMPLETE',
      tradingsymbol: orderParams.tradingsymbol,
      exchange: orderParams.exchange,
      transaction_type: orderParams.transaction_type,
      order_type: orderParams.order_type,
      variety: orderParams.variety || 'regular',
      product: orderParams.product,
      quantity: orderParams.quantity,
      average_price: fillPrice,
      filled_quantity: orderParams.quantity,
      pending_quantity: 0,
      price: orderParams.price || 0,
      trigger_price: orderParams.trigger_price || 0,
      order_timestamp: new Date().toISOString(),
    };

    // Store in Redis
    await redis.rpush(PAPER_ORDERS_KEY, JSON.stringify(paperOrder));
    await redis.ltrim(PAPER_ORDERS_KEY, -MAX_ORDERS, -1);

    // Return in Kite format
    return { order_id: paperId };
  }

  async cancelOrder(variety, orderId) {
    // Mark as cancelled in Redis
    const orders = await redis.lrange(PAPER_ORDERS_KEY, 0, -1);
    const parsed = orders.map(o => typeof o === 'string' ? JSON.parse(o) : o);
    const idx = parsed.findIndex(o => o.order_id === orderId);
    if (idx >= 0) {
      parsed[idx].status = 'CANCELLED';
      await redis.del(PAPER_ORDERS_KEY);
      for (const o of parsed) {
        await redis.rpush(PAPER_ORDERS_KEY, JSON.stringify(o));
      }
    }
    return { order_id: orderId };
  }

  async modifyOrder(variety, orderId, params) {
    const orders = await redis.lrange(PAPER_ORDERS_KEY, 0, -1);
    const parsed = orders.map(o => typeof o === 'string' ? JSON.parse(o) : o);
    const order = parsed.find(o => o.order_id === orderId);
    if (order) {
      Object.assign(order, params);
      await redis.del(PAPER_ORDERS_KEY);
      for (const o of parsed) {
        await redis.rpush(PAPER_ORDERS_KEY, JSON.stringify(o));
      }
    }
    return { order_id: orderId };
  }

  async getOrders() {
    const raw = await this.getOrdersRaw();
    return raw;
  }

  async getOrdersRaw(limit = 50) {
    const orders = await redis.lrange(PAPER_ORDERS_KEY, 0, -1);
    const parsed = orders.map(o => typeof o === 'string' ? JSON.parse(o) : o).reverse();
    return parsed.slice(0, limit);
  }

  async getTradesRaw(limit = 50) {
    const orders = await redis.lrange(PAPER_ORDERS_KEY, 0, -1);
    const parsed = orders.map(o => typeof o === 'string' ? JSON.parse(o) : o).reverse();
    // In paper mode, all COMPLETE orders act as our executed trades
    const executed = parsed.filter(o => o.status === 'COMPLETE');
    return { status: 'success', data: executed.slice(0, limit) };
  }

  async getPositions() {
    const raw = await this.getPositionsRaw();
    return { net: raw.net || [], day: raw.day || [] };
  }

  async getPositionsRaw() {
    const orders = await redis.lrange(PAPER_ORDERS_KEY, 0, -1);
    const parsed = orders.map(o => typeof o === 'string' ? JSON.parse(o) : o);

    const positions = {};
    for (const order of parsed) {
      if (order.status !== 'COMPLETE') continue;
      const key = order.tradingsymbol;
      if (!positions[key]) {
        positions[key] = {
          tradingsymbol: order.tradingsymbol,
          exchange: order.exchange,
          product: order.product,
          quantity: 0,
          average_price: 0,
          last_price: 0,
        };
      }
      const pos = positions[key];
      if (order.transaction_type === 'BUY') {
        pos.quantity += order.quantity;
        pos.average_price = (pos.average_price * (pos.quantity - order.quantity) + order.average_price * order.quantity) / pos.quantity || order.average_price;
      } else {
        pos.quantity -= order.quantity;
      }
    }

    const filtered = Object.values(positions).filter(p => p.quantity !== 0);
    return { net: filtered, day: filtered };
  }

  async getHoldings() {
    return []; // No holdings in paper trading
  }

  async getLTP(instruments) {
    // Delegate to KiteDataProvider
    const { apiKey, accessToken } = await getKiteCredentials();
    const dp = new KiteDataProvider({ apiKey, accessToken });
    return dp.getLTP(instruments);
  }
}
