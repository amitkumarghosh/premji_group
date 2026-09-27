import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createExpressApp } from './src/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
  console.log('🏁 Starting Premji Groups Enterprise Operations Server...');
  const app = await createExpressApp();

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    console.log('⚡ Mounting Vite server middleware in development mode...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    
    app.use(vite.middlewares);
    
    // SPA fallback route for front-end routers
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(url, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    console.log('📦 Serving compiled static bundle in production mode...');
    const distPath = path.resolve(__dirname, 'dist');
    
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Premji Enterprise Portal ready at http://localhost:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('🔴 Critical Server Bootstrap Failure:', e);
});
