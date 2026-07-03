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
    const password = String(body?.password || '');

    if (!userId) {
      return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener mínimo 8 caracteres' },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ error: error.message || 'No se pudo actualizar la contraseña' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo actualizar la contraseña' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: true });
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const redirectTo = body?.redirectTo ? String(body.redirectTo) : undefined;

    if (!email) {
      return NextResponse.json({ error: 'Falta email' }, { status: 400 });
    }

    const { error } = await supabaseServer.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) {
      return NextResponse.json({ error: error.message || 'No se pudo enviar el correo' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo enviar el correo' },
      { status: 500 }
    );
  }
}

