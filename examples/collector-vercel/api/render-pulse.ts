import { createCollector } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

// A standalone collector as a Vercel Function. Set DATABASE_URL (e.g. a
// Supabase or Neon connection string) in the project's environment variables.
// The table is created on the first batch.
const collect = createCollector({
  storage: postgresStorage({ url: process.env.DATABASE_URL ?? "" }),
  // Only your sites can send batches.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "*") === "*" ? "*" : (process.env.ALLOWED_ORIGINS ?? "").split(","),
  onError: (error) => console.error("render-pulse collector:", error),
});

// Vercel's Web-standard function signature: one handler per HTTP method.
export const POST = collect;
export const OPTIONS = collect;
