'use client';

import { useEffect, useState } from 'react';
import { authorizedJsonFetch } from '@/lib/admin-bancos';
import { supabase } from '@/lib/supabase';
import { calcCuadreMetrics, formatCOP, formatDate, getTodayString } from '@/lib/utils';
import { assertNoDbError, chunk } from '@/lib/batchDb';
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
          const idBatches = chunk(cuadreIds, 80);
          const gastosRows: any[] = [];
          const turnerosRows: any[] = [];
          for (const batch of idBatches) {
            const [gRes, tRes] = await Promise.all([
              supabase.from('gastos_diarios').select('cuadre_id,valor').in('cuadre_id', batch).limit(999999),
              supabase.from('pagos_turneros').select('cuadre_id,valor').in('cuadre_id', batch).limit(999999),
            ]);
            gastosRows.push(...assertNoDbError<any>(gRes, `Dashboard Admin - gastos_diarios`));
            turnerosRows.push(...assertNoDbError<any>(tRes, `Dashboard Admin - pagos_turneros`));
          }

          const gastosMap: Record<string, number> = {};
          for (const g of gastosRows) {
            const id = g.cuadre_id as string | undefined;
            if (!id) continue;
            gastosMap[id] = (gastosMap[id] || 0) + (Number(g.valor) || 0);
          }

          const turnerosMap: Record<string, number> = {};
          for (const t of turnerosRows) {
            const id = t.cuadre_id as string | undefined;
            if (!id) continue;
            turnerosMap[id] = (turnerosMap[id] || 0) + (Number(t.valor) || 0);
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
  const ultimoCuadreCerrado = cuadres.reduce<CuadreDiario | null>((acc, c) => {
    const consignaHoy = (c.consigna_hoy ?? true) === true;
    const esCerrado = !consignaHoy || Boolean(c.url_foto_consignacion) || (Number(c.valor_consignado) || 0) > 0 || c.estado === 'pendiente';
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

  const ultimoDesembolsos = ultimoCuadre ? (gastosPorCuadreId[ultimoCuadre.id] || 0) + (turnerosPorCuadreId[ultimoCuadre.id] || 0) : 0;
  const ultimoEfectivo = ultimoCuadreMetrics?.totalEfectivoEsperado || 0;
  const ultimoConsignaciones = ultimoCuadre ? (((ultimoCuadre.consigna_hoy ?? true) === false) ? 0 : Number(ultimoCuadre.valor_consignado) || 0) : 0;
  const ultimoSaldoEnCaja = ultimoCuadreCerrado?.consignacion_pendiente || 0;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDeleteCuadre = async (cuadreId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cuadre? Esta acción no se puede deshacer.')) return;
    
    setDeleting(cuadreId);
    try {
      const response = await authorizedJsonFetch<{
        success: boolean;
        result?: { deletedFinancialMovements: number };
      }>('/api/cuadres/eliminar', {
        method: 'DELETE',
        body: JSON.stringify({ cuadreId }),
      });
      
      setCuadres(prev => prev.filter(c => c.id !== cuadreId));
      toast.success(
        response.result?.deletedFinancialMovements
          ? `Cuadre eliminado y se reversaron ${response.result.deletedFinancialMovements} movimientos de Admin Bancos`
          : 'Cuadre eliminado exitosamente'
      );
    } catch (error: any) {
      console.error('Error deleting cuadre:', error);
      toast.error(error?.message || 'Error al eliminar el cuadre');
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
        cuadreForSelectedDate.estado === 'devuelto' ||
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
      // Ir al wizard con la fecha (el wizard se encarga de crear el cuadre de forma idempotente)
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
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 mt-4 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
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
                cuadreForSelectedDate.estado === 'devuelto' ||
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
                {cuadreForSelectedDate.estado === 'devuelto' && cuadreForSelectedDate.observacion_superadmin && (
                  <span className="text-sm text-red-800 bg-red-100 px-2 py-1 rounded font-medium">
                    Motivo: {cuadreForSelectedDate.observacion_superadmin}
                  </span>
                )}
                {(cuadreForSelectedDate.consigna_hoy ?? true) === true && !cuadreForSelectedDate.url_foto_consignacion && (
                  <span className="text-sm text-orange-600 bg-orange-50 px-2 py-1 rounded">
                    ⚠️ Pendiente foto consignación
                  </span>
                )}
                {cuadreForSelectedDate.consignacion_pendiente &&
                  cuadreForSelectedDate.consignacion_pendiente > 0 &&
                  ultimoCuadreCerrado?.id === cuadreForSelectedDate.id && (
                  <span className="text-sm text-orange-800 bg-orange-100 px-2 py-1 rounded font-medium">
                    ⚠️ Faltante por consignar: {formatCOP(cuadreForSelectedDate.consignacion_pendiente)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Venta Total</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoCuadre?.recaudo || 0)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Datafono</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoCuadre?.venta_tarjetas || 0)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Desembolsos</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoDesembolsos)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Efectivo</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoEfectivo)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Consignaciones</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoConsignaciones)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">Saldo en Caja</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCOP(ultimoSaldoEnCaja)}</p>
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
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Datafono</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Desembolsos</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Efectivo</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Consignaciones</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Estado</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Saldo en Caja</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadres.map((cuadre) => {
                  const totalGastos = gastosPorCuadreId[cuadre.id] || 0;
                  const totalTurneros = turnerosPorCuadreId[cuadre.id] || 0;
                  const desembolsos = totalGastos + totalTurneros;
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
                  const consignaciones = (cuadre.consigna_hoy ?? true) === false ? 0 : Number(cuadre.valor_consignado) || 0;

                  return (
                    <tr key={cuadre.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{formatDate(cuadre.fecha)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.recaudo)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.venta_tarjetas)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(desembolsos)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(metrics.totalEfectivoEsperado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(consignaciones)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">{getEstadoBadge(cuadre.estado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.consignacion_pendiente)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const puedeEditar =
                                cuadre.estado === 'borrador' ||
                                cuadre.estado === 'pendiente' ||
                                cuadre.estado === 'devuelto' ||
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
                            cuadre.estado === 'devuelto' ||
                            (cuadre.estado === 'enviado' && (cuadre.consigna_hoy ?? true) === true && !cuadre.url_foto_consignacion)
                              ? 'Editar'
                              : 'Ver'}
                          </button>
                          {(cuadre.estado === 'borrador' ||
                            cuadre.estado === 'pendiente' ||
                            cuadre.estado === 'devuelto' ||
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
