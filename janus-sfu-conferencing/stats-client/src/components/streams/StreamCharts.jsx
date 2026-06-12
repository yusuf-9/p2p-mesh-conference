import { useMemo, useState } from 'react';
import NoDataPlaceholder from '../connections/NoDataPlaceholder';
import MetricChartPanel from '../charts/MetricChartPanel';
import StreamQualityBar from './StreamQualityBar';
import {
  buildChartRows,
  buildQualitySegments,
  formatTooltipValue,
  formatYAxisValue,
  getChartTabs,
  getStreamSeries,
  getStreamWindowMs,
  hasStreamChartData,
} from '../../lib/streamTimeSeries';

const VIEW_MODES = [
  { id: 'averages', label: 'Averages' },
  { id: 'totals', label: 'Totals' },
];

export default function StreamCharts({ stream, streamTimeSeries }) {
  const [activeTab, setActiveTab] = useState('latency');
  const [viewMode, setViewMode] = useState('totals');

  const rawSeries = getStreamSeries(streamTimeSeries, stream.id);
  const chartTabs = useMemo(() => getChartTabs(stream), [stream]);
  const { startMs, endMs } = getStreamWindowMs(stream);

  const qualitySegments = useMemo(
    () => buildQualitySegments(rawSeries?.meta?.quality, startMs, endMs),
    [rawSeries, startMs, endMs]
  );

  const tabDef = chartTabs.find((t) => t.id === activeTab) ?? chartTabs[0];
  const { rows, series } = useMemo(
    () =>
      buildChartRows(rawSeries, activeTab, stream.direction, {
        mode: tabDef?.hasViewMode ? viewMode : 'totals',
      }),
    [rawSeries, activeTab, stream.direction, tabDef?.hasViewMode, viewMode]
  );

  if (!hasStreamChartData(rawSeries)) {
    return (
      <div className="metric-charts">
        <NoDataPlaceholder message="No stream time series (reprocess with schema 1.2)" />
      </div>
    );
  }

  const effectiveTab = tabDef?.id ?? 'latency';

  return (
    <div className="metric-charts">
      <div className="metric-charts-toolbar">
        <div className="metric-charts-tabs">
          {chartTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`metric-charts-tab${
                effectiveTab === tab.id ? ' metric-charts-tab-active' : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabDef?.hasViewMode && (
          <div className="metric-charts-view">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`metric-charts-view-btn${
                  viewMode === mode.id ? ' metric-charts-view-btn-active' : ''
                }`}
                onClick={() => setViewMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <StreamQualityBar segments={qualitySegments} />
      <MetricChartPanel
        rows={rows}
        series={series}
        formatYAxis={(value) => formatYAxisValue(value, effectiveTab, viewMode)}
        formatTooltip={(value, spec) =>
          formatTooltipValue(value, spec, effectiveTab, viewMode)
        }
      />
    </div>
  );
}
