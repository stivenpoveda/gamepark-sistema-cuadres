import { NextResponse } from 'next/server';
import { ensureFinancialBaseData, syncApprovedCuadreToAccount, syncApprovedCuadresBatch } from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    if (body.cuadreId) {
      const result = await syncApprovedCuadreToAccount(auth.profile, {
        cuadreId: body.cuadreId,
        cuentaId: body.cuentaId,
        forceHistorical: Boolean(body.forceHistorical),
      });
      return NextResponse.json({ success: true, result });
    }

    const results = await syncApprovedCuadresBatch(
      auth.profile,
      body.cuentaId,
      Array.isArray(body.cuadreIds) ? body.cuadreIds : undefined
    );

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo sincronizar el cuadre' }, { status: 400 });
  }
}
