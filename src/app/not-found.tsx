import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="eyebrow">404</p>
      <h1 className="text-3xl font-bold">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-muted">Tautan mungkin salah atau data sudah dihapus.</p>
      <Link href="/dashboard" className="btn btn-primary mt-2">
        Kembali ke dashboard
      </Link>
    </div>
  );
}
