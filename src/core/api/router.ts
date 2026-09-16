// Router API yang tidak bergantung framework.
// Dipakai oleh Next.js (src/app/api/[...path]/route.ts) dan oleh demo in-browser,
// sehingga aturan akses, validasi, dan logika bisnis hanya ditulis sekali.
import { AppError } from "../domain/errors";
import { can, type Permission } from "../domain/permissions";
import type { AuthContext } from "../domain/types";
import type { Deps } from "../repo/types";
import * as auth from "../services/auth";
import * as billing from "../services/billing";
import * as bookings from "../services/bookings";
import { makeSvc, type Svc } from "../services/context";
import * as contracts from "../services/contracts";
import * as crm from "../services/crm";
import * as customers from "../services/customers";
import * as dash from "../services/dashboard";
import * as portal from "../services/portal";
import * as settings from "../services/settings";
import * as spaces from "../services/spaces";

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequest {
  method: Method;
  path: string; // tanpa prefix /api, mis. "/leads/abc"
  query: Record<string, string>;
  body: unknown;
  session: auth.SessionPayload | null;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** Instruksi sesi untuk adapter (set cookie / hapus cookie). */
  setSession?: auth.SessionPayload | null;
}

interface Ctx {
  s: Svc;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

type Handler = (c: Ctx) => Promise<unknown>;
interface Route {
  method: Method;
  pattern: string;
  perm: Permission;
  handler: Handler;
  regex: RegExp;
  keys: string[];
}

const routes: Route[] = [];

function route(method: Method, pattern: string, perm: Permission, handler: Handler) {
  const keys: string[] = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/\//g, "\\/").replace(/:([a-zA-Z]+)/g, (_, k) => {
        keys.push(k);
        return "([^\\/]+)";
      }) +
      "\\/?$",
  );
  routes.push({ method, pattern, perm, handler, regex, keys });
}

// ---- Dashboard & pencarian
route("GET", "/dashboard", "dashboard.view", ({ s }) => dash.dashboard(s));
route("GET", "/search", "dashboard.view", ({ s, query }) => dash.globalSearch(s, query.q ?? ""));
route("GET", "/staff", "crm.view", ({ s }) => crm.staffOptions(s));

// ---- CRM
route("GET", "/leads", "crm.view", ({ s, query }) => crm.listLeads(s, query));
route("GET", "/leads/pipeline", "crm.view", ({ s }) => crm.pipelineSummary(s));
route("POST", "/leads", "crm.manage", ({ s, body }) => crm.createLead(s, body));
route("GET", "/leads/:id", "crm.view", ({ s, params }) => crm.getLead(s, params.id));
route("PATCH", "/leads/:id", "crm.manage", ({ s, params, body }) => crm.updateLead(s, params.id, body));
route("DELETE", "/leads/:id", "crm.manage", ({ s, params }) => crm.deleteLead(s, params.id));
route("POST", "/leads/:id/stage", "crm.manage", ({ s, params, body }) => crm.moveLeadStage(s, params.id, body));
route("POST", "/leads/:id/activities", "crm.manage", ({ s, params, body }) => crm.addLeadActivity(s, params.id, body));
route("POST", "/leads/:id/convert", "crm.manage", ({ s, params }) => crm.convertLead(s, params.id));

// ---- Pelanggan
route("GET", "/customers", "customers.view", ({ s, query }) => customers.listCustomers(s, query));
route("POST", "/customers", "customers.manage", ({ s, body }) => customers.createCustomer(s, body));
route("GET", "/customers/:id", "customers.view", ({ s, params }) => customers.getCustomer(s, params.id));
route("PATCH", "/customers/:id", "customers.manage", ({ s, params, body }) => customers.updateCustomer(s, params.id, body));
route("DELETE", "/customers/:id", "customers.manage", ({ s, params }) => customers.deleteCustomer(s, params.id));
route("POST", "/customers/:id/portal-users", "customers.manage", ({ s, params, body }) => customers.createPortalUser(s, params.id, body));
route("DELETE", "/customers/:id/portal-users/:mid", "customers.manage", ({ s, params }) => customers.removePortalUser(s, params.id, params.mid));

// ---- Ruang
route("GET", "/locations", "spaces.view", ({ s }) => spaces.listLocations(s));
route("POST", "/locations", "spaces.manage", ({ s, body }) => spaces.createLocation(s, body));
route("PATCH", "/locations/:id", "spaces.manage", ({ s, params, body }) => spaces.updateLocation(s, params.id, body));
route("POST", "/floors", "spaces.manage", ({ s, body }) => spaces.createFloor(s, body));
route("PATCH", "/floors/:id", "spaces.manage", ({ s, params, body }) => spaces.updateFloor(s, params.id, body));
route("DELETE", "/floors/:id", "spaces.manage", ({ s, params }) => spaces.deleteFloor(s, params.id));
route("GET", "/floors/:id/plan", "spaces.view", ({ s, params }) => spaces.floorPlan(s, params.id));
route("GET", "/spaces", "spaces.view", ({ s, query }) => spaces.listSpaces(s, query));
route("GET", "/spaces/stats", "spaces.view", ({ s }) => spaces.spaceStats(s));
route("POST", "/spaces", "spaces.manage", ({ s, body }) => spaces.createSpace(s, body));
route("GET", "/spaces/:id", "spaces.view", ({ s, params }) => spaces.getSpace(s, params.id));
route("PATCH", "/spaces/:id", "spaces.manage", ({ s, params, body }) => spaces.updateSpace(s, params.id, body));
route("DELETE", "/spaces/:id", "spaces.manage", ({ s, params }) => spaces.deleteSpace(s, params.id));

// ---- Katalog
route("GET", "/products", "customers.view", ({ s, query }) => spaces.listProducts(s, query));
route("POST", "/products", "catalog.manage", ({ s, body }) => spaces.createProduct(s, body));
route("PATCH", "/products/:id", "catalog.manage", ({ s, params, body }) => spaces.updateProduct(s, params.id, body));
route("DELETE", "/products/:id", "catalog.manage", ({ s, params }) => spaces.deleteProduct(s, params.id));

// ---- Kontrak
route("GET", "/contracts", "contracts.view", ({ s, query }) => contracts.listContracts(s, query));
route("POST", "/contracts", "contracts.manage", ({ s, body }) => contracts.createContract(s, body));
route("GET", "/contracts/:id", "contracts.view", ({ s, params }) => contracts.getContract(s, params.id));
route("PATCH", "/contracts/:id", "contracts.manage", ({ s, params, body }) => contracts.updateContract(s, params.id, body));
route("DELETE", "/contracts/:id", "contracts.manage", ({ s, params }) => contracts.deleteContract(s, params.id));
route("POST", "/contracts/:id/activate", "contracts.manage", ({ s, params }) => contracts.activateContract(s, params.id));
route("POST", "/contracts/:id/terminate", "contracts.manage", ({ s, params, body }) => contracts.terminateContract(s, params.id, body));
route("POST", "/contracts/:id/renew", "contracts.manage", ({ s, params, body }) => contracts.renewContract(s, params.id, body));

// ---- Booking
route("GET", "/bookings", "bookings.view", ({ s, query }) => bookings.listBookings(s, query));
route("GET", "/bookings/availability", "bookings.view", ({ s, query }) => bookings.availability(s, query.spaceId ?? "", query.date ?? ""));
route("POST", "/bookings", "bookings.manage", ({ s, body }) => bookings.createBooking(s, body));
route("PATCH", "/bookings/:id", "bookings.manage", ({ s, params, body }) => bookings.updateBooking(s, params.id, body));
route("POST", "/bookings/:id/cancel", "bookings.manage", ({ s, params }) => bookings.cancelBooking(s, params.id));

// ---- Tagihan
route("GET", "/invoices", "billing.view", ({ s, query }) => billing.listInvoices(s, query));
route("GET", "/invoices/summary", "billing.view", ({ s }) => billing.invoiceSummary(s));
route("POST", "/invoices", "billing.manage", ({ s, body }) => billing.createInvoice(s, body));
route("POST", "/invoices/generate", "billing.manage", ({ s, body }) => billing.generateRecurringInvoices(s, body));
route("GET", "/invoices/:id", "billing.view", ({ s, params }) => billing.getInvoice(s, params.id));
route("PATCH", "/invoices/:id", "billing.manage", ({ s, params, body }) => billing.updateInvoice(s, params.id, body));
route("POST", "/invoices/:id/send", "billing.manage", ({ s, params }) => billing.sendInvoice(s, params.id));
route("POST", "/invoices/:id/void", "billing.manage", ({ s, params }) => billing.voidInvoice(s, params.id));
route("POST", "/invoices/:id/payments", "billing.manage", ({ s, params, body }) => billing.recordPayment(s, params.id, body));
route("GET", "/payments", "billing.view", ({ s }) => billing.listPayments(s));
route("DELETE", "/payments/:id", "billing.manage", ({ s, params }) => billing.deletePayment(s, params.id));

// ---- Permintaan layanan
route("GET", "/requests", "requests.manage", ({ s, query }) => settings.listRequests(s, query));
route("PATCH", "/requests/:id", "requests.manage", ({ s, params, body }) => settings.updateRequest(s, params.id, body));

// ---- Pengaturan
route("GET", "/settings/organization", "settings.manage", ({ s }) => settings.getOrganizationSettings(s));
route("PATCH", "/settings/organization", "settings.manage", ({ s, body }) => settings.updateOrganizationSettings(s, body));
route("GET", "/team", "team.manage", ({ s }) => settings.listTeam(s));
route("POST", "/team", "team.manage", ({ s, body }) => settings.addTeamMember(s, body));
route("PATCH", "/team/:id", "team.manage", ({ s, params, body }) => settings.changeTeamRole(s, params.id, body));
route("DELETE", "/team/:id", "team.manage", ({ s, params }) => settings.removeTeamMember(s, params.id));
route("GET", "/audit", "audit.view", ({ s, query }) => settings.listAudit(s, query));

// ---- Portal pelanggan
route("GET", "/portal/overview", "portal.access", ({ s }) => portal.portalOverview(s));
route("GET", "/portal/invoices/:id", "portal.access", ({ s, params }) => portal.portalInvoice(s, params.id));
route("GET", "/portal/spaces", "portal.access", ({ s }) => portal.portalSpaces(s));
route("GET", "/portal/availability", "portal.access", ({ s, query }) => portal.portalAvailability(s, query.spaceId ?? "", query.date ?? ""));
route("POST", "/portal/bookings", "portal.access", ({ s, body }) => portal.portalCreateBooking(s, body));
route("POST", "/portal/bookings/:id/cancel", "portal.access", ({ s, params }) => portal.portalCancelBooking(s, params.id));
route("POST", "/portal/requests", "portal.access", ({ s, body }) => portal.portalCreateRequest(s, body));

function mapUnknownError(e: unknown): AppError | null {
  const err = e as { code?: string; message?: string };
  if (err?.message === "NOT_FOUND" || err?.code === "P2025") return new AppError("NOT_FOUND", "Data tidak ditemukan");
  if (err?.code === "P2002" || err?.message?.startsWith("UNIQUE_VIOLATION")) return new AppError("CONFLICT", "Data duplikat: nilai unik sudah dipakai");
  if (err?.code === "P2003") return new AppError("CONFLICT", "Data masih direferensikan oleh data lain");
  return null;
}

export function toErrorResponse(e: unknown, onUnexpected?: (e: unknown) => void): ApiResponse {
  const appErr = e instanceof AppError ? e : mapUnknownError(e);
  if (appErr) return { status: appErr.status, body: { error: { code: appErr.code, message: appErr.message, fields: appErr.fields } } };
  onUnexpected?.(e);
  return { status: 500, body: { error: { code: "INTERNAL", message: "Terjadi kesalahan pada server. Silakan coba lagi." } } };
}

export async function handleApi(deps: Deps, req: ApiRequest, onUnexpected?: (e: unknown) => void): Promise<ApiResponse> {
  try {
    // ---- Rute publik (tanpa sesi)
    if (req.method === "POST" && req.path === "/auth/login") {
      const r = await auth.login(deps, req.body);
      return { status: 200, body: { redirectTo: r.redirectTo }, setSession: r.session };
    }
    if (req.method === "POST" && req.path === "/auth/signup") {
      const r = await auth.signup(deps, req.body);
      return { status: 201, body: { redirectTo: r.redirectTo }, setSession: r.session };
    }
    if (req.method === "POST" && req.path === "/auth/logout") {
      return { status: 200, body: { ok: true }, setSession: null };
    }
    if (req.method === "GET" && req.path === "/health") {
      return { status: 200, body: { ok: true, time: deps.now().toISOString() } };
    }

    // ---- Rute terautentikasi
    const ctx: AuthContext | null = await auth.resolveAuth(deps, req.session);
    if (!ctx) {
      return { status: 401, body: { error: { code: "UNAUTHORIZED", message: "Sesi berakhir. Silakan masuk kembali." } }, setSession: req.session ? null : undefined };
    }
    if (req.method === "GET" && req.path === "/auth/me") return { status: 200, body: await auth.me(deps, ctx) };
    if (req.method === "POST" && req.path === "/auth/password") return { status: 200, body: await auth.changePassword(deps, ctx, req.body) };

    let methodMismatch = false;
    for (const r of routes) {
      const m = r.regex.exec(req.path);
      if (!m) continue;
      if (r.method !== req.method) {
        methodMismatch = true;
        continue;
      }
      if (!can(ctx.role, r.perm)) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses untuk aksi ini");
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const result = await r.handler({ s: makeSvc(deps, ctx), params, query: req.query, body: req.body });
      return { status: req.method === "POST" ? 201 : 200, body: result ?? { ok: true } };
    }
    if (methodMismatch) return { status: 405, body: { error: { code: "METHOD_NOT_ALLOWED", message: "Metode tidak didukung" } } };
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan" } } };
  } catch (e) {
    return toErrorResponse(e, onUnexpected);
  }
}

export const ROUTE_TABLE = routes.map((r) => ({ method: r.method, pattern: r.pattern, permission: r.perm }));
