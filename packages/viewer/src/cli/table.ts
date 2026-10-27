export interface Column<T> {
  header: string;
  value: (row: T) => string | number;
  /** Numbers are right-aligned by default. */
  align?: "left" | "right";
}

/** Renders rows as a plain-text table with aligned columns. */
export function renderTable<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const cells = rows.map((row) => columns.map((column) => format(column.value(row))));
  const widths = columns.map((column, i) =>
    Math.max(column.header.length, ...cells.map((row) => (row[i] ?? "").length)),
  );
  const aligns = columns.map(
    (column) => column.align ?? (rows.length > 0 && typeof column.value(rows[0] as T) === "number" ? "right" : "left"),
  );

  const line = (values: string[]) =>
    values
      .map((value, i) => (aligns[i] === "right" ? value.padStart(widths[i] ?? 0) : value.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();

  return [line(columns.map((c) => c.header)), line(widths.map((w) => "─".repeat(w))), ...cells.map(line)].join("\n");
}

function format(value: string | number): string {
  if (typeof value === "string") return value;
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(1);
}
