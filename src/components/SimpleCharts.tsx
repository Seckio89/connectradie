import { useState } from 'react';

// ─── Bar Chart ───────────────────────────────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  showValues?: boolean;
}

export function BarChart({ data, height = 200, showValues = true }: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="w-full overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0" style={{ minHeight: height }}>
      <div className="flex items-end gap-1 sm:gap-2 h-full" style={{ height }}>
        {data.map((d, i) => {
          const barHeight = (d.value / max) * 100;
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full gap-1 min-w-[36px]"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {showValues && (
                <span
                  className={`text-[10px] sm:text-xs font-medium transition-opacity duration-200 ${
                    isHovered ? 'text-gray-900 opacity-100' : 'text-gray-600 opacity-70'
                  }`}
                >
                  {d.value}
                </span>
              )}
              <div
                className="w-full max-w-[40px] rounded-t-lg transition-all duration-500 min-h-[4px] cursor-pointer"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: d.color || '#3b82f6',
                  opacity: isHovered ? 1 : 0.85,
                  transform: isHovered ? 'scaleX(1.1)' : 'scaleX(1)',
                }}
              />
              <span className="text-[9px] sm:text-xs text-gray-500 truncate w-full text-center leading-tight">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Line Chart ──────────────────────────────────────────────────────────────

interface LineChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function LineChart({ data, height = 200, color = '#06D6A0', formatValue }: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.value), 1);
  const paddingX = 10;
  const paddingY = 20;
  const viewWidth = 500;
  const viewHeight = height;
  const chartW = viewWidth - paddingX * 2;
  const chartH = viewHeight - paddingY * 2;

  if (data.length === 0) {
    return <div className="text-center text-gray-400 py-8 text-sm">No data</div>;
  }

  const coords = data.map((d, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = paddingY + chartH - (d.value / max) * chartH;
    return { x, y };
  });

  const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');
  const areaPoints = `${coords[0].x},${paddingY + chartH} ${polylinePoints} ${coords[coords.length - 1].x},${paddingY + chartH}`;

  return (
    <div className="w-full relative">
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label={`Line chart with ${data.length} data points`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = paddingY + chartH - pct * chartH;
          return (
            <line key={pct} x1={paddingX} y1={y} x2={viewWidth - paddingX} y2={y} stroke="#f3f4f6" strokeWidth="1" aria-hidden="true" />
          );
        })}
        {/* Area fill */}
        <polygon points={areaPoints} fill={color} opacity="0.08" aria-hidden="true" />
        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Data points */}
        {coords.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hoveredIndex === i ? 6 : 4}
              fill={hoveredIndex === i ? color : 'white'}
              stroke={color}
              strokeWidth="2"
              className="cursor-pointer transition-all duration-200"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
            {hoveredIndex === i && (
              <>
                <rect
                  x={c.x - 30}
                  y={c.y - 30}
                  width="60"
                  height="20"
                  rx="4"
                  fill="#1f2937"
                />
                <text
                  x={c.x}
                  y={c.y - 17}
                  textAnchor="middle"
                  fill="white"
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatValue ? formatValue(data[i].value) : data[i].value}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-1 sm:px-2 mt-1 overflow-hidden">
        {data.map((d, i) => (
          <span
            key={i}
            className={`text-[9px] sm:text-xs truncate ${hoveredIndex === i ? 'text-gray-900 font-medium' : 'text-gray-400'}`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
}

export function DonutChart({ data, size = 160, centerLabel = 'Total' }: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const center = size / 2;
  const radius = size / 2 - 10;
  const innerRadius = radius * 0.6;
  const strokeWidth = radius - innerRadius;
  let cumulative = 0;

  const segments = data.map((d) => {
    const start = cumulative;
    const angle = (d.value / total) * 360;
    cumulative += angle;
    return { ...d, startAngle: start, endAngle: start + angle };
  });

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
  }

  const midRadius = (radius + innerRadius) / 2;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <svg width={size} height={size} className="flex-shrink-0 max-w-[140px] sm:max-w-none w-auto h-auto sm:w-[160px] sm:h-[160px]" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Donut chart showing ${data.map(d => `${d.label}: ${d.value}`).join(', ')}`}>
        {segments.map((seg, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <path
              key={i}
              d={describeArc(center, center, midRadius, seg.startAngle, seg.endAngle)}
              fill="none"
              stroke={seg.color}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              className="cursor-pointer transition-all duration-200"
              opacity={hoveredIndex !== null && !isHovered ? 0.4 : 1}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}
        <text x={center} y={center - 6} textAnchor="middle" className="text-lg font-bold" fill="#111827">
          {total}
        </text>
        <text x={center} y={center + 10} textAnchor="middle" className="text-xs" fill="#6b7280">
          {centerLabel}
        </text>
      </svg>
      <div className="space-y-1.5 sm:space-y-2 w-full sm:w-auto">
        {data.map((d, i) => {
          const isHovered = hoveredIndex === i;
          const pct = Math.round((d.value / total) * 100);
          return (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs sm:text-sm cursor-pointer transition-all duration-200 ${
                isHovered ? 'scale-105' : ''
              }`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: d.color }}
                aria-hidden="true"
              />
              <span className={`${isHovered ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                {d.label}
              </span>
              <span className="font-medium text-gray-900 ml-auto">{d.value}</span>
              <span className="text-xs text-gray-400">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
