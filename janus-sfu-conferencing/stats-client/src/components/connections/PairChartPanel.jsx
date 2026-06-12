import MetricChartPanel from '../charts/MetricChartPanel';
import { formatTooltipValue, formatYAxisValue } from '../../lib/pairTimeSeries';

export default function PairChartPanel({ rows, series, tabId, mode }) {
  return (
    <MetricChartPanel
      rows={rows}
      series={series}
      formatYAxis={(value) => formatYAxisValue(value, tabId, mode)}
      formatTooltip={(value, spec) => formatTooltipValue(value, spec, tabId, mode)}
    />
  );
}
