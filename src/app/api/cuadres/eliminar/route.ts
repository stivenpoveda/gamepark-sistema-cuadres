import { NextResponse } from 'next/server';
import { deleteCuadreWithFinancialCleanup } from '@/lib/admin-bancos-server';
import { isAccountingRole, isSuperRole } from '@/lib/roles';
import { supabaseServer } from '@/lib/supabase-server';

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'No se encontro un token de autenticacion valido' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'No se pudo validar el usuario autenticado' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.activo) {
      return NextResponse.json({ error: 'El perfil no existe o no esta activo' }, { status: 403 });
    }

    const body = await request.json();
    const cuadreId = String(body?.cuadreId || '').trim();

    if (!cuadreId) {
      return NextResponse.json({ error: 'Debes indicar el cuadre a eliminar' }, { status: 400 });
    }

    const { data: cuadre, error: cuadreError } = await supabaseServer
      .from('cuadres_diarios')
      .select('id,punto_de_venta_id')
      .eq('id', cuadreId)
      .single();

    if (cuadreError || !cuadre) {
      return NextResponse.json({ error: 'No se encontro el cuadre a eliminar' }, { status: 404 });
    }

    const canManageAnyCuadre = isSuperRole(profile.rol) || isAccountingRole(profile.rol);
    const canManageOwnCuadre =
      profile.rol === 'admin_pdv' &&
      profile.punto_de_venta_id &&
      profile.punto_de_venta_id === cuadre.punto_de_venta_id;

    if (!canManageAnyCuadre && !canManageOwnCuadre) {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar este cuadre' },
        { status: 403 }
      );
    }

    const result = await deleteCuadreWithFinancialCleanup(profile, cuadreId);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo eliminar el cuadre' },
      { status: 400 }
    );
  }
}
