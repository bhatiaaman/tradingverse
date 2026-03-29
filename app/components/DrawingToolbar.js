'use client';
// ─── DrawingToolbar ───────────────────────────────────────────────────────────
// Left-side collapsible toolbar for chart drawing tools.
// Toggle tab is always visible; clicking it slides out the tool panel.

import { useState } from 'react';

// ── SVG Icons (inline, no dependency) ────────────────────────────────────────
const CursorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"/>
  </svg>
);

const TrendLineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="2" y1="13" x2="14" y2="2"/>
    <circle cx="14" cy="2" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

const RayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <line x1="2" y1="13" x2="15" y2="1"/>
    <line x1="12" y1="3" x2="15" y2="1" strokeWidth="1" opacity="0.6"/>
    <line x1="13" y1="5" x2="15" y2="1" strokeWidth="1" opacity="0.6"/>
  </svg>
);

const HLineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="0" y1="8" x2="16" y2="8"/>
    <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
  </svg>
);

const VLineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="8" y1="0" x2="8" y2="16"/>
    <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
  </svg>
);

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOL_GROUPS = [
  {
    label: 'Lines',
    tools: [
      { id: 'trend_line',      label: 'Trend Line',       icon: <TrendLineIcon /> },
      { id: 'ray',             label: 'Ray',               icon: <RayIcon /> },
      { id: 'horizontal_line', label: 'Horizontal Line',   icon: <HLineIcon /> },
      { id: 'vertical_line',   label: 'Vertical Line',     icon: <VLineIcon /> },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function DrawingToolbar({ activeTool, onToolSelect, selectedDrawingId, onDeleteSelected, onClearAll }) {
  const [open, setOpen] = useState(false);

  const handleToolClick = (id) => {
    onToolSelect(activeTool === id ? null : id); // toggle off if already active
  };

  return (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-stretch select-none">

      {/* ── Slide-out panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="w-36 bg-[#0a0e1a]/95 border border-r-0 border-white/[0.10] rounded-l-xl shadow-2xl py-1.5">

          {/* Cursor / select (deactivate tool) */}
          <button
            onClick={() => onToolSelect(null)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors ${
              activeTool === null
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Cursor (Esc)"
          >
            <CursorIcon />
            <span>Cursor</span>
          </button>

          {/* Tool groups */}
          {TOOL_GROUPS.map(group => (
            <div key={group.label}>
              <div className="px-3 pt-2 pb-1 text-[9px] text-slate-600 uppercase tracking-wider">
                {group.label}
              </div>
              {group.tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => handleToolClick(tool.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    activeTool === tool.id
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                  title={tool.label}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          ))}

          {/* ── Delete actions ───────────────────────────────────────────── */}
          <div className="mt-1 pt-1.5 border-t border-white/[0.06] px-2 space-y-0.5">
            <button
              onClick={onDeleteSelected}
              disabled={!selectedDrawingId}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium rounded transition-colors ${
                selectedDrawingId
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-slate-700 cursor-not-allowed'
              }`}
              title="Delete selected line (Del)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
              <span>Delete selected</span>
            </button>
            <button
              onClick={onClearAll}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="Clear all drawings"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0z"/>
              </svg>
              <span>Clear all</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Toggle tab (always visible) ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-5 flex flex-col items-center justify-center gap-0.5 py-3 transition-colors rounded-r-lg border border-l-0 border-white/[0.10] shadow-lg ${
          open || activeTool
            ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400'
            : 'bg-[#0a0e1a]/80 text-slate-500 hover:text-slate-300 hover:bg-[#0a0e1a]'
        }`}
        title={open ? 'Hide drawing tools' : 'Drawing tools'}
      >
        {/* Three horizontal lines icon representing drawing tools */}
        <span className="w-2.5 h-px bg-current rounded" />
        <span className="w-2.5 h-px bg-current rounded opacity-70" style={{ transform: 'rotate(-20deg)' }} />
        <span className="w-2.5 h-px bg-current rounded" />
      </button>
    </div>
  );
}
