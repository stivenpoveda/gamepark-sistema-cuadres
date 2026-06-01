import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Nota: La protección real debe hacerse en el cliente con supabase.auth.getSession()
  // o usando Server Components. Este middleware es solo para redirecciones básicas.
  
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
