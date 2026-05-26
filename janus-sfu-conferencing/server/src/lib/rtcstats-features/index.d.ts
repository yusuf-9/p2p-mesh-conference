/** Type declarations for the plain-JS rtcstats-features package. */

export declare function extract(
  userId: string,
  filePath: string,
  processedDir: string
): Promise<Record<string, unknown> | void>;

export declare function processFile(
  userId: string,
  filePath: string
): Promise<Record<string, unknown> | void>;

export declare function processRTCStatsDump(
  userId: string,
  filePath: string,
  processedDir: string
): Promise<void>;

export declare function extractClientFeatures(clientTrace: unknown): unknown;
export declare function extractConnectionFeatures(
  clientTrace: unknown,
  peerConnectionTrace: unknown
): unknown;
export declare function extractTrackFeatures(
  clientTrace: unknown,
  peerConnectionTrace: unknown,
  trackInformation: unknown
): unknown;
