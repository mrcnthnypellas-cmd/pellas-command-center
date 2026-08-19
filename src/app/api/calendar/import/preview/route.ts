import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { parseAndValidateCalendarImport } from '@/lib/calendarImport';

// Parse + validate only — nothing is written to the database here. The UI shows this
// preview with per-row errors and the user must explicitly confirm before /commit runs.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'calendarEvent', action: 'create', resourceCompanyId: ctx.companyId });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { results, missingColumns } = parseAndValidateCalendarImport(buffer);

    return NextResponse.json({
      results,
      missingColumns,
      validCount: results.filter((r) => r.valid).length,
      invalidCount: results.filter((r) => !r.valid).length,
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Could not parse file — is it a valid .xlsx?' }, { status: 400 });
  }
}
