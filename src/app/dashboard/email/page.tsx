import { requireCtx } from '@/lib/session';
import { EmailCenter } from '@/components/email/EmailCenter';

export default async function EmailPage() {
  await requireCtx();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Email Center</h1>
        <p className="text-sm text-slate-500">
          Compose sends a real email through the configured provider. There is no inbox — this app is not a
          mail server, only a sending integration point.
        </p>
      </div>
      <EmailCenter />
    </div>
  );
}
