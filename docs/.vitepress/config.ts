import { defineConfig } from "vitepress";

const repo = "https://github.com/Amalmktk/react-render-pulse";

export default defineConfig({
  title: "react-render-pulse",
  description: "Real-user render performance monitoring for React, at the component level.",
  // Served from GitHub Pages at https://amalmktk.github.io/react-render-pulse/.
  base: "/react-render-pulse/",
  // docs/README.md is the index for browsing the folder on GitHub, not a site page.
  srcExclude: ["README.md"],
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "API", link: "/api/client", activeMatch: "/api/" },
      { text: "Performance", link: "/guide/performance" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "Collecting results", link: "/guide/collecting-results" },
          { text: "Modes", link: "/guide/modes" },
          { text: "Choosing areas", link: "/guide/choosing-areas" },
          { text: "What we collect", link: "/guide/what-we-collect" },
          { text: "Collector and storage", link: "/guide/collector" },
          { text: "Viewer", link: "/guide/viewer" },
          { text: "Frameworks", link: "/guide/frameworks" },
          { text: "OpenTelemetry", link: "/guide/opentelemetry" },
          { text: "Performance", link: "/guide/performance" },
        ],
      },
      {
        text: "API reference",
        items: [
          { text: "react-render-pulse", link: "/api/client" },
          { text: "react-render-pulse-collector", link: "/api/collector" },
          { text: "react-render-pulse-viewer", link: "/api/viewer" },
        ],
      },
      {
        text: "Design decisions",
        items: [
          { text: "000: Gap note", link: "/decisions/000-gap-note" },
          { text: "001: Measurement modes", link: "/decisions/001-modes" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    search: { provider: "local" },
    footer: { message: "Released under the MIT License." },
  },
});
