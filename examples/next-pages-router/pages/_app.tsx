import type { AppProps } from "next/app";
import Router, { useRouter } from "next/router";
import { initRenderPulse, RenderMonitor } from "react-render-pulse";

// Module scope runs once, before the first render. The window check skips the
// server render, where initRenderPulse would do nothing anyway.
if (typeof window !== "undefined") {
  initRenderPulse({
    endpoint: "/api/render-pulse",
    sampleRate: Number(process.env.NEXT_PUBLIC_RENDER_PULSE_SAMPLE_RATE ?? 1),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    // The Pages Router knows the route template (e.g. /orders/[id]), so use it.
    // Router throws until it's created, so fall back to the raw path for that moment.
    getRoute: () => {
      try {
        return Router.pathname;
      } catch {
        return location.pathname;
      }
    },
  });
}

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  // One area per page, named after the route template.
  return (
    <RenderMonitor id={`page:${pathname}`}>
      <Component {...pageProps} />
    </RenderMonitor>
  );
}
