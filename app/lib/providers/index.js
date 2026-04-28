// Provider factory — the only import routes need.
//
// Usage:
//   import { getDataProvider } from '@/app/lib/providers'
//   const dp = await getDataProvider()
//   const data = await dp.getOHLC([...])
//
// Active broker is stored in Redis (tradingverse:active_broker).
// Data source is always Kite (paper trading shares the same market data).

import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { KiteBroker }         from './kite/KiteBroker.js';
import { KiteDataProvider }   from './kite/KiteDataProvider.js';
import { PaperBroker }        from './paper/PaperBroker.js';
import { redis }              from '@/app/lib/redis';
import { sql }                from '@/app/lib/db';
import { kiteRedisGet }       from './kite/kite-redis.js';

async function getActiveBroker() {
  try {
    const active = await redis.get('tradingverse:active_broker');
    if (active) return active;
    // Redis evicted — fall back to DB and repopulate Redis
    const rows = await sql`SELECT value FROM system_config WHERE key = 'active_broker'`;
    const broker = rows[0]?.value?.broker ?? 'kite';
    await redis.set('tradingverse:active_broker', broker);
    return broker;
  } catch {
    return 'kite';
  }
}

export async function getBroker() {
  const active = await getActiveBroker();
  if (active === 'paper') {
    return new PaperBroker();
  }
  const { apiKey, accessToken } = await getKiteCredentials();
  return new KiteBroker({ apiKey, accessToken });
}

export async function getDataProvider() {
  // Data source is always Kite (even for paper trading)
  const { apiKey, accessToken } = await getKiteCredentials();
  return new KiteDataProvider({ apiKey, accessToken });
}

export async function getProviderStatus() {
  const active = await getActiveBroker();
  const tokenRefreshedAt = await kiteRedisGet('token_refreshed_at').catch(() => null);

  if (active === 'paper') {
    return {
      broker:           'paper',
      brokerLabel:      'Paper Trading',
      dataSource:       'kite',
      connected:        true,
      tokenRefreshedAt: tokenRefreshedAt || null,
    };
  }

  const { apiKey, accessToken } = await getKiteCredentials();
  const connected = await KiteBroker.getConnectionStatus(apiKey, accessToken);
  return {
    broker:           'kite',
    brokerLabel:      'Zerodha Kite',
    dataSource:       'kite',
    connected,
    tokenRefreshedAt: tokenRefreshedAt || null,
  };
}
