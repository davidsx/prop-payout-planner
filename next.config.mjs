import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives inside a larger repo with other lockfiles; pin the root
  // so Next.js doesn't guess the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
