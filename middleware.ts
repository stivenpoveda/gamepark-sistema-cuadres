import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import {
  canManageSuperadminCatalogs,
  getDefaultRouteForRole,
  isAccountingRole,
  isSuperRole,
} from '@/lib/roles';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) return res;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/superadmin');

  if (!session) {
    if (isProtected) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('reason', 'session');
      return NextResponse.redirect(url);
    }
    return res;
  }

  if (!isProtected && pathname !== '/login') return res;

  const { data: profile, error: profileError } = await supabase
    .from('usuarios')
    .select('rol,activo')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile?.activo) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('reason', !profile?.activo ? 'inactive' : 'profile');
    return NextResponse.redirect(url);
  }

  if (pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = getDefaultRouteForRole(profile.rol);
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/superadmin') && profile.rol === 'admin_pdv') {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const isAdminCuadreDetalle =
    pathname.startsWith('/admin/cuadre/') && !pathname.startsWith('/admin/cuadre/nuevo');
  const isSuperadminOnlyPath =
    pathname.startsWith('/superadmin/usuarios') || pathname.startsWith('/superadmin/puntos-de-venta');

  if (isSuperadminOnlyPath && !canManageSuperadminCatalogs(profile.rol)) {
    const url = req.nextUrl.clone();
    url.pathname = '/superadmin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin') && isSuperRole(profile.rol) && !isAdminCuadreDetalle) {
    const url = req.nextUrl.clone();
    url.pathname = '/superadmin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin') && isAccountingRole(profile.rol) && !isAdminCuadreDetalle) {
    const url = req.nextUrl.clone();
    url.pathname = '/superadmin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
