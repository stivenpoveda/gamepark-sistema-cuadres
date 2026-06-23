import { NextResponse } from 'next/server';
import { ensureFinancialBaseData } from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    await ensureFinancialBaseData(auth.profile);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo inicializar Admin Bancos' }, { status: 400 });
  }
}
