'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtL(oi) {
  if (oi == null || oi === 0) return '—'
  const v = oi / 100000
  return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'L'
}

function fmtDeltaL(delta) {
  if (delta == null) return null
  const v = delta / 100000
  const sign = delta > 0 ? '+' : ''
  return sign + (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'L'
}

function fmtNum(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN')
}

// ── Data age hook — updates every 30s ─────────────────────────────────────────
function useDataAge(timestamp) {
  const [ageS, setAgeS] = useState(0)
  useEffect(() => {
    if (!timestamp) return
    const compute = () => setAgeS(Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
    compute()
    const iv = setInterval(compute, 30_000)
    return () => clearInterval(iv)
  }, [timestamp])
  return ageS
}

function ageLabel(s) {
  if (s < 60)  return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

// ── PCR mini sparkline — last 5 readings as coloured dots ────────────────────
function PCRSparkline({ history }) {
  if (!history?.length) return null
  const pts = history.slice(-6)
  return (
    <div className="flex items-center gap-[3px] ml-1">
      {pts.map((p, i) => (
        <div
          key={i}
          title={`PCR ${p.v}`}
          className={`rounded-full transition-all ${
            p.v > 1.2 ? 'bg-emerald-400' :
            p.v < 0.8 ? 'bg-rose-400'    : 'bg-amber-400'
          }`}
          style={{ width: 5, height: i === pts.length - 1 ? 7 : 5 }}
        />
      ))}
    </div>
  )
}

// ── PCR trend arrow ──────────────────────────────────────────────────────────
function PCRTrend({ history }) {
  if (!history || history.length < 2) return null
  const delta = history[history.length - 1].v - history[0].v
  if (Math.abs(delta) < 0.03) return <Minus size={10} className="text-slate-500" />
  return delta > 0
    ? <TrendingUp  size={10} className="text-emerald-400" title={`PCR rising +${delta.toFixed(2)}`} />
    : <TrendingDown size={10} className="text-rose-400"   title={`PCR falling ${delta.toFixed(2)}`} />
}

// ── Market activity badge ─────────────────────────────────────────────────────
function ActivityBadge({ activity, strength }) {
  if (!activity || activity === 'Unknown') return null
  const isBull = ['Long Buildup', 'Short Covering', 'Long Buildup & Short Covering'].some(a => activity.startsWith(a))
  const isBear = ['Short Buildup', 'Long Unwinding', 'Short Buildup & Long Unwinding'].some(a => activity.startsWith(a))
  const cls    = isBull
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
    : isBear
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
    : 'bg-slate-700/40 text-slate-400 border-slate-600/25'
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${cls}`}>
      {activity.split(' (')[0]}
      {strength > 0 && <span className="opacity-60">{strength}/10</span>}
    </span>
  )
}

// ── Commentary ────────────────────────────────────────────────────────────────
function getCommentary(chainData, scData) {
  if (!chainData) return []
  const lines = []
  const spot = parseFloat(chainData.spotPrice) || 0
  const { pcr, marketActivity, optionChain, atmStrike, maxPain, actionableInsights } = chainData

  // Prefer synthesised actionable insights if available
  if (actionableInsights?.length) {
    for (const ins of actionableInsights) {
      const isBull = ins.emoji === '🚀' || ins.emoji === '🐂' || ins.emoji === '🛡️' || ins.emoji === '⬆️'
      const isBear = ins.emoji === '📉' || ins.emoji === '🐻' || ins.emoji === '🚧' || ins.emoji === '⬇️'
      lines.push({
        key: ins.type,
        icon: ins.emoji,
        color: isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-slate-300',
        text: ins.message,
      })
    }
    // Always append Futures OI commentary if available
    const futOI = scData?.signals?.futuresOI
    if (futOI?.detail && !futOI.detail.includes('No OI') && !futOI.detail.includes('Insufficient')) {
      lines.push({ key: 'futoi', icon: futOI.hit ? '⚡' : '◈',
        color: futOI.hit ? 'text-emerald-400' : 'text-slate-400',
        text: futOI.hit
          ? `Futures OI falling while spot rises — ${futOI.detail}. Trapped shorts exiting; CE buyers have structural tailwind.`
          : `Futures OI: ${futOI.detail}. No short-covering divergence yet.` })
    }
    return lines
  }

  // Fallback: legacy commentary
  if (marketActivity?.activity) {
    const isBull  = ['Long Buildup', 'Short Covering'].includes(marketActivity.activity)
    const isBear  = ['Short Buildup', 'Long Unwinding'].includes(marketActivity.activity)
    const color   = isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-slate-300'
    const str     = marketActivity.strength
    const sNote   = str >= 7 ? 'Strong' : str >= 4 ? 'Moderate' : str > 0 ? 'Weak' : ''
    if (['Pre-Market', 'Market Closed'].includes(marketActivity.activity)) {
      lines.push({ key: 'act', icon: marketActivity.emoji || '🔔', color: 'text-slate-400',
        text: marketActivity.activity === 'Pre-Market'
          ? 'Pre-market — last session OI loaded. Watch GIFT Nifty for gap direction at 9:15 AM.'
          : 'Session ended — OI reflects final closing positions. Review before tomorrow.' })
    } else {
      const desc = marketActivity.description ? ` — ${marketActivity.description}` : ''
      const act  = marketActivity.actionable  ? ` ${marketActivity.actionable}.` : ''
      lines.push({ key: 'act', icon: marketActivity.emoji || '📊', color,
        text: `${sNote ? sNote + ' ' : ''}${marketActivity.activity}${desc}.${act}` })
    }
  }

  const futOI = scData?.signals?.futuresOI
  if (futOI?.detail && !futOI.detail.includes('No OI') && !futOI.detail.includes('Insufficient')) {
    lines.push({ key: 'futoi', icon: futOI.hit ? '⚡' : '◈',
      color: futOI.hit ? 'text-emerald-400' : 'text-slate-400',
      text: futOI.hit
        ? `Futures OI falling while spot rises — ${futOI.detail}. Trapped shorts exiting; CE buyers have structural tailwind.`
        : `Futures OI: ${futOI.detail}. No short-covering divergence yet.` })
  }

  if (pcr != null) {
    let text = '', color = ''
    if      (pcr > 1.5) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — extreme put loading. Strong floor below spot.` }
    else if (pcr > 1.2) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — put writers in control. Dips near support likely to hold.` }
    else if (pcr > 0.9) { color = 'text-slate-300';   text = `PCR ${pcr.toFixed(2)} — balanced. No directional OI edge; range-bound action likely.` }
    else if (pcr > 0.7) { color = 'text-amber-400';   text = `PCR ${pcr.toFixed(2)} — call-skewed. Call writers capping rallies.` }
    else                { color = 'text-rose-400';    text = `PCR ${pcr.toFixed(2)} — heavy call writing. Bears positioning hard; need strong catalyst.` }
    lines.push({ key: 'pcr', icon: '⊗', color, text })
  }

  if (optionChain?.length && atmStrike && spot > 0) {
    const atmCE  = optionChain.find(o => o.strike === atmStrike && o.type === 'CE')
    const atmPE  = optionChain.find(o => o.strike === atmStrike && o.type === 'PE')
    const strad  = (atmCE?.ltp || 0) + (atmPE?.ltp || 0)
    if (strad > 0) {
      const upper   = atmStrike + strad
      const lower   = atmStrike - strad
      const nearBE  = spot > atmStrike ? upper : lower
      const ptsAway = Math.abs(nearBE - spot)
      const imminent = ptsAway < strad * 0.35
      lines.push({ key: 'straddle', icon: '⇔',
        color: imminent ? 'text-amber-400' : 'text-slate-400',
        text: `ATM straddle ₹${strad.toFixed(0)} — breakeven ${Math.round(lower)}–${Math.round(upper)}. Spot ${ptsAway.toFixed(0)}pts from ${spot > atmStrike ? 'upper' : 'lower'} BE.${imminent ? ' Breach imminent — gamma accelerating.' : ''}` })
    }
  }

  if (maxPain && spot > 0) {
    const diff = spot - maxPain
    if (Math.abs(diff) > 50) {
      const dir  = diff > 0 ? 'above' : 'below'
      const pull = diff > 0 ? 'Downward' : 'Upward'
      const pct  = (Math.abs(diff) / maxPain * 100).toFixed(1)
      lines.push({ key: 'mp', icon: '🎯', color: 'text-slate-400',
        text: `Spot ${pct}% ${dir} max pain ₹${maxPain} — ${pull} pull as expiry nears.` })
    }
  }

  return lines
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OptionsAnalysisPanel({
  chainData, scData = null, scLastUpdated = null, loading,
  underlying, expiry, onRefresh, onUnderlyingChange, onExpiryChange,
}) {
  const dataAge   = useDataAge(chainData?.timestamp)
  const isStale   = dataAge > 120 && !loading  // >2 min during potential market hours
  const pcrHist   = chainData?.pcrHistory || []
  const pcrTrend  = pcrHist.length >= 2
    ? pcrHist[pcrHist.length - 1].v - pcrHist[0].v
    : 0

  const spot      = parseFloat(chainData?.spotPrice || 0)
  const atm       = chainData?.atmStrike
  const chain     = chainData?.optionChain || []
  const activity  = chainData?.marketActivity
  const futuresOI = chainData?.futuresOI

  // ATM straddle + breakeven
  const atmCE   = chain.find(o => o.strike === atm && o.type === 'CE')
  const atmPE   = chain.find(o => o.strike === atm && o.type === 'PE')
  const strad   = (atmCE?.ltp || 0) + (atmPE?.ltp || 0)
  const beUpper = strad > 0 ? Math.round(atm + strad) : null
  const beLower = strad > 0 ? Math.round(atm - strad) : null

  // Strike gap
  const gap = (underlying === 'BANKNIFTY' || underlying === 'SENSEX') ? 100
             : underlying === 'MIDCPNIFTY' ? 25 : 50

  // Build ±5 strike rows (was ±4)
  const rows = []
  if (atm && chain.length) {
    for (let i = 5; i >= -5; i--) {
      const strike = atm + i * gap
      const ce = chain.find(o => o.strike === strike && o.type === 'CE')
      const pe = chain.find(o => o.strike === strike && o.type === 'PE')
      rows.push({
        strike,
        cOI: ce?.oi || 0,       pOI: pe?.oi || 0,
        cVol: ce?.volume || 0,  pVol: pe?.volume || 0,
        cDelta: ce?.oiChange,   pDelta: pe?.oiChange,
        isATM: i === 0,
        isBeUpper: beUpper === strike,
        isBeLower: beLower === strike,
      })
    }
  }

  // Scale for bars — 90th-percentile cap
  const allOIs  = rows.flatMap(r => [r.cOI, r.pOI]).filter(v => v > 0).sort((a, b) => a - b)
  const p90OI   = allOIs[Math.floor(allOIs.length * 0.9)] || 1
  const allVols = rows.flatMap(r => [r.cVol, r.pVol]).filter(v => v > 0).sort((a, b) => a - b)
  const p90Vol  = allVols[Math.floor(allVols.length * 0.9)] || 1
  const oiPct   = v => Math.min(100, Math.round((v / p90OI) * 100))
  const volPct  = v => Math.min(100, Math.round((v / p90Vol) * 100))

  // S/R from chainData
  const support    = chainData?.support
  const resistance = chainData?.resistance

  const commentary = getCommentary(chainData, scData)
  const updatedAt  = chainData?.timestamp
    ? new Date(chainData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  return (
    <div className="bg-[#0e1521] border border-slate-700/30 rounded-xl overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-700/20 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-[3px] h-5 bg-indigo-500 rounded-full flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-200">Options Analysis</span>
          {activity?.activity && activity.activity !== 'Unknown' && (
            <ActivityBadge activity={activity.activity} strength={activity.strength} />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 hover:bg-slate-700/40 rounded-lg transition-colors disabled:opacity-40"
            title="Force refresh OI data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {/* Underlying selector */}
          <div className="flex bg-[#131d2e] rounded-lg p-0.5 border border-slate-700/30">
            {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map(u => (
              <button
                key={u}
                onClick={() => onUnderlyingChange(u)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded-md transition-colors ${
                  underlying === u ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                {u === 'BANKNIFTY' ? 'BNF' : u === 'FINNIFTY' ? 'FIN' : u === 'MIDCPNIFTY' ? 'MID' : u}
              </button>
            ))}
          </div>
          {/* Expiry selector */}
          <div className="flex bg-[#131d2e] rounded-lg p-0.5 border border-slate-700/30">
            {['weekly', 'monthly'].map(e => {
              const disabled = underlying === 'BANKNIFTY' && e === 'weekly'
              return (
                <button
                  key={e}
                  onClick={() => !disabled && onExpiryChange(e)}
                  disabled={disabled}
                  className={`px-2.5 py-0.5 text-[10px] font-mono rounded-md transition-colors ${
                    expiry === e ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-200'
                  } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {e === 'weekly' ? 'Wkly' : 'Mthly'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Staleness banner ─────────────────────────────────────────────────── */}
      {isStale && (
        <div className="px-4 py-1.5 bg-amber-950/30 border-b border-amber-800/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-400">
            <AlertTriangle size={10} />
            <span>Data {ageLabel(dataAge)} old — OI may have shifted</span>
          </div>
          <button
            onClick={onRefresh}
            className="text-[10px] font-mono text-indigo-400 hover:text-indigo-200 transition-colors"
          >
            Refresh →
          </button>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-10 text-center text-slate-500 text-sm">Loading options data…</div>
      ) : chainData?.error ? (
        <div className="px-4 py-6 text-center text-rose-400 text-sm">{chainData.error}</div>
      ) : (
        <div>

          {/* ── Stat cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-px bg-slate-700/20 border-b border-slate-700/20">

            {/* Spot */}
            <div className="bg-[#0e1521] px-3 py-2.5">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">Spot / ATM</div>
              <div className="text-sm font-bold font-mono tabular-nums text-slate-100">
                {fmtNum(parseFloat(spot).toFixed(0))}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">ATM {fmtNum(atm)}</div>
            </div>

            {/* PCR + trend */}
            <div className="bg-[#0e1521] px-3 py-2.5">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">PCR</div>
              {chainData?.totalCallOI === 0 || chainData?.totalPutOI === 0 ? (
                <>
                  <div className="text-sm font-bold font-mono text-slate-600">N/A</div>
                  <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                    {chainData?.offMarketHours ? 'Market Closed' : 'OI Unavailable'}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold font-mono tabular-nums ${
                      chainData?.pcr > 1.2 ? 'text-emerald-400' :
                      chainData?.pcr < 0.8 ? 'text-rose-400' : 'text-amber-400'
                    }`}>{chainData?.pcr?.toFixed(2) || '—'}</span>
                    <PCRTrend history={pcrHist} />
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-mono text-slate-500">
                      {chainData?.pcr > 1.2 ? 'Bullish' : chainData?.pcr < 0.8 ? 'Bearish' : 'Neutral'}
                    </span>
                    <PCRSparkline history={pcrHist} />
                  </div>
                </>
              )}
            </div>

            {/* Max Pain */}
            <div className="bg-[#0e1521] px-3 py-2.5">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">Max Pain</div>
              <div className="text-sm font-bold font-mono tabular-nums text-amber-400">
                {fmtNum(chainData?.maxPain) || '—'}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                {chainData?.maxPain && spot
                  ? `${spot > chainData.maxPain ? '+' : ''}${(spot - chainData.maxPain).toFixed(0)}pts from spot`
                  : '—'}
              </div>
            </div>

            {/* Expiry */}
            <div className="bg-[#0e1521] px-3 py-2.5">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">Expiry / DTE</div>
              <div className="text-sm font-bold font-mono text-slate-100">
                {chainData?.expiry
                  ? new Date(chainData.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                  : '—'}
              </div>
              {chainData?.expiry && (() => {
                const dte = Math.ceil((new Date(chainData.expiry) - new Date()) / 86400000)
                return (
                  <div className={`text-[10px] font-mono mt-0.5 ${dte <= 1 ? 'text-rose-400' : dte <= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {dte}d left{dte <= 1 ? ' · 0DTE' : ''} · {chainData?.expiryType || ''}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── ATM Premiums + Straddle ──────────────────────────────────────── */}
          {atm && (atmCE || atmPE) && (
            <div className="grid grid-cols-3 gap-px bg-slate-700/20 border-b border-slate-700/20">
              <div className="bg-[#0e1521] px-3 py-2.5">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">{atm} CE · ATM Call</div>
                <div className="text-base font-bold font-mono tabular-nums text-rose-400">
                  ₹{atmCE?.ltp?.toFixed(2) || '—'}
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">Premium</div>
              </div>
              <div className="bg-[#0e1521] px-3 py-2.5">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">{atm} PE · ATM Put</div>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-400">
                  ₹{atmPE?.ltp?.toFixed(2) || '—'}
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">Premium</div>
              </div>
              <div className="bg-[#0e1521] px-3 py-2.5">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] mb-1">Straddle</div>
                <div className="text-base font-bold font-mono tabular-nums text-amber-400">
                  ₹{strad > 0 ? strad.toFixed(2) : '—'}
                </div>
                {beUpper && (
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                    BE {fmtNum(beLower)}–{fmtNum(beUpper)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Futures OI strip ─────────────────────────────────────────────── */}
          {(activity?.activity || futuresOI || scData?.signals?.futuresOI?.detail) && (
            <div className="px-4 py-2 border-b border-slate-700/20 flex items-center gap-3 flex-wrap">
              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.12em] shrink-0">Futures OI</span>
              {activity?.activity && activity.activity !== 'Pre-Market' && activity.activity !== 'Market Closed' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-300">{activity.emoji}</span>
                  <span className={`text-[10px] font-mono font-semibold ${
                    ['Long Buildup','Short Covering'].some(a => activity.activity.startsWith(a))
                      ? 'text-emerald-400'
                      : ['Short Buildup','Long Unwinding'].some(a => activity.activity.startsWith(a))
                      ? 'text-rose-400' : 'text-slate-400'
                  }`}>{activity.activity.split(' (')[0]}</span>
                  {activity.strength > 0 && (
                    <div className="flex items-center gap-px">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i}
                          className={`h-2 w-1 rounded-sm ${i < Math.round(activity.strength / 2) ? 'bg-indigo-500' : 'bg-slate-800'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {futuresOI != null && (
                <span className="text-[10px] font-mono text-slate-500">
                  Fut OI <span className="text-slate-300 tabular-nums">{fmtL(futuresOI)}</span>
                </span>
              )}
              {(() => {
                const f = scData?.signals?.futuresOI
                if (!f?.detail || f.detail.includes('No OI') || f.detail.includes('Insufficient')) return null
                return (
                  <span className={`text-[10px] font-mono ${f.hit ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {f.hit ? '⚡ SC signal' : `· ${f.detail.split('.')[0]}`}
                  </span>
                )
              })()}
            </div>
          )}

          {/* ── OI Chain ─────────────────────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="px-3 py-3 border-b border-slate-700/20">
              {/* Column header */}
              <div className="flex items-center mb-2 text-[9px] font-mono uppercase tracking-[0.12em]">
                <div className="flex-1 text-left text-emerald-600">← Put OI</div>
                <div className="w-20 text-center text-slate-600">Strike</div>
                <div className="flex-1 text-right text-rose-600">Call OI →</div>
              </div>

              <div className="space-y-0.5">
                {rows.map(({ strike, cOI, pOI, cVol, pVol, cDelta, pDelta, isATM, isBeUpper, isBeLower }) => {
                  const isS1 = strike === support
                  const isR1 = strike === resistance

                  return (
                    <div key={strike}>
                      {/* Breakeven upper marker */}
                      {isBeUpper && (
                        <div className="flex items-center gap-1 py-0.5">
                          <div className="flex-1 border-t border-dashed border-amber-600/30" />
                          <span className="text-[8px] font-mono text-amber-600/70 shrink-0">BE↑ {fmtNum(beUpper)}</span>
                          <div className="flex-1 border-t border-dashed border-amber-600/30" />
                        </div>
                      )}

                      <div className={`flex items-center gap-1 px-1 rounded-sm ${isATM ? 'bg-indigo-500/8 ring-1 ring-indigo-500/15' : ''}`}>

                        {/* PUT side */}
                        <div className="flex-1 flex justify-end items-center gap-1.5">
                          {/* ΔOI + OI labels */}
                          <div className="text-right shrink-0">
                            <div className="text-[9px] font-mono tabular-nums text-slate-400 leading-tight">
                              {fmtL(pOI)}
                            </div>
                            {pDelta != null && pDelta !== 0 && (
                              <div className={`text-[8px] font-mono tabular-nums leading-tight ${
                                pDelta > 0 ? 'text-emerald-500' : 'text-rose-500'
                              }`}>
                                {fmtDeltaL(pDelta)}
                              </div>
                            )}
                          </div>
                          {/* OI bar + Volume bar */}
                          <div className="w-20 space-y-0.5">
                            <div className="h-2.5 flex justify-end rounded-sm overflow-hidden bg-slate-800/50">
                              <div
                                className={`h-full ${isS1 ? 'bg-emerald-400/90' : 'bg-emerald-500/45'} rounded-l-sm`}
                                style={{ width: `${oiPct(pOI)}%` }}
                              />
                            </div>
                            <div className="h-[3px] flex justify-end rounded-sm overflow-hidden bg-slate-800/30">
                              <div className="h-full bg-indigo-500/35 rounded-l-sm" style={{ width: `${volPct(pVol)}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Strike label */}
                        <div className="w-20 shrink-0 text-center py-0.5">
                          <div className={`text-[10px] font-mono tabular-nums leading-tight ${
                            isATM ? 'text-indigo-300 font-bold' :
                            isS1  ? 'text-emerald-400' :
                            isR1  ? 'text-rose-400' : 'text-slate-400'
                          }`}>
                            {fmtNum(strike)}
                          </div>
                          <div className="text-[7px] font-mono leading-tight">
                            {isATM && <span className="text-indigo-500">ATM</span>}
                            {isS1 && !isATM && <span className="text-emerald-600">S1</span>}
                            {isR1 && !isATM && <span className="text-rose-600">R1</span>}
                          </div>
                        </div>

                        {/* CALL side */}
                        <div className="flex-1 flex items-center gap-1.5">
                          {/* OI bar + Volume bar */}
                          <div className="w-20 space-y-0.5">
                            <div className="h-2.5 rounded-sm overflow-hidden bg-slate-800/50">
                              <div
                                className={`h-full ${isR1 ? 'bg-rose-400/90' : 'bg-rose-500/45'} rounded-r-sm`}
                                style={{ width: `${oiPct(cOI)}%` }}
                              />
                            </div>
                            <div className="h-[3px] rounded-sm overflow-hidden bg-slate-800/30">
                              <div className="h-full bg-indigo-500/35 rounded-r-sm" style={{ width: `${volPct(cVol)}%` }} />
                            </div>
                          </div>
                          {/* ΔOI + OI labels */}
                          <div className="text-left shrink-0">
                            <div className="text-[9px] font-mono tabular-nums text-slate-400 leading-tight">
                              {fmtL(cOI)}
                            </div>
                            {cDelta != null && cDelta !== 0 && (
                              <div className={`text-[8px] font-mono tabular-nums leading-tight ${
                                cDelta > 0 ? 'text-rose-500' : 'text-emerald-500'
                              }`}>
                                {fmtDeltaL(cDelta)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Breakeven lower marker */}
                      {isBeLower && (
                        <div className="flex items-center gap-1 py-0.5">
                          <div className="flex-1 border-t border-dashed border-amber-600/30" />
                          <span className="text-[8px] font-mono text-amber-600/70 shrink-0">BE↓ {fmtNum(beLower)}</span>
                          <div className="flex-1 border-t border-dashed border-amber-600/30" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ΔOI legend */}
              <div className="mt-2 flex items-center gap-3 text-[8px] font-mono text-slate-700">
                <span>PUT ΔOI: <span className="text-emerald-700">+buildup</span> <span className="text-rose-700">-unwind</span></span>
                <span>CALL ΔOI: <span className="text-rose-700">+buildup</span> <span className="text-emerald-700">-unwind</span></span>
                <span className="text-indigo-700">▒ vol</span>
              </div>
            </div>
          )}

          {/* ── S/R levels ───────────────────────────────────────────────────── */}
          {(chainData?.support || chainData?.resistance) && (
            <div className="px-4 py-2 border-b border-slate-700/20 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
              <div className="flex justify-between">
                <span className="text-rose-400 font-semibold">R1 {fmtNum(chainData?.resistance)}</span>
                <span className="text-slate-600">{fmtL(chainData?.resistanceOI)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400 font-semibold">S1 {fmtNum(chainData?.support)}</span>
                <span className="text-slate-600">{fmtL(chainData?.supportOI)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-rose-500/70">R2 {fmtNum(chainData?.resistance2)}</span>
                <span className="text-slate-700">{fmtL(chainData?.resistance2OI)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-500/70">S2 {fmtNum(chainData?.support2)}</span>
                <span className="text-slate-700">{fmtL(chainData?.support2OI)}</span>
              </div>
            </div>
          )}

          {/* ── Commentary ───────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-slate-700/20 space-y-2">
            {commentary.length === 0
              ? <p className="text-xs text-slate-600">Analyzing market activity…</p>
              : commentary.map(l => (
                <p key={l.key} className="text-[11px] leading-relaxed">
                  <span className="mr-1.5 text-slate-500">{l.icon}</span>
                  <span className={l.color}>{l.text}</span>
                </p>
              ))
            }
          </div>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div className="px-4 py-2 flex items-center justify-between flex-wrap gap-y-1 text-[9px] font-mono text-slate-600">
            <div className="flex gap-3">
              <span>CE <span className="text-rose-500/70 tabular-nums">{fmtL(chainData?.totalCallOI)}</span></span>
              <span>PE <span className="text-emerald-500/70 tabular-nums">{fmtL(chainData?.totalPutOI)}</span></span>
              {chainData?.totalCallOI && chainData?.totalPutOI && (
                <span>PCR <span className="text-slate-400 tabular-nums">{chainData?.pcr?.toFixed(2)}</span></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isStale && <span className="text-amber-600">⚠ {ageLabel(dataAge)} old</span>}
              {!isStale && updatedAt && (
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-600 animate-pulse inline-block" />
                  {updatedAt}
                  {dataAge > 30 && <span className="text-slate-700">· {ageLabel(dataAge)} ago</span>}
                </span>
              )}
              {scLastUpdated && <span className="text-indigo-700">SC active</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
