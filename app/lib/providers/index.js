// Provider factory — the only import routes need.
//
// Usage:
//   import { getDataProvider } from '@/app/lib/providers'
//   const dp = await getDataProvider()
//   const data = await dp.getOHLC([...])
//
// A fresh instance is created per call but kite-credentials.js has a 30s
// module-level cache, so repeated calls within the same warm Lambda are fast.

import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { KiteBroker }         from './kite/KiteBroker.js';
import { KiteDataProvider }   from './kite/KiteDataProvider.js';

export async function getBroker() {
  const { apiKey, accessToken } = await getKiteCredentials();
  return new KiteBroker({ apiKey, accessToken });
}

export async function getDataProvider() {
  const { apiKey, accessToken } = await getKiteCredentials();
  return new KiteDataProvider({ apiKey, accessToken });
}

export async function getProviderStatus() {
  const { apiKey, accessToken } = await getKiteCredentials();
  const connected = await KiteBroker.getConnectionStatus(apiKey, accessToken);
  return {
    broker:      'kite',
    brokerLabel: 'Zerodha Kite',
    dataSource:  'kite',
    connected,
  };
}
