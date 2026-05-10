import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Aperture UI build config.
// The widget-mode + Supabase Edge plumbing from upstream goal_ui has been
// dropped; this is a single SPA that mounts the `aperture-wasm` artifact at
// `/aperture` and posts swarm-bus envelopes via `window.postMessage`.
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
