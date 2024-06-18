import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:5000", // Adjust this to match your WebSocket server URL
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
