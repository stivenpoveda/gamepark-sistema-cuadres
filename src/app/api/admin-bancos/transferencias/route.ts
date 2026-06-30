import { NextResponse } from 'next/server';
import {
  createTransferBetweenAccounts,
  ensureFinancialBaseData,
  reverseTransferBetweenAccounts,
  updateTransferBetweenAccounts,
} from '@/lib/admin-bancos-server';
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

export async function PATCH(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    const transfer = await updateTransferBetweenAccounts(auth.profile, {
      transferGroupId: String(body.id || ''),
      cuentaOrigenId: body.cuentaOrigenId,
      cuentaDestinoId: body.cuentaDestinoId || null,
      cuentaExterna: body.cuentaExterna || null,
      valor: Number(body.valor || 0),
      descripcion: body.descripcion,
      fechaMovimiento: body.fechaMovimiento,
    });

    return NextResponse.json({ success: true, transfer });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo actualizar la transferencia' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const transferGroupId = String(body?.id || '').trim();

    if (!transferGroupId) {
      return NextResponse.json(
        { error: 'Debes indicar la transferencia a reversar' },
        { status: 400 }
      );
    }

    await reverseTransferBetweenAccounts(auth.profile, transferGroupId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo reversar la transferencia' },
      { status: 400 }
    );
  }
}
