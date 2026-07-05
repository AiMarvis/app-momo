// @ts-check
import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";
import mdx from "@astrojs/mdx";

import { getSiteUrl } from "./src/config/site.ts";

export default defineConfig({
  site: getSiteUrl(),
  output: "static",
  integrations: [solid(), mdx()],
  server: {
    allowedHosts: ["www.kuku.mom", "kuku.mom"],
  },
  vite: {
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
