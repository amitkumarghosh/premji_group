import { createExpressApp } from '../server.ts';

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      appPromise = createExpressApp();
    }
    const app = await appPromise;
    if (req.url && !req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    return app(req, res);
  } catch (err: any) {
    console.error('Fatal Serverless Handler Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Server Initialization Failure',
      details: err?.message || String(err)
    }));
  }
}
