import type { NextRequest } from "next/server";

function upstream(token: string): string {
  const origin = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
    .replace(/\/+$/, "");
  return `${origin}/api/v1/public/location-captures/${encodeURIComponent(token)}`;
}

async function forward(request: NextRequest, token: string, method: "GET" | "POST") {
  const response = await fetch(upstream(token), {
    method,
    headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
    body: method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return forward(request, (await context.params).token, "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return forward(request, (await context.params).token, "POST");
}
