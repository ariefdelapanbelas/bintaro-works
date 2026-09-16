import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paket yang harus tetap di-resolve oleh Node (tidak dibundel) di sisi server.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  poweredByHeader: false,
};

export default nextConfig;
