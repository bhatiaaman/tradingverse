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
  fvgFill:   { bull: 'rgba(34,197,94,0.09)',   bear: 'rgba(239,68,68,0.09)'  },
  fvgBorder: { bull: 'rgba(34,197,94,0.35)',   bear: 'rgba(239,68,68,0.35)' },
  obFill:    { bull: 'rgba(49,121,245,0.13)',  bear: 'rgba(242,54,69,0.13)' },
  obBorder:  { bull: 'rgba(49,121,245,0.45)',  bear: 'rgba(242,54,69,0.45)' },
};

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
  bosLabelBg:    'rgba(241,245,249,0.9)',
  fvgFill:   { bull: 'rgba(22,163,74,0.1)',    bear: 'rgba(220,38,38,0.1)'  },
  fvgBorder: { bull: 'rgba(22,163,74,0.55)',   bear: 'rgba(220,38,38,0.55)' },
  obFill:    { bull: 'rgba(37,99,235,0.12)',   bear: 'rgba(220,38,38,0.12)' },
  obBorder:  { bull: 'rgba(37,99,235,0.55)',   bear: 'rgba(220,38,38,0.55)' },
};
