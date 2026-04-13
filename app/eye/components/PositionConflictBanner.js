'use client';

/**
 * Position Conflict Banner — shown when open positions conflict with current bias.
 * Lets the user exit conflicting positions with a single click.
 *
 * Props:
 *   positionAlert                — { bias, conflicting: Position[] } | null
 *   positionAlertDismissedBias   — string | null (bias at time of last dismiss)
 *   setPositionAlertDismissedBias — setter
 *   exitingSymbol                — string | null (symbol currently being exited)
 *   exitResult                   — { ok, symbol, error } | null
 *   onExitPosition               — (position) => Promise<void>
 */
export default function PositionConflictBanner({
  positionAlert,
  positionAlertDismissedBias,
  setPositionAlertDismissedBias,
  exitingSymbol,
  exitResult,
  onExitPosition,
}) {
  if (!positionAlert || positionAlertDismissedBias === positionAlert.bias) return null;

  return (
    <div className="border-b-2 border-rose-500 bg-rose-950/80 backdrop-blur-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-rose-400 text-lg leading-none mt-0.5 flex-shrink-0">⚡</span>
            <div className="min-w-0">
              <p className="text-rose-300 font-bold text-sm">
                Structure flipped {positionAlert.bias === 'bull' ? 'BULLISH' : 'BEARISH'} — you have conflicting open positions
              </p>
              <div className="mt-2 space-y-2">
                {positionAlert.conflicting.map(p => {
                  const pnl      = p.pnl ?? ((p.last_price - p.average_price) * p.quantity);
                  const side     = p.quantity > 0 ? 'LONG' : 'SHORT';
                  const pnlStr   = pnl != null ? `₹${pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString('en-IN')}` : null;
                  const isExiting = exitingSymbol === p.tradingsymbol;
                  const wasExited = exitResult?.ok && exitResult.symbol === p.tradingsymbol;
                  return (
                    <div key={p.tradingsymbol} className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-mono font-semibold ${side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>{side}</span>
                        <span className="text-slate-200 font-medium">{p.tradingsymbol}</span>
                        <span className="text-slate-400">×{Math.abs(p.quantity)}</span>
                        {p.average_price > 0 && <span className="text-slate-400 text-xs">avg ₹{p.average_price.toFixed(0)}</span>}
                        {p.last_price   > 0 && <span className="text-slate-400 text-xs">now ₹{p.last_price.toFixed(0)}</span>}
                        {pnlStr && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pnl >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {pnlStr}
                          </span>
                        )}
                      </div>
                      {!wasExited ? (
                        <button
                          onClick={() => onExitPosition(p)}
                          disabled={!!exitingSymbol}
                          className="px-3 py-1 rounded text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white disabled:opacity-50 transition-colors flex-shrink-0"
                        >
                          {isExiting ? 'Exiting…' : `Exit ${side} — Market`}
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-400 font-semibold">✓ Exit order placed</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {exitResult?.ok === false && (
                <p className="mt-1.5 text-xs text-rose-400">Exit failed: {exitResult.error}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setPositionAlertDismissedBias(positionAlert.bias)}
            className="text-slate-500 hover:text-slate-300 text-xs flex-shrink-0 mt-0.5 transition-colors"
            title="Dismiss — will reappear on next scan if still conflicting"
          >
            Keep holding ✕
          </button>
        </div>
      </div>
    </div>
  );
}
