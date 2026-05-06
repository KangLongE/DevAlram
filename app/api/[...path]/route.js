const backendBaseUrl = (
  process.env.BACKEND_BASE_URL || "http://localhost:8083"
).replace(/\/+$/, "");

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "www-authenticate",
]);

export const dynamic = "force-dynamic";

async function proxyToBackend(request, context) {
  const params = await context.params;
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path}${sourceUrl.search}`, backendBaseUrl);
  const headers = new Headers(request.headers);

  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }

  headers.set("ngrok-skip-browser-warning", "true");

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "follow",
  });

  const responseHeaders = new Headers(response.headers);
  for (const header of hopByHopHeaders) {
    responseHeaders.delete(header);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
