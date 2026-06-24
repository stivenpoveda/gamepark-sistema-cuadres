import { NextResponse } from 'next/server';
import { createTransferBetweenAccounts, ensureFinancialBaseData } from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    const transfer = await createTransferBetweenAccounts(auth.profile, {
      cuentaOrigenId: body.cuentaOrigenId,
      cuentaDestinoId: body.cuentaDestinoId || null,
      cuentaExterna: body.cuentaExterna || null,
      valor: Number(body.valor || 0),
      descripcion: body.descripcion,
      fechaMovimiento: body.fechaMovimiento,
      idempotencyKey: body.idempotencyKey || null,
    });

    return NextResponse.json({ success: true, transfer });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo crear la transferencia' }, { status: 400 });
  }
}
