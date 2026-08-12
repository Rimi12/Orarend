// Vercel Serverless Function for Live Multi-User Cloud Sync
const memoryStore: Record<string, { exists: boolean; data: any; _updatedBy: string; _updatedAt: number }> = {};

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const room = String(req.query?.room || req.body?.room || 'default');
    const dtype = String(req.query?.type || req.body?.type || 'main');
    const key = `${room}_${dtype}`;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { data, clientId } = body || {};

      memoryStore[key] = {
        exists: true,
        data,
        _updatedBy: clientId || 'unknown',
        _updatedAt: Date.now() / 1000,
      };

      return res.status(200).json({ status: 'ok', key, updatedAt: memoryStore[key]._updatedAt });
    }

    if (req.method === 'GET') {
      const record = memoryStore[key] || { exists: false };
      return res.status(200).json(record);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal Error' });
  }
}
