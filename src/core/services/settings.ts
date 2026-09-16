import { AppError, conflict } from "../domain/errors";
import type { RequestStatus } from "../domain/types";
import { organizationSchema, parse, requestUpdateSchema, teamMemberSchema, teamRoleSchema } from "../domain/validation";
import { audit, byId, mustGet, type Svc } from "./context";

export async function getOrganizationSettings(s: Svc) {
  return s.repo.organization();
}

export async function updateOrganizationSettings(s: Svc, body: unknown) {
  const input = parse(organizationSchema, body);
  const org = await s.repo.updateOrganization(input);
  await audit(s, "org.update", "Organization", org.id, "Mengubah pengaturan organisasi");
  return org;
}

export async function listTeam(s: Svc) {
  const members = await s.repo.membership.list({ where: { role: ["OWNER", "ADMIN", "STAFF", "FINANCE"] }, orderBy: { field: "createdAt", dir: "asc" } });
  const out = [];
  for (const m of members) {
    const u = await s.deps.db.getUser(m.userId);
    if (u) out.push({ membershipId: m.id, userId: u.id, name: u.name, email: u.email, role: m.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt, isSelf: u.id === s.auth.userId });
  }
  return out;
}

export async function addTeamMember(s: Svc, body: unknown) {
  const input = parse(teamMemberSchema, body);
  if (input.role === "OWNER" && s.auth.role !== "OWNER") throw new AppError("FORBIDDEN", "Hanya Owner yang bisa menambah Owner");
  let user = await s.deps.db.findUserByEmail(input.email);
  if (user) {
    const ms = await s.deps.db.membershipsOfUser(user.id);
    if (ms.some((m) => m.organizationId === s.auth.organizationId)) {
      throw new AppError("CONFLICT", "Email ini sudah menjadi anggota organisasi", { email: "sudah terdaftar" });
    }
  } else {
    user = await s.deps.db.createUser({ email: input.email, name: input.name, passwordHash: await s.deps.hasher.hash(input.password) });
  }
  const m = await s.repo.membership.create({ userId: user.id, role: input.role, customerId: null });
  await audit(s, "team.add", "Membership", m.id, `Menambah ${user.name} sebagai ${input.role}`);
  return { membershipId: m.id, userId: user.id, name: user.name, email: user.email, role: m.role };
}

async function ownerCount(s: Svc) {
  return s.repo.membership.count({ role: "OWNER" });
}

export async function changeTeamRole(s: Svc, membershipId: string, body: unknown) {
  const input = parse(teamRoleSchema, body);
  const m = await mustGet(s.repo.membership.get(membershipId), "Anggota");
  if (m.role === "CUSTOMER") throw conflict("Bukan anggota tim");
  if ((m.role === "OWNER" || input.role === "OWNER") && s.auth.role !== "OWNER") throw new AppError("FORBIDDEN", "Hanya Owner yang bisa mengubah role Owner");
  if (m.role === "OWNER" && input.role !== "OWNER" && (await ownerCount(s)) <= 1) throw conflict("Organisasi harus memiliki minimal satu Owner");
  const updated = await s.repo.membership.update(membershipId, { role: input.role });
  await audit(s, "team.role", "Membership", membershipId, `Mengubah role menjadi ${input.role}`);
  return updated;
}

export async function removeTeamMember(s: Svc, membershipId: string) {
  const m = await mustGet(s.repo.membership.get(membershipId), "Anggota");
  if (m.userId === s.auth.userId) throw conflict("Anda tidak bisa menghapus akses Anda sendiri");
  if (m.role === "OWNER" && s.auth.role !== "OWNER") throw new AppError("FORBIDDEN", "Hanya Owner yang bisa menghapus Owner");
  if (m.role === "OWNER" && (await ownerCount(s)) <= 1) throw conflict("Organisasi harus memiliki minimal satu Owner");
  await s.repo.membership.delete(membershipId);
  await audit(s, "team.remove", "Membership", membershipId, "Mencabut akses anggota tim");
  return { ok: true };
}

export async function listAudit(s: Svc, q: { entity?: string }) {
  return s.repo.auditLog.list({ where: q.entity ? { entity: q.entity } : undefined, orderBy: { field: "createdAt", dir: "desc" }, take: 300 });
}

// ---------------- Permintaan layanan (sisi admin) ----------------

export async function listRequests(s: Svc, q: { status?: string }) {
  const [requests, customers] = await Promise.all([
    s.repo.serviceRequest.list({ where: q.status ? { status: q.status as RequestStatus } : undefined, orderBy: { field: "createdAt", dir: "desc" } }),
    s.repo.customer.list(),
  ]);
  const cmap = byId(customers);
  return requests.map((r) => ({ ...r, customerName: cmap.get(r.customerId)?.name ?? "-" }));
}

export async function updateRequest(s: Svc, id: string, body: unknown) {
  const input = parse(requestUpdateSchema, body);
  await mustGet(s.repo.serviceRequest.get(id), "Permintaan");
  const r = await s.repo.serviceRequest.update(id, input);
  await audit(s, "request.update", "ServiceRequest", id, `Update permintaan "${r.subject}" → ${r.status}`);
  return r;
}
