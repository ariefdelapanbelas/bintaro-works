import type { Organization, ScopedEntities, ScopedTable, User } from "../domain/types";

/** Kolom yang diisi otomatis oleh repository. */
type AutoFields = "id" | "organizationId" | "createdAt" | "updatedAt";

export type CreateInput<T> = Omit<T, AutoFields | Extract<keyof T, AutoFields>> extends infer R
  ? // kolom nullable boleh tidak diisi
    { [K in keyof R as null extends R[K] ? never : K]: R[K] } & {
      [K in keyof R as null extends R[K] ? K : never]?: R[K];
    }
  : never;

export type UpdateInput<T> = Partial<Omit<T, AutoFields | Extract<keyof T, AutoFields>>>;

/** Filter kesetaraan sederhana; nilai array = IN (...). */
export type Where<T> = { [K in keyof T]?: T[K] | T[K][] };

export interface ListOptions<T> {
  where?: Where<T>;
  orderBy?: { field: keyof T & string; dir: "asc" | "desc" };
  take?: number;
}

/**
 * Akses tabel yang SELALU terikat pada satu organisasi.
 * Service tidak pernah bisa membaca/menulis data tenant lain,
 * karena organizationId tidak pernah menjadi parameter bebas.
 */
export interface ScopedTableRepo<T> {
  list(opts?: ListOptions<T>): Promise<T[]>;
  get(id: string): Promise<T | null>;
  findFirst(where: Where<T>): Promise<T | null>;
  count(where?: Where<T>): Promise<number>;
  create(data: CreateInput<T>): Promise<T>;
  update(id: string, data: UpdateInput<T>): Promise<T>;
  delete(id: string): Promise<void>;
  deleteWhere(where: Where<T>): Promise<number>;
}

export type OrgRepo = { [K in ScopedTable]: ScopedTableRepo<ScopedEntities[K]> } & {
  organizationId: string;
  organization(): Promise<Organization>;
  updateOrganization(data: Partial<Omit<Organization, "id" | "slug" | "createdAt" | "updatedAt">>): Promise<Organization>;
  /** Nomor urut atomik per organisasi, mis. untuk nomor invoice. */
  nextSequence(key: string): Promise<number>;
};

export interface GlobalRepo {
  findUserByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  createUser(data: { email: string; name: string; passwordHash: string; phone?: string | null }): Promise<User>;
  updateUser(id: string, data: Partial<Pick<User, "name" | "passwordHash" | "phone" | "isActive" | "lastLoginAt">>): Promise<User>;
  membershipsOfUser(userId: string): Promise<ScopedEntities["membership"][]>;
  getOrganization(id: string): Promise<Organization | null>;
  /** Dipakai halaman publik: cari organisasi berdasarkan slug. */
  findOrganizationBySlug(slug: string): Promise<Organization | null>;
  createOrganization(data: Pick<Organization, "name" | "slug"> & Partial<Omit<Organization, "id" | "createdAt" | "updatedAt">>): Promise<Organization>;
  /** Repository ter-scope untuk satu organisasi. */
  forOrg(organizationId: string): OrgRepo;
  /** Jalankan fn secara atomik (rollback bila error). */
  transaction<R>(organizationId: string, fn: (repo: OrgRepo) => Promise<R>): Promise<R>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface Deps {
  db: GlobalRepo;
  hasher: PasswordHasher;
  now: () => Date;
}
