import { AppError } from "../domain/errors";
import { ROLE_PERMISSIONS } from "../domain/permissions";
import type { AuthContext, Membership } from "../domain/types";
import { changePasswordSchema, loginSchema, parse, signupSchema } from "../domain/validation";
import type { Deps } from "../repo/types";
import { seedOrganizationDefaults } from "./defaults";
import { audit, makeSvc } from "./context";

export interface SessionPayload {
  uid: string;
  oid: string;
  role: AuthContext["role"];
}

const invalid = () => new AppError("UNAUTHORIZED", "Email atau kata sandi salah");

/** Tentukan konteks auth dari payload sesi; memvalidasi ulang ke DB setiap request. */
export async function resolveAuth(deps: Deps, session: SessionPayload | null): Promise<AuthContext | null> {
  if (!session) return null;
  const user = await deps.db.getUser(session.uid);
  if (!user || !user.isActive) return null;
  const memberships = await deps.db.membershipsOfUser(user.id);
  const m = memberships.find((x) => x.organizationId === session.oid);
  if (!m) return null;
  return { userId: user.id, userName: user.name, organizationId: m.organizationId, role: m.role, customerId: m.customerId };
}

function pickMembership(ms: Membership[]): Membership | undefined {
  // Utamakan akses staf dibanding akses portal bila user punya keduanya.
  return ms.find((m) => m.role !== "CUSTOMER") ?? ms[0];
}

export async function login(deps: Deps, body: unknown) {
  const input = parse(loginSchema, body);
  const user = await deps.db.findUserByEmail(input.email);
  if (!user || !user.isActive) {
    await deps.hasher.hash(input.password); // samakan waktu respons
    throw invalid();
  }
  const ok = await deps.hasher.verify(input.password, user.passwordHash);
  if (!ok) throw invalid();
  const m = pickMembership(await deps.db.membershipsOfUser(user.id));
  if (!m) throw new AppError("FORBIDDEN", "Akun Anda belum terhubung ke organisasi mana pun");
  await deps.db.updateUser(user.id, { lastLoginAt: deps.now() });
  const session: SessionPayload = { uid: user.id, oid: m.organizationId, role: m.role };
  const auth: AuthContext = { userId: user.id, userName: user.name, organizationId: m.organizationId, role: m.role, customerId: m.customerId };
  await audit(makeSvc(deps, auth), "auth.login", "User", user.id, `${user.name} masuk`);
  return { session, redirectTo: m.role === "CUSTOMER" ? "/portal" : "/dashboard" };
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

/** Pendaftaran tenant baru (SaaS): buat organisasi + owner + data awal. */
export async function signup(deps: Deps, body: unknown) {
  const input = parse(signupSchema, body);
  if (await deps.db.findUserByEmail(input.email)) {
    throw new AppError("CONFLICT", "Email sudah terdaftar", { email: "sudah terdaftar" });
  }
  const passwordHash = await deps.hasher.hash(input.password);
  const { organization, user } = await seedOrganizationDefaults(deps, {
    organizationName: input.organizationName,
    slug: `${slugify(input.organizationName)}-${Math.random().toString(36).slice(2, 6)}`,
    ownerName: input.name,
    ownerEmail: input.email,
    passwordHash,
  });
  return { session: { uid: user.id, oid: organization.id, role: "OWNER" as const }, redirectTo: "/dashboard" };
}

export async function me(deps: Deps, auth: AuthContext) {
  const [user, org] = await Promise.all([deps.db.getUser(auth.userId), deps.db.getOrganization(auth.organizationId)]);
  let customerName: string | null = null;
  if (auth.customerId) customerName = (await deps.db.forOrg(auth.organizationId).customer.get(auth.customerId))?.name ?? null;
  return {
    user: { id: auth.userId, name: user?.name ?? auth.userName, email: user?.email ?? "" },
    organization: { id: auth.organizationId, name: org?.name ?? "", slug: org?.slug ?? "", taxRate: org?.taxRate ?? 11, paymentTermDays: org?.paymentTermDays ?? 14 },
    role: auth.role,
    customerId: auth.customerId,
    customerName,
    permissions: ROLE_PERMISSIONS[auth.role],
  };
}

export async function changePassword(deps: Deps, auth: AuthContext, body: unknown) {
  const input = parse(changePasswordSchema, body);
  const user = await deps.db.getUser(auth.userId);
  if (!user) throw invalid();
  if (!(await deps.hasher.verify(input.currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION", "Kata sandi saat ini salah", { currentPassword: "salah" });
  }
  await deps.db.updateUser(user.id, { passwordHash: await deps.hasher.hash(input.newPassword) });
  return { ok: true };
}
