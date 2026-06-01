'use server';

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const { nombre, email, password, rol, punto_de_venta_id } = await request.json();

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmar email automáticamente
    });

    if (authError) throw authError;

    // 2. Crear usuario en la tabla usuarios
    const { error: dbError } = await supabaseServer.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol,
      punto_de_venta_id: punto_de_venta_id || null,
      activo: true,
    });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
