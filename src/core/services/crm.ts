import { conflict } from "../domain/errors";
import type { Lead, LeadStage } from "../domain/types";
import { activitySchema, leadSchema, leadStageSchema, leadUpdateSchema, parse } from "../domain/validation";
import { audit, includesText, mustGet, tx, type Svc } from "./context";

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "Baru",
  CONTACTED: "Dihubungi",
  SITE_VISIT: "Site Visit",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negosiasi",
  WON: "Menang",
  LOST: "Gagal",
};

async function ownerNames(s: Svc) {
  const members = await s.repo.membership.list({ where: { role: ["OWNER", "ADMIN", "STAFF", "FINANCE"] } });
  const names = new Map<string, string>();
  for (const m of members) {
    const u = await s.deps.db.getUser(m.userId);
    if (u) names.set(u.id, u.name);
  }
  return names;
}

export async function listLeads(s: Svc, q: { q?: string; stage?: string; source?: string; ownerId?: string }) {
  const leads = await s.repo.lead.list({
    where: {
      ...(q.stage ? { stage: q.stage as LeadStage } : {}),
      ...(q.source ? { source: q.source as Lead["source"] } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
    },
    orderBy: { field: "updatedAt", dir: "desc" },
  });
  const owners = await ownerNames(s);
  return leads
    .filter((l) => includesText([l.name, l.company, l.email, l.phone], q.q))
    .map((l) => ({ ...l, ownerName: l.ownerId ? owners.get(l.ownerId) ?? null : null }));
}

export async function getLead(s: Svc, id: string) {
  const lead = await mustGet(s.repo.lead.get(id), "Lead");
  const [activities, owners] = await Promise.all([
    s.repo.leadActivity.list({ where: { leadId: id }, orderBy: { field: "createdAt", dir: "desc" } }),
    ownerNames(s),
  ]);
  return {
    ...lead,
    ownerName: lead.ownerId ? owners.get(lead.ownerId) ?? null : null,
    activities: activities.map((a) => ({ ...a, userName: a.userId ? owners.get(a.userId) ?? null : null })),
  };
}

export async function createLead(s: Svc, body: unknown) {
  const input = parse(leadSchema, body);
  const lead = await s.repo.lead.create({
    name: input.name,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: input.source,
    interest: input.interest,
    stage: "NEW",
    expectedValue: input.expectedValue,
    ownerId: input.ownerId ?? s.auth.userId,
    customerId: null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
    lostReason: null,
    notes: input.notes ?? null,
  });
  await audit(s, "lead.create", "Lead", lead.id, `Lead baru: ${lead.name}`);
  return lead;
}

export async function updateLead(s: Svc, id: string, body: unknown) {
  const input = parse(leadUpdateSchema, body);
  await mustGet(s.repo.lead.get(id), "Lead");
  const lead = await s.repo.lead.update(id, input);
  await audit(s, "lead.update", "Lead", id, `Mengubah lead ${lead.name}`);
  return lead;
}

export async function moveLeadStage(s: Svc, id: string, body: unknown) {
  const input = parse(leadStageSchema, body);
  const result = await tx(s, async (t) => {
    const lead = await mustGet(t.repo.lead.get(id), "Lead");
    if (lead.stage === input.stage) return lead;
    const updated = await t.repo.lead.update(id, {
      stage: input.stage,
      lostReason: input.stage === "LOST" ? input.lostReason ?? lead.lostReason : null,
    });
    await t.repo.leadActivity.create({
      leadId: id,
      type: "STAGE_CHANGE",
      content: `Tahap: ${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[input.stage]}${input.stage === "LOST" && input.lostReason ? ` (${input.lostReason})` : ""}`,
      userId: t.auth.userId,
    });
    return updated;
  });
  return result;
}

export async function addLeadActivity(s: Svc, id: string, body: unknown) {
  const input = parse(activitySchema, body);
  await mustGet(s.repo.lead.get(id), "Lead");
  const act = await s.repo.leadActivity.create({ leadId: id, type: input.type, content: input.content, userId: s.auth.userId });
  return act;
}

export async function deleteLead(s: Svc, id: string) {
  const lead = await mustGet(s.repo.lead.get(id), "Lead");
  await tx(s, async (t) => {
    await t.repo.leadActivity.deleteWhere({ leadId: id });
    await t.repo.lead.delete(id);
  });
  await audit(s, "lead.delete", "Lead", id, `Menghapus lead ${lead.name}`);
  return { ok: true };
}

/** Konversi lead menjadi pelanggan (atau tautkan ke pelanggan yang ada). */
export async function convertLead(s: Svc, id: string) {
  const result = await tx(s, async (t) => {
    const lead = await mustGet(t.repo.lead.get(id), "Lead");
    if (lead.customerId) {
      const existing = await t.repo.customer.get(lead.customerId);
      if (existing) throw conflict("Lead ini sudah dikonversi menjadi pelanggan");
    }
    const customer = await t.repo.customer.create({
      type: lead.company ? "COMPANY" : "INDIVIDUAL",
      name: lead.company || lead.name,
      contactName: lead.company ? lead.name : null,
      email: lead.email,
      phone: lead.phone,
      npwp: null,
      address: null,
      industry: null,
      status: "ACTIVE",
      notes: lead.notes,
    });
    const prevStage = lead.stage;
    const updated = await t.repo.lead.update(id, { customerId: customer.id, stage: "WON", lostReason: null });
    await t.repo.leadActivity.create({
      leadId: id,
      type: "STAGE_CHANGE",
      content: `Dikonversi menjadi pelanggan "${customer.name}"${prevStage !== "WON" ? ` (${STAGE_LABEL[prevStage]} → Menang)` : ""}`,
      userId: t.auth.userId,
    });
    return { lead: updated, customer };
  });
  await audit(s, "lead.convert", "Customer", result.customer.id, `Konversi lead ${result.lead.name} → pelanggan`);
  return result;
}

export async function pipelineSummary(s: Svc) {
  const leads = await s.repo.lead.list();
  const stages = ["NEW", "CONTACTED", "SITE_VISIT", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as LeadStage[];
  return stages.map((stage) => {
    const rows = leads.filter((l) => l.stage === stage);
    return { stage, label: STAGE_LABEL[stage], count: rows.length, value: rows.reduce((a, l) => a + l.expectedValue, 0) };
  });
}

export async function staffOptions(s: Svc) {
  const owners = await ownerNames(s);
  return [...owners.entries()].map(([id, name]) => ({ id, name }));
}
