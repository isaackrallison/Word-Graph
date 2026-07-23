import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// Serve api/embed.ts at /api/embed during `npm run dev`, matching the route
// Vercel gives it in production.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/embed', (req, res) => {
        server
          .ssrLoadModule('/api/embed.ts')
          .then((mod) => (mod as { default: (q: unknown, s: unknown) => Promise<void> }).default(req, res))
          .catch((err) => {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'dev api error' }));
          });
      });
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), devApi()],
}));
