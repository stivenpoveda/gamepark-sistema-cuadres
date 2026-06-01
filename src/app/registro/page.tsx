'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegistroPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Primero verificamos que el usuario exista en la tabla usuarios
      const { data: existingUser, error: checkError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', normalizedEmail)
        .single();

      if (checkError || !existingUser) {
        throw new Error('No hay un usuario registrado con este email. Contacta al administrador.');
      }

      if (!existingUser.activo) {
        throw new Error('Este usuario está inactivo.');
      }

      // Crear el usuario en Auth
      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) throw signUpError;

      toast.success('Cuenta creada exitosamente. Ahora puedes iniciar sesión.');
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-company flex items-center justify-center px-4 py-12">
      <div className="absolute top-0 left-0 w-48 h-48 bg-primary/10 rounded-full -translate-x-24 -translate-y-24 sm:w-64 sm:h-64 sm:-translate-x-32 sm:-translate-y-32"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-secondary/10 rounded-full translate-x-32 translate-y-32 sm:w-80 sm:h-80 sm:translate-x-40 sm:translate-y-40"></div>
      
      <div className="relative w-full max-w-md space-y-8 bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/30 p-8 sm:p-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/login')} className="text-gray-600 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Crear Cuenta
            </h2>
          </div>
          <div className="w-5"></div>
        </div>

        <p className="text-gray-600 text-sm text-center">
          Ingresa los mismos datos que te dio el administrador
        </p>

        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 relative z-10">
          <div>
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

          <div>
            <label htmlFor="password" className="block text-sm sm:text-base font-medium text-gray-900">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 sm:py-4 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 text-base sm:text-lg"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm sm:text-base font-medium text-gray-900">
              Confirmar Contraseña
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
                Creando cuenta...
              </>
            ) : (
              'Crear Cuenta'
            )}
          </button>
        </form>

        <div className="text-center">
          <p className="text-gray-600 text-sm">
            ¿Ya tienes cuenta?{' '}
            <button
              onClick={() => router.push('/login')}
              className="text-primary font-medium hover:underline"
            >
              Inicia sesión aquí
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
