import { vitePlugin as remix } from "@remix-run/dev";
import { vercelPreset } from "@vercel/remix/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function hostFromUrl(value?: string) {
  if (!value) return undefined;

  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0];
  }
}

const shopifyTunnelHost = hostFromUrl(
  process.env.SHOPIFY_CLI_TUNNEL_URL || process.env.SHOPIFY_APP_URL
);

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      presets: [vercelPreset()]
    }),
    tsconfigPaths()
  ],
  server: {
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "::1",
      "trycloudflare.com",
      ".trycloudflare.com",
      "ngrok-free.app",
      ".ngrok-free.app",
      "ngrok.io",
      ".ngrok.io",
      ...(shopifyTunnelHost ? [shopifyTunnelHost] : [])
    ],
    host: "0.0.0.0",
    port: Number(process.env.PORT || 3000)
  }
});
