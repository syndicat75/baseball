/**
 * @file health.ts
 * @description Vercel serverless function endpoint for application health checking.
 * Returns service identifier and server ISO timestamp.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Handles incoming health-check requests.
 * 
 * @param req - Incoming Vercel HTTP request object
 * @param res - Outgoing Vercel HTTP response object
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[health] [REQUEST] ${req.method} ${req.url} - At: ${new Date().toISOString()}`);

  try {
    const responseBody = {
      ok: true,
      service: 'kbo-postseason-simulator',
      time: new Date().toISOString()
    };

    console.log(`[health] [RESPONSE] Status: 200 - Body: ${JSON.stringify(responseBody)}`);
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error(`[health] [ERROR] Health check failed:`, error);
    return res.status(500).json({
      ok: false,
      error: 'Health check failed',
      details: error.message
    });
  }
}
