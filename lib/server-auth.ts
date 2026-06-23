import { NextResponse } from 'next/server';
import { isSuperRole, isTreasuryRole } from '@/lib/roles';
import { supabaseServer } from '@/lib/supabase-server';
import type { Usuario } from '@/types';

export type ServerAuthResult =
  | { ok: true; profile: Usuario }
  | { ok: false; response: NextResponse };

export async function requireRoleFromRequest(
  request: Request,
  options: {
    allowSuper?: boolean;
    allowTreasury?: boolean;
  } = {}
): Promise<ServerAuthResult> {
  const { allowSuper = true, allowTreasury = false } = options;
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No se encontro un token de autenticacion valido' }, { status: 401 }),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No se pudo validar el usuario autenticado' }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.activo) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'El perfil no existe o no esta activo' }, { status: 403 }),
    };
  }

  const canPass =
    (allowSuper && isSuperRole(profile.rol)) || (allowTreasury && isTreasuryRole(profile.rol));

  if (!canPass) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    profile,
  };
}
