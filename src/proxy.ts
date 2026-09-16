import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/server/session";

// Next.js 16: "middleware" berganti nama menjadi "proxy" (runtime Node.js).
// Proxy hanya mengarahkan halaman; otorisasi sebenarnya tetap dicek di API router.

const PUBLIC_PATHS = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session) {
    if (isPublic) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  const home = session.role === "CUSTOMER" ? "/portal" : "/dashboard";
  if (isPublic || pathname === "/") return NextResponse.redirect(new URL(home, req.url));
  if (session.role === "CUSTOMER" && !pathname.startsWith("/portal")) return NextResponse.redirect(new URL("/portal", req.url));
  if (session.role !== "CUSTOMER" && pathname.startsWith("/portal")) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  // Lewati API, aset statis, dan file berekstensi.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
