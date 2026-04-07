# Tradingverse WebSocket Architecture Plan

This document outlines the limitations of Serverless hosting and the required architecture for scaling Tradingverse into a true WebSocket-driven live-tick platform.

## The Vercel Limitation Check

By default, Tradingverse is hosted natively on Vercel utilizing Next.js API Routes (Serverless Functions via AWS Lambda). **Natively supporting true WebSockets directly on Vercel Free Tier is functionally impossible due to two major architectural constraints:**

1. **Ephemeral Execution Constraints:** Vercel functions are strictly stateless. When a UI element invokes an API, the server spins up, responds, and terminates (capped at a hard 10-second ceiling on the Free Tier). WebSockets require a persistant TCP connection that stays open uninterrupted for 6+ hours during the trading day.
2. **Kite Connection Limits:** The Zerodha Kite API permits a maximum of **3 active WebSocket `KiteTicker` instances** globally per API token. If Vercel attempted to spin up a WebSocket instance inside a Serverless function for multiple users (or just multiple browser tabs), the ephemeral engines would instantly shatter the 3-connection limit and trigger an automated API Ban.

## Proposed Strategy: Split Daemon Architecture

To achieve sub-millisecond, massive-scale live tick streaming without HTTP polling lag while avoiding Vercel API limits, Tradingverse must transition to a Split Architecture.

### Step 1: Retain Next.js on Vercel
99% of the platform architecture remains completely unchanged. Complex server logic, OAuth Auth, UI components, static charting, and MongoDB/Redis CRUD endpoints will persist on Vercel securely.

### Step 2: Implement a Persistent Micro-Daemon
We deploy a heavily isolated, extremely lightweight Node.js daemon instance securely on a persistent free-tier platform (such as **Render.com**, **Fly.io**, or **Railway**).

**The Daemon's Lifecycle:**
1. At 9:15 AM, the Daemon assumes exactly **1 `KiteTicker` connection** securely utilizing the primary API token.
2. It holds this master connection securely in memory to ensure you never breach the 3-connection limit.
3. As the ~10,000 requests-per-second flood the Daemon from the NSE, it consumes and normalizes the payload.
4. It hosts its own independent WebSocket Server (`ws://`) that specifically rebroadcasts the sanitized ticks.
5. All Tradingverse dashboard instances and React Web UI hooks subscribe strictly to the Daemon's `ws://` broadcast rather than connecting to Kite directly.

## Conclusion
Until strict high-frequency algorithmic streaming is required, **HTTP Polling strictly guarded by Upstash Redis Caching** (our current implementation) provides the most elegant, highly integrated, and cheapest mechanism for streaming NIFTY options within the constraints of Vercel's standard tier. 
