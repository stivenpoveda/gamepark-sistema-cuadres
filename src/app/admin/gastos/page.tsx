'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/utils';
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { GastoDiario, Usuario, PuntoDeVenta } from '@/types';
import UploadFoto from '@/components/UploadFoto';
import toast from 'react-hot-toast';

const categoriasGastos = [
  'Mantenimiento y Reparaciones',
  'Pagos Tecnico - Auditor Mecanico',
  'Servicio Publicos y Telefono',
  'Turnos',
  'Transporte, Fletes y Acarreos Maquinaria y Repuestos',
  'Fiestas',
  'Compra redencion',
  'Peluches',
  'Utiles-Papeleria y Fotocopias',
  'Base Refrigierios y H20',
  'Bioseguridad',
  'Publicidad y avisos varios',
  'Compra de aseo',
  'Viaticos-Pago hotel',
  'Tarjetas malas y devoluciones',
  'Otros'
];

export default function GastosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [gastos, setGastos] = useState<GastoDiario[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newGasto, setNewGasto] = useState<Partial<GastoDiario>>({
    categoria: 'general',
  });

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const [userRes, pdvRes] = await Promise.all([
        supabase.from('usuarios').select('*').eq('email', session.user.email).single(),
        supabase.from('puntos_de_venta').select('*')
      ]);
      
      const userData = userRes.data;
      if (userData) {
        userData.punto_de_venta = (pdvRes.data || []).find(pdv => pdv.id === userData.punto_de_venta_id);
      }

      setUser(userData);
      setPuntoVenta(userData?.punto_de_venta || null);

      if (userData?.punto_de_venta_id) {
        const { data: cuadresData } = await supabase
          .from('cuadres_diarios')
          .select('id')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .order('fecha', { ascending: false })
          .limit(30);

        const cuadreIds = cuadresData?.map((c) => c.id) || [];
        if (cuadreIds.length > 0) {
          const { data: gastosData } = await supabase
            .from('gastos_diarios')
            .select('*')
            .in('cuadre_id', cuadreIds)
            .order('fecha', { ascending: false });
          setGastos(gastosData || []);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const handleAddGasto = async () => {
    if (!user?.punto_de_venta_id || !newGasto.descripcion || !newGasto.valor) return;

    const today = new Date().toISOString().split('T')[0];
    const { data: cuadreData } = await supabase
      .from('cuadres_diarios')
      .select('id')
      .eq('punto_de_venta_id', user.punto_de_venta_id)
      .eq('fecha', today)
      .single();

    let cuadreId = cuadreData?.id;
    if (!cuadreId) {
      const { data: newCuadre } = await supabase
        .from('cuadres_diarios')
        .insert({
          punto_de_venta_id: user.punto_de_venta_id,
          usuario_id: user.id,
          fecha: today,
          estado: 'borrador',
        })
        .select()
        .single();
      cuadreId = newCuadre?.id;
    }

    const { data } = await supabase
      .from('gastos_diarios')
      .insert({
        cuadre_id: cuadreId,
        descripcion: newGasto.descripcion,
        categoria: newGasto.categoria || 'general',
        valor: newGasto.valor,
        url_foto_factura: newGasto.url_foto_factura,
        fecha: today,
        registrado_por: user.id,
      })
      .select()
      .single();

    setGastos([data, ...gastos]);
    setNewGasto({ categoria: 'general' });
    setShowModal(false);
    toast.success('Gasto agregado');
  };

  const handleDeleteGasto = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return;
    await supabase.from('gastos_diarios').delete().eq('id', id);
    setGastos(gastos.filter((g) => g.id !== id));
    toast.success('Gasto eliminado');
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
          <a href="/admin" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Dashboard
          </a>
          <a href="/admin/gastos" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
            Gastos
          </a>
          <a href="/admin/turneros" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Turneros
          </a>
          <a href="/admin/reportes" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Reportes
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')} className="text-primary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Gastos</h1>
            <p className="text-gray-600">{puntoVenta?.nombre}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Nuevo Gasto
          </button>
        </div>

        <div className="space-y-4">
          {gastos.map((gasto) => (
            <div key={gasto.id} className="bg-white p-6 rounded-xl shadow-md flex justify-between items-start">
              <div>
                <p className="font-medium">{gasto.descripcion}</p>
                <p className="text-sm text-gray-500">{gasto.categoria}</p>
                <p className="text-sm text-gray-400">{new Date(gasto.fecha).toLocaleDateString()}</p>
                {gasto.url_foto_factura && (
                  <img
                    src={gasto.url_foto_factura}
                    alt="Factura"
                    className="w-20 h-20 object-cover rounded mt-2"
                  />
                )}
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xl font-bold">{formatCOP(gasto.valor)}</p>
                <button
                  onClick={() => handleDeleteGasto(gasto.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
          {gastos.length === 0 && (
            <div className="bg-white p-12 rounded-xl shadow-md text-center">
              <p className="text-gray-500">No hay gastos registrados</p>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">Nuevo Gasto</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={newGasto.descripcion || ''}
                    onChange={(e) => setNewGasto({ ...newGasto, descripcion: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select
                    value={newGasto.categoria || 'general'}
                    onChange={(e) => setNewGasto({ ...newGasto, categoria: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  >
                    {categoriasGastos.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                  <input
                    type="number"
                    value={newGasto.valor || ''}
                    onChange={(e) => setNewGasto({ ...newGasto, valor: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto Factura</label>
                  <UploadFoto
                    bucket="soportes"
                    currentUrl={newGasto.url_foto_factura}
                    onUpload={(url) => setNewGasto({ ...newGasto, url_foto_factura: url })}
                    onRemove={() => setNewGasto({ ...newGasto, url_foto_factura: undefined })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddGasto}
                  className="px-4 py-2 bg-primary text-white rounded-lg"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
