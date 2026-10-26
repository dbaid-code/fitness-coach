import type { ReactNode } from 'react';
import { AppFrame } from '@/components/layout/app-frame';

// (auth) pages: wordmark only, no navigation (D-33).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppFrame nav={false}>{children}</AppFrame>;
}
