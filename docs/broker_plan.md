# Multi-Broker Support Plan

## Core Architecture Decision

**Data always comes from Kite / the configured data provider.**
Other brokers (Dhan, Upstox, ICICI Direct, Groww) are wired for **order placement only**.

- Option chain, quotes, OHLC, historical candles, instrument lists → always Kite (`getDataProvider()`)
- Place order, cancel order, fetch orders, fetch positions, fetch holdings → active broker (`getBroker()`)

This means:
- `getDataProvider()` always returns `KiteDataProvider` — no switching, no instrument map translation for data
- `getBroker()` returns whichever broker the user has set as active for trading
- A user can be disconnected from Kite for data (market closed, session expired) while still having a non-Kite broker configured for orders — these are independent concerns

---

## Existing Architecture

Provider abstraction layer at `app/lib/providers/`:

```
app/lib/providers/
  index.js                  — getBroker(), getDataProvider(), getProviderStatus()
  kite/
    kite-redis.js           — Redis helpers for Kite credential keys
    KiteBroker.js           — All order/auth operations
    KiteDataProvider.js     — All market data operations (UNCHANGED for multi-broker)
```

All 30 API routes already use `getBroker()` / `getDataProvider()` — no direct KiteConnect imports.

---

## What Changes vs What Stays

| Concern | Change? | Notes |
|---------|---------|-------|
| `getDataProvider()` | **No change** | Always returns `KiteDataProvider` |
| Option chain, OHLC, quotes, historical | **No change** | All routes stay as-is |
| `getBroker()` | **Changes** | Returns active broker from Redis key |
| `placeOrder`, `cancelOrder` | **Changes** | Goes through active broker class |
| `getOrders`, `getPositions`, `getHoldings` | **Changes** | Goes through active broker class |
| Instrument key format | **No translation needed** | Only Kite fetches market data; Kite uses `NSE:SYMBOL` natively |
| Route URLs | **No change** | Frontend unaffected |

---

## Simplified Canonical Interface (Order Broker Only)

Since non-Kite brokers only handle orders, the interface is much smaller:

```js
class {Broker}Broker {
  constructor({ clientId, accessToken })   // or apiKey, depending on broker

  // Order execution
  async placeOrder(variety, orderParams)   // canonical Kite-style params, broker translates internally
  async cancelOrder(variety, orderId)
  async getOrders()                        // returns canonical order array
  async getPositions()                     // returns canonical positions array
  async getHoldings()                      // returns canonical holdings array

  // Auth
  static async getConnectionStatus(...)
  static async saveCredentials(...)
  static async disconnect()
  static async exchangeToken(...)          // only for OAuth brokers
}
```

No `getOHLC()`, `getHistoricalData()`, `getQuote()`, `getInstruments()` — those stay Kite-only.

---

## Canonical Order & Position Shapes

Every broker normalises its responses to these shapes. Routes use these fields and nothing broker-specific.

**Order:**
```js
{
  order_id:          string,
  tradingsymbol:     string,
  exchange:          'NSE' | 'BSE' | 'NFO' | 'MCX',
  transaction_type:  'BUY' | 'SELL',
  quantity:          number,
  filled_quantity:   number,
  pending_quantity:  number,
  price:             number,
  average_price:     number,
  trigger_price:     number | null,
  product:           'CNC' | 'MIS' | 'NRML',
  order_type:        'MARKET' | 'LIMIT' | 'SL' | 'SL-M',
  variety:           'regular' | 'amo' | 'co' | 'iceberg',
  status:            'COMPLETE' | 'OPEN' | 'CANCELLED' | 'REJECTED' | 'PENDING',
  status_message:    string,
  tag:               string,
  placed_at:         string,   // ISO 8601
  exchange_order_id: string | null,
}
```

**Position:**
```js
{
  tradingsymbol:   string,
  exchange:        string,
  product:         'CNC' | 'MIS' | 'NRML',
  quantity:        number,       // net — positive = long, negative = short
  average_price:   number,
  last_price:      number,
  pnl:             number,
  realised_pnl:    number,
  unrealised_pnl:  number,
  buy_quantity:    number,
  sell_quantity:   number,
  buy_price:       number,
  sell_price:      number,
}
```

The `placeOrder(variety, orderParams)` input uses Kite-style param names (since the frontend was built for Kite). Each broker class translates internally.

---

## Redis Key Structure

```
{NS}:broker:active              → "kite" | "dhan" | "upstox" | "icici" | "groww"

# Kite (existing, unchanged)
{NS}:kite:api_key
{NS}:kite:access_token
{NS}:kite:disconnected

# Dhan
{NS}:dhan:client_id
{NS}:dhan:access_token
{NS}:dhan:disconnected

# Upstox
{NS}:upstox:api_key
{NS}:upstox:api_secret
{NS}:upstox:access_token
{NS}:upstox:refresh_token       ← long-lived refresh token
{NS}:upstox:token_expiry        ← unix timestamp, auto-refresh before expiry
{NS}:upstox:disconnected

# ICICI Direct (Breeze)
{NS}:icici:api_key
{NS}:icici:api_secret
{NS}:icici:session_token
{NS}:icici:disconnected

# Groww
{NS}:groww:api_key
{NS}:groww:access_token
{NS}:groww:disconnected
```

---

## Broker Auth Types

| Broker | Auth type | Notes |
|--------|-----------|-------|
| **Kite** | Daily request-token → access-token (existing) | Already working |
| **Dhan** | Paste Client ID + access token from Dhan console | Simplest — no OAuth redirect |
| **Upstox** | OAuth 2.0 with access + refresh tokens | Redirect flow; access token auto-refreshes |
| **ICICI Direct** | Session token via Breeze SDK | Daily re-auth; install `breeze-connect` npm |
| **Groww** | TBD | API least mature — implement last |

---

## Order Param Translation

The frontend sends Kite-style params. Each broker translates internally:

**Dhan:**
- `product='MIS'` → `productType='INTRADAY'`
- `product='CNC'` → `productType='CNC'`
- `product='NRML'` → `productType='MARGIN'`
- `order_type='MARKET'` → `orderType='MARKET'`
- `exchange='NSE'` → `exchangeSegment='NSE_EQ'`
- `exchange='NFO'` → `exchangeSegment='NSE_FNO'`
- Requires `security_id` (numeric) instead of symbol string → fetch from Dhan's scrip master CSV

**Upstox:**
- `product='CNC'` → `product='D'`
- `product='MIS'` → `product='I'`
- `product='NRML'` → `product='M'`
- `variety='regular'` → `order_type='SIMPLE'`
- Requires Upstox instrument key (`NSE_EQ|ISIN`) → fetch from Upstox instrument CSV

**ICICI Breeze:**
- Different SDK method signatures entirely
- Exchange and symbol passed as separate params

---

## File Structure

```
app/lib/providers/
  index.js                           ← MODIFY: getBroker() reads {NS}:broker:active
  credentials.js                     ← NEW: generalised per-broker credential cache

  kite/                              ← UNCHANGED (data provider stays Kite-only)
    kite-redis.js
    KiteBroker.js
    KiteDataProvider.js

  dhan/
    dhan-redis.js                    ← new
    DhanBroker.js                    ← new (orders only)

  upstox/
    upstox-redis.js                  ← new
    UpstoxBroker.js                  ← new (orders only)

  icici/
    icici-redis.js                   ← new
    IciciBroker.js                   ← new (orders only)

  groww/
    groww-redis.js                   ← new
    GrowwBroker.js                   ← new (orders only)

app/api/
  provider-status/route.js           ← new: active broker + all connection statuses
  provider-switch/route.js           ← new: POST to switch active broker
  dhan-config/route.js               ← new: GET/POST credentials
  upstox-config/route.js             ← new: GET/POST + auth code exchange
  upstox-callback/route.js           ← new: OAuth redirect landing
  icici-config/route.js              ← new
  groww-config/route.js              ← new

app/settings/
  page.js                            ← MODIFY: dynamic broker cards from provider-status
  kite/page.js                       ← minor updates
  dhan/page.js                       ← new: paste Client ID + token, test connection
  upstox/page.js                     ← new: OAuth flow (Login with Upstox button)
  icici/page.js                      ← new: Breeze session setup
  groww/page.js                      ← new
```

---

## Implementation Phases

### Phase 0 — Foundation (prerequisite, nothing breaks)

1. `app/lib/providers/credentials.js` — generic per-broker credential cache with 30s TTL per broker, 10s for active-broker key. Exports: `getActiveBroker()`, `getCredentials(id)`, `setActiveBroker(id)`, `invalidateCredentials(id?)`
2. Update `providers/index.js` — `getBroker()` reads `{NS}:broker:active`, switches on broker ID. Still only returns Kite (nothing else implemented yet). `getDataProvider()` always returns `KiteDataProvider` — no switch needed.
3. Normalise `kite-orders/route.js` + `kite-positions/route.js` — remove raw Kite envelope assumptions (`data.status !== 'success'`, `data.data || []`). `KiteBroker.getOrders()` / `getPositions()` return canonical arrays directly.
4. `/api/provider-status` route — returns `{ active, brokers: { kite: { connected, configured }, dhan: {...}, ... } }`
5. `/api/provider-switch` route — POST `{ broker: 'dhan' }`, writes to Redis, invalidates cache
6. Update `settings/page.js` — dynamic grid from provider-status API, "Set as Active" button per card

### Phase 1 — Dhan (first non-Kite broker)

Validates the full pattern. Simplest auth (no OAuth redirect).

1. `dhan-redis.js`
2. `DhanBroker.js` — wraps Dhan Order API v2. Fetches scrip master CSV on first call to resolve `tradingsymbol → security_id`. Translates canonical order params → Dhan format. Normalises Dhan responses → canonical shapes.
3. `dhan-config/route.js` + `settings/dhan/page.js` — enter Client ID + access token, test connection

### Phase 2 — Upstox

Validates OAuth 2.0 callback flow + auto token refresh.

1. `upstox-redis.js`
2. `UpstoxBroker.js` — on construct, if `token_expiry` within 15 min, auto-refresh using `refresh_token`. Translates canonical order params → Upstox format. Resolves `NSE:SYMBOL → NSE_EQ|ISIN` from instrument CSV.
3. `upstox-config/route.js` (GET status, POST save API key, POST exchange auth code for tokens)
4. `upstox-callback/route.js` (OAuth redirect landing, exchanges code, stores tokens)
5. `settings/upstox/page.js` — step 1: save API key; step 2: "Login with Upstox" redirect; returns to page with token stored

### Phase 3 — ICICI Direct (Breeze)

1. `npm install breeze-connect`
2. `IciciBroker.js` — wraps BreezeConnect session auth, translates order params
3. `icici-config/route.js` + `settings/icici/page.js`

### Phase 4 — Groww

Implement last. Evaluate API documentation quality before starting.

---

## Settings Hub UI Layout

```
Active Broker
┌─────────────────────────────────────────────────────────────┐
│  Zerodha Kite (data + orders)         ● Connected           │
│  All market data is always from Kite   [Manage →]           │
└─────────────────────────────────────────────────────────────┘

Order Broker  (select one for order placement)
┌──────────────────────┐  ┌──────────────────────┐
│  Zerodha Kite        │  │  ✓ Dhan               │
│  ● Connected         │  │  ● Connected  [Active] │
│  [Manage →]          │  │  [Manage →]            │
└──────────────────────┘  └──────────────────────┘
┌──────────────────────┐  ┌──────────────────────┐
│  Upstox              │  │  ICICI Direct         │
│  ○ Not configured    │  │  ○ Not configured     │
│  [Set up →]          │  │  [Set up →]           │
└──────────────────────┘  └──────────────────────┘
```

---

## Risk Areas

- **Dhan security_id lookup** — Dhan requires a numeric security_id per instrument. The scrip master CSV must be fetched and cached. F&O contracts (options with expiry + strike in the symbol) must map correctly — not just equity symbols.
- **Upstox instrument key** — `NSE_EQ|ISIN` format. Monthly/weekly NFO contracts need to be in the instrument map.
- **ICICI Breeze session** — daily re-auth required; the session expires and must be renewed each morning before trading.
- **Groww API maturity** — API documentation is limited. Verify F&O order support before committing.
- **Token expiry banner** — if the order broker's token expires mid-session, orders will silently fail. A connection status indicator in the terminal header should show the order broker state and prompt re-auth.
