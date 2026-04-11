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
  bosLabelBg:    'rgba(6,11,20,0.85)',
  // BOS / CHoCH — TV signature teal/red
  bullBos:   '#089981',
  bearBos:   '#F23645',
  bullChoch: '#26a69a',
  bearChoch: '#ef5350',
  // OB fills — TV blue/red, very subtle
  fvgFill:   { bull: 'rgba(41,98,255,0.06)',  bear: 'rgba(242,54,69,0.06)'  },
  fvgBorder: { bull: 'rgba(41,98,255,0.25)',  bear: 'rgba(242,54,69,0.25)'  },
  obFill:    { bull: 'rgba(41,98,255,0.12)',  bear: 'rgba(242,54,69,0.12)'  },
  obBorder:  { bull: 'rgba(41,98,255,0.45)',  bear: 'rgba(242,54,69,0.45)'  },
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
  // Zone fills — TV teal/red, clearly visible on light bg
  fvgFill:   { bull: 'rgba(8,153,129,0.1)',    bear: 'rgba(242,54,69,0.1)'   },
  fvgBorder: { bull: 'rgba(8,153,129,0.6)',    bear: 'rgba(242,54,69,0.6)'   },
  obFill:    { bull: 'rgba(8,153,129,0.18)',   bear: 'rgba(242,54,69,0.18)'  },
  obBorder:  { bull: 'rgba(8,153,129,0.8)',    bear: 'rgba(242,54,69,0.8)'   },
};
