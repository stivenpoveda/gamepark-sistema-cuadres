'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const didShowReason = useRef(false);

  useEffect(() => {
    if (didShowReason.current) return;
    const reason = searchParams.get('reason');
    if (!reason) return;

    didShowReason.current = true;
    if (reason === 'session') toast.error('Tu sesión no se pudo validar. Intenta iniciar sesión de nuevo.');
    if (reason === 'profile') toast.error('No se encontró tu usuario en el sistema. Contacta al administrador.');
    if (reason === 'inactive') toast.error('Tu usuario está inactivo.');
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;

      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; i < 4 && !session; i++) {
        await sleep(300);
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session) throw new Error('No se pudo establecer sesión. Intenta de nuevo.');

      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (userError) {
        console.error('Error al buscar usuario:', userError);
        throw new Error('No se pudo validar el usuario en el sistema');
      }

      if (!userData?.activo) {
        await supabase.auth.signOut();
        throw new Error('Usuario inactivo');
      }

      if (userData.rol === 'superadmin' || userData.rol === 'superadministrador') {
        router.replace('/superadmin');
      } else {
        router.replace('/admin');
      }
      toast.success('Inicio de sesión exitoso');
    } catch (error: any) {
      toast.error(error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-company flex items-center justify-center px-4 py-12">
      <div className="absolute top-0 left-0 w-48 h-48 bg-primary/10 rounded-full -translate-x-24 -translate-y-24 sm:w-64 sm:h-64 sm:-translate-x-32 sm:-translate-y-32"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-secondary/10 rounded-full translate-x-32 translate-y-32 sm:w-80 sm:h-80 sm:translate-x-40 sm:translate-y-40"></div>
      
      <div className="relative w-full max-w-md space-y-8 bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/30 p-8 sm:p-10">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src="/logo-gamepark.png" 
              alt="Game Park" 
              className="mx-auto mb-4 sm:mb-6 w-48 sm:w-64 drop-shadow-lg"
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Sistema de Cuadres de Efectivo
            </h2>
            <p className="text-gray-600 text-base sm:text-lg font-medium">
              Inicia sesión para continuar
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6 relative z-10">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm sm:text-base font-medium text-gray-900">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 sm:py-4 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 text-base sm:text-lg"
              placeholder="tu.correo@gamepark.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm sm:text-base font-medium text-gray-900">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 sm:py-4 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 text-base sm:text-lg"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center gap-2 py-4 px-4 sm:py-5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] text-lg sm:text-xl"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-company flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  );
}