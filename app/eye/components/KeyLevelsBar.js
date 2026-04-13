'use client';

// Level pill colour per category
const LEVEL_CATEGORY_COLOR = {
  pd:      'text-sky-300',
  pivot:   'text-violet-300',
  weekly:  'text-amber-300',
  monthly: 'text-orange-300',
  ema:     'text-emerald-300',
  today:   'text-slate-300',
  or:      'text-pink-300',
};

// Short label → human-readable tooltip name
const LEVEL_FULL_NAME = {
  PDH: 'Previous Day High', PDL: 'Previous Day Low', PDC: 'Previous Day Close',
  PP: 'Pivot Point', R1: 'Resistance 1', S1: 'Support 1',
  WkH: 'Weekly High', WkL: 'Weekly Low',
  MoH: 'Monthly High', MoL: 'Monthly Low',
  EMA9: 'EMA 9', EMA21: 'EMA 21', EMA50: 'EMA 50', EMA200: 'EMA 200',
  TdH: "Today's High", TdL: "Today's Low",
  ORH: 'Opening Range High', ORL: 'Opening Range Low',
};

/**
 * Horizontal scrollable bar of key price levels.
 * Nearest ceiling and floor levels are highlighted.
 *
 * @param {{ levels: Array, spot: number }} props
 */
export default function KeyLevelsBar({ levels, spot }) {
  if (!levels?.length) return null;

  // Nearest resistance above and nearest support below define the current zone
  const nearestCeiling = levels.find(l => l.dist !== null && l.dist > 0.5);
  const nearestFloor   = levels.find(l => l.dist !== null && l.dist < -0.5);

  return (
    <div className="px-3 py-2 border-b border-blue-800/40 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1.5 min-w-max">
        {levels.map((l) => {
          const dist = l.dist;
          const isNear   = dist !== null && Math.abs(dist) <= 0.5;
          const isAbove  = dist !== null && dist > 0;
          const isCeiling = nearestCeiling && l.label === nearestCeiling.label && !isNear;
          const isFloor   = nearestFloor   && l.label === nearestFloor.label   && !isNear;

          const priceColor = isNear
            ? 'text-amber-400'
            : isAbove
              ? 'text-emerald-400'
              : 'text-red-400';
          const labelColor = LEVEL_CATEGORY_COLOR[l.category] || 'text-slate-400';
          const bg = isNear
            ? 'bg-amber-500/10 border border-amber-500/30 animate-pulse'
            : isCeiling
              ? 'bg-rose-950/40 border border-rose-700/50'
              : isFloor
                ? 'bg-sky-950/40 border border-sky-700/50'
                : 'bg-[#0a1628] border border-blue-800/20';

          const fullName   = LEVEL_FULL_NAME[l.label] || l.label;
          const zoneTag    = isCeiling ? ' — zone ceiling' : isFloor ? ' — zone floor' : '';
          const tooltipText = `${fullName}: ₹${l.price.toLocaleString('en-IN')}${
            dist !== null ? ` (${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%)` : ''
          }${zoneTag}`;

          return (
            <div
              key={l.label}
              className={`flex flex-col items-center px-2 py-1 rounded-md ${bg} min-w-[52px]`}
              title={tooltipText}
            >
              <span className={`text-[9px] font-semibold leading-none ${labelColor}`}>{l.label}</span>
              <span className={`text-[10px] font-mono font-medium leading-tight mt-0.5 ${priceColor}`}>
                {l.price >= 10000
                  ? l.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                  : l.price.toFixed(1)}
              </span>
              {dist !== null && (
                <span className={`text-[8px] leading-none mt-0.5 ${
                  isNear ? 'text-amber-400' : isCeiling ? 'text-rose-500' : isFloor ? 'text-sky-500' : 'text-slate-500'
                }`}>
                  {dist >= 0 ? '+' : ''}{dist.toFixed(1)}%
                </span>
              )}
              {(isCeiling || isFloor) && (
                <span className={`text-[7px] leading-none mt-0.5 font-bold ${isCeiling ? 'text-rose-600' : 'text-sky-600'}`}>
                  {isCeiling ? '▲ RES' : '▼ SUP'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
