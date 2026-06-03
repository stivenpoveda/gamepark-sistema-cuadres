'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcCuadreMetrics, formatCOP, formatDate, getTodayString } from '@/lib/utils';
import { Loader2, LogOut, Plus, FileText, Calendar, Trash2, Menu, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { CuadreDiario, Usuario, PuntoDeVenta } from '@/types';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [cuadres, setCuadres] = useState<CuadreDiario[]>([]);
  const [gastosPorCuadreId, setGastosPorCuadreId] = useState<Record<string, number>>({});
  const [turnerosPorCuadreId, setTurnerosPorCuadreId] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; i < 4 && !session; i++) {
        await sleep(300);
        session = (await supabase.auth.getSession()).data.session;
      }

      if (!session) {
        router.replace('/login?reason=session');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userError || !userData) {
        router.replace('/login?reason=profile');
        setLoading(false);
        return;
      }

      if (!userData.punto_de_venta_id) {
        toast.error('Este usuario no tiene asignado un punto de venta. Por favor contacta al superadmin.');
        setLoading(false);
        return;
      }

      const { data: puntoVentaData } = await supabase
        .from('puntos_de_venta')
        .select('*')
        .eq('id', userData.punto_de_venta_id)
        .single();

      setUser(userData);
      setPuntoVenta(puntoVentaData || null);

      if (userData.punto_de_venta_id) {
        const { data: cuadresData, error } = await supabase
          .from('cuadres_diarios')
          .select('*')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .order('fecha', { ascending: false });

        if (error) {
          console.error('Error al buscar cuadres:', error);
        }

        setCuadres(cuadresData || []);

        const cuadreIds = (cuadresData || []).map((c) => c.id).filter(Boolean) as string[];
        if (cuadreIds.length > 0) {
          const [gastosRes, turnerosRes] = await Promise.all([
            supabase.from('gastos_diarios').select('cuadre_id,valor').in('cuadre_id', cuadreIds),
            supabase.from('pagos_turneros').select('cuadre_id,valor').in('cuadre_id', cuadreIds),
          ]);

          const gastosMap: Record<string, number> = {};
          for (const g of gastosRes.data || []) {
            const id = (g as any).cuadre_id as string | undefined;
            if (!id) continue;
            gastosMap[id] = (gastosMap[id] || 0) + (Number((g as any).valor) || 0);
          }

          const turnerosMap: Record<string, number> = {};
          for (const t of turnerosRes.data || []) {
            const id = (t as any).cuadre_id as string | undefined;
            if (!id) continue;
            turnerosMap[id] = (turnerosMap[id] || 0) + (Number((t as any).valor) || 0);
          }

          setGastosPorCuadreId(gastosMap);
          setTurnerosPorCuadreId(turnerosMap);
        } else {
          setGastosPorCuadreId({});
          setTurnerosPorCuadreId({});
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [router]);

  const cuadreForSelectedDate = cuadres.find(c => c.fecha === selectedDate);
  const ultimoCuadreConPendiente = cuadres.reduce<CuadreDiario | null>((acc, c) => {
    if (Number(c.consignacion_pendiente || 0) <= 0) return acc;
    const consignaHoy = (c.consigna_hoy ?? true) === true;
    const esCerrado = !consignaHoy || !!c.url_foto_consignacion;
    if (!esCerrado) return acc;
    if (!acc) return c;
    const accTime = new Date(acc.fecha).getTime();
    const cTime = new Date(c.fecha).getTime();
    return cTime > accTime ? c : acc;
  }, null);

  const ultimoCuadre = cuadres[0];
  const ultimoCuadreMetrics = ultimoCuadre
    ? calcCuadreMetrics({
        recaudo: ultimoCuadre.recaudo,
        venta_tarjetas: ultimoCuadre.venta_tarjetas,
        consignacion_pendiente: ultimoCuadre.consignacion_pendiente,
        valor_consignado: ultimoCuadre.valor_consignado,
        url_foto_consignacion: ultimoCuadre.url_foto_consignacion,
        consigna_hoy: ultimoCuadre.consigna_hoy,
        gastos: [{ valor: gastosPorCuadreId[ultimoCuadre.id] || 0 }],
        turneros: [{ valor: turnerosPorCuadreId[ultimoCuadre.id] || 0 }],
        total_fisico: ultimoCuadre.total_fisico,
        context: 'final',
      })
    : null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDeleteCuadre = async (cuadreId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cuadre? Esta acción no se puede deshacer.')) return;
    
    setDeleting(cuadreId);
    try {
      // First delete related records
      await Promise.all([
        supabase.from('denominaciones_cuadre').delete().eq('cuadre_id', cuadreId),
        supabase.from('gastos_diarios').delete().eq('cuadre_id', cuadreId),
        supabase.from('pagos_turneros').delete().eq('cuadre_id', cuadreId),
      ]);
      
      // Then delete the cuadre
      await supabase.from('cuadres_diarios').delete().eq('id', cuadreId);
      
      setCuadres(prev => prev.filter(c => c.id !== cuadreId));
      toast.success('Cuadre eliminado exitosamente');
    } catch (error) {
      console.error('Error deleting cuadre:', error);
      toast.error('Error al eliminar el cuadre');
    } finally {
      setDeleting(null);
    }
  };

  const goToCuadre = async () => {
    if (!puntoVenta || !user) return;

    if (cuadreForSelectedDate) {
      // Si el cuadre está en borrador, pendiente, o enviado sin consignación, ir al wizard
      const puedeEditar = 
        cuadreForSelectedDate.estado === 'borrador' || 
        cuadreForSelectedDate.estado === 'pendiente' ||
        (cuadreForSelectedDate.estado === 'enviado' &&
          (cuadreForSelectedDate.consigna_hoy ?? true) === true &&
          !cuadreForSelectedDate.url_foto_consignacion);
      
      if (puedeEditar) {
        // Redirigir al wizard con la fecha
        router.push(`/admin/cuadre/nuevo?date=${selectedDate}`);
      } else {
        // Si está aprobado o tiene consignación, ir a la vista de detalle
        router.push(`/admin/cuadre/${cuadreForSelectedDate.id}`);
      }
    } else {
      // Crear nuevo cuadre y redirigir al wizard
      const insertData: Record<string, any> = {
        punto_de_venta_id: puntoVenta.id,
        usuario_id: user.id,
        fecha: selectedDate,
        estado: 'borrador',
        recaudo: 0,
        venta_tarjetas: 0,
        venta_fiesta: 0,
        venta_confiteria: 0,
        recibos: 0,
        venta_cajero_auto: 0,
        tar_inicial: 0,
        tar_consumo: 0,
        tar_fiestas: 0,
        tar_malas: 0,
        tar_final: 0,
        total_fisico: 0,
        total_sistema: 0,
        sobrante: 0,
        faltante: 0,
        consignacion_pendiente: 0,
        valor_consignado: 0,
        consigna_hoy: true,
      };

      const doInsert = async (payload: Record<string, any>) => {
        const { data, error } = await supabase.from('cuadres_diarios').insert(payload).select().single();
        if (error) throw error;
        return data;
      };

      try {
        await doInsert(insertData);
      } catch (e: any) {
        const msg = String(e?.message || '');
        const match = msg.match(/Could not find the '([^']+)' column/i);
        const missingColumn = match?.[1];
        if (e?.code === 'PGRST204' && missingColumn && missingColumn in insertData) {
          const retryData = { ...insertData };
          delete retryData[missingColumn];
          try {
            await doInsert(retryData);
          } catch (e2: any) {
            toast.error('Error al crear el cuadre: ' + (e2?.message || 'Error'));
            return;
          }
        } else {
          toast.error('Error al crear el cuadre: ' + (e?.message || 'Error'));
          return;
        }
      }

      // Ir al wizard con la fecha
      router.push(`/admin/cuadre/nuevo?date=${selectedDate}`);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const styles = {
      borrador: 'bg-gray-100 text-gray-800',
      pendiente: 'bg-orange-100 text-orange-800',
      enviado: 'bg-yellow-100 text-yellow-800',
      aprobado: 'bg-green-100 text-green-800',
      devuelto: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[estado as keyof typeof styles] || 'bg-gray-100'}`}>
        {estado.charAt(0).toUpperCase() + estado.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen relative overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      
      {/* Sidebar */}
      <aside
        className={`inset-y-0 left-0 z-50 w-64 text-white flex-shrink-0 transform transition-transform duration-300 ${
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
            <img 
              src="/logo-gamepark.png" 
              alt="Game Park" 
              className="mx-auto w-full" 
            />
          </div>
          <nav className="px-4 py-6 flex-1">
            <a href="/admin" className="flex items-center gap-3 px-4 py-3 bg-white/20 rounded-lg mb-2 hover:bg-white/30 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Inicio
            </a>
            <a href="/admin/gastos" className="flex items-center gap-3 px-4 py-3 hover:bg-white/20 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Gastos
            </a>
            <a href="/admin/turneros" className="flex items-center gap-3 px-4 py-3 hover:bg-white/20 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Turneros
            </a>
            <a href="/admin/reportes" className="flex items-center gap-3 px-4 py-3 hover:bg-white/20 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Reportes
            </a>
          </nav>
          <div className="p-6 border-t border-white/20">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>
      
      <main className="flex-1 min-w-0">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 md:p-0">
          <div className="flex items-center justify-between md:hidden mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white p-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              <Menu className="w-6 h-6" />
            </button>
            <img 
              src="/logo-gamepark.png" 
              alt="Game Park" 
              className="h-10" 
            />
            <div className="w-10"></div>
          </div>
          
          {/* Title */}
          <div className="p-4 md:p-8 md:pb-0">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 drop-shadow-lg">{puntoVenta?.nombre}</h1>
            <p className="text-white/80 drop-shadow text-sm md:text-base">{puntoVenta?.ciudad}</p>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4 md:p-8 max-w-full">

        <div className="mb-6 bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Seleccionar fecha</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary shadow-sm"
            />
            <button
              onClick={goToCuadre}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-opacity-90 shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" />
              {cuadreForSelectedDate ? (
                cuadreForSelectedDate.estado === 'borrador' || 
                cuadreForSelectedDate.estado === 'pendiente' ||
                (cuadreForSelectedDate.estado === 'enviado' && !cuadreForSelectedDate.url_foto_consignacion)
                  ? 'Editar'
                  : 'Ver'
              ) : 'Crear Cuadre'}
            </button>
          </div>
          {cuadreForSelectedDate && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800 mb-2">Estado del cuadre para esta fecha:</p>
              <div className="flex flex-wrap items-center gap-2">
                {getEstadoBadge(cuadreForSelectedDate.estado)}
                {(cuadreForSelectedDate.consigna_hoy ?? true) === true && !cuadreForSelectedDate.url_foto_consignacion && (
                  <span className="text-sm text-orange-600 bg-orange-50 px-2 py-1 rounded">
                    ⚠️ Pendiente foto consignación
                  </span>
                )}
                {cuadreForSelectedDate.consignacion_pendiente &&
                  cuadreForSelectedDate.consignacion_pendiente > 0 &&
                  ultimoCuadreConPendiente?.id === cuadreForSelectedDate.id && (
                  <span className="text-sm text-orange-800 bg-orange-100 px-2 py-1 rounded font-medium">
                    ⚠️ Faltante por consignar: {formatCOP(cuadreForSelectedDate.consignacion_pendiente)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Total Físico</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(cuadres[0]?.total_fisico || 0)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Venta Total (Sistema)</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(cuadres[0]?.recaudo || 0)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Valor General a Consignar</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoCuadreMetrics?.totalGeneralAConsignar || 0)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Diferencia</p>
            <p className={`text-2xl sm:text-3xl font-bold ${(cuadres[0]?.sobrante || 0) > 0 ? 'text-green-600' : (cuadres[0]?.faltante || 0) > 0 ? 'text-red-600' : ''}`}>
              {(cuadres[0]?.sobrante || 0) > 0 ? `+${formatCOP(Number(cuadres[0].sobrante))}` : (cuadres[0]?.faltante || 0) > 0 ? `-${formatCOP(Number(cuadres[0].faltante))}` : '$0'}
            </p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Estado</p>
            {cuadres[0] ? getEstadoBadge(cuadres[0].estado) : <span className="text-gray-400 text-sm">Sin cuadre</span>}
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Historial</h3>
          </div>
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[760px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Fecha</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Venta Total</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Valor General a Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Estado</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Pendiente Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadres.map((cuadre) => {
                  const totalGastos = gastosPorCuadreId[cuadre.id] || 0;
                  const totalTurneros = turnerosPorCuadreId[cuadre.id] || 0;
                  const metrics = calcCuadreMetrics({
                    recaudo: cuadre.recaudo,
                    venta_tarjetas: cuadre.venta_tarjetas,
                    consignacion_pendiente: cuadre.consignacion_pendiente,
                    valor_consignado: cuadre.valor_consignado,
                    url_foto_consignacion: cuadre.url_foto_consignacion,
                    consigna_hoy: cuadre.consigna_hoy,
                    gastos: [{ valor: totalGastos }],
                    turneros: [{ valor: totalTurneros }],
                    total_fisico: cuadre.total_fisico,
                    context: 'final',
                  });

                  return (
                    <tr key={cuadre.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{formatDate(cuadre.fecha)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.recaudo)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(metrics.totalGeneralAConsignar)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">{getEstadoBadge(cuadre.estado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        {cuadre.consignacion_pendiente &&
                        cuadre.consignacion_pendiente > 0 &&
                        ultimoCuadreConPendiente?.id === cuadre.id ? (
                          <span className="text-orange-700 font-medium text-xs sm:text-sm">
                            {formatCOP(cuadre.consignacion_pendiente)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs sm:text-sm">$0</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const puedeEditar =
                                cuadre.estado === 'borrador' ||
                                cuadre.estado === 'pendiente' ||
                                (cuadre.estado === 'enviado' &&
                                  (cuadre.consigna_hoy ?? true) === true &&
                                  !cuadre.url_foto_consignacion);

                              if (puedeEditar) {
                                router.push(`/admin/cuadre/nuevo?date=${cuadre.fecha}`);
                              } else {
                                router.push(`/admin/cuadre/${cuadre.id}`);
                              }
                            }}
                            className="text-primary hover:text-primary/80 font-medium hover:underline text-xs sm:text-sm"
                          >
                            {cuadre.estado === 'borrador' ||
                            cuadre.estado === 'pendiente' ||
                            (cuadre.estado === 'enviado' && (cuadre.consigna_hoy ?? true) === true && !cuadre.url_foto_consignacion)
                              ? 'Editar'
                              : 'Ver'}
                          </button>
                          {(cuadre.estado === 'borrador' ||
                            cuadre.estado === 'pendiente' ||
                            (cuadre.estado === 'enviado' && (cuadre.consigna_hoy ?? true) === true && !cuadre.url_foto_consignacion)) && (
                            <button
                              onClick={() => handleDeleteCuadre(cuadre.id)}
                              disabled={deleting === cuadre.id}
                              className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                              {deleting === cuadre.id ? (
                                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}
