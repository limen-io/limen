import { dispatchMcpRequest } from '../../server';

// Slice 1 local-only security (first-slice.md §3, "Segurança local"):
// since the dev server uses real Gmail credentials, we reject any HTTP request
// whose Origin header is set and not localhost. Requests without Origin (e.g.,
// curl or the Claude Code MCP client over loopback) pass through.
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

function rejectOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (origin === null) return null; // non-browser client; accept
  if (ALLOWED_ORIGINS.has(origin)) return null;
  return new Response('Forbidden: Origin not allowed', { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const blocked = rejectOrigin(request);
  if (blocked) return blocked;
  return dispatchMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  const blocked = rejectOrigin(request);
  if (blocked) return blocked;
  return dispatchMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  const blocked = rejectOrigin(request);
  if (blocked) return blocked;
  return dispatchMcpRequest(request);
}
