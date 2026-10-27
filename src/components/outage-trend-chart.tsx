'use client';

type ChartData = { date: string; count: number };

const WIDTH = 720;
const HEIGHT = 220;
const TOP = 28;
const SIDE = 16;
const BOTTOM = 58;

export default function OutageTrendChart({ data }: { data: ChartData[] }) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = (WIDTH - SIDE * 2) / data.length;
  const barWidth = Math.min(44, Math.max(4, slot * 0.6));
  const baseline = TOP + plotHeight;

  return (
    <div className="mt-12 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900 mb-6">Outage Trend</h3>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Bar chart of outages per day"
      >
        <line x1={SIDE} y1={baseline} x2={WIDTH - SIDE} y2={baseline} className="stroke-slate-200" />
        {data.map((d, i) => {
          const height = Math.max((d.count / maxCount) * plotHeight, d.count > 0 ? 3 : 0);
          const x = SIDE + i * slot + (slot - barWidth) / 2;
          const y = baseline - height;
          const labelY = baseline + 14;

          return (
            <g key={`${d.date}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={4}
                className="fill-blue-500 transition-colors hover:fill-blue-600"
              >
                <title>{`${d.date}: ${d.count} outage${d.count === 1 ? '' : 's'}`}</title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                className="fill-blue-700"
              >
                {d.count}
              </text>
              <text
                x={x + barWidth / 2}
                y={labelY}
                textAnchor="end"
                fontSize={10}
                className="fill-zinc-500"
                transform={`rotate(-45 ${x + barWidth / 2} ${labelY})`}
              >
                {d.date}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
