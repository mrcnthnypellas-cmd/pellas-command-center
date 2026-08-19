import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  redirect(session.user.role === 'CLIENT' ? '/portal' : '/dashboard');
}
