import { useMemo, useState } from 'react';
import NoDataPlaceholder from './NoDataPlaceholder';
import PairStateBar from './PairStateBar';
import PairChartPanel from './PairChartPanel';
import {
  buildChartRows,
  buildStateSegments,
  CHART_TABS,
  getPairSeries,
  hasPairChartData,
} from '../../lib/pairTimeSeries';

const VIEW_MODES = [
  { id: 'averages', label: 'Averages' },
  { id: 'totals', label: 'Totals' },
];

export default function PairCharts({ pcId, pairEntry, pairTimeSeries, session }) {
  const [activeTab, setActiveTab] = useState('latency');
  const [viewMode, setViewMode] = useState('totals');

  const { transportId, pairId } = pairEntry;
  const rawSeries = getPairSeries(pairTimeSeries, pcId, transportId, pairId);

  const sessionStartMs = session?.start ?? null;
  const sessionEndMs = session?.end ?? null;

  const stateSegments = useMemo(
    () => buildStateSegments(rawSeries?.meta?.state, sessionStartMs, sessionEndMs),
    [rawSeries, sessionStartMs, sessionEndMs]
  );

  const tabDef = CHART_TABS.find((t) => t.id === activeTab) ?? CHART_TABS[0];
  const { rows, series } = useMemo(
    () =>
      buildChartRows(rawSeries, activeTab, {
        mode: tabDef.hasViewMode ? viewMode : 'totals',
      }),
    [rawSeries, activeTab, tabDef.hasViewMode, viewMode]
  );

  if (!hasPairChartData(rawSeries)) {
    return (
      <div className="metric-charts">
        <NoDataPlaceholder message="No connectivity time series (reprocess with schema 1.1)" />
      </div>
    );
  }

  return (
    <div className="metric-charts">
      <div className="metric-charts-toolbar">
        <div className="metric-charts-tabs">
          {CHART_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`metric-charts-tab${activeTab === tab.id ? ' metric-charts-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabDef.hasViewMode && (
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

      <PairStateBar segments={stateSegments} />
      <PairChartPanel rows={rows} series={series} tabId={activeTab} mode={viewMode} />
    </div>
  );
}
