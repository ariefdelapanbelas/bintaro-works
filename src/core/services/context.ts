import type { AuthContext } from "../domain/types";
import type { Deps, OrgRepo } from "../repo/types";
import { forbidden, notFound } from "../domain/errors";
import { can, type Permission } from "../domain/permissions";

/** Konteks eksekusi service: dependency + identitas + repo ter-scope tenant. */
export interface Svc {
  deps: Deps;
  auth: AuthContext;
  repo: OrgRepo;
  now: Date;
}

export function makeSvc(deps: Deps, auth: AuthContext): Svc {
  return { deps, auth, repo: deps.db.forOrg(auth.organizationId), now: deps.now() };
}

/** Jalankan fn dalam transaksi DB; repo di dalam fn ikut transaksi. */
export function tx<R>(s: Svc, fn: (t: Svc) => Promise<R>): Promise<R> {
  return s.deps.db.transaction(s.auth.organizationId, (repo) => fn({ ...s, repo }));
}

export function need(s: Svc, p: Permission) {
  if (!can(s.auth.role, p)) throw forbidden();
}

export async function mustGet<T>(p: Promise<T | null>, what: string): Promise<T> {
  const v = await p;
  if (!v) throw notFound(what);
  return v;
}

export async function audit(s: Svc, action: string, entity: string, entityId: string | null, summary: string) {
  await s.repo.auditLog.create({
    userId: s.auth.userId,
    userName: s.auth.userName,
    action,
    entity,
    entityId,
    summary,
  });
}

export function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

export function includesText(haystack: (string | null | undefined)[], q?: string | null): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((h) => h?.toLowerCase().includes(needle));
}
