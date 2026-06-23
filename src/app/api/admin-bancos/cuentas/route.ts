import { NextResponse } from 'next/server';
import { requireRoleFromRequest } from '@/lib/server-auth';
import { ensureFinancialBaseData, upsertFinancialAccount } from '@/lib/admin-bancos-server';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    const account = await upsertFinancialAccount(auth.profile, {
      id: body.id,
      nombre: body.nombre,
      banco: body.banco,
      titular: body.titular,
      numeroCuenta: body.numeroCuenta,
      tipoCuenta: body.tipoCuenta,
      tipoEntidad: body.tipoEntidad,
      saldoInicial: Number(body.saldoInicial || 0),
      estado: body.estado,
      descripcion: body.descripcion,
    });

    return NextResponse.json({ success: true, account });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo guardar la cuenta' }, { status: 400 });
  }
}
