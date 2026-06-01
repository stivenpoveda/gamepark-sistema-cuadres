'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate } from '@/lib/utils';
import { Loader2, ArrowLeft, Download, Menu, X, LogOut, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CuadreDiario, PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

export default function SuperadminReportesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cuadres, setCuadres] = useState<CuadreDiario[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [gastosByCuadreId, setGastosByCuadreId] = useState<Record<string, number>>({});
  const [turnerosByCuadreId, setTurnerosByCuadreId] = useState<Record<string, number>>({});
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [pdvSeleccionado, setPdvSeleccionado] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const [pdvRes, cuadresRes, gastosRes, turnerosRes] = await Promise.all([
        supabase.from('puntos_de_venta').select('*'),
        supabase.from('cuadres_diarios').select('*').order('fecha', { ascending: false }),
        supabase.from('gastos_diarios').select('cuadre_id,valor'),
        supabase.from('pagos_turneros').select('cuadre_id,valor'),
      ]);

      // Combine data como en la página principal
      const cuadresWithData = cuadresRes.data?.map(cuadre => ({
        ...cuadre,
        punto_de_venta: pdvRes.data?.find(p => p.id === cuadre.punto_de_venta_id),
      })) || [];

      console.log('✅ Cuadres cargados del superadmin:', cuadresWithData);
      setCuadres(cuadresWithData);
      setPuntosVenta(pdvRes.data || []);

      const gastosMap: Record<string, number> = {};
      (gastosRes.data || []).forEach((g) => {
        gastosMap[g.cuadre_id] = (gastosMap[g.cuadre_id] || 0) + (Number(g.valor) || 0);
      });
      setGastosByCuadreId(gastosMap);

      const turnerosMap: Record<string, number> = {};
      (turnerosRes.data || []).forEach((t) => {
        turnerosMap[t.cuadre_id] = (turnerosMap[t.cuadre_id] || 0) + (Number(t.valor) || 0);
      });
      setTurnerosByCuadreId(turnerosMap);

      const today = new Date();
      const lastMonth = new Date(today);
      lastMonth.setMonth(today.getMonth() - 1);
      setFechaFin(today.toISOString().split('T')[0]);
      setFechaInicio(lastMonth.toISOString().split('T')[0]);

      setLoading(false);
    };

    fetchData();
  }, []);

  const cuadresFiltrados = cuadres.filter((c) => {
    let matchFecha = true;
    if (fechaInicio && fechaFin) {
      // Aseguramos que la fecha del cuadre esté en formato YYYY-MM-DD
      const fechaCuadre = c.fecha.split('T')[0];
      matchFecha = fechaCuadre >= fechaInicio && fechaCuadre <= fechaFin;
    }
    let matchPdv = true;
    if (pdvSeleccionado) {
      matchPdv = c.punto_de_venta_id === pdvSeleccionado;
    }
    return matchFecha && matchPdv;
  });

  const totals = cuadresFiltrados.reduce(
    (acc, c) => {
      acc.totalFisico += Number(c.total_fisico) || 0;
      acc.ventaTotal += Number(c.recaudo) || 0;
      acc.valorAConsignar += Number(c.total_sistema) || 0;
      acc.ventaDatafono += Number(c.venta_tarjetas) || 0;
      acc.valorConsignado += Number(c.valor_consignado) || 0;
      acc.gastos += gastosByCuadreId[c.id] || 0;
      acc.turneros += turnerosByCuadreId[c.id] || 0;
      acc.sobrante += Number(c.sobrante) || 0;
      acc.faltante += Number(c.faltante) || 0;
      return acc;
    },
    {
      totalFisico: 0,
      ventaTotal: 0,
      valorAConsignar: 0,
      ventaDatafono: 0,
      valorConsignado: 0,
      gastos: 0,
      turneros: 0,
      sobrante: 0,
      faltante: 0,
    }
  );

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cuadres');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Venta Total', key: 'ventaTotal', width: 15 },
      { header: 'Valor a Consignar', key: 'valorAConsignar', width: 18 },
      { header: 'Venta Datafono', key: 'ventaDatafono', width: 15 },
      { header: 'Valor Consignado', key: 'valorConsignado', width: 18 },
      { header: 'Gastos', key: 'gastos', width: 15 },
      { header: 'Turneros', key: 'turneros', width: 15 },
      { header: 'Pendiente', key: 'pendiente', width: 15 },
      { header: 'Total Físico', key: 'totalFisico', width: 15 },
      { header: 'Sobrante', key: 'sobrante', width: 15 },
      { header: 'Faltante', key: 'faltante', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
    ];

    cuadresFiltrados.forEach((c) => {
      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        ventaTotal: formatCOP(c.recaudo),
        valorAConsignar: formatCOP(c.total_sistema),
        ventaDatafono: formatCOP(c.venta_tarjetas),
        valorConsignado: formatCOP(c.valor_consignado),
        gastos: formatCOP(gastosByCuadreId[c.id] || 0),
        turneros: formatCOP(turnerosByCuadreId[c.id] || 0),
        pendiente: formatCOP(c.consignacion_pendiente),
        totalFisico: formatCOP(c.total_fisico),
        sobrante: formatCOP(c.sobrante),
        faltante: formatCOP(c.faltante),
        estado: c.estado,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_cuadres_general.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado exitosamente');
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

  const consolidadoMensual = Object.values(
    cuadresFiltrados.reduce<Record<string, {
      mes: string;
      pdv: string;
      pdvId: string;
      ventaTotal: number;
      valorAConsignar: number;
      ventaDatafono: number;
      valorConsignado: number;
      gastos: number;
      turneros: number;
      pendienteFinMes: number;
      _fechaMax: string;
    }>>((acc, c) => {
      const fecha = c.fecha.split('T')[0];
      const mes = fecha.slice(0, 7);
      const pdvId = c.punto_de_venta_id || 'N/A';
      const pdv = c.punto_de_venta?.nombre || 'N/A';
      const key = `${pdvId}|${mes}`;
      const ventaTotal = Number(c.recaudo) || 0;
      const valorAConsignar = Number(c.total_sistema) || 0;
      const ventaDatafono = Number(c.venta_tarjetas) || 0;
      const valorConsignado = Number(c.valor_consignado) || 0;
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const pendiente = Number(c.consignacion_pendiente) || 0;

      if (!acc[key]) {
        acc[key] = {
          mes,
          pdv,
          pdvId,
          ventaTotal: 0,
          valorAConsignar: 0,
          ventaDatafono: 0,
          valorConsignado: 0,
          gastos: 0,
          turneros: 0,
          pendienteFinMes: pendiente,
          _fechaMax: fecha,
        };
      }

      acc[key].ventaTotal += ventaTotal;
      acc[key].valorAConsignar += valorAConsignar;
      acc[key].ventaDatafono += ventaDatafono;
      acc[key].valorConsignado += valorConsignado;
      acc[key].gastos += gastos;
      acc[key].turneros += turneros;
      if (fecha >= acc[key]._fechaMax) {
        acc[key]._fechaMax = fecha;
        acc[key].pendienteFinMes = pendiente;
      }

      return acc;
    }, {})
  ).sort((a, b) => {
    if (a.mes === b.mes) return a.pdv.localeCompare(b.pdv);
    return a.mes.localeCompare(b.mes);
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-company relative">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 text-white flex-shrink-0 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-full bg-black/30 backdrop-blur-md border-r border-white/20 flex flex-col">
          <div className="p-6 border-b border-white/20 relative">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 md:hidden text-white hover:text-white/80"
            >
              <X className="w-6 h-6" />
            </button>
            <img src="/logo-gamepark.png" alt="Game Park" className="w-full" />
            <p className="text-sm opacity-80 mt-2 text-center">Super Admin</p>
          </div>
          <nav className="px-4 py-6 flex-1">
            <a href="/superadmin" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Dashboard
            </a>
            <a href="/superadmin/reportes" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Reportes
            </a>
            <a href="/superadmin/usuarios" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2 transition-all duration-200">
              <FileText className="w-5 h-5" />
              Usuarios
            </a>
            <a href="/superadmin/puntos-de-venta" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2 transition-all duration-200">
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
        <div className="sticky top-0 z-30 bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 md:p-0">
          <div className="flex items-center justify-between md:hidden mb-4">
            <button onClick={() => setSidebarOpen(true)} className="text-white p-2 rounded-lg bg-white/10 hover:bg-white/20">
              <Menu className="w-6 h-6" />
            </button>
            <img src="/logo-gamepark.png" alt="Game Park" className="h-10" />
            <div className="w-10"></div>
          </div>

          <div className="p-0 md:p-6 md:pb-0">
            <button onClick={() => router.push('/superadmin')} className="hidden md:flex items-center gap-2 text-white mb-4 hover:text-white/80 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              Volver
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">Reportes Generales</h1>
              <p className="text-white/80 drop-shadow text-sm mt-1">Resumen por fechas y consolidado mensual</p>
            </div>
            <button
              onClick={exportarExcel}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg w-full sm:w-auto"
            >
              <Download className="w-5 h-5" />
              Exportar Excel
            </button>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
            <select
              value={pdvSeleccionado}
              onChange={(e) => setPdvSeleccionado(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              {puntosVenta.map((pdv) => (
                <option key={pdv.id} value={pdv.id}>
                  {pdv.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Venta Total</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.ventaTotal)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Valor a Consignar</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.valorAConsignar)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Venta Datafono</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.ventaDatafono)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Valor Consignado</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.valorConsignado)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Gastos</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.gastos)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Turneros</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.turneros)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Total Sobrante</p>
            <p className="text-2xl font-bold text-green-700">{formatCOP(totals.sobrante)}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow-2xl border border-white/30">
            <p className="text-sm text-gray-600">Total Faltante</p>
            <p className="text-2xl font-bold text-red-700">{formatCOP(totals.faltante)}</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Cuadres</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-light">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Punto de Venta</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Fecha</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Venta Total</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Valor a Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">Venta Datafono</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden xl:table-cell">Valor Consignado</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden xl:table-cell">Gastos</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden xl:table-cell">Turneros</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell">Pendiente</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell">Total Físico</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell">Diferencia</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                      No hay cuadres para mostrar en este rango de fechas.
                    </td>
                  </tr>
                ) : (
                  cuadresFiltrados.map((cuadre) => (
                    <tr key={cuadre.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{cuadre.punto_de_venta?.nombre || 'N/A'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{formatDate(cuadre.fecha)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.recaudo)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(cuadre.total_sistema)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden lg:table-cell">{formatCOP(cuadre.venta_tarjetas)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden xl:table-cell">{formatCOP(cuadre.valor_consignado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden xl:table-cell">{formatCOP(gastosByCuadreId[cuadre.id] || 0)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden xl:table-cell">{formatCOP(turnerosByCuadreId[cuadre.id] || 0)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden sm:table-cell">{formatCOP(cuadre.consignacion_pendiente)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden 2xl:table-cell">{formatCOP(cuadre.total_fisico)}</td>
                      <td className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden 2xl:table-cell ${(Number(cuadre.sobrante) || 0) > 0 ? 'text-green-600' : (Number(cuadre.faltante) || 0) > 0 ? 'text-red-600' : ''}`}>
                        {(Number(cuadre.sobrante) || 0) > 0 ? `+${formatCOP(Number(cuadre.sobrante))}` : (Number(cuadre.faltante) || 0) > 0 ? `-${formatCOP(Number(cuadre.faltante))}` : '$0'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">{getEstadoBadge(cuadre.estado)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Consolidado Mensual</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className="bg-light">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Mes</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Punto de Venta</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Venta Total</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Valor a Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">Venta Datafono</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">Valor Consignado</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">Gastos</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">Turneros</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Pendiente Fin de Mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {consolidadoMensual.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No hay datos para el consolidado mensual en este rango.
                    </td>
                  </tr>
                ) : (
                  consolidadoMensual.map((row) => (
                    <tr key={`${row.pdvId}|${row.mes}`} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{row.mes}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">{row.pdv}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(row.ventaTotal)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(row.valorAConsignar)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden lg:table-cell">{formatCOP(row.ventaDatafono)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden lg:table-cell">{formatCOP(row.valorConsignado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden lg:table-cell">{formatCOP(row.gastos)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium hidden lg:table-cell">{formatCOP(row.turneros)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium">{formatCOP(row.pendienteFinMes)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
