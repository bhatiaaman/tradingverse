'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ThirdEyePanel — the full right-column Third Eye card.
 *
 * Receives all state + handlers from EyePage as props.
 * No local state except the ATM qty input which is lifted to the page.
 */
export default function ThirdEyePanel({
  // Data
  thirdEyeData,
  thirdEyeOpen, setThirdEyeOpen,
  thirdEyeLog,
  thirdEyeLive,
  thirdEyeMode, setThirdEyeMode,
  thirdEyeEnv, setThirdEyeEnv,
  thirdEyeTestMode,
  serverBiasState,
  liveTick,
  activeTrade,
  tradeLTP,
  tradeExiting,
  tradeExited,
  thirdEyePlaced,
  thirdEyePlacing,
  scanStatus,
  openPositions,
  semiAutoQty, setSemiAutoQty,
  chartSymbol,
  // Helpers passed down from page
  SEMI_AUTO_IDS,
  getAtmInfo,
  isMarketHours,
  positionDir,
  // Handlers
  onPlaceThirdEyeOrder,
  onExitThirdEyeTrade,
}) {
  // ── Stale signal reversal sets (used in live card) ────────────────────────
  const BULL_REVERSAL_IDS = new Set(['morning_star','hammer','bull_pin','bull_engulfing','tweezer_bottom']);
  const BEAR_REVERSAL_IDS = new Set(['evening_star','shooting_star','bear_pin','bear_engulfing','tweezer_top']);

  // ── Live card action label → colour class ─────────────────────────────────
  const getActionClass = (action) => {
    if (!action) return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    if (action.startsWith('GO LONG'))    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (action.startsWith('LONG'))       return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
    if (action.startsWith('HOLD LONG'))  return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    if (action.startsWith('GO SHORT'))   return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    if (action.startsWith('SHORT'))      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    if (action.startsWith('HOLD SHORT')) return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    if (action.startsWith('EXIT'))       return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    if (action === 'WARNING')            return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (action === 'POTENTIAL LONG')     return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    if (action === 'POTENTIAL SHORT')    return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
    if (action === 'WRAP UP')            return 'bg-amber-700/20 text-amber-400 border-amber-600/30';
    if (action === 'OBSERVE')            return 'bg-slate-700/40 text-slate-500 border-slate-600/30';
    return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="bg-[#0d1829] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-white/[0.05]">
        {/* Row 1: title + collapse */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">👁</span>
            <span className="text-sm font-bold text-white">Third Eye</span>
            {thirdEyeData?.strongSetups?.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/eye/settings"
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors text-[10px] font-medium"
              title="Setup Settings"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
              </svg>
              Setups
            </Link>
            <button onClick={() => setThirdEyeOpen(o => !o)} className="text-slate-500 hover:text-slate-300">
              {thirdEyeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Row 2: mode + environment toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setThirdEyeMode('semi')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all ${
              thirdEyeMode === 'semi'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-600 hover:text-slate-400 border border-transparent'
            }`}
            title="Semi-Auto: action card shown, you confirm before order fires"
          >Semi</button>
          <button
            disabled
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-slate-700 cursor-not-allowed border border-transparent"
            title="Auto mode — coming soon"
          >Auto</button>
          <span className="w-px h-3 bg-white/10 mx-0.5" />
          {[['light','L','sky'],['medium','M','amber'],['tight','T','rose']].map(([env, label, col]) => (
            <button
              key={env}
              onClick={() => setThirdEyeEnv(env)}
              className={`w-7 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all ${
                thirdEyeEnv === env
                  ? col === 'sky'   ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : col === 'amber' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  :                   'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-600 hover:text-slate-400 border border-transparent'
              }`}
              title={env}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Active Trade Card ─────────────────────────────────────────────── */}
      {thirdEyeOpen && activeTrade && (
        <div className={`mx-3 my-2 p-3 rounded-xl border ${
          activeTrade.direction === 'bull'
            ? 'bg-emerald-500/[0.06] border-emerald-500/20'
            : 'bg-rose-500/[0.06] border-rose-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${
              activeTrade.direction === 'bull'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            }`}>
              ACTIVE · {activeTrade.optionType}
            </span>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]">{activeTrade.symbol}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 mb-2.5 text-center">
            <div>
              <p className="text-[9px] text-slate-600 mb-0.5">Entry</p>
              <p className="text-[11px] font-mono text-white">₹{activeTrade.limitPrice}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 mb-0.5">LTP</p>
              <p className={`text-[11px] font-mono ${!tradeLTP ? 'text-slate-500' : tradeLTP > activeTrade.limitPrice ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tradeLTP ? `₹${tradeLTP}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 mb-0.5">P&amp;L</p>
              <p className={`text-[11px] font-mono ${!tradeLTP ? 'text-slate-500' : ((tradeLTP - activeTrade.limitPrice) * activeTrade.qty) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tradeLTP ? `₹${((tradeLTP - activeTrade.limitPrice) * activeTrade.qty).toFixed(0)}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 mb-0.5">SL Idx</p>
              <p className="text-[11px] font-mono text-rose-400">{activeTrade.slLevel ? activeTrade.slLevel.toFixed(0) : '—'}</p>
            </div>
          </div>
          {tradeExited ? (
            <div className={`text-[10px] text-center py-1.5 rounded-lg border font-mono ${
              tradeExited.ok
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}>
              {tradeExited.ok ? '✓ Exit order sent' : tradeExited.error || 'Exit failed'}
            </div>
          ) : (
            <button
              onClick={onExitThirdEyeTrade}
              disabled={tradeExiting}
              className="w-full py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50"
            >
              {tradeExiting ? 'Exiting…' : 'Exit Trade (Market)'}
            </button>
          )}
        </div>
      )}

      {/* ── Live Card (10s tick) ───────────────────────────────────────────── */}
      {thirdEyeOpen && thirdEyeLive && isMarketHours() && (() => {
        const ln         = thirdEyeLive.narrative ?? null;
        const liveDir    = thirdEyeLive.topSetup?.pattern?.direction;
        const liveScore  = thirdEyeLive.topSetup?.score;
        const liveClose  = thirdEyeLive.candle?.close;
        const liveSl     = thirdEyeLive.topSetup?.pattern?.sl;
        const tickLtp      = liveTick?.ltp;
        const displayPrice = tickLtp ?? liveClose;
        const tickChange   = liveTick?.changePct;
        const tickVwapDist = liveTick?.vwapPct;
        const aboveVwap    = liveTick?.aboveVwap ?? thirdEyeLive.context?.vwap?.above;
        const lastLogEntry = thirdEyeLog[0];
        const lastLogDir   = (lastLogEntry?.narrative?.type !== 'observe') ? lastLogEntry?.topSetup?.pattern?.direction : null;
        const liveHasBullReversal = thirdEyeLive.rawPatterns?.some(p => BULL_REVERSAL_IDS.has(p.pattern?.id));
        const liveHasBearReversal = thirdEyeLive.rawPatterns?.some(p => BEAR_REVERSAL_IDS.has(p.pattern?.id));
        const staleWarning =
          (lastLogDir === 'bear' && liveHasBullReversal) ? '⚠ Prior short — bounce pattern forming, hold fire' :
          (lastLogDir === 'bull' && liveHasBearReversal) ? '⚠ Prior long — rejection pattern forming, tighten stops' :
          null;
        const actionClass = getActionClass(ln?.action);
        return (
          <div className="px-3 pt-2 pb-1">
            <div className={`relative px-3 py-2.5 rounded-xl border ${
              ln?.type === 'exit' ? 'bg-violet-500/[0.06] border-violet-500/25' :
              liveDir === 'bull'  ? 'bg-emerald-500/[0.05] border-emerald-500/20' :
              liveDir === 'bear'  ? 'bg-rose-500/[0.05] border-rose-500/20' :
                                    'bg-white/[0.02] border-white/[0.06]'
            }`}>
              {/* LIVE pulse dot */}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-400"></span>
                </span>
                <span className="text-[9px] font-bold text-sky-400 tracking-wider">LIVE</span>
              </div>
              <div className="flex items-center gap-2 mb-1.5 pr-12">
                {ln && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider shrink-0 ${actionClass}`}>
                    {ln.action ?? 'WATCH'}
                  </span>
                )}
                {thirdEyeLive.topSetup?.pattern?.name && (
                  <span className="text-[10px] text-white font-medium truncate">{thirdEyeLive.topSetup.pattern.name}</span>
                )}
                {liveScore != null && <span className="text-[9px] text-slate-500 ml-auto shrink-0">{liveScore}/10</span>}
              </div>
              <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{ln?.reason ?? 'Monitoring price action…'}</p>
              {staleWarning && <p className="mt-1.5 text-[9px] text-amber-400/80 font-medium">{staleWarning}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono">
                {displayPrice && (
                  <span className={`font-bold ${tickChange != null ? tickChange >= 0 ? 'text-emerald-400' : 'text-rose-400' : 'text-white'}`}>
                    {displayPrice.toFixed(0)}
                    {tickChange != null && <span className="text-[8px] ml-0.5">({tickChange >= 0 ? '+' : ''}{tickChange.toFixed(2)}%)</span>}
                  </span>
                )}
                {tickVwapDist != null && (
                  <span className={aboveVwap ? 'text-emerald-500/70' : 'text-rose-500/70'}>
                    {aboveVwap ? '▲' : '▼'} VWAP {Math.abs(tickVwapDist).toFixed(2)}%
                  </span>
                )}
                {liveSl && <span className="text-rose-500/80">SL {liveSl.toFixed(0)}</span>}
                <span className="ml-auto text-slate-700">
                  {thirdEyeLive.time} · upd {liveTick?.updatedAt ?? thirdEyeLive.updatedAt ?? thirdEyeLive.time}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bias + Position Strip ─────────────────────────────────────────── */}
      {(() => {
        const serverBias  = serverBiasState?.bias;
        const bias        = serverBias ? serverBias.toLowerCase() : 'neutral';
        const biasSince   = serverBiasState?.since;
        const pendingFlip = serverBiasState?.pendingFlip;
        const biasColor = bias === 'bull' ? 'text-emerald-400' : bias === 'bear' ? 'text-rose-400' : 'text-slate-400';
        const biasBg    = bias === 'bull' ? 'bg-emerald-500/10 border-emerald-500/20' : bias === 'bear' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-800/60 border-white/5';
        const biasLabel = bias === 'bull' ? '▲ BULL' : bias === 'bear' ? '▼ BEAR' : '— NEUTRAL';
        const conflicting = openPositions.filter(p => positionDir(p) !== bias);
        const aligned     = openPositions.filter(p => positionDir(p) === bias);
        const totalPnl = openPositions.reduce((s, p) => {
          const pnl = p.pnl ?? ((p.last_price - p.average_price) * p.quantity);
          return s + (pnl ?? 0);
        }, 0);
        return (
          <div className={`mx-3 mb-2 rounded-lg border ${biasBg} px-3 py-2`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Bias</span>
                <span className={`text-[11px] font-bold ${biasColor}`}>{biasLabel}</span>
                {biasSince && <span className="text-[9px] text-slate-600">since {biasSince}</span>}
                {pendingFlip && (
                  <span className="text-[9px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    {pendingFlip === 'BULL' ? '▲ pending' : '▼ pending'}
                  </span>
                )}
              </div>
              {openPositions.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {conflicting.length > 0 && (
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                      ⚡ {conflicting.length} AGAINST
                    </span>
                  )}
                  {aligned.length > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                      ✓ {aligned.length} aligned
                    </span>
                  )}
                  {openPositions.map(p => {
                    const pnl = p.pnl ?? ((p.last_price - p.average_price) * p.quantity);
                    const isConflict = conflicting.includes(p);
                    return (
                      <span key={p.tradingsymbol} className={`text-[10px] font-mono ${isConflict ? 'text-rose-300' : 'text-slate-400'}`}>
                        {p.tradingsymbol.replace(/NFO:/, '')} ×{Math.abs(p.quantity)}
                        {pnl != null && (
                          <span className={pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}> ₹{Math.round(pnl) >= 0 ? '+' : ''}{Math.round(pnl).toLocaleString('en-IN')}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[10px] text-slate-600">No open positions</span>
              )}
              {openPositions.length > 0 && (
                <span className={`text-[11px] font-bold tabular-nums ml-auto ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}₹{Math.round(totalPnl).toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Test mode banner ──────────────────────────────────────────────── */}
      {thirdEyeOpen && thirdEyeTestMode && (
        <div className="mx-3 mb-1 px-2 py-1 rounded text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/20 font-bold tracking-wider text-center">
          TEST MODE · Ctrl+Shift+T to exit
        </div>
      )}

      {/* ── Sealed Log ────────────────────────────────────────────────────── */}
      {thirdEyeOpen && (() => {
        const displayLog = thirdEyeLog;
        return (
          <div className="divide-y divide-white/[0.04] max-h-[560px] overflow-y-auto">
            {scanStatus && scanStatus.pushed < scanStatus.total && (
              <p className="px-4 py-1.5 text-[9px] font-mono text-rose-500/70 border-b border-white/[0.04]">
                ⚠ scan errors: {scanStatus.total - scanStatus.pushed} candle(s) failed — check console
              </p>
            )}
            {displayLog.length === 0 ? (
              <p className="px-4 py-6 text-slate-600 text-xs text-center">Waiting for next candle close…</p>
            ) : displayLog.map((entry, i) => {
              const ln      = entry.narrative;
              const isFirst = i === 0;

              // Semi-auto action card
              const setupId      = entry.topSetup?.pattern?.id;
              const isActionable = (
                isFirst &&
                (entry.isTest || chartSymbol === 'NIFTY') &&
                (entry.topSetup?.score ?? 0) >= 6 &&
                SEMI_AUTO_IDS?.includes(setupId)
              );

              if (isActionable) {
                const s       = entry.topSetup.pattern;
                const isBull  = s.direction === 'bull';
                const close   = entry.candle.close;
                const sl      = s.sl;
                const dist    = sl ? Math.abs(close - sl) : null;
                const target  = sl ? (isBull ? close + 2 * dist : close - 2 * dist) : null;
                const placed  = thirdEyePlaced[entry.time];
                const placing = thirdEyePlacing === entry.time;
                const atm     = getAtmInfo(close);
                const optLabel = `${atm.strike} ${isBull ? 'CE' : 'PE'}`;
                return (
                  <div key={i} className={`px-4 py-3 bg-white/[0.03] border-l-2 ${isBull ? 'border-emerald-500/60' : 'border-rose-500/60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${isBull ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                          {isBull ? 'LONG' : 'SHORT'}
                        </span>
                        {entry.isTest && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/30 tracking-widest">TEST</span>}
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono">{entry.isTest ? '—' : entry.time}</span>
                    </div>
                    <p className="text-[11px] font-semibold text-white mb-1">{s.name}</p>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="text-[10px] text-slate-500">Score {entry.topSetup.score} · <span className="text-white/70 font-mono">{optLabel}</span> · <span className="text-slate-600">{atm.expiryLabel}</span></p>
                      <div className="ml-auto flex items-center gap-1">
                        <span className="text-[9px] text-slate-500">Qty</span>
                        <input
                          type="number" min="65" step="65"
                          value={semiAutoQty}
                          onChange={e => setSemiAutoQty(Math.max(65, parseInt(e.target.value) || 65))}
                          className="w-16 text-[10px] font-mono text-white bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-center focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">Entry</p>
                        <p className="text-[11px] font-mono text-white">{close.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">SL</p>
                        <p className="text-[11px] font-mono text-rose-400">{sl ? sl.toFixed(0) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">Target 2:1</p>
                        <p className="text-[11px] font-mono text-emerald-400">{target ? target.toFixed(0) : '—'}</p>
                      </div>
                    </div>
                    {s.details?.flipPrice && (
                      <p className="text-[9px] text-slate-500 mb-2 font-mono">
                        S/R level: <span className="text-amber-300">{s.details.flipPrice.toFixed(0)}</span>
                        {s.details.distPct != null && <span className="text-slate-600"> · {s.details.distPct}% away</span>}
                        {s.details.touchCount != null && <span className="text-slate-600"> · {s.details.touchCount} prior touches</span>}
                      </p>
                    )}
                    {s.details?.wideCandle && (
                      <p className="text-[9px] text-amber-400/80 mb-2">⚠ Wide candle — SL capped at 1 ATR · size down</p>
                    )}
                    {placed ? (
                      placed.ok ? (
                        <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/20 px-3 py-2 space-y-1">
                          <div className="text-[10px] text-emerald-400 font-mono font-semibold">✓ Entry placed — {placed.symbol}</div>
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-slate-500">Buy limit</span>
                            <span className="text-white">₹{placed.entryLimit ?? placed.limitPrice}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-slate-500">SL trigger (prem)</span>
                            <span className={placed.slOrderId ? 'text-rose-400' : 'text-amber-400'}>
                              {placed.slOrderId ? `₹${placed.slTrigger} ✓` : `₹${placed.slTrigger} ⚠ manual`}
                            </span>
                          </div>
                          {placed.niftySl && (
                            <div className="flex justify-between text-[10px] font-mono">
                              <span className="text-slate-500">Nifty SL level</span>
                              <span className="text-rose-300">₹{placed.niftySl.toFixed(0)}</span>
                            </div>
                          )}
                          {placed.slError && (
                            <div className="text-[9px] text-amber-400/80">SL order failed: {placed.slError} — set manually</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-rose-400 text-center py-1.5 bg-rose-500/10 rounded-lg border border-rose-500/20">
                          {placed.error || 'Order failed'}
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => onPlaceThirdEyeOrder(entry)}
                        disabled={placing}
                        className={`w-full py-2 rounded-lg text-[11px] font-bold tracking-wide transition-all disabled:opacity-50 ${isBull ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white`}
                      >
                        {placing ? 'Placing…' : `Buy ${optLabel} · ${semiAutoQty} qty`}
                      </button>
                    )}
                  </div>
                );
              }

              // Regular log entry
              if (!ln) return null;

              const isEntry   = ln.type === 'entry';
              const isExit    = ln.type === 'exit';
              const isCaut    = ln.type === 'caution';
              const nLong     = ln.direction === 'bull';
              const isGo      = ln.subType === 'fresh';
              const isCont    = ln.subType === 'cont';
              const isBosWatch = ln.action === 'BOS WATCH';

              const badgeStyle =
                (isEntry && isGo   && nLong)  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                (isEntry && isCont && nLong)  ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' :
                (isEntry && isGo   && !nLong) ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                (isEntry && isCont && !nLong) ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                isExit                        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' :
                isBosWatch                    ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                (isCaut && nLong)             ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                isCaut                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                ln.type === 'watch'            ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                'bg-slate-700/20 text-slate-600 border-slate-600/10';

              const headlineStyle =
                (isEntry && isGo   && nLong)  ? 'text-emerald-300' :
                (isEntry && isCont && nLong)  ? 'text-teal-300' :
                (isEntry && isGo   && !nLong) ? 'text-rose-300' :
                (isEntry && isCont && !nLong) ? 'text-orange-300' :
                isExit                        ? 'text-violet-300' :
                isBosWatch                    ? 'text-yellow-300' :
                isCaut                        ? 'text-amber-300' :
                ln.type === 'watch'            ? 'text-slate-400' :
                'text-slate-500';

              return (
                <div key={i} className={`px-4 py-3 ${isFirst ? 'bg-white/[0.025]' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${badgeStyle}`}>{ln.action}</span>
                    <span className="text-[10px] text-slate-600 font-mono">{entry.time}</span>
                  </div>
                  <p className={`text-[11px] font-semibold leading-snug mb-1 ${headlineStyle}`}>{ln.headline}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{ln.reason}</p>
                  {entry.topSetup?.pattern?.details?.flipPrice && (
                    <p className="text-[9px] text-slate-600 font-mono mt-0.5">
                      S/R @ <span className="text-amber-400/80">{entry.topSetup.pattern.details.flipPrice.toFixed(0)}</span>
                      {entry.topSetup.pattern.details.touchCount != null && ` · ${entry.topSetup.pattern.details.touchCount} touches`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
