'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate, getTodayString } from '@/lib/utils';
import { Loader2, LogOut, Trash2, Filter, Menu, X, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { CuadreDiario, Usuario, PuntoDeVenta } from '@/types';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);
  const [cuadres, setCuadres] = useState<(CuadreDiario & { punto_de_venta?: PuntoDeVenta; usuario?: Usuario })[]>([]);
  const [puntosDeVenta, setPuntosDeVenta] = useState<PuntoDeVenta[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    fechaInicio: '',
    fechaFin: '',
    ciudad: '',
    puntoVentaId: '',
  });

  // Unique cities for filter
  const ciudades = [...new Set(puntosDeVenta.map(p => p.ciudad))];

  useEffect(() => {
    const init = async () => {
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
        .eq('email', session.user.email)
        .single();

      if (userError || !userData) {
        router.replace('/login?reason=profile');
        return;
      }

      setUser(userData);

      const [pdvRes, cuadresRes] = await Promise.all([
        supabase.from('puntos_de_venta').select('*'),
        supabase
          .from('cuadres_diarios')
          .select('*')
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      setPuntosDeVenta(pdvRes.data || []);

      // Combine data
      const cuadresWithData = cuadresRes.data?.map(cuadre => ({
        ...cuadre,
        punto_de_venta: pdvRes.data?.find(p => p.id === cuadre.punto_de_venta_id),
      })) || [];

      setCuadres(cuadresWithData);
      setLoading(false);
    };

    init();
  }, [router]);

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
    } catch (error: any) {
      console.error('Error deleting cuadre:', error);
      toast.error('Error al eliminar el cuadre');
    } finally {
      setDeleting(null);
    }
  };

  // Apply filters
  const filteredCuadres = cuadres.filter(cuadre => {
    const pdv = cuadre.punto_de_venta;

    // No mostrar borradores
    if (cuadre.estado === 'borrador') {
      return false;
    }

    // Date filter (sin timezone)
    if (filters.fechaInicio && cuadre.fecha < filters.fechaInicio) {
      return false;
    }
    if (filters.fechaFin && cuadre.fecha > filters.fechaFin) {
      return false;
    }

    // City filter
    if (filters.ciudad && pdv?.ciudad !== filters.ciudad) {
      return false;
    }

    // PDV filter
    if (filters.puntoVentaId && cuadre.punto_de_venta_id !== filters.puntoVentaId) {
      return false;
    }

    return true;
  });

  const clearFilters = () => {
    setFilters({
      fechaInicio: '',
      fechaFin: '',
      ciudad: '',
      puntoVentaId: '',
    });
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

  const totalVentaHoy = cuadres
    .filter(c => c.fecha === getTodayString())
    .reduce((sum, c) => sum + Number(c.total_sistema || 0), 0);

  const localesActivos = puntosDeVenta.filter(p => p.activo).length;
  const cuadresPendientes = cuadres.filter(
    (c) => c.estado === 'pendiente' || ((c.consigna_hoy ?? true) === true && !c.url_foto_consignacion)
  ).length;
  const ultimoPendientePorPdv = cuadres.reduce<Record<string, { id: string; fecha: string }>>((acc, c) => {
    if (Number(c.consignacion_pendiente || 0) <= 0) return acc;
    const consignaHoy = (c.consigna_hoy ?? true) === true;
    const esCerrado = !consignaHoy || !!c.url_foto_consignacion;
    if (!esCerrado) return acc;
    const key = c.punto_de_venta_id || '';
    if (!key) return acc;
    const existing = acc[key];
    if (!existing) {
      acc[key] = { id: c.id, fecha: c.fecha };
      return acc;
    }
    const existingTime = new Date(existing.fecha).getTime();
    const cTime = new Date(c.fecha).getTime();
    if (cTime > existingTime) {
      acc[key] = { id: c.id, fecha: c.fecha };
    }
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-company relative">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 text-white flex-shrink-0 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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
              className="w-full"
            />
            <p className="text-sm opacity-80 mt-2 text-center">Super Admin</p>
          </div>
          <nav className="px-4 py-6 flex-1">
            <a href="/superadmin" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2 hover:bg-white/20 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Dashboard
            </a>
            <a href="/superadmin/reportes" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Reportes
            </a>
            <a href="/superadmin/usuarios" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Usuarios
            </a>
            <a href="/superadmin/puntos-de-venta" className="flex items-center gap-3 px-4 py-3 hover:bg-white/20 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Puntos de Venta
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

      <main className="flex-1">
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
          <div className="p-4 md:p-6 md:pb-0">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 drop-shadow">Dashboard Super Admin</h1>
            <p className="text-white/80 drop-shadow text-sm md:text-base">Resumen general del sistema</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-primary/10 rounded-lg text-lg sm:text-xl">💰</div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Venta Hoy</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCOP(totalVentaHoy)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-primary/10 rounded-lg text-lg sm:text-xl">📍</div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Locales</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{localesActivos}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-warning/10 rounded-lg text-lg sm:text-xl">⏳</div>
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Pendientes</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{cuadresPendientes}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-4 sm:p-6 mb-6 sm:mb-8 border border-white/30">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <Filter className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Filtros</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                <input
                  type="date"
                  value={filters.fechaInicio}
                  onChange={(e) => setFilters(f => ({ ...f, fechaInicio: e.target.value }))}
                  className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary bg-white shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                <input
                  type="date"
                  value={filters.fechaFin}
                  onChange={(e) => setFilters(f => ({ ...f, fechaFin: e.target.value }))}
                  className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary bg-white shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <select
                  value={filters.ciudad}
                  onChange={(e) => setFilters(f => ({ ...f, ciudad: e.target.value }))}
                  className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary bg-white shadow-sm"
                >
                  <option value="">Todas</option>
                  {ciudades.map(ciudad => (
                    <option key={ciudad} value={ciudad}>{ciudad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Local</label>
                <select
                  value={filters.puntoVentaId}
                  onChange={(e) => setFilters(f => ({ ...f, puntoVentaId: e.target.value }))}
                  className="w-full px-3 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary bg-white shadow-sm"
                >
                  <option value="">Todos</option>
                  {puntosDeVenta.map(pdv => (
                    <option key={pdv.id} value={pdv.id}>{pdv.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-3 sm:mt-4">
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm hover:shadow transition-all duration-200 text-sm"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Cuadres ({filteredCuadres.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-light">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Fecha</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Local</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell">Ciudad</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Estado</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Pendiente Consignar</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell">Total</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCuadres.map((cuadre) => (
                    <tr key={cuadre.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{formatDate(cuadre.fecha)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{cuadre.punto_de_venta?.nombre || 'N/A'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm hidden sm:table-cell">{cuadre.punto_de_venta?.ciudad || 'N/A'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">{getEstadoBadge(cuadre.estado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        {cuadre.consignacion_pendiente &&
                        cuadre.consignacion_pendiente > 0 &&
                        ultimoPendientePorPdv[cuadre.punto_de_venta_id || '']?.id === cuadre.id ? (
                          <span className="text-orange-700 font-medium text-xs sm:text-sm">
                            {formatCOP(cuadre.consignacion_pendiente)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs sm:text-sm">$0</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden sm:table-cell">{formatCOP(cuadre.total_fisico)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => router.push(`/admin/cuadre/${cuadre.id}`)}
                            className="text-primary hover:text-primary/80 font-medium text-xs sm:text-sm"
                          >
                            Ver
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
