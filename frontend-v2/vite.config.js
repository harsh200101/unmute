import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:5000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // host: true binds 0.0.0.0 so devices on the same LAN can hit this
      // (e.g. testing a meeting between two laptops). Cookies + the /api
      // proxy continue to work because the browser still sees a single
      // origin (the Vite host:5173) for both UI and API.
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
