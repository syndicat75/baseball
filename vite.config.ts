import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom Vite Plugin to emulate Vercel Serverless Functions in local development.
 * Automatically handles routing and injects VercelRequest/VercelResponse query parsing and status helpers.
 */
function apiMiddlewarePlugin() {
  return {
    name: 'api-middleware-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/')) {
          console.log(`[Vite API Middleware] Intercepted request: ${req.method} ${req.url}`);
          
          try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = parsedUrl.pathname;

            let apiPath = '';
            if (pathname === '/api/health') {
              apiPath = path.resolve(__dirname, 'api/health.ts');
            } else if (pathname === '/api/kbo/standings') {
              apiPath = path.resolve(__dirname, 'api/kbo/standings.ts');
            } else if (pathname === '/api/kbo/schedule') {
              apiPath = path.resolve(__dirname, 'api/kbo/schedule.ts');
            } else if (pathname === '/api/simulate') {
              apiPath = path.resolve(__dirname, 'api/simulate.ts');
            }

            if (apiPath && fs.existsSync(apiPath)) {
              // Dynamically import the typescript handler via Vite's ssrLoadModule
              const module = await server.ssrLoadModule(apiPath);
              const handler = module.default;

              // Parse and map query params
              const query: Record<string, string> = {};
              parsedUrl.searchParams.forEach((val, key) => {
                query[key] = val;
              });

              // Enrich request to match VercelRequest
              const extendedReq = Object.assign(req, {
                query,
                body: req.body || {}
              });

              // Enrich response to match VercelResponse
              const extendedRes = Object.assign(res, {
                status(code: number) {
                  res.statusCode = code;
                  return extendedRes;
                },
                json(data: any) {
                  if (!res.headersSent) {
                    res.setHeader('Content-Type', 'application/json');
                  }
                  res.end(JSON.stringify(data));
                  return extendedRes;
                }
              });

              await handler(extendedReq, extendedRes);
              return;
            } else {
              console.warn(`[Vite API Middleware] API Route not found on disk: ${pathname}`);
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                error: 'API route 없음', 
                details: `The requested path ${pathname} was not found on this server.`,
                errorType: 'API route 없음'
              }));
              return;
            }
          } catch (error: any) {
            console.error(`[Vite API Middleware] Error executing API route:`, error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              error: 'Internal Server Error', 
              details: error.message,
              errorType: 'HTML parser 실패'
            }));
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiMiddlewarePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
