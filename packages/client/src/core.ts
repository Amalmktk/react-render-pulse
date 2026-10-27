// Framework-agnostic entry: no React imports, so it's safe in Server Components,
// route handlers, and plain Node. Everything here is also exported from the main entry.
export type {
  AreaReport,
  DeviceContext,
  Exporter,
  LongTaskEvent,
  LongTaskKind,
  LongTaskReport,
  Mode,
  ModeOption,
  Payload,
  RenderEvent,
  RenderPhase,
  SessionInfo,
  SessionSummary,
  WorstCase,
} from "./types.js";
export { HISTOGRAM_BOUNDS, histogramPercentile } from "./aggregate/histogram.js";
