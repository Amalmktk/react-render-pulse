import { createCollector, memoryStorage, type Storage } from "react-render-pulse-collector";
import { postgresStorage } from "react-render-pulse-collector/postgres";

// Postgres in production (e.g. Supabase or Neon); in memory locally, so the
// example runs without a database. Swap in jsonFileStorage on a server with a disk.
const storage: Storage = process.env.DATABASE_URL
  ? postgresStorage({ url: process.env.DATABASE_URL })
  : memoryStorage();

const collect = createCollector({ storage });

export const POST = collect;
export const OPTIONS = collect;
