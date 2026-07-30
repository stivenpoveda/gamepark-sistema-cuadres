'use server';

import { NextResponse } from 'next/server';
import { requireRoleFromRequest } from '@/lib/server-auth';
import { supabaseServer } from '@/lib/supabase-server';

export async function PATCH(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: true });
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!userId) {
      return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Falta email' }, { status: 400 });
    }

    const { error: authError } = await supabaseServer.auth.admin.updateUserById(userId, { email });
    if (authError) {
      return NextResponse.json(
        { error: authError.message || 'No se pudo solicitar el cambio de correo' },
        { status: 400 }
      );
    }

    const { error: dbError } = await supabaseServer.from('usuarios').update({ email }).eq('id', userId);
    if (dbError) {
      return NextResponse.json(
        { error: dbError.message || 'No se pudo actualizar el correo en la tabla de usuarios' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo solicitar el cambio de correo' },
      { status: 500 }
    );
  }
}

