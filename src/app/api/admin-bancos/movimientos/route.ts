import { NextResponse } from 'next/server';
import { createFinancialMovement, ensureFinancialBaseData } from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    const type = body.tipoMovimiento;
    if (!['ingreso', 'egreso'].includes(type)) {
      return NextResponse.json({ error: 'Tipo de movimiento no permitido' }, { status: 400 });
    }

    const movement = await createFinancialMovement(auth.profile, {
      cuentaId: body.cuentaId,
      tipoMovimiento: type,
      categoriaId: body.categoriaId || null,
      descripcion: body.descripcion,
      fechaMovimiento: body.fechaMovimiento,
      valor: Number(body.valor || 0),
      pdvId: body.pdvId || null,
      centroCosto: body.centroCosto || null,
      soporteUrl: body.soporteUrl || null,
      origen: 'manual',
      metadata: {
        source: 'admin-bancos-ui',
        idempotency_key: body.idempotencyKey || null,
      },
    });

    return NextResponse.json({ success: true, movement });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo crear el movimiento' }, { status: 400 });
  }
}
