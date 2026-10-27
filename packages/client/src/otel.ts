// OpenTelemetry export, kept out of the main entry so apps that don't use it don't ship it.
export { createOtelExporter } from "./export/otel.js";
export type { OtelExporterOptions, OtelMeterLike } from "./export/otel.js";
