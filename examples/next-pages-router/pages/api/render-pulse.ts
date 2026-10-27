import { createCollector, memoryStorage, type Storage } from "react-render-pulse-collector";
import { toNodeListener } from "react-render-pulse-collector/node";
import { postgresStorage } from "react-render-pulse-collector/postgres";

// The collector reads and size-limits the raw body itself.
export const config = { api: { bodyParser: false } };

const storage: Storage = process.env.DATABASE_URL
  ? postgresStorage({ url: process.env.DATABASE_URL })
  : memoryStorage();

export default toNodeListener(createCollector({ storage }));
