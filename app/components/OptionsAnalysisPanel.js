'use client'

import { RefreshCw } from 'lucide-react'

// ── Commentary logic ──────────────────────────────────────────────────────────
// scData is optional — only eye page passes it (futures OI signal from /api/short-covering)
function getOptionsAnalysisCommentary(chainData, scData) {
  if (!chainData) return [];
  const lines = [];
  const spot = parseFloat(chainData.spotPrice) || 0;
  const { pcr, marketActivity, optionChain, atmStrike, maxPain } = chainData;

  // 1. Market activity — richer narrative
  if (marketActivity?.activity) {
    const isBull = ['Long Buildup', 'Short Covering'].includes(marketActivity.activity);
    const isBear = ['Short Buildup', 'Long Unwinding'].includes(marketActivity.activity);
    const color  = isBull ? 'text-emerald-400' : isBear ? 'text-red-400' : 'text-slate-300';
    const str    = marketActivity.strength;
    const sNote  = str >= 7 ? 'Strong' : str >= 4 ? 'Moderate' : str > 0 ? 'Weak' : '';
    if (['Pre-Market', 'Market Closed'].includes(marketActivity.activity)) {
      lines.push({ key: 'act', icon: marketActivity.emoji || '🔔', color: 'text-slate-400',
        text: marketActivity.activity === 'Pre-Market'
          ? `Pre-market — last session OI loaded. Watch GIFT Nifty for gap direction at 9:15 AM.`
          : `Session ended — OI reflects final closing positions. Review before tomorrow.` });
    } else {
      const desc = marketActivity.description ? ` — ${marketActivity.description}` : '';
      const act  = marketActivity.actionable  ? ` ${marketActivity.actionable}.`  : '';
      lines.push({ key: 'act', icon: marketActivity.emoji || '📊', color,
        text: `${sNote ? sNote + ' ' : ''}${marketActivity.activity}${desc}.${act}` });
    }
  }

  // 2. Futures OI (only when scData is provided — eye page)
  const futOI = scData?.signals?.futuresOI;
  if (futOI?.detail && !futOI.detail.includes('No OI') && !futOI.detail.includes('Insufficient')) {
    lines.push({ key: 'futoi', icon: futOI.hit ? '⚡' : '◈', color: futOI.hit ? 'text-emerald-400' : 'text-slate-400',
      text: futOI.hit
        ? `Futures OI falling while spot rises — ${futOI.detail}. Trapped shorts are exiting; CE buyers have structural tailwind.`
        : `Futures OI: ${futOI.detail}. No short-covering divergence yet.` });
  }

  // 3. PCR — 5-band interpretation
  if (pcr != null) {
    let text = '', color = '';
    if      (pcr > 1.5) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — extreme put loading. Put sellers defending aggressively; strong floor below spot.`; }
    else if (pcr > 1.2) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — put writers in control. Bullish tilt; dips near support likely to find buyers.`; }
    else if (pcr > 0.9) { color = 'text-slate-300';   text = `PCR ${pcr.toFixed(2)} — balanced. No strong directional OI edge; range-bound action likely.`; }
    else if (pcr > 0.7) { color = 'text-amber-400';   text = `PCR ${pcr.toFixed(2)} — call-skewed. Call writers building resistance cap; rallies tend to stall.`; }
    else                { color = 'text-rose-400';    text = `PCR ${pcr.toFixed(2)} — heavy call writing. Bears positioning hard; CE buyers need a strong catalyst.`; }
    lines.push({ key: 'pcr', icon: '⊗', color, text });
  }

  // 4. ATM straddle + breakeven distance
  if (optionChain?.length && atmStrike && spot > 0) {
    const atmCE  = optionChain.find(o => o.strike === atmStrike && o.type === 'CE');
    const atmPE  = optionChain.find(o => o.strike === atmStrike && o.type === 'PE');
    const strad  = (atmCE?.ltp || 0) + (atmPE?.ltp || 0);
    if (strad > 0) {
      const upper    = atmStrike + strad;
      const lower    = atmStrike - strad;
      const nearBE   = spot > atmStrike ? upper : lower;
      const ptsAway  = Math.abs(nearBE - spot);
      const imminent = ptsAway < strad * 0.35;
      const side     = spot > atmStrike ? 'upper' : 'lower';
      lines.push({ key: 'straddle', icon: '⇔', color: imminent ? 'text-amber-400' : 'text-slate-400',
        text: `ATM straddle ₹${strad.toFixed(0)} — breakeven range ${lower.toFixed(0)}–${upper.toFixed(0)}. Spot ${ptsAway.toFixed(0)}pts from ${side} BE.${imminent ? ' Breach imminent — gamma accelerating.' : ''}` });
    }
  }

  // 5. Max pain gravity
  if (maxPain && spot > 0) {
    const diff    = spot - maxPain;
    const absDiff = Math.abs(diff);
    if (absDiff > 50) {
      const dir  = diff > 0 ? 'above' : 'below';
      const pull = diff > 0 ? 'Downward' : 'Upward';
      const pct  = (absDiff / maxPain * 100).toFixed(1);
      lines.push({ key: 'mp', icon: '🎯', color: 'text-slate-400',
        text: `Spot ${pct}% ${dir} max pain ₹${maxPain} — ${pull} pull expected as expiry nears.` });
    }
  }

  return lines;
}

// ── Component ─────────────────────────────────────────────────────────────────
// Props:
//   chainData       — optionChainData from /api/option-chain
//   scData          — from /api/short-covering (pass null on trades page)
//   loading         — optionLoading boolean
//   underlying      — 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY' | 'SENSEX'
//   expiry          — 'weekly' | 'monthly'
//   onRefresh       — () => void — force refresh callback
//   onUnderlyingChange — (u: string) => void
//   onExpiryChange  — (e: string) => void
export default function OptionsAnalysisPanel({
  chainData, scData = null, scLastUpdated = null, loading, underlying, expiry,
  onRefresh, onUnderlyingChange, onExpiryChange,
}) {
  return (
    <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-blue-300 flex items-center gap-2 flex-wrap">
          <span className="w-1 h-5 bg-blue-500 rounded flex-shrink-0" />
          Options Analysis
          {chainData?.marketActivity?.activity && chainData.marketActivity.activity !== 'Unknown' && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
              ['Long Buildup', 'Short Covering'].includes(chainData.marketActivity.activity)
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : ['Short Buildup', 'Long Unwinding'].includes(chainData.marketActivity.activity)
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : chainData.marketActivity.activity === 'Consolidation'
                ? 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
            }`}>
              {chainData.marketActivity.emoji} {chainData.marketActivity.activity}
            </span>
          )}
        </h2>
        <div className="flex gap-2 items-center">
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Force refresh OI data"
            className="p-1.5 hover:bg-blue-800/40 rounded transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex bg-[#0a1628] rounded-lg p-0.5">
            {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map((u) => (
              <button
                key={u}
                onClick={() => onUnderlyingChange(u)}
                className={`px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors ${underlying === u ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {u === 'BANKNIFTY' ? 'BankNifty' : u === 'FINNIFTY' ? 'FinNifty' : u === 'MIDCPNIFTY' ? 'Midcap' : u === 'SENSEX' ? 'Sensex' : 'Nifty'}
              </button>
            ))}
          </div>
          <div className="flex bg-[#0a1628] rounded-lg p-0.5">
            {['weekly', 'monthly'].map((e) => {
              const isDisabled = underlying === 'BANKNIFTY' && e === 'weekly';
              return (
                <button
                  key={e}
                  onClick={() => !isDisabled && onExpiryChange(e)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${expiry === e ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={isDisabled}
                >
                  {e === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-slate-400 text-center py-8">Loading options data...</div>
      ) : chainData?.error ? (
        <div className="text-red-400 text-center py-4">{chainData.error}</div>
      ) : (
        <div className="space-y-4">
          {/* Key stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-[#0a1628] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Spot / ATM</div>
              <div className="text-lg font-mono text-slate-200 mt-1">{parseFloat(chainData?.spotPrice || 0).toLocaleString()}</div>
              <div className="text-xs text-slate-400">ATM: {chainData?.atmStrike?.toLocaleString()}</div>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">PCR</div>
              {(chainData && (chainData.totalCallOI === 0 || chainData.totalPutOI === 0)) ? (
                <>
                  <div className="text-lg font-mono mt-1 text-slate-500">N/A</div>
                  <div className="text-xs text-slate-500">
                    {chainData.offMarketHours ? 'Market Closed' : 'OI Unavailable — retrying'}
                  </div>
                </>
              ) : (
                <>
                  <div className={`text-lg font-mono mt-1 ${chainData?.pcr > 1.2 ? 'text-green-400' : chainData?.pcr < 0.8 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {chainData?.pcr?.toFixed(2) || '—'}
                  </div>
                  <div className="text-xs text-slate-400">{chainData?.pcr > 1.2 ? 'Bullish' : chainData?.pcr < 0.8 ? 'Bearish' : 'Neutral'}</div>
                </>
              )}
            </div>
            <div className="bg-[#0a1628] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Max Pain</div>
              <div className="text-lg font-mono text-orange-400 mt-1">{chainData?.maxPain?.toLocaleString() || '—'}</div>
              <div className="text-xs text-slate-400">
                {chainData?.maxPain && chainData?.spotPrice
                  ? `${((chainData.maxPain - parseFloat(chainData.spotPrice)) / parseFloat(chainData.spotPrice) * 100).toFixed(1)}% from spot`
                  : '—'}
              </div>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry / DTE</div>
              <div className="text-lg font-mono text-slate-200 mt-1">
                {chainData?.expiry ? new Date(chainData.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
              </div>
              <div className="text-xs text-slate-400">
                {chainData?.expiry
                  ? (() => { const d = Math.ceil((new Date(chainData.expiry) - new Date()) / 86400000); return `${d}d left · ${chainData?.expiryType || ''}`; })()
                  : '—'}
              </div>
            </div>
          </div>

          {/* ATM Premiums + Straddle */}
          {chainData?.atmStrike && chainData?.optionChain?.length > 0 && (() => {
            const atm   = chainData.atmStrike;
            const atmCE = chainData.optionChain.find(o => o.strike === atm && o.type === 'CE');
            const atmPE = chainData.optionChain.find(o => o.strike === atm && o.type === 'PE');
            if (!atmCE && !atmPE) return null;
            const straddle = (atmCE?.ltp || 0) + (atmPE?.ltp || 0);
            return (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border-l-2 border-red-500/40">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{atm} CE (ATM Call)</div>
                  <div className="text-lg font-mono text-red-400 mt-1">₹{atmCE?.ltp?.toFixed(2) || '—'}</div>
                  <div className="text-xs text-slate-500">Premium</div>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border-l-2 border-green-500/40">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{atm} PE (ATM Put)</div>
                  <div className="text-lg font-mono text-green-400 mt-1">₹{atmPE?.ltp?.toFixed(2) || '—'}</div>
                  <div className="text-xs text-slate-500">Premium</div>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Straddle Value</div>
                  <div className="text-lg font-mono text-amber-400 mt-1">₹{straddle.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">Expected move ±</div>
                </div>
              </div>
            );
          })()}

          {/* OI Distribution — mini bar chart per strike */}
          {(() => {
            const chain = chainData?.optionChain;
            if (!chain?.length) return null;
            const atm = chainData.atmStrike;
            const gap = (underlying === 'BANKNIFTY' || underlying === 'SENSEX') ? 100 : underlying === 'MIDCPNIFTY' ? 25 : 50;
            const rows = [];
            for (let i = 4; i >= -4; i--) {
              const strike = atm + i * gap;
              const ce = chain.find(o => o.strike === strike && o.type === 'CE');
              const pe = chain.find(o => o.strike === strike && o.type === 'PE');
              rows.push({ strike, cOI: ce?.oi || 0, pOI: pe?.oi || 0, isATM: i === 0 });
            }
            const allOIs = rows.flatMap(r => [r.cOI, r.pOI]).filter(v => v > 0).sort((a, b) => a - b);
            const p90  = allOIs[Math.floor(allOIs.length * 0.9)] || 1;
            const pct  = v => Math.min(100, Math.round((v / p90) * 100));
            return (
              <div className="bg-[#0a1628] rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                  <span className="text-green-400">← Put OI</span>
                  <span>Strike</span>
                  <span className="text-red-400">Call OI →</span>
                </div>
                <div className="space-y-px">
                  {rows.map(({ strike, cOI, pOI, isATM }) => {
                    const putPct  = pct(pOI);
                    const callPct = pct(cOI);
                    const isS1 = strike === chainData?.support;
                    const isR1 = strike === chainData?.resistance;
                    return (
                      <div key={strike} className={`flex items-center gap-1 h-6 px-1 rounded ${isATM ? 'bg-blue-500/10 ring-1 ring-blue-500/20' : ''}`}>
                        <div className="flex-1 flex justify-end items-center gap-1.5">
                          <span className="text-[9px] text-slate-600 font-mono w-8 text-right tabular-nums">{pOI > 0 ? (pOI/100000).toFixed(1)+'L' : ''}</span>
                          <div className="w-20 h-3 flex justify-end rounded-sm overflow-hidden">
                            <div className={`h-full rounded-l ${isS1 ? 'bg-green-400/70' : 'bg-green-500/35'}`} style={{ width: `${putPct}%` }} />
                          </div>
                        </div>
                        <div className="w-16 flex-shrink-0 text-center">
                          <span className={`text-xs font-mono ${isATM ? 'text-blue-300 font-bold' : isS1 ? 'text-green-400' : isR1 ? 'text-red-400' : 'text-slate-400'}`}>
                            {strike.toLocaleString()}
                          </span>
                          {isATM && <span className="text-[8px] text-blue-500 ml-0.5">ATM</span>}
                          {isS1 && !isATM && <span className="text-[8px] text-green-500 ml-0.5">S1</span>}
                          {isR1 && !isATM && <span className="text-[8px] text-red-500 ml-0.5">R1</span>}
                        </div>
                        <div className="flex-1 flex items-center gap-1.5">
                          <div className="w-20 h-3 rounded-sm overflow-hidden">
                            <div className={`h-full rounded-r ${isR1 ? 'bg-red-400/70' : 'bg-red-500/35'}`} style={{ width: `${callPct}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-600 font-mono w-8 tabular-nums">{cOI > 0 ? (cOI/100000).toFixed(1)+'L' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/40 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-red-400 font-medium">R1 {chainData?.resistance?.toLocaleString()}</span>
                    <span className="text-slate-500">{(chainData?.resistanceOI/100000).toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-400 font-medium">S1 {chainData?.support?.toLocaleString()}</span>
                    <span className="text-slate-500">{(chainData?.supportOI/100000).toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-300">R2 {chainData?.resistance2?.toLocaleString()}</span>
                    <span className="text-slate-500">{(chainData?.resistance2OI/100000).toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-300">S2 {chainData?.support2?.toLocaleString()}</span>
                    <span className="text-slate-500">{(chainData?.support2OI/100000).toFixed(1)}L</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Commentary */}
          <div className="bg-[#0a1628] rounded-lg p-3">
            {(() => {
              const lines = getOptionsAnalysisCommentary(chainData, scData);
              if (!lines.length) return <p className="text-sm text-slate-500">Analyzing market activity…</p>;
              return (
                <div className="space-y-2.5">
                  {lines.map(l => (
                    <p key={l.key} className="text-xs leading-relaxed">
                      <span className="mr-1.5">{l.icon}</span>
                      <span className={l.color}>{l.text}</span>
                    </p>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap justify-between items-center gap-y-1 text-[10px] sm:text-xs text-slate-400 pt-2 border-t border-blue-800/40">
            <div className="flex gap-3">
              <span>Total CE: <span className="text-red-400 font-mono">{(chainData?.totalCallOI / 100000).toFixed(1)}L</span></span>
              <span>Total PE: <span className="text-green-400 font-mono">{(chainData?.totalPutOI / 100000).toFixed(1)}L</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-slow" />
                Live Analysis: {scLastUpdated || (chainData?.timestamp ? new Date(chainData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—')}
              </span>
            </div>
          </div>
          <div className="text-[9px] text-slate-600 pt-1 flex justify-between">
            <span>OI data reflects NSE snapshots · Intraday may lag 5–15m</span>
            {scLastUpdated && <span className="text-amber-500/60 italic">Signal poller active</span>}
          </div>
        </div>
      )}
    </div>
  );
}
