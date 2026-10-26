import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LogInForm } from '@/features/auth/log-in-form';
import { getUser } from '@/server/http/auth';

export default async function LogInPage() {
  if (await getUser()) redirect('/');
  return (
    <Suspense>
      <LogInForm />
    </Suspense>
  );
}
