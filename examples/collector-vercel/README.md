# Collector on Vercel

A standalone react-render-pulse collector, deployed as a Vercel Function with Postgres storage.

1. Create a Postgres database (Supabase, Neon, or Vercel Postgres) and copy its connection string.
2. Deploy this folder: `vercel deploy`.
3. In the Vercel project settings, set:
   - `DATABASE_URL`: the connection string.
   - `ALLOWED_ORIGINS`: your sites, comma-separated (e.g. `https://itzamal.in`), or `*`.
4. Point your app at it: `initRenderPulse({ endpoint: "https://<project>.vercel.app/api/render-pulse" })`.
5. Read the data: `npx react-render-pulse-viewer serve --db "$DATABASE_URL"`.

The `render_pulse_batches` table is created on the first batch.
