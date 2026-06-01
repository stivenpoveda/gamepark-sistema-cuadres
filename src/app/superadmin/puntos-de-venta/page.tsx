'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';

export default function PuntosDeVentaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPdv, setEditingPdv] = useState<PuntoDeVenta | null>(null);
  const [newPdv, setNewPdv] = useState({
    nombre: '',
    ciudad: '',
    direccion: '',
    activo: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('puntos_de_venta').select('*').order('nombre');
      setPuntosVenta(data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPdv) {
        const { error } = await supabase
          .from('puntos_de_venta')
          .update({
            nombre: newPdv.nombre,
            ciudad: newPdv.ciudad,
            direccion: newPdv.direccion,
          })
          .eq('id', editingPdv.id);
        if (error) throw error;
        toast.success('Punto de venta actualizado');
      } else {
        const { error } = await supabase.from('puntos_de_venta').insert(newPdv);
        if (error) throw error;
        toast.success('Punto de venta creado');
      }

      const { data } = await supabase.from('puntos_de_venta').select('*').order('nombre');
      setPuntosVenta(data || []);
      setShowModal(false);
      setEditingPdv(null);
      setNewPdv({
        nombre: '',
        ciudad: '',
        direccion: '',
        activo: true,
      });
    } catch (error: any) {
      toast.error(error.message || 'Error');
    }
  };

  const toggleActivo = async (pdv: PuntoDeVenta) => {
    const { error } = await supabase
      .from('puntos_de_venta')
      .update({ activo: !pdv.activo })
      .eq('id', pdv.id);
    if (error) {
      toast.error('Error al cambiar estado');
      return;
    }
    setPuntosVenta(puntosVenta.map((p) => (p.id === pdv.id ? { ...p, activo: !p.activo } : p)));
  };

  const deletePdv = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este punto de venta?')) return;
    const { error } = await supabase.from('puntos_de_venta').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
      return;
    }
    setPuntosVenta(puntosVenta.filter((p) => p.id !== id));
    toast.success('Punto de venta eliminado');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
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
          <a href="/superadmin/usuarios" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Usuarios
          </a>
          <a href="/superadmin/puntos-de-venta" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
            Puntos de Venta
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/superadmin')} className="text-primary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Puntos de Venta</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Nuevo Punto de Venta
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-light">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nombre</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ciudad</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dirección</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {puntosVenta.map((pdv) => (
                  <tr key={pdv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{pdv.nombre}</td>
                    <td className="px-6 py-4 text-sm">{pdv.ciudad}</td>
                    <td className="px-6 py-4 text-sm">{pdv.direccion || '-'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleActivo(pdv)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          pdv.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {pdv.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingPdv(pdv);
                            setNewPdv({
                              nombre: pdv.nombre,
                              ciudad: pdv.ciudad,
                              direccion: pdv.direccion || '',
                              activo: pdv.activo,
                            });
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePdv(pdv.id)}
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
                {editingPdv ? 'Editar Punto de Venta' : 'Nuevo Punto de Venta'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newPdv.nombre}
                    onChange={(e) => setNewPdv({ ...newPdv, nombre: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input
                    type="text"
                    value={newPdv.ciudad}
                    onChange={(e) => setNewPdv({ ...newPdv, ciudad: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={newPdv.direccion}
                    onChange={(e) => setNewPdv({ ...newPdv, direccion: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingPdv(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                  >
                    {editingPdv ? 'Guardar' : 'Crear'}
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
