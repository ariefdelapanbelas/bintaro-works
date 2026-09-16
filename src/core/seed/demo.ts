// Data contoh Bintaro Works. Dijalankan MELALUI service layer (bukan insert mentah),
// dengan jam simulasi yang bergerak maju bulan demi bulan, sehingga riwayat kontrak,
// invoice, pembayaran, dan booking konsisten dengan aturan bisnis yang sesungguhnya.
import { addDays, businessToday, monthDiff, monthStartUTC } from "../domain/dates";
import type { AuthContext, Customer, Invoice, Product, Space, SpaceType } from "../domain/types";
import type { GlobalRepo, PasswordHasher } from "../repo/types";
import * as billing from "../services/billing";
import * as bookings from "../services/bookings";
import { makeSvc } from "../services/context";
import * as contracts from "../services/contracts";
import * as crm from "../services/crm";
import * as customersSvc from "../services/customers";
import { seedOrganizationDefaults } from "../services/defaults";
import * as spacesSvc from "../services/spaces";

export const DEMO_PASSWORD = "bintaro123";
export const DEMO_ACCOUNTS = [
  { email: "owner@bintaroworks.id", name: "Arief Rahman", role: "OWNER" as const },
  { email: "admin@bintaroworks.id", name: "Nadia Putri", role: "ADMIN" as const },
  { email: "staf@bintaroworks.id", name: "Raka Pratama", role: "STAFF" as const },
  { email: "finance@bintaroworks.id", name: "Sinta Maharani", role: "FINANCE" as const },
  { email: "budi@kopikita.id", name: "Budi Santoso", role: "CUSTOMER" as const },
];

const H = 3_600_000;

/** Pseudo-random deterministik agar data demo selalu sama. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

export async function seedDemo(db: GlobalRepo, hasher: PasswordHasher, realNow: Date, clockRef?: { now: Date }) {
  const clock = clockRef ?? { now: new Date(realNow) };
  const deps = { db, hasher, now: () => new Date(clock.now) };
  const today = businessToday(realNow);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const M = (k: number) => monthStartUTC(y, m - 5 + k); // M(0) = 5 bulan lalu, M(5) = bulan ini
  const wib = (day: Date, hour: number, minute = 0) => new Date(day.getTime() + (hour - 7) * H + minute * 60_000);
  const setClock = (d: Date) => {
    clock.now = d.getTime() > realNow.getTime() ? new Date(realNow) : d;
  };
  const rand = rng(20260916);

  setClock(wib(addDays(M(0), 1), 9));

  const passwordHash = await hasher.hash(DEMO_PASSWORD);
  const { organization, user: owner } = await seedOrganizationDefaults(deps, {
    organizationName: "Bintaro Works",
    slug: "bintaro-works",
    ownerName: DEMO_ACCOUNTS[0].name,
    ownerEmail: DEMO_ACCOUNTS[0].email,
    passwordHash,
  });
  const auth: AuthContext = { userId: owner.id, userName: owner.name, organizationId: organization.id, role: "OWNER", customerId: null };
  const S = () => makeSvc(deps, auth);
  const repo = db.forOrg(organization.id);

  await repo.updateOrganization({
    name: "Bintaro Works",
    email: "halo@bintaroworks.id",
    phone: "+62 21 7450 8899",
    address: "Jl. Bintaro Utama Sektor 9 Blok B2 No. 18, Pondok Aren, Tangerang Selatan 15229",
    npwp: "01.234.567.8-411.000",
    taxRate: 11,
    invoicePrefix: "BW-INV",
    contractPrefix: "BW-KTR",
    paymentTermDays: 14,
    bankName: "BCA",
    bankAccountNo: "527 088 1990",
    bankAccountName: "PT Bintaro Works Indonesia",
  });

  // ---- Tim
  const staffIds: Record<string, string> = { OWNER: owner.id };
  for (const acc of DEMO_ACCOUNTS.slice(1, 4)) {
    const u = await db.createUser({ email: acc.email, name: acc.name, passwordHash });
    await repo.membership.create({ userId: u.id, role: acc.role, customerId: null });
    staffIds[acc.role] = u.id;
  }

  // ---- Lokasi, lantai, ruang
  const [loc] = await repo.location.list();
  await repo.location.update(loc.id, { name: "Bintaro Works — Sektor 9", address: "Jl. Bintaro Utama Sektor 9, Tangerang Selatan" });
  const [floor1] = await repo.floor.list();
  await repo.floor.update(floor1.id, { name: "Lantai 1 · Coworking & Studio" });
  const floor2 = await repo.floor.create({ locationId: loc.id, name: "Lantai 2 · Private Office", level: 2, gridCols: 12, gridRows: 8 });
  const basement = await repo.floor.create({ locationId: loc.id, name: "Basement · Parkir", level: 0, gridCols: 12, gridRows: 8 });

  const sp: Record<string, Space> = {};
  const addSpace = async (
    floorId: string,
    code: string,
    name: string,
    type: SpaceType,
    o: { cap: number; area?: number; monthly?: number; hourly?: number; x: number; y: number; w: number; h: number; amen?: string[]; desc?: string },
  ) => {
    sp[code] = await spacesSvc.createSpace(S(), {
      floorId,
      code,
      name,
      type,
      capacity: o.cap,
      areaSqm: o.area ?? null,
      monthlyPrice: o.monthly ?? 0,
      hourlyPrice: o.hourly ?? 0,
      isBookable: !!o.hourly,
      amenities: o.amen ?? [],
      posX: o.x,
      posY: o.y,
      width: o.w,
      height: o.h,
      description: o.desc ?? null,
    });
  };
  await addSpace(floor1.id, "CW-01", "Coworking Hall", "COWORKING_DESK", { cap: 30, area: 180, monthly: 1_250_000, x: 0, y: 0, w: 6, h: 4, amen: ["Wi-Fi 1 Gbps", "Pantry", "Loker"] });
  await addSpace(floor1.id, "MR-01", "Meeting Room Borobudur", "MEETING_ROOM", { cap: 8, area: 24, hourly: 150_000, x: 6, y: 0, w: 3, h: 2, amen: ["TV 65\"", "Whiteboard", "Video conference"] });
  await addSpace(floor1.id, "MR-02", "Meeting Room Prambanan", "MEETING_ROOM", { cap: 4, area: 12, hourly: 100_000, x: 9, y: 0, w: 3, h: 2, amen: ["TV 43\"", "Whiteboard"] });
  await addSpace(floor1.id, "PS-01", "Podcast Studio", "PODCAST_STUDIO", { cap: 4, area: 16, hourly: 350_000, x: 6, y: 2, w: 3, h: 2, amen: ["4 Mic Shure SM7B", "3 Kamera", "Operator"] });
  await addSpace(floor1.id, "LS-01", "Live Streaming Studio", "LIVE_STUDIO", { cap: 3, area: 16, hourly: 450_000, x: 9, y: 2, w: 3, h: 2, amen: ["Ring light", "2 Kamera", "Rak display"] });
  await addSpace(floor1.id, "EV-01", "Event Space Nusantara", "EVENT_SPACE", { cap: 60, area: 150, hourly: 750_000, x: 0, y: 4, w: 7, h: 4, amen: ["Sound system", "Proyektor", "Panggung"] });
  const offices: [string, number, number, number, number, number, number][] = [
    // code, cap, area, harga, x, y, w/h combined below
    ["PO-201", 2, 10, 4_500_000, 0, 0, 3],
    ["PO-202", 4, 18, 8_500_000, 3, 0, 3],
    ["PO-203", 4, 18, 8_500_000, 6, 0, 3],
    ["PO-204", 6, 26, 12_000_000, 9, 0, 3],
    ["PO-205", 2, 10, 4_500_000, 0, 4, 3],
    ["PO-206", 4, 18, 8_500_000, 3, 4, 3],
    ["PO-207", 4, 18, 8_500_000, 6, 4, 3],
    ["PO-208", 10, 42, 18_000_000, 9, 3, 3],
    ["PO-209", 2, 10, 4_500_000, 0, 6, 3],
    ["PO-210", 3, 14, 6_000_000, 3, 6, 3],
  ];
  for (const [code, cap, area, price, x, yy, w] of offices) {
    const h = code === "PO-204" ? 3 : code === "PO-208" ? 5 : 2;
    await addSpace(floor2.id, code, `Private Office ${code.slice(3)}`, "PRIVATE_OFFICE", {
      cap,
      area,
      monthly: price,
      x,
      y: yy,
      w,
      h,
      amen: ["AC", "Meja & kursi ergonomis", "Kunci akses"],
    });
  }
  for (let i = 1; i <= 6; i++) {
    const code = `PK-0${i}`;
    await addSpace(basement.id, code, `Slot Parkir ${i}`, "PARKING", { cap: 1, monthly: 400_000, x: (i - 1) * 2, y: 0, w: 2, h: 3 });
  }

  const products = await repo.product.list();
  const prod = (name: string) => products.find((p: Product) => p.name.startsWith(name))?.id ?? null;

  // ---- Pelanggan
  const cust: Record<string, Customer> = {};
  const addCustomer = async (key: string, data: Record<string, unknown>) => {
    cust[key] = await customersSvc.createCustomer(S(), data);
  };
  await addCustomer("arunika", { type: "COMPANY", name: "PT Arunika Teknologi", contactName: "Dewi Anggraini", email: "dewi@arunika.co.id", phone: "0812-8890-1122", industry: "Software", npwp: "02.555.111.9-411.000", address: "Bintaro Works PO-208" });
  await addCustomer("rupa", { type: "COMPANY", name: "CV Studio Rupa Kreatif", contactName: "Yoga Prasetyo", email: "halo@rupakreatif.id", phone: "0813-1100-2233", industry: "Agensi Kreatif" });
  await addCustomer("kopikita", { type: "COMPANY", name: "PT Kopi Kita Nusantara", contactName: "Budi Santoso", email: "budi@kopikita.id", phone: "0811-9090-7788", industry: "F&B" });
  await addCustomer("lintas", { type: "COMPANY", name: "PT Lintas Logistik Prima", contactName: "Hendra Wijaya", email: "finance@lintaslogistik.co.id", phone: "0821-3344-5566", industry: "Logistik" });
  await addCustomer("samudra", { type: "COMPANY", name: "PT Samudra Karya Konsultan", contactName: "Rina Marlina", email: "rina@samudrakarya.id", phone: "0812-7766-5544", industry: "Konsultan" });
  await addCustomer("maya", { type: "INDIVIDUAL", name: "dr. Maya Lestari", email: "maya.lestari@gmail.com", phone: "0857-1234-9876", industry: "Kesehatan" });
  await addCustomer("tani", { type: "COMPANY", name: "Rumah Tani Digital", contactName: "Fajar Nugroho", email: "fajar@rumahtani.id", phone: "0896-5544-3322", industry: "Agritech" });
  await addCustomer("klinik", { type: "COMPANY", name: "Klinik Gigi Senyum Bintaro", contactName: "drg. Laras", email: "admin@senyumbintaro.id", phone: "0812-2211-3344", industry: "Kesehatan" });
  await addCustomer("anggun", { type: "INDIVIDUAL", name: "Anggun Collection", contactName: "Anggun Pertiwi", email: "anggun.collection@gmail.com", phone: "0877-8899-0011", industry: "Fashion (live selling)" });
  await addCustomer("cerdas", { type: "COMPANY", name: "Yayasan Cerdas Bangsa", contactName: "Pak Ahmad Fauzi", email: "sekretariat@cerdasbangsa.or.id", phone: "021-7788-9900", industry: "Pendidikan" });
  await addCustomer("ngobrol", { type: "INDIVIDUAL", name: "Podcast Ngobrol Santai", contactName: "Dimas Aditya", email: "dimas@ngobrolsantai.id", phone: "0819-2345-6789", industry: "Media" });

  // ---- Akun portal pelanggan
  await customersSvc.createPortalUser(S(), cust.kopikita.id, { name: DEMO_ACCOUNTS[4].name, email: DEMO_ACCOUNTS[4].email, password: DEMO_PASSWORD });

  // ---- Rencana kontrak: [kunci, bulanMulai, pelanggan, ruang, produk, kategori, judul, fee, siklus, durasi, deposit, autoRenew]
  type Plan = { at: number; day: number; c: string; space?: string; product?: string; cat: string; title: string; fee: number; cycle: string; months: number; deposit: number; auto?: boolean };
  const plans: Plan[] = [
    { at: 0, day: 1, c: "arunika", space: "PO-208", product: "Private Office", cat: "PRIVATE_OFFICE", title: "Private Office PO-208 (10 orang)", fee: 18_000_000, cycle: "MONTHLY", months: 12, deposit: 18_000_000, auto: true },
    { at: 0, day: 1, c: "kopikita", space: "PO-201", cat: "PRIVATE_OFFICE", title: "Private Office PO-201 (2 orang)", fee: 4_500_000, cycle: "QUARTERLY", months: 6, deposit: 4_500_000 },
    { at: 0, day: 1, c: "maya", product: "Virtual Office — PKP", cat: "VIRTUAL_OFFICE", title: "Virtual Office PKP Ready", fee: 650_000, cycle: "YEARLY", months: 12, deposit: 0 },
    { at: 0, day: 1, c: "arunika", space: "PK-03", product: "Parkir", cat: "PARKING", title: "Parkir Reserved PK-03", fee: 400_000, cycle: "MONTHLY", months: 12, deposit: 0, auto: true },
    { at: 1, day: 1, c: "rupa", space: "PO-202", cat: "PRIVATE_OFFICE", title: "Private Office PO-202 (4 orang)", fee: 8_500_000, cycle: "MONTHLY", months: 12, deposit: 8_500_000 },
    { at: 1, day: 1, c: "tani", space: "CW-01", product: "Coworking", cat: "COWORKING", title: "Coworking 3 kursi", fee: 3_750_000, cycle: "MONTHLY", months: 6, deposit: 0 },
    { at: 2, day: 1, c: "lintas", space: "PO-204", cat: "PRIVATE_OFFICE", title: "Private Office PO-204 (6 orang)", fee: 12_000_000, cycle: "MONTHLY", months: 12, deposit: 12_000_000 },
    { at: 2, day: 1, c: "lintas", space: "PK-02", product: "Parkir", cat: "PARKING", title: "Parkir Reserved PK-02", fee: 400_000, cycle: "MONTHLY", months: 12, deposit: 0 },
    { at: 2, day: 1, c: "anggun", space: "PK-01", product: "Parkir", cat: "PARKING", title: "Parkir Reserved PK-01", fee: 400_000, cycle: "MONTHLY", months: 12, deposit: 0 },
    { at: 3, day: 1, c: "samudra", space: "PO-206", cat: "PRIVATE_OFFICE", title: "Private Office PO-206 (4 orang)", fee: 8_000_000, cycle: "YEARLY", months: 12, deposit: 8_000_000 },
    { at: 4, day: 1, c: "klinik", product: "Virtual Office — Basic", cat: "VIRTUAL_OFFICE", title: "Virtual Office Basic", fee: 350_000, cycle: "UPFRONT", months: 12, deposit: 0 },
    { at: 4, day: 1, c: "cerdas", space: "PO-205", cat: "PRIVATE_OFFICE", title: "Private Office PO-205 (2 orang)", fee: 4_500_000, cycle: "MONTHLY", months: 12, deposit: 4_500_000 },
    { at: 5, day: 1, c: "ngobrol", space: "PO-209", cat: "PRIVATE_OFFICE", title: "Private Office PO-209 (2 orang)", fee: 4_500_000, cycle: "MONTHLY", months: 12, deposit: 4_500_000 },
  ];

  // Pola pembayaran: invoice yang TIDAK dibayar / dibayar sebagian (berdasar kunci pelanggan & bulan)
  const unpaid = new Set(["lintas@4", "tani@4", "lintas@5", "cerdas@5", "ngobrol@5", "rupa@5"]);
  const partial = new Set(["lintas@3"]);

  const bookable = ["MR-01", "MR-02", "PS-01", "LS-01", "EV-01"];
  const bookingCustomers = ["anggun", "ngobrol", "rupa", "arunika", "kopikita", "samudra", "cerdas", "tani"];
  const titles: Record<string, string[]> = {
    "MR-01": ["Rapat klien", "Weekly sync", "Interview kandidat", "Presentasi proposal"],
    "MR-02": ["Diskusi tim kecil", "Konsultasi pajak", "1:1 meeting"],
    "PS-01": ["Rekaman episode podcast", "Rekaman webinar", "Voice over iklan"],
    "LS-01": ["Live selling TikTok", "Live Shopee", "Launching koleksi baru"],
    "EV-01": ["Workshop UMKM", "Townhall perusahaan", "Community meetup"],
  };

  for (let k = 0; k <= 5; k++) {
    const monthStart = M(k);
    const isCurrent = k === 5;

    // 1) kontrak yang mulai bulan ini
    setClock(wib(addDays(monthStart, 0), 8));
    for (const p of plans.filter((x) => x.at === k)) {
      setClock(wib(addDays(monthStart, p.day - 1), 9));
      const start = addDays(monthStart, p.day - 1);
      const end = addDays(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + p.months, start.getUTCDate())), -1);
      const c = await contracts.createContract(S(), {
        customerId: cust[p.c].id,
        spaceId: p.space ? sp[p.space].id : null,
        productId: p.product ? prod(p.product) : null,
        category: p.cat,
        title: p.title,
        startDate: start,
        endDate: end,
        monthlyFee: p.fee,
        deposit: p.deposit,
        billingCycle: p.cycle,
        autoRenew: !!p.auto,
      });
      await contracts.activateContract(S(), c.id);
    }

    // 2) generate tagihan berulang tanggal 1
    setClock(wib(monthStart, 10));
    await billing.generateRecurringInvoices(S(), { year: monthStart.getUTCFullYear(), month: monthStart.getUTCMonth() + 1 });

    // 3) booking ruang sepanjang bulan
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    const lastDay = isCurrent ? Math.min(daysInMonth, today.getUTCDate() + 10) : daysInMonth;
    const nBookings = isCurrent ? 16 : 9;
    for (let i = 0; i < nBookings; i++) {
      const day = 1 + Math.floor(rand() * lastDay);
      const dayDate = addDays(monthStart, day - 1);
      if (dayDate.getUTCDay() === 0) continue; // Minggu tutup
      const code = bookable[Math.floor(rand() * bookable.length)];
      const startHour = 9 + Math.floor(rand() * 8);
      const dur = code === "EV-01" ? 4 : 1 + Math.floor(rand() * 3);
      const ck = bookingCustomers[Math.floor(rand() * bookingCustomers.length)];
      const isGuest = rand() < 0.2;
      const bookedAt = addDays(dayDate, -2).getTime() < monthStart.getTime() ? monthStart : addDays(dayDate, -2);
      setClock(wib(bookedAt, 8));
      const titleList = titles[code];
      try {
        await bookings.createBooking(S(), {
          spaceId: sp[code].id,
          customerId: isGuest ? null : cust[ck].id,
          guestName: isGuest ? ["Tamu: Bpk. Wahyu", "Tamu: Ibu Citra", "Tamu: Komunitas Startup Bintaro"][i % 3] : null,
          title: titleList[Math.floor(rand() * titleList.length)],
          startAt: wib(dayDate, startHour),
          endAt: wib(dayDate, Math.min(startHour + dur, 21)),
          attendees: Math.min(sp[code].capacity, 1 + Math.floor(rand() * sp[code].capacity)),
          createInvoice: !isGuest,
        });
      } catch {
        // slot bentrok → lewati (wajar di data acak)
      }
    }

    // 4) pembayaran untuk invoice bulan ini
    if (!isCurrent || today.getUTCDate() > 5) {
      const payDay = isCurrent ? Math.max(1, today.getUTCDate() - 1) : 27;
      setClock(wib(addDays(monthStart, payDay - 1), 14));
      const openInv = (await repo.invoice.list({ where: { status: ["SENT", "OVERDUE", "PARTIAL"] } })).filter(
        (inv: Invoice) => new Date(inv.issueDate).getTime() <= addDays(monthStart, payDay - 1).getTime(),
      );
      for (const inv of openInv) {
        const key = Object.keys(cust).find((kk) => cust[kk].id === inv.customerId) ?? "";
        const kIssue = monthDiff(new Date(inv.issueDate), M(0));
        if (!isCurrent && kIssue !== k) continue;
        if (unpaid.has(`${key}@${kIssue}`) && inv.contractId) continue;
        if (kIssue === 5 && rand() < 0.35) continue; // sebagian invoice bulan berjalan belum dibayar
        const outstanding = inv.total - inv.amountPaid;
        const amount = partial.has(`${key}@${kIssue}`) && inv.contractId && kIssue === k ? Math.round(outstanding / 2) : outstanding;
        const methods = ["TRANSFER", "TRANSFER", "VIRTUAL_ACCOUNT", "QRIS"];
        await billing.recordPayment(S(), inv.id, {
          amount,
          method: methods[Math.floor(rand() * methods.length)],
          paidAt: clock.now,
          reference: `TRX${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`,
        });
      }
    }
  }

  // ---- Kembali ke waktu nyata: lead pipeline, permintaan layanan, draft
  setClock(new Date(realNow));
  const leadData = [
    { name: "Andi Saputra", company: "PT Nusa Energi Hijau", source: "WEBSITE", interest: "PRIVATE_OFFICE", stage: "NEGOTIATION", value: 8_500_000 * 12, follow: 0 },
    { name: "Clara Wibisono", company: "Wibisono & Partners Law Firm", source: "REFERRAL", interest: "PRIVATE_OFFICE", stage: "PROPOSAL", value: 12_000_000 * 12, follow: 1 },
    { name: "Rudi Hartono", company: "CV Sinar Abadi", source: "WHATSAPP", interest: "VIRTUAL_OFFICE", stage: "CONTACTED", value: 650_000 * 12, follow: 0 },
    { name: "Mega Puspita", company: null, source: "INSTAGRAM", interest: "STUDIO", stage: "NEW", value: 2_800_000, follow: 2 },
    { name: "Taufik Hidayat", company: "PT Garuda Solusi Digital", source: "WALK_IN", interest: "PRIVATE_OFFICE", stage: "SITE_VISIT", value: 18_000_000 * 12, follow: 0 },
    { name: "Siska Amelia", company: "Siska Bakery", source: "WHATSAPP", interest: "BUSINESS_SERVICE", stage: "NEW", value: 2_500_000, follow: -1 },
    { name: "Bayu Firmansyah", company: "Bayu Creative Lab", source: "INSTAGRAM", interest: "COWORKING", stage: "CONTACTED", value: 1_250_000 * 6, follow: 3 },
    { name: "Lestari Handayani", company: "PT Mitra Farma", source: "WEBSITE", interest: "MEETING_ROOM", stage: "PROPOSAL", value: 6_000_000, follow: 2 },
    { name: "Irfan Maulana", company: "Irfan Fotografi", source: "REFERRAL", interest: "STUDIO", stage: "WON", value: 3_500_000, follow: null },
    { name: "Nina Kartika", company: "PT Kartika Mandiri", source: "WEBSITE", interest: "VIRTUAL_OFFICE", stage: "LOST", value: 350_000 * 12, follow: null },
    { name: "Gilang Ramadhan", company: "Startup Kilat", source: "WALK_IN", interest: "COWORKING", stage: "SITE_VISIT", value: 3_750_000 * 6, follow: 1 },
    { name: "Putri Ayu", company: null, source: "OTHER", interest: "PRINTING", stage: "NEW", value: 500_000, follow: null },
  ] as const;
  const owners = [staffIds.OWNER, staffIds.STAFF, staffIds.ADMIN];
  const activityNotes = [
    ["CALL", "Telepon awal, tertarik survei lokasi minggu ini."],
    ["WHATSAPP", "Kirim pricelist & brosur via WhatsApp."],
    ["MEETING", "Site visit bersama tim, cocok dengan PO lantai 2."],
    ["EMAIL", "Kirim proposal penawaran + draft kontrak."],
    ["NOTE", "Minta diskon 5% untuk kontrak 12 bulan, perlu approval owner."],
  ] as const;
  const order = ["NEW", "CONTACTED", "SITE_VISIT", "PROPOSAL", "NEGOTIATION"];
  let li = 0;
  for (const l of leadData) {
    setClock(new Date(realNow.getTime() - (20 - li) * 86_400_000));
    const lead = await crm.createLead(S(), {
      name: l.name,
      company: l.company,
      email: `${l.name.split(" ")[0].toLowerCase()}@${(l.company ?? "gmail").toLowerCase().replace(/[^a-z]/g, "").slice(0, 14)}.com`,
      phone: `08${String(1100000000 + Math.floor(rand() * 899999999)).slice(0, 10)}`,
      source: l.source,
      interest: l.interest,
      expectedValue: l.value,
      ownerId: owners[li % owners.length],
      nextFollowUpAt: l.follow === null ? null : addDays(today, l.follow),
    });
    const targetIdx = l.stage === "WON" || l.stage === "LOST" ? 3 : order.indexOf(l.stage);
    for (let st = 1; st <= targetIdx; st++) {
      setClock(new Date(realNow.getTime() - (20 - li - st * 2) * 86_400_000));
      await crm.addLeadActivity(S(), lead.id, { type: activityNotes[st - 1][0], content: activityNotes[st - 1][1] });
      await crm.moveLeadStage(S(), lead.id, { stage: order[st] });
    }
    if (l.stage === "WON") await crm.convertLead(S(), lead.id);
    if (l.stage === "LOST") await crm.moveLeadStage(S(), lead.id, { stage: "LOST", lostReason: "Memilih lokasi lebih dekat ke Jakarta Selatan" });
    li++;
  }
  setClock(new Date(realNow));

  // Draft kontrak dari lead negosiasi
  const nusa = await customersSvc.createCustomer(S(), { type: "COMPANY", name: "PT Nusa Energi Hijau", contactName: "Andi Saputra", email: "andi@nusaenergihijau.com", phone: "0812-4455-6677", industry: "Energi terbarukan" });
  const nextMonth = monthStartUTC(y, m + 1);
  await contracts.createContract(S(), {
    customerId: nusa.id,
    spaceId: sp["PO-203"].id,
    category: "PRIVATE_OFFICE",
    title: "Private Office PO-203 (4 orang)",
    startDate: nextMonth,
    endDate: addDays(monthStartUTC(y, m + 13), -1),
    monthlyFee: 8_075_000,
    deposit: 8_500_000,
    billingCycle: "MONTHLY",
    notes: "Diskon 5% disetujui owner untuk kontrak 12 bulan.",
  });

  // Ruang maintenance
  await spacesSvc.updateSpace(S(), sp["PO-207"].id, { status: "MAINTENANCE", description: "Perbaikan plafon & AC, estimasi selesai 2 minggu." });

  // Invoice layanan bisnis (draft) & percetakan (terbit)
  await billing.createInvoice(S(), {
    customerId: cust.tani.id,
    issueDate: today,
    dueDate: addDays(today, 14),
    items: [{ productId: prod("Pendirian PT"), description: "Pendirian PT Perorangan — Rumah Tani Digital", quantity: 1, unitPrice: 2_500_000 }],
    notes: "Menunggu kelengkapan KTP direktur.",
    send: false,
  });
  const printInv = await billing.createInvoice(S(), {
    customerId: cust.samudra.id,
    issueDate: addDays(today, -3),
    dueDate: addDays(today, 7),
    items: [
      { productId: prod("Cetak Dokumen"), description: "Cetak laporan klien A4 berwarna", quantity: 350, unitPrice: 2_000 },
      { productId: prod("Jasa Pembukuan"), description: "Jasa pembukuan bulan lalu", quantity: 1, unitPrice: 1_500_000 },
    ],
    send: true,
  });
  void printInv;

  // Permintaan layanan dari pelanggan
  const reqs = [
    { c: "arunika", category: "Fasilitas", subject: "AC ruang PO-208 meneteskan air", description: "AC unit dekat jendela meneteskan air sejak pagi, mohon dicek teknisi.", priority: "HIGH", status: "OPEN" },
    { c: "kopikita", category: "Akses", subject: "Tambah 2 kartu akses karyawan baru", description: "Mohon dibuatkan 2 kartu akses untuk karyawan baru atas nama Sari dan Joko.", priority: "MEDIUM", status: "IN_PROGRESS" },
    { c: "maya", category: "Surat & Paket", subject: "Konfirmasi surat dari KPP Pratama", description: "Apakah ada surat dari KPP Pratama Pondok Aren minggu ini?", priority: "MEDIUM", status: "RESOLVED", response: "Ada 1 surat, sudah kami scan dan kirim via email." },
    { c: "rupa", category: "Internet", subject: "Wi-Fi lantai 2 lambat sore hari", description: "Kecepatan turun ke 5 Mbps setiap jam 3-5 sore.", priority: "LOW", status: "OPEN" },
  ];
  const kopikitaMembership = (await repo.membership.list({ where: { customerId: cust.kopikita.id } }))[0];
  for (const r of reqs) {
    const created = await repo.serviceRequest.create({
      customerId: cust[r.c].id,
      category: r.category,
      subject: r.subject,
      description: r.description,
      priority: r.priority as "HIGH" | "MEDIUM" | "LOW",
      status: "OPEN",
      response: null,
      createdById: r.c === "kopikita" ? kopikitaMembership?.userId ?? null : null,
    });
    if (r.status !== "OPEN") await repo.serviceRequest.update(created.id, { status: r.status as "IN_PROGRESS" | "RESOLVED", response: r.response ?? null });
  }

  // Booking mendatang untuk pelanggan portal (hari ini & besok)
  setClock(new Date(realNow));
  for (const [code, dayOffset, hour, dur, title] of [
    ["MR-01", 1, 10, 2, "Rapat supplier biji kopi"],
    ["PS-01", 3, 14, 2, "Rekaman konten brand story"],
  ] as const) {
    try {
      await bookings.createBooking(S(), {
        spaceId: sp[code].id,
        customerId: cust.kopikita.id,
        title,
        startAt: wib(addDays(today, dayOffset), hour),
        endAt: wib(addDays(today, dayOffset), hour + dur),
        attendees: 3,
        createInvoice: true,
      });
    } catch {
      /* bentrok → lewati */
    }
  }

  // Segarkan status (overdue, kontrak berakhir)
  await contracts.listContracts(S(), {});
  await billing.listInvoices(S(), {});

  return { organizationId: organization.id, ownerId: owner.id };
}
