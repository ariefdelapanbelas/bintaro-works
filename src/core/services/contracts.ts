import { addDays, addMonths, startOfDayUTC, businessToday } from "../domain/dates";
import { AppError, conflict } from "../domain/errors";
import type { Contract, ContractStatus } from "../domain/types";
import { contractSchema, contractUpdateSchema, parse, renewSchema, terminateSchema } from "../domain/validation";
import { billingPeriodFor, createContractPeriodInvoice, outstandingOf } from "./billing";
import { audit, byId, includesText, mustGet, tx, type Svc } from "./context";

/** Tandai kontrak kedaluwarsa; perpanjang otomatis bila autoRenew. */
export async function refreshContractStatuses(s: Svc) {
  const today = businessToday(s.now).getTime();
  const active = await s.repo.contract.list({ where: { status: "ACTIVE" } });
  for (const c of active) {
    const end = new Date(c.endDate).getTime();
    if (end >= today) continue;
    if (c.autoRenew) {
      let newEnd = new Date(c.endDate);
      const start = new Date(c.startDate);
      const lengthMonths = Math.max(1, Math.round((end - start.getTime()) / (30.44 * 86_400_000)));
      while (newEnd.getTime() < today) newEnd = addDays(addMonths(addDays(newEnd, 1), lengthMonths), -1);
      await s.repo.contract.update(c.id, { endDate: newEnd });
      await audit(s, "contract.autorenew", "Contract", c.id, `Kontrak ${c.number} diperpanjang otomatis`);
    } else {
      await tx(s, async (t) => {
        await t.repo.contract.update(c.id, { status: "EXPIRED" });
        if (c.spaceId) await releaseSpaceIfFree(t, c.spaceId, c.id);
      });
      await audit(s, "contract.expire", "Contract", c.id, `Kontrak ${c.number} berakhir`);
    }
  }
}

async function releaseSpaceIfFree(s: Svc, spaceId: string, exceptContractId: string) {
  const others = await s.repo.contract.list({ where: { spaceId, status: "ACTIVE" } });
  if (others.some((o) => o.id !== exceptContractId)) return;
  const space = await s.repo.space.get(spaceId);
  if (space && space.status === "OCCUPIED") await s.repo.space.update(spaceId, { status: "AVAILABLE" });
}

export async function listContracts(s: Svc, q: { status?: string; q?: string; customerId?: string }) {
  await refreshContractStatuses(s);
  const [contracts, customers, spaces] = await Promise.all([
    s.repo.contract.list({
      where: {
        ...(q.status ? { status: q.status as ContractStatus } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
      },
      orderBy: { field: "createdAt", dir: "desc" },
    }),
    s.repo.customer.list(),
    s.repo.space.list(),
  ]);
  const cmap = byId(customers);
  const smap = byId(spaces);
  const today = businessToday(s.now).getTime();
  return contracts
    .map((c) => ({
      ...c,
      customerName: cmap.get(c.customerId)?.name ?? "-",
      spaceName: c.spaceId ? `${smap.get(c.spaceId)?.code ?? ""} · ${smap.get(c.spaceId)?.name ?? ""}` : null,
      daysLeft: Math.ceil((new Date(c.endDate).getTime() - today) / 86_400_000),
    }))
    .filter((c) => includesText([c.number, c.title, c.customerName, c.spaceName], q.q));
}

export async function getContract(s: Svc, id: string) {
  const c = await mustGet(s.repo.contract.get(id), "Kontrak");
  const [customer, space, product, invoices] = await Promise.all([
    s.repo.customer.get(c.customerId),
    c.spaceId ? s.repo.space.get(c.spaceId) : Promise.resolve(null),
    c.productId ? s.repo.product.get(c.productId) : Promise.resolve(null),
    s.repo.invoice.list({ where: { contractId: id }, orderBy: { field: "issueDate", dir: "desc" } }),
  ]);
  return {
    ...c,
    customer,
    space,
    product,
    invoices: invoices.map((i) => ({ ...i, outstanding: outstandingOf(i) })),
    totalValue: c.monthlyFee * monthsBetween(c.startDate, c.endDate),
  };
}

function monthsBetween(a: Date, b: Date) {
  const start = new Date(a);
  const end = new Date(b);
  let n = 0;
  while (addMonths(start, n).getTime() <= end.getTime() && n < 1200) n++;
  return Math.max(1, n);
}

async function assertSpaceFree(s: Svc, spaceId: string, start: Date, end: Date, exceptId?: string) {
  const space = await mustGet(s.repo.space.get(spaceId), "Ruang");
  if (space.isBookable) {
    throw new AppError("VALIDATION", "Ruang ini bertipe booking per jam. Gunakan modul Booking.", { spaceId: "ruang booking" });
  }
  const actives = await s.repo.contract.list({ where: { spaceId, status: "ACTIVE" } });
  const clash = actives.find(
    (c) => c.id !== exceptId && new Date(c.startDate).getTime() <= end.getTime() && start.getTime() <= new Date(c.endDate).getTime(),
  );
  if (clash && space.type !== "COWORKING_DESK") {
    throw conflict(`Ruang ${space.code} sudah terikat kontrak aktif ${clash.number}`);
  }
  if (space.status === "MAINTENANCE") throw conflict(`Ruang ${space.code} sedang maintenance`);
  return space;
}

export async function createContract(s: Svc, body: unknown) {
  const input = parse(contractSchema, body);
  await mustGet(s.repo.customer.get(input.customerId), "Pelanggan");
  if (input.spaceId) await mustGet(s.repo.space.get(input.spaceId), "Ruang");
  if (input.productId) await mustGet(s.repo.product.get(input.productId), "Produk");
  const contract = await tx(s, async (t) => {
    const org = await t.repo.organization();
    const seq = await t.repo.nextSequence("contract");
    const number = `${org.contractPrefix}/${input.startDate.getUTCFullYear()}/${String(seq).padStart(4, "0")}`;
    return t.repo.contract.create({
      number,
      customerId: input.customerId,
      spaceId: input.spaceId ?? null,
      productId: input.productId ?? null,
      category: input.category,
      title: input.title,
      startDate: startOfDayUTC(input.startDate),
      endDate: startOfDayUTC(input.endDate),
      monthlyFee: input.monthlyFee,
      deposit: input.deposit,
      billingCycle: input.billingCycle,
      status: "DRAFT",
      autoRenew: input.autoRenew,
      signedAt: null,
      terminatedAt: null,
      notes: input.notes ?? null,
    });
  });
  await audit(s, "contract.create", "Contract", contract.id, `Membuat draft kontrak ${contract.number}`);
  return contract;
}

export async function updateContract(s: Svc, id: string, body: unknown) {
  const input = parse(contractUpdateSchema, body);
  const c = await mustGet(s.repo.contract.get(id), "Kontrak");
  const isDraft = c.status === "DRAFT";
  const patch: Partial<Contract> = { notes: input.notes, autoRenew: input.autoRenew };
  if (isDraft) {
    Object.assign(patch, {
      customerId: input.customerId,
      spaceId: input.spaceId,
      productId: input.productId,
      category: input.category,
      title: input.title,
      startDate: input.startDate ? startOfDayUTC(input.startDate) : undefined,
      endDate: input.endDate ? startOfDayUTC(input.endDate) : undefined,
      monthlyFee: input.monthlyFee,
      deposit: input.deposit,
      billingCycle: input.billingCycle,
    });
  } else {
    const locked = ["customerId", "spaceId", "startDate", "monthlyFee", "billingCycle", "deposit", "category"] as const;
    if (locked.some((k) => input[k] !== undefined)) {
      throw conflict("Kontrak aktif hanya bisa diubah catatan & perpanjangan otomatis. Gunakan Perpanjang/Terminasi.");
    }
    if (input.title) patch.title = input.title;
  }
  const start = patch.startDate ?? c.startDate;
  const end = patch.endDate ?? c.endDate;
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    throw new AppError("VALIDATION", "Tanggal selesai harus setelah tanggal mulai", { endDate: "tidak valid" });
  }
  const updated = await s.repo.contract.update(id, patch);
  await audit(s, "contract.update", "Contract", id, `Mengubah kontrak ${c.number}`);
  return updated;
}

export async function activateContract(s: Svc, id: string) {
  const result = await tx(s, async (t) => {
    const c = await mustGet(t.repo.contract.get(id), "Kontrak");
    if (c.status !== "DRAFT") throw conflict("Hanya kontrak DRAFT yang bisa diaktifkan");
    if (new Date(c.endDate).getTime() < businessToday(t.now).getTime()) {
      throw conflict("Tanggal selesai kontrak sudah lewat");
    }
    if (c.spaceId) {
      const space = await assertSpaceFree(t, c.spaceId, new Date(c.startDate), new Date(c.endDate), c.id);
      if (space.type !== "COWORKING_DESK" || space.capacity <= 1) await t.repo.space.update(space.id, { status: "OCCUPIED" });
    }
    const contract = await t.repo.contract.update(id, { status: "ACTIVE", signedAt: t.now });
    await t.repo.customer.update(c.customerId, { status: "ACTIVE" });
    const start = new Date(c.startDate);
    const period = billingPeriodFor(contract, start.getUTCFullYear(), start.getUTCMonth());
    const invoice = period ? await createContractPeriodInvoice(t, contract, period, { includeDeposit: true }) : null;
    return { contract, invoice };
  });
  await audit(
    s,
    "contract.activate",
    "Contract",
    id,
    `Mengaktifkan kontrak ${result.contract.number}${result.invoice ? ` & menerbitkan ${result.invoice.number}` : ""}`,
  );
  return result;
}

export async function terminateContract(s: Svc, id: string, body: unknown) {
  const input = parse(terminateSchema, body);
  const contract = await tx(s, async (t) => {
    const c = await mustGet(t.repo.contract.get(id), "Kontrak");
    if (c.status !== "ACTIVE") throw conflict("Hanya kontrak aktif yang bisa diterminasi");
    const notes = [c.notes, input.reason ? `Terminasi: ${input.reason}` : null].filter(Boolean).join("\n");
    const updated = await t.repo.contract.update(id, {
      status: "TERMINATED",
      terminatedAt: input.date,
      endDate: startOfDayUTC(input.date).getTime() < new Date(c.endDate).getTime() ? startOfDayUTC(input.date) : c.endDate,
      notes: notes || null,
    });
    if (c.spaceId) await releaseSpaceIfFree(t, c.spaceId, c.id);
    return updated;
  });
  await audit(s, "contract.terminate", "Contract", id, `Terminasi kontrak ${contract.number}`);
  return contract;
}

export async function renewContract(s: Svc, id: string, body: unknown) {
  const input = parse(renewSchema, body);
  const contract = await tx(s, async (t) => {
    const c = await mustGet(t.repo.contract.get(id), "Kontrak");
    if (c.status !== "ACTIVE" && c.status !== "EXPIRED") throw conflict("Hanya kontrak aktif/berakhir yang bisa diperpanjang");
    const newEnd = addDays(addMonths(addDays(new Date(c.endDate), 1), input.months), -1);
    if (c.status === "EXPIRED" && c.spaceId) {
      await assertSpaceFree(t, c.spaceId, addDays(new Date(c.endDate), 1), newEnd, c.id);
      await t.repo.space.update(c.spaceId, { status: "OCCUPIED" });
    }
    return t.repo.contract.update(id, {
      endDate: newEnd,
      status: "ACTIVE",
      monthlyFee: input.monthlyFee ?? c.monthlyFee,
    });
  });
  await audit(s, "contract.renew", "Contract", id, `Perpanjang kontrak ${contract.number} ${input.months} bulan`);
  return contract;
}

export async function deleteContract(s: Svc, id: string) {
  const c = await mustGet(s.repo.contract.get(id), "Kontrak");
  if (c.status !== "DRAFT") throw conflict("Hanya draft kontrak yang bisa dihapus");
  await s.repo.contract.delete(id);
  await audit(s, "contract.delete", "Contract", id, `Menghapus draft ${c.number}`);
  return { ok: true };
}
