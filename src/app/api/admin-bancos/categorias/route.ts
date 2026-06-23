import { NextResponse } from 'next/server';
import { requireRoleFromRequest } from '@/lib/server-auth';
import { ensureFinancialBaseData, upsertFinancialCategory } from '@/lib/admin-bancos-server';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: false, allowTreasury: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    await ensureFinancialBaseData(auth.profile);

    const category = await upsertFinancialCategory(auth.profile, {
      id: body.id,
      nombre: body.nombre,
      tipo: body.tipo,
      descripcion: body.descripcion,
      activa: body.activa ?? true,
    });

    return NextResponse.json({ success: true, category });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo guardar la categoria' }, { status: 400 });
  }
}
