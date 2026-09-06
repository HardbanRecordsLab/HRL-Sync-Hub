import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Code splitting is done at the route level (React.lazy in App.tsx). We do NOT
// hand-split node_modules — separating React from its consumers into different
// chunks breaks module init order ("Cannot read properties of undefined
// (reading 'createContext')"). Let Rollup chunk vendor code from the import graph.
export default defineConfig(() => ({
  server: { host: "::", port: 8080 },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
}));
