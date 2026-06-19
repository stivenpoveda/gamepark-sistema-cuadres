'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDefaultRouteForRole } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session) {
          router.replace('/login?reason=session');
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('usuarios')
          .select('rol, activo')
          .eq('id', session.user.id)
          .single();

        if (cancelled) return;

        if (userError || !userData?.activo) {
          await supabase.auth.signOut();
          router.replace(!userData?.activo ? '/login?reason=inactive' : '/login?reason=profile');
          return;
        }

        router.replace(getDefaultRouteForRole(userData.rol));
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!cancelled) router.replace('/login');
    }, 8000);

    checkAuth();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}
