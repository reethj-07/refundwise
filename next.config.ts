import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the policy file (read at runtime by getRefundPolicy) is bundled into
  // the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
};

export default nextConfig;
