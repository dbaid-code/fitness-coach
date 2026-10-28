import { redirect } from 'next/navigation';
import { SignUpForm } from '@/features/auth/sign-up-form';
import { getUser } from '@/server/http/auth';

export default async function SignUpPage() {
  if (await getUser()) redirect('/');
  return <SignUpForm />;
}
