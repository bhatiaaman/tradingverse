'use client';

/**
 * Short Covering Setup Banner — shown at the top of the page when an SC setup is active.
 * Handles the confirm/place flow inline.
 *
 * Props:
 *   scData          — SC data object { active, trade, score, maxScore, context, signals }
 *   scDismissed     — boolean
 *   setScDismissed  — setter
 *   scConfirming    — boolean (confirm step visible)
 *   setScConfirming — setter
 *   scPlacing       — boolean (order in flight)
 *   scOrderResult   — { ok, msg } | null
 *   kiteAuth        — { isLoggedIn }
 *   onPlaceScOrder  — async handler for placing the SC order
 */
export default function ShortCoveringBanner({
  scData, scDismissed, setScDismissed,
  scConfirming, setScConfirming,
  scPlacing, scOrderResult,
  kiteAuth,
  onPlaceScOrder,
}) {
  if (!scData?.active || scDismissed) return null;

  const trade = scData.trade;
  const score = scData.score;
  const max   = scData.maxScore;

  return (
    <div className="border-b border-emerald-500/30 bg-emerald-950/60 backdrop-blur-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
        {!scConfirming ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Left: label + score + signals */}
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-emerald-400 text-base leading-none mt-0.5 flex-shrink-0">⚡</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-emerald-300 font-bold text-sm">Short Covering Active</span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">{score}/{max}</span>
                  {scData.context?.spot && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      NIFTY <span className="text-white">{scData.context.spot.toFixed(0)}</span>
                      {scData.context.vwap ? <> · VWAP <span className={scData.context.spot > scData.context.vwap ? 'text-emerald-400' : 'text-red-400'}>{scData.context.vwap.toFixed(0)}</span></> : null}
                      {scData.context.ceWall ? <> · Wall <span className="text-red-400">{scData.context.ceWall}</span></> : null}
                    </span>
                  )}
                </div>
                {/* Top 3 hit signals */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {Object.entries(scData.signals ?? {}).filter(([, s]) => s.hit).slice(0, 3).map(([k, s]) => (
                    <span key={k} className="text-[10px] text-emerald-400/80">✓ {s.detail}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: trade info + action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {trade && (
                <div className="text-[11px] font-mono text-right">
                  <div className="text-white font-bold">NIFTY {trade.strike} CE · ₹{trade.entryLtp}</div>
                  <div className="text-red-400">SL ₹{trade.sl.cePremium} <span className="text-slate-500">(−{trade.sl.pctRisk}%)</span></div>
                  <div className="text-emerald-400">T1 ₹{trade.targets[0]?.cePremium} · T2 ₹{trade.targets[1]?.cePremium}</div>
                </div>
              )}
              {trade && kiteAuth.isLoggedIn && !scOrderResult?.ok && (
                <button
                  onClick={() => setScConfirming(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  Buy CE ▶
                </button>
              )}
              {scOrderResult && (
                <span className={`text-[11px] font-medium px-2 py-1 rounded-lg ${scOrderResult.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-400'}`}>
                  {scOrderResult.ok ? '✅ ' : '❌ '}{scOrderResult.msg}
                </span>
              )}
              <button
                onClick={() => setScDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors text-xs"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          /* Inline confirm step */
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-emerald-300 font-bold text-sm">⚡ Confirm Buy</span>
            <div className="text-[11px] font-mono flex items-center gap-3 flex-wrap">
              <span className="text-white">NIFTY {trade?.strike} CE · MARKET · MIS · 75 qty</span>
              <span className="text-emerald-400">~₹{trade ? (trade.entryLtp * 75).toLocaleString('en-IN') : '—'}</span>
              <span className="text-red-400">SL ₹{trade?.sl.cePremium}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScConfirming(false)}
                disabled={scPlacing}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 text-xs font-medium hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onPlaceScOrder}
                disabled={scPlacing}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {scPlacing ? 'Placing…' : '✓ Place Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
