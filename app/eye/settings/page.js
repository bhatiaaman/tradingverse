'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Setup catalogue ───────────────────────────────────────────────────────────
// Each entry: id (matches cfg key), name, description, thresholds (editable params)
const SETUPS = [
  {
    id: 's1', name: 'BOS + OB Retest',
    desc: 'Break of Structure detected, price retests the Order Block zone with a rejection candle.',
    thresholds: [],
  },
  {
    id: 's3', name: 'ORB Breakout / Breakdown',
    desc: 'Body fully closes beyond Opening Range High or Low with volume confirmation.',
    thresholds: [
      { key: 'volMult', label: 'Min volume multiplier', default: 1.8, step: 0.1, min: 1.0, max: 5.0 },
    ],
  },
  {
    id: 's4', name: 'Power Candle Pullback',
    desc: 'Recent power candle followed by a 35–65% retracement, re-entry candle in same direction.',
    thresholds: [
      { key: 'pullbackMin', label: 'Pullback min %', default: 35, step: 1, min: 10, max: 60 },
      { key: 'pullbackMax', label: 'Pullback max %', default: 65, step: 1, min: 40, max: 90 },
    ],
  },
  {
    id: 's5', name: 'EMA Stack Bounce',
    desc: 'EMAs stacked in trend direction, price at EMA 21, bounce candle.',
    thresholds: [
      { key: 'bodyPct', label: 'Min candle body %', default: 0.40, step: 0.05, min: 0.1, max: 0.9 },
    ],
  },
  {
    id: 's6', name: 'Strong Engulfing at Level',
    desc: 'Engulfing candle at BOS level, VWAP, or OB zone with volume confirmation.',
    thresholds: [
      { key: 'volMult', label: 'Min volume multiplier', default: 1.4, step: 0.1, min: 1.0, max: 5.0 },
    ],
  },
  {
    id: 's8', name: 'Higher Low / Lower High',
    desc: 'Confirmed swing structure (HH/HL or LH/LL), price bouncing at latest pivot.',
    thresholds: [
      { key: 'distPct', label: 'Max distance from pivot %', default: 0.5, step: 0.1, min: 0.1, max: 2.0 },
    ],
  },
  {
    id: 's9', name: 'S/R Flip Retest',
    desc: 'BOS level with 2+ prior touches flips from resistance to support (or vice versa).',
    thresholds: [
      { key: 'distPct',    label: 'Max distance from level %', default: 0.3, step: 0.05, min: 0.05, max: 1.0 },
      { key: 'touchCount', label: 'Min prior touches',         default: 2,   step: 1,    min: 1,    max: 5    },
    ],
  },
  {
    id: 's10', name: 'Double Bottom / Double Top',
    desc: 'Two swing pivots within 0.3% of each other, second touch on lower volume.',
    thresholds: [],
  },
  {
    id: 's11', name: 'Inside Bar Breakout',
    desc: 'Inside bar pattern with volume confirmation on the breakout candle.',
    thresholds: [
      { key: 'volMult', label: 'Min volume multiplier', default: 1.5, step: 0.1, min: 1.0, max: 5.0 },
    ],
  },
  {
    id: 's12', name: 'VWAP + Level Confluence',
    desc: 'Price within 0.15% of VWAP and 0.2% of a BOS level simultaneously.',
    thresholds: [
      { key: 'vwapDistPct', label: 'Max VWAP distance %', default: 0.15, step: 0.05, min: 0.05, max: 0.5 },
      { key: 'bosDistPct',  label: 'Max BOS distance %',  default: 0.20, step: 0.05, min: 0.05, max: 0.5 },
    ],
  },
  {
    id: 's13', name: 'Liquidity Sweep + CHoCH',
    desc: 'Prior candle sweeps a swing high/low; current candle confirms a Change of Character.',
    thresholds: [],
  },
  {
    id: 's14', name: 'FVG Fill at Structure',
    desc: 'Price enters an unmitigated Fair Value Gap near a BOS or OB zone with rejection.',
    thresholds: [],
  },
  {
    id: 's15', name: 'OTE Retracement',
    desc: 'Price retraces into the 62–79% Fibonacci zone after a BOS impulse move.',
    thresholds: [
      { key: 'minMovePct', label: 'Min impulse move %', default: 2.5, step: 0.1, min: 0.5, max: 10 },
    ],
  },
  {
    id: 's16', name: 'Wyckoff Spring / Upthrust',
    desc: 'Price briefly breaks a trading range boundary then snaps back inside.',
    thresholds: [],
  },
  {
    id: 's17', name: 'Confluence Stack',
    desc: 'No single dominant pattern — multiple independent signals at the same price level.',
    thresholds: [
      { key: 'minFactors', label: 'Min confluent factors', default: 4, step: 1, min: 2, max: 8 },
    ],
  },
  {
    id: 's18', name: 'BB Momentum Breakout',
    desc: 'Close breaks outside Bollinger Band (20,2) with aligned RSI, volume, and prior swing break.',
    thresholds: [
      { key: 'volMult', label: 'Min volume multiplier', default: 1.5, step: 0.1, min: 1.0, max: 5.0 },
    ],
  },
  {
    id: 's19', name: 'Flag & Pole Breakout',
    desc: 'Pole (3–5 candles, ≥1.5% move) followed by tight consolidation (≤0.8% range), breakout close beyond flag with volume expansion.',
    thresholds: [
      { key: 'volMult', label: 'Min volume multiplier', default: 1.3, step: 0.1, min: 1.0, max: 5.0 },
    ],
  },
  {
    id: 's20', name: 'EMA Cross (9×21)',
    desc: 'EMA9 crosses EMA21 with price on the correct side of VWAP. Trend-filtered — only longs in uptrend, shorts in downtrend.',
    thresholds: [],
    defaultDisabled: true,
  },
  {
    id: 's21', name: 'VWAP Reclaim',
    desc: 'Price extended 35–90pts from VWAP with momentum fading. Reclaim candle closes beyond prior candle high/low. Semi-auto enabled for Nifty 5-min.',
    thresholds: [],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildDefault() {
  const cfg = {};
  for (const s of SETUPS) {
    cfg[s.id] = { enabled: s.defaultDisabled !== true, thresholds: {}, conditions: {} };
    for (const th of s.thresholds) cfg[s.id].thresholds[th.key] = th.default;
  }
  return cfg;
}

function mergeWithDefaults(saved) {
  const base = buildDefault();
  for (const s of SETUPS) {
    if (saved[s.id]) {
      base[s.id].enabled = saved[s.id].enabled !== false;
      for (const th of s.thresholds) {
        const v = saved[s.id]?.thresholds?.[th.key];
        if (v != null) base[s.id].thresholds[th.key] = v;
      }
    }
  }
  return base;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EyeSettingsPage() {
  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch('/api/eye-settings')
      .then(r => r.json())
      .then(d => setConfig(mergeWithDefaults(d.config || {})))
      .catch(() => setConfig(buildDefault()))
      .finally(() => setLoading(false));
  }, []);

  const toggleSetup = (id) => {
    setConfig(c => ({ ...c, [id]: { ...c[id], enabled: !c[id].enabled } }));
    setSaved(false);
  };

  const setThreshold = (id, key, val) => {
    setConfig(c => ({
      ...c,
      [id]: { ...c[id], thresholds: { ...c[id].thresholds, [key]: val } },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/eye-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = config ? SETUPS.filter(s => config[s.id]?.enabled).length : 0;

  return (
    <div className="min-h-screen bg-[#060b14] text-white">

      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
        <Link href="/eye" className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          Eye
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white font-semibold text-sm">Setup Settings</span>
        <div className="flex-1" />
        {!loading && (
          <span className="text-xs text-slate-500">{enabledCount} / {SETUPS.length} enabled</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            saved
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40'
          }`}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 text-sm gap-2">
            <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          SETUPS.map((setup) => {
            const cfg        = config[setup.id];
            const isEnabled  = cfg?.enabled !== false;
            const isExpanded = expanded === setup.id;
            const hasThresh  = setup.thresholds.length > 0;

            return (
              <div key={setup.id}
                className={`rounded-xl border transition-colors ${
                  isEnabled
                    ? 'bg-[#0d1829] border-blue-900/40'
                    : 'bg-[#090e18] border-white/[0.05] opacity-60'
                }`}
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleSetup(setup.id)}
                    className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
                      isEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      isEnabled ? 'left-[18px]' : 'left-0.5'
                    }`} />
                  </button>

                  {/* Name + desc */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{setup.name}</span>
                      <span className="text-[10px] font-mono text-slate-600 uppercase">{setup.id}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{setup.desc}</p>
                  </div>

                  {/* Expand button (only if has thresholds) */}
                  {hasThresh && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : setup.id)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                      title="Edit thresholds"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Thresholds panel */}
                {isExpanded && hasThresh && (
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
                    {setup.thresholds.map(th => (
                      <div key={th.key} className="flex items-center gap-3">
                        <label className="text-xs text-slate-400 flex-1">{th.label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={th.min} max={th.max} step={th.step}
                            value={cfg?.thresholds?.[th.key] ?? th.default}
                            onChange={e => setThreshold(setup.id, th.key, parseFloat(e.target.value))}
                            className="w-28 accent-indigo-500"
                          />
                          <input
                            type="number"
                            min={th.min} max={th.max} step={th.step}
                            value={cfg?.thresholds?.[th.key] ?? th.default}
                            onChange={e => setThreshold(setup.id, th.key, parseFloat(e.target.value))}
                            className="w-16 bg-[#060b14] border border-white/10 rounded-md px-2 py-0.5 text-xs text-white text-right focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            onClick={() => setThreshold(setup.id, th.key, th.default)}
                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                            title="Reset to default"
                          >
                            reset
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
