import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTooltipValue, formatYAxisValue } from '../../lib/pairTimeSeries';

function ChartTooltip({ active, payload, label, tabId, mode, series }) {
  if (!active || !payload?.length) return null;

  const seriesByKey = Object.fromEntries(series.map((s) => [s.key, s]));

  return (
    <div className="pair-chart-tooltip">
      <div className="pair-chart-tooltip-time">{label}</div>
      {payload.map((entry) => {
        const spec = seriesByKey[entry.dataKey];
        if (!spec || entry.value == null) return null;
        return (
          <div key={entry.dataKey} className="pair-chart-tooltip-row">
            <span
              className="pair-chart-tooltip-dot"
              style={{ backgroundColor: entry.color }}
            />
            <span className="pair-chart-tooltip-label">{spec.label}</span>
            <span className="pair-chart-tooltip-value">
              {formatTooltipValue(entry.value, spec, tabId, mode)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PairChartPanel({ rows, series, tabId, mode }) {
  if (!rows.length || !series.length) {
    return <div className="pair-chart-empty">No chart data for this tab</div>;
  }

  const leftSeries = series.filter((s) => s.yAxis !== 'right');
  const rightSeries = series.filter((s) => s.yAxis === 'right');
  const hasDualAxis = leftSeries.length > 0 && rightSeries.length > 0;

  return (
    <div className="pair-chart-panel">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 8, right: hasDualAxis ? 16 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
          <XAxis
            dataKey="tLabel"
            tick={{ fontSize: 10, fill: '#666' }}
            tickLine={false}
            axisLine={{ stroke: '#ddd' }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#666' }}
            tickLine={false}
            axisLine={{ stroke: '#ddd' }}
            width={52}
            tickFormatter={(v) => formatYAxisValue(v, tabId, mode)}
          />
          {hasDualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#666' }}
              tickLine={false}
              axisLine={{ stroke: '#ddd' }}
              width={40}
              tickFormatter={(v) => String(Math.round(v))}
            />
          )}
          <Tooltip
            content={<ChartTooltip tabId={tabId} mode={mode} series={series} />}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((spec) => (
            <Line
              key={spec.key}
              type="monotone"
              dataKey={spec.key}
              name={spec.label}
              stroke={spec.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              yAxisId={spec.yAxis === 'right' ? 'right' : 'left'}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
