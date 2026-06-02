'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Usuario, PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';

export default function UsuariosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [newUser, setNewUser] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'admin_pdv' as 'superadmin' | 'superadministrador' | 'admin_pdv',
    punto_de_venta_id: '',
    activo: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      const [usuariosRes, pdvRes] = await Promise.all([
        supabase.from('usuarios').select('*').order('nombre'),
        supabase.from('puntos_de_venta').select('*').order('nombre'),
      ]);
      
      // Combine data manually
      const usuariosWithPdv = (usuariosRes.data || []).map(usuario => ({
        ...usuario,
        punto_de_venta: (pdvRes.data || []).find(pdv => pdv.id === usuario.punto_de_venta_id)
      }));
      
      setUsuarios(usuariosWithPdv);
      setPuntosVenta(pdvRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const { error } = await supabase
          .from('usuarios')
          .update({
            nombre: newUser.nombre,
            email: newUser.email,
            rol: newUser.rol,
            punto_de_venta_id: newUser.punto_de_venta_id || null,
          })
          .eq('id', editingUser.id);
        if (error) throw error;
        toast.success('Usuario actualizado');
      } else {
        // Llamar a la API para crear el usuario (usa service role key en el servidor)
        const response = await fetch('/api/crear-usuario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: newUser.nombre,
            email: newUser.email,
            password: newUser.password,
            rol: newUser.rol,
            punto_de_venta_id: newUser.punto_de_venta_id || null,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Error al crear usuario');
        }

        toast.success('Usuario creado exitosamente. Puede iniciar sesión con la contraseña establecida.');
      }

      const [usuariosRes, pdvRes] = await Promise.all([
        supabase.from('usuarios').select('*').order('nombre'),
        supabase.from('puntos_de_venta').select('*').order('nombre')
      ]);
      
      const usuariosWithPdv = (usuariosRes.data || []).map(usuario => ({
        ...usuario,
        punto_de_venta: (pdvRes.data || []).find(pdv => pdv.id === usuario.punto_de_venta_id)
      }));
      
      setUsuarios(usuariosWithPdv);
      setShowModal(false);
      setEditingUser(null);
      setNewUser({
        nombre: '',
        email: '',
        password: '',
        rol: 'admin_pdv',
        punto_de_venta_id: '',
        activo: true,
      });
    } catch (error: any) {
      toast.error(error.message || 'Error');
    }
  };

  const toggleActivo = async (usuario: Usuario) => {
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: !usuario.activo })
      .eq('id', usuario.id);
    if (error) {
      toast.error('Error al cambiar estado');
      return;
    }
    setUsuarios(usuarios.map((u) => (u.id === usuario.id ? { ...u, activo: !u.activo } : u)));
  };

  const deleteUsuario = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
      return;
    }
    setUsuarios(usuarios.filter((u) => u.id !== id));
    toast.success('Usuario eliminado');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 overflow-x-hidden">
      <aside className="w-64 bg-primary text-white flex-shrink-0 hidden md:block">
        <div className="p-6">
          <h2 className="text-2xl font-bold">Game Park</h2>
        </div>
        <nav className="px-4">
          <a href="/superadmin" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Dashboard
          </a>
          <a href="/superadmin/reportes" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Reportes
          </a>
          <a href="/superadmin/usuarios" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
            Usuarios
          </a>
          <a href="/superadmin/puntos-de-venta" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Puntos de Venta
          </a>
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-6 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <button onClick={() => router.push('/superadmin')} className="text-primary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Usuarios</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Nuevo Usuario
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[900px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nombre</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rol</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Punto de Venta</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{usuario.nombre}</td>
                    <td className="px-6 py-4 text-sm">{usuario.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        usuario.rol === 'superadmin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {usuario.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">{usuario.punto_de_venta?.nombre || '-'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleActivo(usuario)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          usuario.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(usuario);
                            setNewUser({
                              nombre: usuario.nombre,
                              email: usuario.email,
                              password: '',
                              rol: usuario.rol,
                              punto_de_venta_id: usuario.punto_de_venta_id || '',
                              activo: usuario.activo,
                            });
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteUsuario(usuario.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newUser.nombre}
                    onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required={!editingUser}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={newUser.rol}
                    onChange={(e) => setNewUser({ ...newUser, rol: e.target.value as 'superadmin' | 'admin_pdv' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  >
                    <option value="admin_pdv">Admin PdV</option>
                    <option value="superadmin">Superadmin</option>
                    <option value="superadministrador">Superadministrador</option>
                  </select>
                </div>
                {newUser.rol === 'admin_pdv' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
                    <select
                      value={newUser.punto_de_venta_id}
                      onChange={(e) => setNewUser({ ...newUser, punto_de_venta_id: e.target.value })}
                      required={newUser.rol === 'admin_pdv'}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                    >
                      <option value="">Seleccionar</option>
                      {puntosVenta.map((pdv) => (
                        <option key={pdv.id} value={pdv.id}>{pdv.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingUser(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                  >
                    {editingUser ? 'Guardar' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
