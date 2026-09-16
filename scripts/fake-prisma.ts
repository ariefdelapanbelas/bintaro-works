// PrismaClient tiruan untuk menguji PrismaRepo tanpa database.
// Membaca prisma/schema.prisma agar setiap create/update/where divalidasi terhadap
// nama kolom, tipe, enum, dan kolom wajib — menangkap ketidaksesuaian skema ↔ kode.
import { readFileSync } from "node:fs";

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  hasDefault: boolean;
  defaultRaw?: string;
}

export function parseSchema(path: string) {
  const src = readFileSync(path, "utf8");
  const enums = new Map<string, Set<string>>();
  const models = new Map<string, Map<string, Field>>();
  const uniques = new Map<string, string[][]>();
  const blockRe = /(model|enum)\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  const raw: [string, string, string][] = [];
  while ((m = blockRe.exec(src))) raw.push([m[1], m[2], m[3]]);
  for (const [kind, name, body] of raw) {
    if (kind === "enum") enums.set(name, new Set(body.split("\n").map((l) => l.replace(/\/\/.*/, "").trim()).filter(Boolean)));
  }
  const modelNames = new Set(raw.filter((r) => r[0] === "model").map((r) => r[1]));
  for (const [kind, name, body] of raw) {
    if (kind !== "model") continue;
    const fields = new Map<string, Field>();
    const u: string[][] = [];
    for (const line0 of body.split("\n")) {
      const line = line0.replace(/\/\/.*/, "").trim();
      if (!line) continue;
      if (line.startsWith("@@unique")) {
        u.push(line.match(/\[([^\]]+)\]/)![1].split(",").map((s) => s.trim()));
        continue;
      }
      if (line.startsWith("@@")) continue;
      const [fname, ftype] = line.split(/\s+/);
      const base = ftype.replace(/[?[\]]/g, "");
      if (modelNames.has(base)) continue; // relasi
      fields.set(fname, {
        name: fname,
        type: base,
        optional: ftype.endsWith("?"),
        list: ftype.endsWith("[]"),
        hasDefault: /@default|@updatedAt/.test(line),
        defaultRaw: line.match(/@default\(([^)]*)\)/)?.[1],
      });
      if (/@unique/.test(line) && !/@@/.test(line)) u.push([fname]);
    }
    models.set(name, fields);
    uniques.set(name, u);
  }
  return { enums, models, uniques };
}

type Row = Record<string, unknown>;

export function createFakePrisma(schemaPath: string) {
  const { enums, models, uniques } = parseSchema(schemaPath);
  const store = new Map<string, Row[]>();
  let seq = 0;

  const fail = (msg: string): never => {
    throw new Error(`[fake-prisma] ${msg}`);
  };

  function checkValue(model: string, f: Field, v: unknown, ctx: string) {
    if (v === null) {
      if (!f.optional) fail(`${model}.${f.name} tidak boleh null (${ctx})`);
      return;
    }
    if (f.list) {
      if (!Array.isArray(v)) fail(`${model}.${f.name} harus array (${ctx})`);
      return;
    }
    switch (f.type) {
      case "String":
        if (typeof v !== "string") fail(`${model}.${f.name} harus string, dapat ${typeof v} (${ctx})`);
        break;
      case "Int":
        if (typeof v === "object" && v && "increment" in (v as Row)) break;
        if (typeof v !== "number" || !Number.isInteger(v)) fail(`${model}.${f.name} harus Int, dapat ${String(v)} (${ctx})`);
        if (Math.abs(v as number) > 2147483647) fail(`${model}.${f.name} melebihi batas Int32: ${v} (${ctx})`);
        break;
      case "Boolean":
        if (typeof v !== "boolean") fail(`${model}.${f.name} harus Boolean (${ctx})`);
        break;
      case "DateTime":
        if (!(v instanceof Date) || Number.isNaN(v.getTime())) fail(`${model}.${f.name} harus Date valid (${ctx})`);
        break;
      default:
        if (enums.has(f.type) && !enums.get(f.type)!.has(v as string)) fail(`${model}.${f.name} enum ${f.type} tidak mengenal '${String(v)}' (${ctx})`);
    }
  }

  function checkData(model: string, data: Row, ctx: string, isCreate: boolean) {
    const fields = models.get(model)!;
    for (const [k, v] of Object.entries(data)) {
      const f = fields.get(k) ?? fail(`${model} tidak punya kolom '${k}' (${ctx})`);
      if (v === undefined) continue;
      checkValue(model, f, v, ctx);
    }
    if (isCreate) {
      for (const f of fields.values()) {
        if (!f.optional && !f.hasDefault && !f.list && data[f.name] === undefined) fail(`${model}.${f.name} wajib diisi saat create (${ctx})`);
      }
    }
  }

  function matchWhere(model: string, row: Row, where: Row = {}): boolean {
    const fields = models.get(model)!;
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k.includes("_")) {
        // unique komposit, mis. organizationId_key
        const parts = k.split("_");
        if (parts.every((p) => fields.has(p))) {
          if (!parts.every((p) => eq(row[p], (cond as Row)[p]))) return false;
          continue;
        }
      }
      if (!fields.has(k)) fail(`${model} where: kolom '${k}' tidak ada`);
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as Row;
        if ("in" in c) {
          if (!(c.in as unknown[]).some((x) => eq(row[k], x))) return false;
          for (const x of c.in as unknown[]) checkValue(model, fields.get(k)!, x, "where.in");
          continue;
        }
        fail(`${model} where: operator tidak didukung ${JSON.stringify(c)}`);
      }
      if (cond !== null) checkValue(model, fields.get(k)!, cond, "where");
      if (!eq(row[k], cond)) return false;
    }
    return true;
  }
  const eq = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));

  function applyDefaults(model: string, data: Row): Row {
    const fields = models.get(model)!;
    const row: Row = {};
    const now = new Date();
    for (const f of fields.values()) {
      if (data[f.name] !== undefined) row[f.name] = data[f.name];
      else if (f.name === "id") row.id = `fk${++seq}`;
      else if (f.name === "createdAt" || f.name === "updatedAt") row[f.name] = now;
      else if (f.list) row[f.name] = [];
      else if (f.hasDefault) row[f.name] = defaultFor(f);
      else row[f.name] = null;
    }
    return row;
  }
  function defaultFor(f: Field) {
    const d = f.defaultRaw;
    if (d === undefined) return null;
    if (f.type === "Int") return Number(d);
    if (f.type === "Boolean") return d === "true";
    if (f.type === "String") return d.replace(/^"|"$/g, "");
    if (enums.has(f.type)) return d;
    return null;
  }

  function checkUnique(model: string, row: Row, exceptId?: unknown) {
    for (const cols of uniques.get(model) ?? []) {
      const rows = store.get(model) ?? [];
      if (rows.some((r) => r.id !== exceptId && cols.every((c) => eq(r[c], row[c])))) {
        const e = new Error(`Unique constraint failed on ${model}(${cols.join(",")})`) as Error & { code: string };
        e.code = "P2002";
        throw e;
      }
    }
  }

  function sortRows(rows: Row[], orderBy?: Row) {
    if (!orderBy) return rows;
    const [field, dir] = Object.entries(orderBy)[0];
    return [...rows].sort((a, b) => {
      const av = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field];
      const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field];
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return ((av as number) < (bv as number) ? -1 : 1) * (dir === "asc" ? 1 : -1);
    });
  }

  const clone = <T,>(v: T): T => structuredClone(v);

  function delegate(model: string) {
    const rows = () => {
      if (!store.has(model)) store.set(model, []);
      return store.get(model)!;
    };
    return {
      async findMany(args: { where?: Row; orderBy?: Row; take?: number } = {}) {
        let out = rows().filter((r) => matchWhere(model, r, args.where));
        out = sortRows(out, args.orderBy);
        if (args.take) out = out.slice(0, args.take);
        return clone(out);
      },
      async findFirst(args: { where?: Row } = {}) {
        const r = rows().find((x) => matchWhere(model, x, args.where));
        return r ? clone(r) : null;
      },
      async findUnique(args: { where: Row }) {
        const r = rows().find((x) => matchWhere(model, x, args.where));
        return r ? clone(r) : null;
      },
      async count(args: { where?: Row } = {}) {
        return rows().filter((r) => matchWhere(model, r, args.where)).length;
      },
      async create(args: { data: Row }) {
        checkData(model, args.data, "create", true);
        const row = applyDefaults(model, args.data);
        checkUnique(model, row);
        rows().push(row);
        return clone(row);
      },
      async update(args: { where: Row; data: Row }) {
        checkData(model, args.data, "update", false);
        const r = rows().find((x) => matchWhere(model, x, args.where));
        if (!r) {
          const e = new Error("Record not found") as Error & { code: string };
          e.code = "P2025";
          throw e;
        }
        const next = { ...r, ...Object.fromEntries(Object.entries(args.data).filter(([, v]) => v !== undefined)) };
        if ("updatedAt" in next) next.updatedAt = new Date();
        checkUnique(model, next, r.id);
        Object.assign(r, next);
        return clone(r);
      },
      async updateMany(args: { where: Row; data: Row }) {
        checkData(model, args.data, "updateMany", false);
        let count = 0;
        for (const r of rows().filter((x) => matchWhere(model, x, args.where))) {
          const next = { ...r, ...Object.fromEntries(Object.entries(args.data).filter(([, v]) => v !== undefined)) };
          if ("updatedAt" in next) next.updatedAt = new Date();
          checkUnique(model, next, r.id);
          Object.assign(r, next);
          count++;
        }
        return { count };
      },
      async deleteMany(args: { where: Row }) {
        const all = rows();
        let count = 0;
        for (let i = all.length - 1; i >= 0; i--) {
          if (matchWhere(model, all[i], args.where)) {
            all.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      async upsert(args: { where: Row; create: Row; update: Row }) {
        const r = rows().find((x) => matchWhere(model, x, args.where));
        if (!r) return this.create({ data: args.create });
        const data: Row = {};
        for (const [k, v] of Object.entries(args.update)) {
          data[k] = v && typeof v === "object" && "increment" in (v as Row) ? (r[k] as number) + ((v as Row).increment as number) : v;
        }
        return this.update({ where: { id: r.id }, data });
      },
    };
  }

  const client: Record<string, unknown> = {};
  for (const name of models.keys()) client[name[0].toLowerCase() + name.slice(1)] = delegate(name);
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const snapshot = new Map([...store.entries()].map(([k, v]) => [k, structuredClone(v)]));
    try {
      return await fn(client);
    } catch (e) {
      store.clear();
      for (const [k, v] of snapshot) store.set(k, v);
      throw e;
    }
  };
  client.$disconnect = async () => {};
  return { client, store };
}
