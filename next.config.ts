import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security/headers';

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321');

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Agent prompts are read from disk at runtime (agent-runtime.md §3).
  outputFileTracingIncludes: { '/api/v1/**': ['./src/server/agents/**/prompt.v*.md'] },
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol === 'http:' ? 'http' : 'https',
        hostname: supabaseUrl.hostname,
        ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
        pathname: '/storage/v1/object/public/exercise-images/**',
      },
    ],
  },
  async headers() {
    // Static security headers (security plan S-7, D-47); the per-request CSP is set in src/proxy.ts.
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default config;
