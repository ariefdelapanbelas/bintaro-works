import { NextResponse, type NextRequest } from "next/server";
import { handleApi, type Method } from "@/core/api/router";
import { getDeps } from "@/server/db";
import { SESSION_COOKIE, cookieOptions, signSession, verifySession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx, method: Method) {
  const { path } = await ctx.params;
  // Proteksi CSRF sederhana: mutasi harus berasal dari origin yang sama.
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Origin tidak diizinkan" } }, { status: 403 });
    }
  }

  let body: unknown = undefined;
  if (method !== "GET" && method !== "DELETE") {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Body JSON tidak valid" } }, { status: 400 });
      }
    }
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const result = await handleApi(
    await getDeps(),
    {
      method,
      path: "/" + path.map(encodeURIComponent).join("/"),
      query: Object.fromEntries(req.nextUrl.searchParams.entries()),
      body,
      session,
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || undefined,
    },
    (e) => console.error("[api]", method, req.nextUrl.pathname, e),
  );

  const res = NextResponse.json(result.body, { status: result.status });
  const isHttps = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.headers.set("Cache-Control", "no-store");
  if (result.setSession) {
    res.cookies.set(SESSION_COOKIE, await signSession(result.setSession), cookieOptions(isHttps));
  } else if (result.setSession === null) {
    res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(isHttps), maxAge: 0 });
  }
  return res;
}

export const GET = (req: NextRequest, ctx: Ctx) => handle(req, ctx, "GET");
export const POST = (req: NextRequest, ctx: Ctx) => handle(req, ctx, "POST");
export const PATCH = (req: NextRequest, ctx: Ctx) => handle(req, ctx, "PATCH");
export const DELETE = (req: NextRequest, ctx: Ctx) => handle(req, ctx, "DELETE");
