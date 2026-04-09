import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { streamAgentEvents, streamIntakeEvents } = require('../../../run_agent.js');

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { input, apiKey, mode, ground_data } = body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return new Response(JSON.stringify({ error: 'Missing or invalid "input" field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const generator = mode === 'intake'
          ? streamIntakeEvents(input.trim(), apiKey || null, ground_data || null)
          : streamAgentEvents(input.trim(), apiKey || null);
        for await (const event of generator) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
