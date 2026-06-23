'use server';

import { NextResponse } from 'next/server';
import { APP_ROLES } from '@/lib/roles';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  let authUserId: string | null = null;
  let normalizedRol = '';
  try {
    const { nombre, email, password, rol, punto_de_venta_id } = await request.json();
    normalizedRol = typeof rol === 'string' ? rol.trim() : '';

    if (!APP_ROLES.includes(normalizedRol as (typeof APP_ROLES)[number])) {
      return NextResponse.json({ error: 'Rol de usuario no válido' }, { status: 400 });
    }

    if (normalizedRol === 'admin_pdv' && !punto_de_venta_id) {
      return NextResponse.json(
        { error: 'Debes seleccionar un punto de venta para el usuario Admin PdV' },
        { status: 400 }
      );
    }

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmar email automáticamente
    });
    authUserId = authData?.user?.id || null;

    if (authError) throw authError;

    // 2. Crear usuario en la tabla usuarios
    const { error: dbError } = await supabaseServer.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol: normalizedRol,
      punto_de_venta_id: normalizedRol === 'admin_pdv' ? punto_de_venta_id || null : null,
      activo: true,
    });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (authUserId && !error?.status) {
      await supabaseServer.auth.admin.deleteUser(authUserId).catch(() => null);
    }
    console.error('Error al crear usuario:', error);

    if (error?.code === 'email_exists' || error?.status === 422) {
      return NextResponse.json(
        { error: 'Ese correo ya existe en autenticacion. Usa otro correo o elimina primero el usuario existente.' },
        { status: 409 }
      );
    }

    if (error?.code === '23514' && String(error?.message || '').includes('usuarios_rol_check')) {
      return NextResponse.json(
        { error: `La base de datos aun no acepta el rol "${normalizedRol}". Debes ejecutar el SQL correspondiente en Supabase.` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
