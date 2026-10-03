import type { NextRequest } from "next/server";

/**
 * Same-origin development bridge. It lets a real phone use one HTTPS tunnel for
 * the seller console and API instead of trying to call `localhost:4000` on the
 * phone itself. The destination is fixed by the server environment; no part of
 * the incoming URL can select another host.
 */
async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.map(encodeURIComponent).join("/");
  const origin = (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000"
  ).replace(/\/+$/, "");
  const url = `${origin}/api/v1/${path}${request.nextUrl.search}`;
  const headers = new Headers({ Accept: request.headers.get("accept") ?? "application/json" });
  for (const name of ["authorization", "content-type", "x-shop-id"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  const upstream = await fetch(url, { method: request.method, headers, body, cache: "no-store" });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control", "x-content-type-options"] as const) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Referrer-Policy", "no-referrer");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
