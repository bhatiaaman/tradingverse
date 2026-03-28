// ─── Chart Palette ────────────────────────────────────────────────────────────
// Two themes: DARK (default) and LIGHT. Passed to renderers that need them.

export const DARK = {
  chartBg:       '#112240',
  axisBg:        '#0c1a2e',
  axisText:      '#94a3b8',
  axisTextDate:  '#64748b',
  gridLine:      'rgba(66,99,235,0.1)',
  timegridLine:  'rgba(66,99,235,0.08)',
  axisBorder:    'rgba(66,99,235,0.25)',
  dateSepLine:   'rgba(148,163,184,0.15)',
  rsiPaneBg:     '#070b13',
  rsiPaneBorder: '#1e3a5f',
  bosLabelBg:    'rgba(6,11,20,0.75)',
  // BOS / CHoCH line colours
  bullBos:   '#22c55e',
  bearBos:   '#ef4444',
  bullChoch: '#86efac',
  bearChoch: '#fca5a5',
  // Zone fills — FVG and Order Block
  fvgFill:   { bull: 'rgba(34,197,94,0.09)',   bear: 'rgba(239,68,68,0.09)'  },
  fvgBorder: { bull: 'rgba(34,197,94,0.35)',   bear: 'rgba(239,68,68,0.35)' },
  obFill:    { bull: 'rgba(49,121,245,0.13)',  bear: 'rgba(242,54,69,0.13)' },
  obBorder:  { bull: 'rgba(49,121,245,0.45)',  bear: 'rgba(242,54,69,0.45)' },
};

// LIGHT uses TradingView's signature SMC palette:
//   bull = teal  #089981  (TV's default long/bull colour)
//   bear = red   #F23645  (TV's default short/bear colour)
export const LIGHT = {
  chartBg:       '#f8fafc',
  axisBg:        '#f1f5f9',
  axisText:      '#475569',
  axisTextDate:  '#64748b',
  gridLine:      'rgba(30,58,138,0.07)',
  timegridLine:  'rgba(30,58,138,0.05)',
  axisBorder:    'rgba(30,58,138,0.18)',
  dateSepLine:   'rgba(100,116,139,0.2)',
  rsiPaneBg:     '#f1f5f9',
  rsiPaneBorder: '#cbd5e1',
  bosLabelBg:    'rgba(241,245,249,0.92)',
  // BOS / CHoCH — TV teal/red
  bullBos:   '#089981',
  bearBos:   '#F23645',
  bullChoch: '#26a69a',
  bearChoch: '#ef5350',
  // Zone fills — TV teal/red, more opaque on light bg
  fvgFill:   { bull: 'rgba(8,153,129,0.1)',    bear: 'rgba(242,54,69,0.1)'   },
  fvgBorder: { bull: 'rgba(8,153,129,0.55)',   bear: 'rgba(242,54,69,0.55)'  },
  obFill:    { bull: 'rgba(8,153,129,0.12)',   bear: 'rgba(242,54,69,0.12)'  },
  obBorder:  { bull: 'rgba(8,153,129,0.65)',   bear: 'rgba(242,54,69,0.65)'  },
};
