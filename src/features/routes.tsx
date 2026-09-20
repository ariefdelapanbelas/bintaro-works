"use client";
// Peta rute untuk demo in-browser (Next.js memakai file-based routing di src/app).
import type { ReactNode } from "react";
import { LoginPage, SignupPage } from "./auth/AuthPages";
import { DashboardPage } from "./dashboard/DashboardPage";
import { LeadDetailPage, LeadsPage } from "./crm/CrmPages";
import { CustomerDetailPage, CustomersPage } from "./customers/CustomerPages";
import { SpaceDetailPage, SpacesPage } from "./spaces/SpacePages";
import { ContractDetailPage, ContractsPage } from "./contracts/ContractPages";
import { BookingsPage } from "./bookings/BookingsPage";
import { BillingPage, InvoiceDetailPage } from "./billing/BillingPages";
import { CatalogPage } from "./catalog/CatalogPage";
import { RequestsPage } from "./requests/RequestsPage";
import { AuditPage, SettingsPage } from "./settings/SettingsPages";
import { PortalBookingsPage, PortalHomePage, PortalInvoicePage, PortalInvoicesPage, PortalRequestsPage } from "./portal/PortalPages";
import { PortalAccountPage } from "./portal/PortalAccountPage";
import { PublicHomePage, PublicInquiryPage } from "./public/PublicApp";

export interface RouteDef {
  pattern: string;
  shell: "none" | "app" | "portal";
  render: (p: Record<string, string>) => ReactNode;
}

export const ROUTES: RouteDef[] = [
  { pattern: "/o/:slug", shell: "none", render: (p) => <PublicHomePage slug={p.slug} /> },
  { pattern: "/o/:slug/sewa", shell: "none", render: (p) => <PublicInquiryPage slug={p.slug} /> },
  { pattern: "/login", shell: "none", render: () => <LoginPage /> },
  { pattern: "/signup", shell: "none", render: () => <SignupPage /> },
  { pattern: "/dashboard", shell: "app", render: () => <DashboardPage /> },
  { pattern: "/crm", shell: "app", render: () => <LeadsPage /> },
  { pattern: "/crm/:id", shell: "app", render: (p) => <LeadDetailPage id={p.id} /> },
  { pattern: "/customers", shell: "app", render: () => <CustomersPage /> },
  { pattern: "/customers/:id", shell: "app", render: (p) => <CustomerDetailPage id={p.id} /> },
  { pattern: "/spaces", shell: "app", render: () => <SpacesPage /> },
  { pattern: "/spaces/:id", shell: "app", render: (p) => <SpaceDetailPage id={p.id} /> },
  { pattern: "/contracts", shell: "app", render: () => <ContractsPage /> },
  { pattern: "/contracts/:id", shell: "app", render: (p) => <ContractDetailPage id={p.id} /> },
  { pattern: "/bookings", shell: "app", render: () => <BookingsPage /> },
  { pattern: "/billing", shell: "app", render: () => <BillingPage /> },
  { pattern: "/billing/:id", shell: "app", render: (p) => <InvoiceDetailPage id={p.id} /> },
  { pattern: "/catalog", shell: "app", render: () => <CatalogPage /> },
  { pattern: "/requests", shell: "app", render: () => <RequestsPage /> },
  { pattern: "/settings", shell: "app", render: () => <SettingsPage /> },
  { pattern: "/audit", shell: "app", render: () => <AuditPage /> },
  { pattern: "/portal", shell: "portal", render: () => <PortalHomePage /> },
  { pattern: "/portal/bookings", shell: "portal", render: () => <PortalBookingsPage /> },
  { pattern: "/portal/invoices", shell: "portal", render: () => <PortalInvoicesPage /> },
  { pattern: "/portal/invoices/:id", shell: "portal", render: (p) => <PortalInvoicePage id={p.id} /> },
  { pattern: "/portal/requests", shell: "portal", render: () => <PortalRequestsPage /> },
  { pattern: "/portal/akun", shell: "portal", render: () => <PortalAccountPage /> },
];

export function matchRoute(pathname: string): { route: RouteDef; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    const keys: string[] = [];
    const re = new RegExp("^" + route.pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
    const m = re.exec(pathname);
    if (m) return { route, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
