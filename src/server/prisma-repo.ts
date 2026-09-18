// Implementasi repository untuk PostgreSQL via Prisma ORM 7.
// Setiap query ter-scope organizationId — lapis pertama isolasi multi-tenant.
import type { Membership, Organization, ScopedTable, User } from "@/core/domain/types";
import type { GlobalRepo, ListOptions, OrgRepo, ScopedTableRepo, Where } from "@/core/repo/types";
import { SCOPED_TABLES } from "@/core/repo/memory";
import type { PrismaClient } from "@/generated/prisma/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PrismaClient atau klien transaksi interaktif (tx). Diketik longgar agar tahan
// terhadap perbedaan tipe hasil generate antar versi Prisma.
type Db = any;

function toPrismaWhere(where: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!where) return out;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? { in: v } : v;
  }
  return out;
}

function stripUndefined(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
  return out;
}

function scopedTable(db: Db, name: ScopedTable, organizationId: string): ScopedTableRepo<any> {
  const d = (db as any)[name];
  const scope = (where?: Record<string, unknown>) => ({ ...toPrismaWhere(where), organizationId });
  return {
    list(opts?: ListOptions<any>) {
      return d.findMany({
        where: scope(opts?.where as Record<string, unknown>),
        orderBy: opts?.orderBy ? { [opts.orderBy.field]: opts.orderBy.dir } : undefined,
        take: opts?.take,
      });
    },
    get(id: string) {
      return d.findFirst({ where: { id, organizationId } });
    },
    findFirst(where: Where<any>) {
      return d.findFirst({ where: scope(where as Record<string, unknown>) });
    },
    count(where?: Where<any>) {
      return d.count({ where: scope(where as Record<string, unknown>) });
    },
    create(data: Record<string, unknown>) {
      return d.create({ data: { ...stripUndefined(data), organizationId } });
    },
    async update(id: string, data: Record<string, unknown>) {
      const clean = stripUndefined(data);
      delete clean.organizationId;
      delete clean.id;
      const res = await d.updateMany({ where: { id, organizationId }, data: clean });
      if (res.count === 0) throw new Error("NOT_FOUND");
      return d.findFirst({ where: { id, organizationId } });
    },
    async delete(id: string) {
      const res = await d.deleteMany({ where: { id, organizationId } });
      if (res.count === 0) throw new Error("NOT_FOUND");
    },
    async deleteWhere(where: Where<any>) {
      const res = await d.deleteMany({ where: scope(where as Record<string, unknown>) });
      return res.count as number;
    },
  };
}

function orgRepo(db: Db, organizationId: string): OrgRepo {
  const repo: Record<string, unknown> = {
    organizationId,
    async organization() {
      const o = await (db as any).organization.findUnique({ where: { id: organizationId } });
      if (!o) throw new Error("NOT_FOUND");
      return o as Organization;
    },
    updateOrganization(data: Partial<Organization>) {
      return (db as any).organization.update({ where: { id: organizationId }, data: stripUndefined(data) });
    },
    async nextSequence(key: string) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const c = await (db as any).counter.upsert({
            where: { organizationId_key: { organizationId, key } },
            create: { organizationId, key, value: 1 },
            update: { value: { increment: 1 } },
          });
          return c.value as number;
        } catch (e: any) {
          if (e?.code !== "P2002" || attempt === 2) throw e; // race saat create pertama
        }
      }
      throw new Error("SEQUENCE_FAILED");
    },
  };
  for (const t of SCOPED_TABLES) repo[t] = scopedTable(db, t, organizationId);
  return repo as unknown as OrgRepo;
}

export class PrismaRepo implements GlobalRepo {
  constructor(private prisma: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } }) as Promise<User | null>;
  }
  getUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } }) as Promise<User | null>;
  }
  createUser(data: { email: string; name: string; passwordHash: string; phone?: string | null }) {
    return this.prisma.user.create({ data: { ...data, email: data.email.toLowerCase() } }) as Promise<User>;
  }
  updateUser(id: string, data: Partial<User>) {
    return this.prisma.user.update({ where: { id }, data: stripUndefined(data) as any }) as Promise<User>;
  }
  membershipsOfUser(userId: string) {
    return this.prisma.membership.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }) as Promise<Membership[]>;
  }
  getOrganization(id: string) {
    return this.prisma.organization.findUnique({ where: { id } }) as Promise<Organization | null>;
  }
  findOrganizationBySlug(slug: string) {
    return this.prisma.organization.findUnique({ where: { slug: slug.toLowerCase() } }) as Promise<Organization | null>;
  }
  createOrganization(data: Pick<Organization, "name" | "slug"> & Partial<Organization>) {
    return this.prisma.organization.create({ data: stripUndefined(data) as any }) as Promise<Organization>;
  }
  forOrg(organizationId: string) {
    return orgRepo(this.prisma, organizationId);
  }
  transaction<R>(organizationId: string, fn: (repo: OrgRepo) => Promise<R>): Promise<R> {
    return this.prisma.$transaction((tx) => fn(orgRepo(tx, organizationId)), { timeout: 15_000 });
  }
}
