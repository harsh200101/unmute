import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:5000';
  return {
    plugins: [react()],
    // Match the existing Render Static Site config (publishPath: build).
    // Vite defaults to `dist/`; renaming the output dir here saves a manual
    // dashboard change.
    build: {
      outDir: 'build',
      emptyOutDir: true,
    },
    // `@/...` resolves to `src/...` — matches the shadcn convention so any
    // upstream component snippets that import `@/lib/utils` or
    // `@/components/ui/...` work without rewrites.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
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
