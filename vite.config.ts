import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      inspectorPort: 9529, // Set inspector port to avoid conflicts
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5473,
    host: "127.0.0.1", // Bind to 127.0.0.1 so Cloudflare tunnel can connect
    strictPort: true,
    allowedHosts: ["llmdj.motin.eu"],
  },
});
