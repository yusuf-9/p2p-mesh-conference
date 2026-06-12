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

function ChartTooltip({ active, payload, label, series, formatTooltip }) {
  if (!active || !payload?.length) return null;

  const seriesByKey = Object.fromEntries(series.map((s) => [s.key, s]));

  return (
    <div className="metric-chart-tooltip">
      <div className="metric-chart-tooltip-time">{label}</div>
      {payload.map((entry) => {
        const spec = seriesByKey[entry.dataKey];
        if (!spec || entry.value == null) return null;
        return (
          <div key={entry.dataKey} className="metric-chart-tooltip-row">
            <span
              className="metric-chart-tooltip-dot"
              style={{ backgroundColor: entry.color }}
            />
            <span className="metric-chart-tooltip-label">{spec.label}</span>
            <span className="metric-chart-tooltip-value">
              {formatTooltip(entry.value, spec)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MetricChartPanel({
  rows,
  series,
  formatYAxis,
  formatTooltip,
  rightAxisFormatter,
}) {
  if (!rows.length || !series.length) {
    return <div className="metric-chart-empty">No chart data for this tab</div>;
  }

  const leftSeries = series.filter((s) => s.yAxis !== 'right');
  const rightSeries = series.filter((s) => s.yAxis === 'right');
  const hasDualAxis = leftSeries.length > 0 && rightSeries.length > 0;

  return (
    <div className="metric-chart-panel">
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
            tickFormatter={formatYAxis}
          />
          {hasDualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#666' }}
              tickLine={false}
              axisLine={{ stroke: '#ddd' }}
              width={40}
              tickFormatter={rightAxisFormatter ?? ((v) => String(Math.round(v)))}
            />
          )}
          <Tooltip
            content={
              <ChartTooltip series={series} formatTooltip={formatTooltip} />
            }
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
