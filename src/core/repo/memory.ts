// Implementasi repository in-memory.
// Dipakai untuk: (1) pengujian otomatis logika bisnis, (2) demo live di browser.
// Produksi memakai PrismaRepo (src/server/prisma-repo.ts) dengan kontrak yang sama.
import type { Membership, Organization, ScopedEntities, ScopedTable, User } from "../domain/types";
import type { GlobalRepo, ListOptions, OrgRepo, ScopedTableRepo, Where } from "./types";

export interface MemoryData {
  organizations: Organization[];
  users: User[];
  counters: { organizationId: string; key: string; value: number }[];
  tables: { [K in ScopedTable]: ScopedEntities[K][] };
}

export const SCOPED_TABLES: ScopedTable[] = [
  "location",
  "floor",
  "space",
  "customer",
  "lead",
  "leadActivity",
  "product",
  "contract",
  "booking",
  "invoice",
  "invoiceItem",
  "payment",
  "serviceRequest",
  "auditLog",
  "membership",
];

export function emptyData(): MemoryData {
  const tables = {} as MemoryData["tables"];
  for (const t of SCOPED_TABLES) (tables as Record<string, unknown[]>)[t] = [];
  return { organizations: [], users: [], counters: [], tables };
}

let idCounter = 0;
export function makeId(prefix = "c"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

function matches<T>(row: T, where?: Where<T>): boolean {
  if (!where) return true;
  for (const key of Object.keys(where) as (keyof T)[]) {
    const expected = where[key];
    if (expected === undefined) continue;
    const actual = (row[key] ?? null) as unknown;
    if (Array.isArray(expected)) {
      if (!expected.some((e) => eq(actual, e))) return false;
    } else if (!eq(actual, expected)) return false;
  }
  return true;
}

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return (a ?? null) === (b ?? null);
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

export class MemoryRepo implements GlobalRepo {
  constructor(public data: MemoryData = emptyData(), private now: () => Date = () => new Date()) {}

  async findUserByEmail(email: string) {
    const u = this.data.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return u ? clone(u) : null;
  }
  async getUser(id: string) {
    const u = this.data.users.find((x) => x.id === id);
    return u ? clone(u) : null;
  }
  async createUser(input: { email: string; name: string; passwordHash: string; phone?: string | null }) {
    if (this.data.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new Error("UNIQUE_VIOLATION:email");
    }
    const t = this.now();
    const user: User = {
      id: makeId("u"),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      phone: input.phone ?? null,
      isActive: true,
      lastLoginAt: null,
      createdAt: t,
      updatedAt: t,
    };
    this.data.users.push(user);
    return clone(user);
  }
  async updateUser(id: string, patch: Partial<User>) {
    const u = this.data.users.find((x) => x.id === id);
    if (!u) throw new Error("NOT_FOUND");
    Object.assign(u, patch, { updatedAt: this.now() });
    return clone(u);
  }
  async membershipsOfUser(userId: string) {
    return clone(this.data.tables.membership.filter((m) => m.userId === userId)) as Membership[];
  }
  async getOrganization(id: string) {
    const o = this.data.organizations.find((x) => x.id === id);
    return o ? clone(o) : null;
  }

  async createOrganization(input: Pick<Organization, "name" | "slug"> & Partial<Organization>) {
    if (this.data.organizations.some((o) => o.slug === input.slug)) throw new Error("UNIQUE_VIOLATION:slug");
    const t = this.now();
    const org: Organization = {
      id: makeId("o"),
      email: null,
      phone: null,
      address: null,
      npwp: null,
      taxRate: 11,
      invoicePrefix: "INV",
      contractPrefix: "KTR",
      paymentTermDays: 14,
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      ...input,
      createdAt: t,
      updatedAt: t,
    };
    this.data.organizations.push(org);
    return clone(org);
  }

  forOrg(organizationId: string): OrgRepo {
    const self = this;
    const repo = {
      organizationId,
      async organization() {
        const o = self.data.organizations.find((x) => x.id === organizationId);
        if (!o) throw new Error("NOT_FOUND");
        return clone(o);
      },
      async updateOrganization(patch: Partial<Organization>) {
        const o = self.data.organizations.find((x) => x.id === organizationId);
        if (!o) throw new Error("NOT_FOUND");
        Object.assign(o, patch, { updatedAt: self.now() });
        return clone(o);
      },
      async nextSequence(key: string) {
        let c = self.data.counters.find((x) => x.organizationId === organizationId && x.key === key);
        if (!c) {
          c = { organizationId, key, value: 0 };
          self.data.counters.push(c);
        }
        c.value += 1;
        return c.value;
      },
    } as Record<string, unknown>;
    for (const table of SCOPED_TABLES) repo[table] = self.table(table, organizationId);
    return repo as unknown as OrgRepo;
  }

  private table<K extends ScopedTable>(name: K, organizationId: string): ScopedTableRepo<ScopedEntities[K]> {
    type T = ScopedEntities[K];
    const self = this;
    const rows = () => self.data.tables[name] as T[];
    const scoped = () => rows().filter((r) => (r as { organizationId: string }).organizationId === organizationId);
    return {
      async list(opts?: ListOptions<T>) {
        let out = scoped().filter((r) => matches(r, opts?.where));
        if (opts?.orderBy) {
          const { field, dir } = opts.orderBy;
          out = [...out].sort((a, b) => {
            const av = a[field] as unknown;
            const bv = b[field] as unknown;
            const an = av instanceof Date ? av.getTime() : av;
            const bn = bv instanceof Date ? bv.getTime() : bv;
            if (an === bn) return 0;
            if (an === null || an === undefined) return 1;
            if (bn === null || bn === undefined) return -1;
            const r = (an as number | string) < (bn as number | string) ? -1 : 1;
            return dir === "asc" ? r : -r;
          });
        }
        if (opts?.take) out = out.slice(0, opts.take);
        return clone(out);
      },
      async get(id: string) {
        const r = scoped().find((x) => (x as { id: string }).id === id);
        return r ? clone(r) : null;
      },
      async findFirst(where: Where<T>) {
        const r = scoped().find((x) => matches(x, where));
        return r ? clone(r) : null;
      },
      async count(where?: Where<T>) {
        return scoped().filter((r) => matches(r, where)).length;
      },
      async create(data) {
        const t = self.now();
        const row = { ...clone(data), id: makeId(), organizationId, createdAt: t } as Record<string, unknown>;
        if (!["leadActivity", "invoiceItem", "payment", "auditLog"].includes(name)) row.updatedAt = t;
        // samakan perilaku Prisma: kolom opsional yang tidak diisi = null
        for (const k of Object.keys(row)) if (row[k] === undefined) row[k] = null;
        rows().push(row as unknown as T);
        return clone(row as unknown as T);
      },
      async update(id: string, patch) {
        const r = scoped().find((x) => (x as { id: string }).id === id) as Record<string, unknown> | undefined;
        if (!r) throw new Error("NOT_FOUND");
        for (const [k, v] of Object.entries(clone(patch))) if (v !== undefined) r[k] = v;
        if ("updatedAt" in r) r.updatedAt = self.now();
        return clone(r as unknown as T);
      },
      async delete(id: string) {
        const all = rows();
        const idx = all.findIndex(
          (x) => (x as { id: string }).id === id && (x as { organizationId: string }).organizationId === organizationId,
        );
        if (idx < 0) throw new Error("NOT_FOUND");
        all.splice(idx, 1);
      },
      async deleteWhere(where: Where<T>) {
        const all = rows();
        let n = 0;
        for (let i = all.length - 1; i >= 0; i--) {
          const row = all[i];
          if ((row as { organizationId: string }).organizationId === organizationId && matches(row, where)) {
            all.splice(i, 1);
            n++;
          }
        }
        return n;
      },
    };
  }

  async transaction<R>(organizationId: string, fn: (repo: OrgRepo) => Promise<R>): Promise<R> {
    const snapshot = clone(this.data);
    try {
      return await fn(this.forOrg(organizationId));
    } catch (e) {
      this.data.organizations = snapshot.organizations;
      this.data.users = snapshot.users;
      this.data.counters = snapshot.counters;
      this.data.tables = snapshot.tables;
      throw e;
    }
  }
}
