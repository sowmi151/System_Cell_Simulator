import { simulate } from '../../../lib/simulator.mjs';
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 150000) return Response.json({ error: 'Session payload is too large.' }, { status: 413 });
    const payload = JSON.parse(body);
    return Response.json({ state: simulate(payload.commands) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid simulation request.' }, { status: 400 });
  }
}
