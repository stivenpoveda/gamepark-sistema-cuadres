'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCOP, getTodayString } from '@/lib/utils';
import { Loader2, ArrowLeft, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { PagoTurnero, Usuario, PuntoDeVenta } from '@/types';
import UploadFoto from '@/components/UploadFoto';
import toast from 'react-hot-toast';
import { cleanupPdvSupportHistory } from '@/lib/retention';

export default function TurnerosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [turneros, setTurneros] = useState<PagoTurnero[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTurnero, setNewTurnero] = useState<Partial<PagoTurnero>>({});

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const [userRes, pdvRes] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', session.user.id).single(),
        supabase.from('puntos_de_venta').select('*')
      ]);
      
      const userData = userRes.data;
      if (userData) {
        userData.punto_de_venta = (pdvRes.data || []).find(pdv => pdv.id === userData.punto_de_venta_id);
      }

      setUser(userData);
      setPuntoVenta(userData?.punto_de_venta || null);

      if (userData?.punto_de_venta_id) {
        try {
          await cleanupPdvSupportHistory(userData.punto_de_venta_id);
        } catch (cleanupError) {
          console.error('Error al depurar historial de gastos/turneros:', cleanupError);
        }

        const { data: cuadresData } = await supabase
          .from('cuadres_diarios')
          .select('id')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .order('fecha', { ascending: false })
          .limit(30);

        const cuadreIds = cuadresData?.map((c) => c.id) || [];
        if (cuadreIds.length > 0) {
          const { data: turnerosData } = await supabase
            .from('pagos_turneros')
            .select('*')
            .in('cuadre_id', cuadreIds)
            .order('fecha', { ascending: false });
          setTurneros(turnerosData || []);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const handleAddTurnero = async () => {
    if (!user?.punto_de_venta_id || !newTurnero.nombre_turnero || !newTurnero.valor) return;

    const today = getTodayString();
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
      .from('pagos_turneros')
      .insert({
        cuadre_id: cuadreId,
        nombre_turnero: newTurnero.nombre_turnero,
        valor: newTurnero.valor,
        horario: newTurnero.horario,
        url_foto_soporte: newTurnero.url_foto_soporte,
        fecha: today,
        registrado_por: user.id,
      })
      .select()
      .single();

    setTurneros([data, ...turneros]);
    setNewTurnero({});
    setShowModal(false);
    toast.success('Turnero agregado');
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
            Inicio
          </a>
          <a href="/admin/gastos" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Gastos
          </a>
          <a href="/admin/turneros" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
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
            <h1 className="text-3xl font-bold text-gray-900">Turneros</h1>
            <p className="text-gray-600">{puntoVenta?.nombre}</p>
            <p className="text-sm text-gray-500 mt-1">
              El historial se conserva por 1 ano y luego se elimina automaticamente.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Nuevo Turnero
          </button>
        </div>

        <div className="space-y-4">
          {turneros.map((turnero) => (
            <div key={turnero.id} className="bg-white p-6 rounded-xl shadow-md flex justify-between items-start">
              <div>
                <p className="font-medium">{turnero.nombre_turnero}</p>
                {turnero.horario && <p className="text-sm text-gray-500">Cédula: {turnero.horario}</p>}
                <p className="text-sm text-gray-400">{new Date(turnero.fecha).toLocaleDateString()}</p>
                {turnero.url_foto_soporte && (
                  <img
                    src={turnero.url_foto_soporte}
                    alt="Soporte"
                    className="w-20 h-20 object-cover rounded mt-2"
                  />
                )}
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xl font-bold">{formatCOP(turnero.valor)}</p>
              </div>
            </div>
          ))}
          {turneros.length === 0 && (
            <div className="bg-white p-12 rounded-xl shadow-md text-center">
              <p className="text-gray-500">No hay turneros registrados</p>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">Nuevo Turnero</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Turnero</label>
                  <input
                    type="text"
                    value={newTurnero.nombre_turnero || ''}
                    onChange={(e) => setNewTurnero({ ...newTurnero, nombre_turnero: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newTurnero.horario || ''}
                    onChange={(e) => setNewTurnero({ ...newTurnero, horario: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                  <input
                    type="number"
                    value={newTurnero.valor || ''}
                    onChange={(e) => setNewTurnero({ ...newTurnero, valor: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto Soporte</label>
                  <UploadFoto
                    bucket="soportes"
                    currentUrl={newTurnero.url_foto_soporte}
                    onUpload={(url) => setNewTurnero({ ...newTurnero, url_foto_soporte: url })}
                    onRemove={() => setNewTurnero({ ...newTurnero, url_foto_soporte: undefined })}
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
                  onClick={handleAddTurnero}
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
