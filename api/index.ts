import { createExpressApp } from '../server.ts';

let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createExpressApp();
  }
  return cachedApp(req, res);
}
