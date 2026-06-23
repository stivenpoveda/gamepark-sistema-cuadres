import { NextResponse } from 'next/server';
import {
  ensureFinancialBaseData,
  syncApprovedCuadreConsignaciones,
  syncApprovedCuadresBatch,
} from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    if (body.cuadreId) {
      const result = await syncApprovedCuadreConsignaciones(auth.profile, {
        cuadreId: body.cuadreId,
        overridesByConsignacionId:
          body.overridesByConsignacionId && typeof body.overridesByConsignacionId === 'object'
            ? body.overridesByConsignacionId
            : undefined,
        forceHistorical: Boolean(body.forceHistorical),
      });
      return NextResponse.json({ success: true, result });
    }

    const results = await syncApprovedCuadresBatch(
      auth.profile,
      Array.isArray(body.cuadreIds) ? body.cuadreIds : undefined
    );

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo registrar el cuadre' }, { status: 400 });
  }
}
