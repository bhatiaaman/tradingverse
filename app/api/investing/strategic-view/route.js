import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/app/lib/prompts/strategic-view'
import { requireSession, unauthorized } from '@/app/lib/session'
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const redis  = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
const NS     = process.env.REDIS_NAMESPACE || 'tradingverse'
const CACHE_TTL      = 6 * 3600
const FREE_DAILY_LIMIT = 3

// Yahoo Finance ticker map for known assets
const YAHOO_SYMBOLS = {
  'nifty 50':  '^NSEI',
  'nifty50':   '^NSEI',
  's&p 500':   '^GSPC',
  'sp500':     '^GSPC',
  'nasdaq':    '^IXIC',
  'crude oil': 'CL=F',
  'crudeoil':  'CL=F',
  'bitcoin':   'BTC-USD',
  'btc':       'BTC-USD',
  'us dollar': 'DX-Y.NYB',
  'usd':       'DX-Y.NYB',
  'gold':      'GC=F',
}

function fmtPrice(price, symbol) {
  if (price == null) return null
  // Indian indices — no currency symbol needed, use comma notation
  if (symbol === '^NSEI') return price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  // Crypto & commodities — USD
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  return `$${price.toFixed(2)}`
}

async function fetchMarketContext(asset) {
  const sym = YAHOO_SYMBOLS[asset.toLowerCase().trim()]
  if (!sym) return null

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const meta   = data?.chart?.result?.[0]?.meta
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0]
    const closes = quotes?.close?.filter(Boolean) || []

    if (!meta?.regularMarketPrice) return null

    const price     = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose || meta.previousClose
    const change    = prevClose ? ((price - prevClose) / prevClose) * 100 : null
    const weekFirst = closes[0]
    const weekChange = weekFirst ? ((price - weekFirst) / weekFirst) * 100 : null

    return {
      date:           new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      price,
      priceFormatted: fmtPrice(price, sym),
      change,
      weekChange,
      yearHigh:           meta.fiftyTwoWeekHigh ?? null,
      yearLow:            meta.fiftyTwoWeekLow  ?? null,
      yearHighFormatted:  fmtPrice(meta.fiftyTwoWeekHigh, sym),
      yearLowFormatted:   fmtPrice(meta.fiftyTwoWeekLow,  sym),
    }
  } catch {
    return null
  }
}

function cacheKey(asset) {
  return `${NS}:strategic-view:${asset.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
}

export async function POST(req) {
  const session = await requireSession()
  if (!session) return unauthorized()

  const rl = await checkLimit(intelligenceLimiter, req)
  if (rl.limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (session.role !== 'admin') {
    const today    = new Date().toISOString().slice(0, 10)
    const usageKey = `${NS}:usage:strategic-view:${session.email}:${today}`
    const used     = await redis.incr(usageKey)
    if (used === 1) await redis.expire(usageKey, 86400)
    if (used > FREE_DAILY_LIMIT) {
      return NextResponse.json({ error: 'Daily limit reached', limitReached: true, limit: FREE_DAILY_LIMIT }, { status: 429 })
    }
  }

  const { asset, refresh = false } = await req.json()
  if (!asset?.trim()) return NextResponse.json({ error: 'Asset required' }, { status: 400 })

  const key = cacheKey(asset)

  // Cached response — always fetch fresh market context so price is current even on cache hits
  if (!refresh) {
    const cached = await redis.get(key)
    if (cached) {
      const content = typeof cached === 'string' ? cached : JSON.stringify(cached)
      return NextResponse.json({ content, cached: true })
    }
  }

  // Fetch live market data in parallel with starting stream setup
  const marketContext = await fetchMarketContext(asset)

  // Stream fresh analysis from Claude with live market context injected
  const encoder   = new TextEncoder()
  let accumulated = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = client.messages.stream({
          model:      'claude-sonnet-4-6',
          max_tokens: 4096,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildUserPrompt(asset, marketContext) }],
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            accumulated += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        if (accumulated) {
          await redis.set(key, accumulated, { ex: CACHE_TTL })
        }
        controller.close()
      } catch (err) {
        console.error('[strategic-view] stream error:', err.message)
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
      'Cache-Control':     'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
