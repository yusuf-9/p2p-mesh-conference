export function formatTime(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(ms) {
  if (ms == null) return 'N/A';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatBitrate(kbps) {
  if (kbps == null || Number.isNaN(kbps)) return 'N/A';
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mb/s`;
  return `${kbps.toFixed(1)} Kb/s`;
}

export function formatRange(min, max, formatter = (v) => String(v)) {
  if (min == null && max == null) return '';
  if (min == null) return formatter(max);
  if (max == null) return formatter(min);
  if (min === max) return formatter(min);
  return `${formatter(min)}-${formatter(max)}`;
}

export function formatMs(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `${value.toFixed(decimals)} ms`;
}

export function formatPacketLoss(value) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `${value.toFixed(1)} %`;
}

export function formatMos(value) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return value.toFixed(1);
}

export function formatBrowser(userAgentData) {
  if (!userAgentData?.brands?.length) return 'N/A';
  const chrome = userAgentData.brands.find((b) => b.brand === 'Google Chrome');
  const chromium = userAgentData.brands.find((b) => b.brand === 'Chromium');
  const brand = chrome ?? chromium ?? userAgentData.brands[0];
  return `${brand.brand} ${brand.version}`;
}

/**
 * Progress fill for a metric within its observed range.
 * Expands min/max to include avg when the average falls outside the stored extrema
 * (e.g. bitrate avg 0 with min=max=27.5 from a single peak interval).
 */
export function barPercent(avg, min, max, { invert = false } = {}) {
  if (avg == null || Number.isNaN(avg)) return 0;

  let lo = min ?? avg;
  let hi = max ?? avg;

  if (min != null && max != null) {
    lo = Math.min(lo, avg);
    hi = Math.max(hi, avg);
  }

  let pct;
  if (hi <= lo) {
    if (hi <= 0 && avg <= 0) {
      pct = 0;
    } else if (hi > 0) {
      pct = (avg / hi) * 100;
    } else {
      pct = 0;
    }
  } else {
    pct = ((avg - lo) / (hi - lo)) * 100;
  }

  pct = Math.min(100, Math.max(0, pct));

  if (invert) {
    if (avg === 0 && (max ?? 0) === 0 && (min ?? 0) === 0) return 100;
    return 100 - pct;
  }

  return pct;
}
