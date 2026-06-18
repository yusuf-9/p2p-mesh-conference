import type { PatchConfig, TraceCallback } from '../types.js';
import type { PatchWindow } from './types.js';
import { wrapEnumerateDevices, wrapGetUserMedia } from './media.js';
import { wrapRTCPeerConnection } from './peer-connection.js';

export interface PatchContext {
  target: PatchWindow;
  getStatsInterval: number;
}

export interface BrowserPatch {
  readonly name: keyof PatchConfig | string;
  apply(trace: TraceCallback, context: PatchContext): void;
}

export class PatchRegistry {
  private started = false;

  constructor(
    private readonly patches: BrowserPatch[],
    private readonly context: PatchContext,
  ) {}

  start(trace: TraceCallback): void {
    if (this.started) return;
    for (const patch of this.patches) {
      patch.apply(trace, this.context);
    }
    this.started = true;
  }

  get isStarted(): boolean {
    return this.started;
  }
}

export const peerConnectionPatch: BrowserPatch = {
  name: 'peerConnection',
  apply(trace, { target, getStatsInterval }) {
    wrapRTCPeerConnection(trace, target, { getStatsInterval });
  },
};

export const mediaPatch: BrowserPatch = {
  name: 'media',
  apply(trace, { target }) {
    wrapGetUserMedia(trace, target);
  },
};

export const enumerateDevicesPatch: BrowserPatch = {
  name: 'enumerateDevices',
  apply(trace, { target }) {
    wrapEnumerateDevices(trace, target);
  },
};

export function resolvePatches(config: PatchConfig): BrowserPatch[] {
  const patches: BrowserPatch[] = [];

  if (config.peerConnection !== false) {
    patches.push(peerConnectionPatch);
  }
  if (config.media !== false) {
    patches.push(mediaPatch);
  }
  if (config.enumerateDevices !== false) {
    patches.push(enumerateDevicesPatch);
  }

  return patches;
}

export function resolveGetStatsInterval(config: PatchConfig, fallback: number): number {
  const pc = config.peerConnection;
  if (pc === false) return fallback;
  if (typeof pc === 'object' && typeof pc.getStatsInterval === 'number') {
    return pc.getStatsInterval;
  }
  return fallback;
}
