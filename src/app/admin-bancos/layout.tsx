'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  ChartNoAxesCombined,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Menu,
  Settings2,
  Wallet,
  X,
} from 'lucide-react';
import { authorizedJsonFetch } from '@/lib/admin-bancos';
import { canAccessBankAdmin } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Usuario } from '@/types';

const navItems = [
  { href: '/admin-bancos', label: 'Dashboard Financiero', icon: ChartNoAxesCombined },
  { href: '/admin-bancos/cuentas', label: 'Cuentas Bancarias', icon: Building2 },
  { href: '/admin-bancos/movimientos', label: 'Movimientos', icon: Wallet },
  { href: '/admin-bancos/transferencias', label: 'Transferencias', icon: ArrowLeftRight },
  { href: '/admin-bancos/reportes', label: 'Reportes', icon: FileSpreadsheet },
  { href: '/admin-bancos/gestion', label: 'Gestion de Cuentas', icon: Settings2 },
] as const;

export default function AdminBancosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login?reason=session');
        return;
      }

      const { data: profile } = await supabase.from('usuarios').select('*').eq('id', session.user.id).maybeSingle();
      if (!profile || !profile.activo || !canAccessBankAdmin(profile.rol)) {
        router.replace('/login?reason=profile');
        return;
      }

      await authorizedJsonFetch('/api/admin-bancos/bootstrap', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setUser(profile);
      setLoading(false);
    };

    init();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-company relative overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`inset-y-0 left-0 z-50 w-72 text-white flex-shrink-0 transform transition-transform duration-300 ${
          sidebarOpen ? 'fixed translate-x-0' : 'hidden'
        } md:static md:block md:translate-x-0`}
      >
        <div className="h-full bg-black/30 backdrop-blur-md border-r border-white/20 flex flex-col">
          <div className="p-6 border-b border-white/20 relative">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 md:hidden text-white hover:text-white/80"
            >
              <X className="w-6 h-6" />
            </button>
            <img src="/logo-gamepark.png" alt="Game Park" className="w-full" />
            <p className="text-sm opacity-80 mt-2 text-center">Admin Bancos</p>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 mt-4 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesion
            </button>
          </div>

          <nav className="px-4 py-6 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 ${
                    active ? 'bg-white/20' : 'hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-30 bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 md:hidden">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white p-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              <Menu className="w-6 h-6" />
            </button>
            <img src="/logo-gamepark.png" alt="Game Park" className="h-10" />
            <div className="w-10" />
          </div>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
