'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcCuadreMetrics, formatCOP, formatDate } from '@/lib/utils';
import { Loader2, ArrowLeft, Download, Menu, X, LogOut, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CuadreDiario, PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

export default function SuperadminReportesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useCardsLayout, setUseCardsLayout] = useState(false);
  const [cuadres, setCuadres] = useState<CuadreDiario[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [gastosByCuadreId, setGastosByCuadreId] = useState<Record<string, number> >({});
  const [turnerosByCuadreId, setTurnerosByCuadreId] = useState<Record<string, number> >({});
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [pdvSeleccionado, setPdvSeleccionado] = useState<string>('');

  useEffect(() => {
    const compute = () => {
      const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
      const width = typeof window !== 'undefined' ? window.innerWidth : 0;
      setUseCardsLayout(Boolean(isCoarsePointer) || width < 1024);
    };

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

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
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const metrics = calcCuadreMetrics({
        recaudo: c.recaudo,
        venta_tarjetas: c.venta_tarjetas,
        consignacion_pendiente: c.consignacion_pendiente,
        valor_consignado: c.valor_consignado,
        url_foto_consignacion: c.url_foto_consignacion,
        consigna_hoy: c.consigna_hoy,
        gastos: [{ valor: gastos }],
        turneros: [{ valor: turneros }],
        total_fisico: c.total_fisico,
        context: 'final',
      });

      acc.valorGeneralAConsignar += metrics.totalGeneralAConsignar;
      acc.ventaDatafono += Number(c.venta_tarjetas) || 0;
      acc.valorConsignado += Number(c.valor_consignado) || 0;
      acc.gastos += gastos;
      acc.turneros += turneros;
      acc.deducciones += gastos + turneros;
      acc.sobrante += Number(c.sobrante) || 0;
      acc.faltante += Number(c.faltante) || 0;
      return acc;
    },
    {
      totalFisico: 0,
      ventaTotal: 0,
      valorGeneralAConsignar: 0,
      ventaDatafono: 0,
      valorConsignado: 0,
      gastos: 0,
      turneros: 0,
      deducciones: 0,
      sobrante: 0,
      faltante: 0,
    }
  );

  const exportarExcelGeneral = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('General');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Venta Total', key: 'ventaTotal', width: 15 },
      { header: 'Valor General a Consignar', key: 'valorGeneralAConsignar', width: 22 },
      { header: 'Venta Datafono', key: 'ventaDatafono', width: 15 },
      { header: 'Valor Consignado', key: 'valorConsignado', width: 18 },
      { header: 'Deducciones (Gastos + Turneros)', key: 'deducciones', width: 22 },
      { header: 'Pendiente', key: 'pendiente', width: 15 },
      { header: 'Total Físico', key: 'totalFisico', width: 15 },
      { header: 'Sobrante', key: 'sobrante', width: 15 },
      { header: 'Faltante', key: 'faltante', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
    ];

    cuadresFiltrados.forEach((c) => {
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const metrics = calcCuadreMetrics({
        recaudo: c.recaudo,
        venta_tarjetas: c.venta_tarjetas,
        consignacion_pendiente: c.consignacion_pendiente,
        valor_consignado: c.valor_consignado,
        url_foto_consignacion: c.url_foto_consignacion,
        consigna_hoy: c.consigna_hoy,
        gastos: [{ valor: gastos }],
        turneros: [{ valor: turneros }],
        total_fisico: c.total_fisico,
        context: 'final',
      });

      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        ventaTotal: formatCOP(c.recaudo),
        valorGeneralAConsignar: formatCOP(metrics.totalGeneralAConsignar),
        ventaDatafono: formatCOP(c.venta_tarjetas),
        valorConsignado: formatCOP(c.valor_consignado),
        deducciones: formatCOP(gastos + turneros),
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
    a.download = `reporte_general_cuadres.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado exitosamente');
  };

  const exportarExcelDeducciones = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Deducciones');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Gastos', key: 'gastos', width: 15 },
      { header: 'Turneros', key: 'turneros', width: 15 },
      { header: 'Deducciones (Gastos + Turneros)', key: 'deducciones', width: 24 },
    ];

    cuadresFiltrados.forEach((c) => {
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        gastos: formatCOP(gastos),
        turneros: formatCOP(turneros),
        deducciones: formatCOP(gastos + turneros),
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_deducciones.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado exitosamente');
  };

  const exportarExcelVentas = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ventas');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Venta Total', key: 'ventaTotal', width: 15 },
      { header: 'Venta Datafono', key: 'ventaDatafono', width: 15 },
      { header: 'Venta Efectivo (Hoy)', key: 'ventaEfectivo', width: 18 },
    ];

    cuadresFiltrados.forEach((c) => {
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const metrics = calcCuadreMetrics({
        recaudo: c.recaudo,
        venta_tarjetas: c.venta_tarjetas,
        consignacion_pendiente: c.consignacion_pendiente,
        valor_consignado: c.valor_consignado,
        url_foto_consignacion: c.url_foto_consignacion,
        consigna_hoy: c.consigna_hoy,
        gastos: [{ valor: gastos }],
        turneros: [{ valor: turneros }],
        total_fisico: c.total_fisico,
        context: 'final',
      });

      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        ventaTotal: formatCOP(c.recaudo),
        ventaDatafono: formatCOP(c.venta_tarjetas),
        ventaEfectivo: formatCOP(metrics.totalEfectivoEsperado),
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_ventas.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado exitosamente');
  };

  const exportarExcelConsignaciones = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Consignaciones');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Consigna Hoy', key: 'consignaHoy', width: 12 },
      { header: 'Valor Consignado', key: 'valorConsignado', width: 18 },
      { header: 'Pendiente', key: 'pendiente', width: 15 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Con Foto', key: 'conFoto', width: 10 },
    ];

    const consignaciones = cuadresFiltrados.filter((c) => {
      const consignaHoy = (c.consigna_hoy ?? true) === true;
      const conFoto = Boolean(c.url_foto_consignacion);
      const valor = Number(c.valor_consignado) || 0;
      return consignaHoy && (conFoto || valor > 0);
    });

    consignaciones.forEach((c) => {
      const consignaHoy = (c.consigna_hoy ?? true) === true;
      const conFoto = Boolean(c.url_foto_consignacion);
      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        consignaHoy: consignaHoy ? 'Sí' : 'No',
        valorConsignado: formatCOP(c.valor_consignado),
        pendiente: formatCOP(c.consignacion_pendiente),
        estado: c.estado,
        conFoto: conFoto ? 'Sí' : 'No',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_consignaciones.xlsx`;
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
      valorGeneralAConsignar: number;
      ventaDatafono: number;
      valorConsignado: number;
      deducciones: number;
      pendienteFinMes: number;
      _fechaMax: string;
    }> >((acc, c) => {
      const fecha = c.fecha.split('T')[0];
      const mes = fecha.slice(0, 7);
      const pdvId = c.punto_de_venta_id || 'N/A';
      const pdv = c.punto_de_venta?.nombre || 'N/A';
      const key = `${pdvId}|${mes}`;
      const ventaTotal = Number(c.recaudo) || 0;
      const ventaDatafono = Number(c.venta_tarjetas) || 0;
      const valorConsignado = Number(c.valor_consignado) || 0;
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const metrics = calcCuadreMetrics({
        recaudo: c.recaudo,
        venta_tarjetas: c.venta_tarjetas,
        consignacion_pendiente: c.consignacion_pendiente,
        valor_consignado: c.valor_consignado,
        url_foto_consignacion: c.url_foto_consignacion,
        consigna_hoy: c.consigna_hoy,
        gastos: [{ valor: gastos }],
        turneros: [{ valor: turneros }],
        total_fisico: c.total_fisico,
        context: 'final',
      });
      const pendiente = Number(c.consignacion_pendiente) || 0;

      if (!acc[key]) {
        acc[key] = {
          mes,
          pdv,
          pdvId,
          ventaTotal: 0,
          valorGeneralAConsignar: 0,
          ventaDatafono: 0,
          valorConsignado: 0,
          deducciones: 0,
          pendienteFinMes: pendiente,
          _fechaMax: fecha,
        };
      }

      acc[key].ventaTotal += ventaTotal;
      acc[key].valorGeneralAConsignar += metrics.totalGeneralAConsignar;
      acc[key].ventaDatafono += ventaDatafono;
      acc[key].valorConsignado += valorConsignado;
      acc[key].deducciones += gastos + turneros;
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
    <div className="flex min-h-screen bg-company relative overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

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

      <main className="flex-1 min-w-0">
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

        <div className="p-4 md:p-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">Reportes Generales</h1>
              <p className="text-white/80 drop-shadow text-sm mt-1">Resumen por fechas y consolidado mensual</p>
            </div>
            <button
              onClick={exportarExcelGeneral}
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
            <p className="text-sm text-gray-600">Valor General a Consignar</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.valorGeneralAConsignar)}</p>
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
            <p className="text-sm text-gray-600">Deducciones (Gastos + Turneros)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.deducciones)}</p>
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

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 mb-6">
          <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">Descargas</h3>
              <p className="text-sm text-gray-600">Exporta análisis por fecha y por punto de venta usando los filtros.</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={exportarExcelGeneral}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <Download className="w-5 h-5" />
                General
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="font-semibold text-gray-900">Deducciones</p>
              <p className="text-sm text-gray-600 mt-1">Gastos + Turneros por día y punto de venta.</p>
              <button
                onClick={exportarExcelDeducciones}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                <FileText className="w-4 h-4" />
                Descargar Excel
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="font-semibold text-gray-900">Ventas</p>
              <p className="text-sm text-gray-600 mt-1">Venta total, datafono y efectivo esperado.</p>
              <button
                onClick={exportarExcelVentas}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                <FileText className="w-4 h-4" />
                Descargar Excel
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="font-semibold text-gray-900">Consignaciones</p>
              <p className="text-sm text-gray-600 mt-1">Consignaciones realizadas por punto de venta.</p>
              <button
                onClick={exportarExcelConsignaciones}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                <FileText className="w-4 h-4" />
                Descargar Excel
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30 max-w-full">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Cuadres</h3>
          </div>
          {useCardsLayout ? (
            <div className="p-4 space-y-3">
              {cuadresFiltrados.length === 0 ? (
                <div className="text-center text-gray-500 py-6">
                  No hay cuadres para mostrar en este rango de fechas.
                </div>
              ) : (
                cuadresFiltrados.map((cuadre) => (
                  <div key={cuadre.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{cuadre.punto_de_venta?.nombre || 'N/A'}</p>
                        <p className="text-sm text-gray-600">{formatDate(cuadre.fecha)}</p>
                      </div>
                      <div className="shrink-0">{getEstadoBadge(cuadre.estado)}</div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="text-gray-600">Venta Total</p>
                        <p className="font-semibold text-gray-900">{formatCOP(cuadre.recaudo)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Valor General a Consignar</p>
                        <p className="font-semibold text-gray-900">
                          {formatCOP(
                            calcCuadreMetrics({
                              recaudo: cuadre.recaudo,
                              venta_tarjetas: cuadre.venta_tarjetas,
                              consignacion_pendiente: cuadre.consignacion_pendiente,
                              valor_consignado: cuadre.valor_consignado,
                              url_foto_consignacion: cuadre.url_foto_consignacion,
                              consigna_hoy: cuadre.consigna_hoy,
                              gastos: [{ valor: gastosByCuadreId[cuadre.id] || 0 }],
                              turneros: [{ valor: turnerosByCuadreId[cuadre.id] || 0 }],
                              total_fisico: cuadre.total_fisico,
                              context: 'final',
                            }).totalGeneralAConsignar
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Datafono</p>
                        <p className="font-semibold text-gray-900">{formatCOP(cuadre.venta_tarjetas)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Consignado</p>
                        <p className="font-semibold text-gray-900">{formatCOP(cuadre.valor_consignado)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Deducciones</p>
                        <p className="font-semibold text-gray-900">
                          {formatCOP((gastosByCuadreId[cuadre.id] || 0) + (turnerosByCuadreId[cuadre.id] || 0))}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-600">Pendiente</p>
                        <p className="font-semibold text-gray-900">{formatCOP(cuadre.consignacion_pendiente)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[760px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-[220px]">Punto de Venta</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-[110px] whitespace-nowrap">Fecha</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 w-[140px] whitespace-nowrap">Venta Total</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 w-[190px] whitespace-nowrap">Valor General a Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell w-[140px] whitespace-nowrap">Datafono</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden xl:table-cell w-[160px] whitespace-nowrap">Consignado</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell w-[160px] whitespace-nowrap">Pendiente</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[150px] whitespace-nowrap">Deducciones</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[140px] whitespace-nowrap">Total Físico</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[120px] whitespace-nowrap">Diferencia</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-[120px] whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                      No hay cuadres para mostrar en este rango de fechas.
                    </td>
                  </tr>
                ) : (
                  cuadresFiltrados.map((cuadre) => {
                    const gastos = gastosByCuadreId[cuadre.id] || 0;
                    const turneros = turnerosByCuadreId[cuadre.id] || 0;
                    const metrics = calcCuadreMetrics({
                      recaudo: cuadre.recaudo,
                      venta_tarjetas: cuadre.venta_tarjetas,
                      consignacion_pendiente: cuadre.consignacion_pendiente,
                      valor_consignado: cuadre.valor_consignado,
                      url_foto_consignacion: cuadre.url_foto_consignacion,
                      consigna_hoy: cuadre.consigna_hoy,
                      gastos: [{ valor: gastos }],
                      turneros: [{ valor: turneros }],
                      total_fisico: cuadre.total_fisico,
                      context: 'final',
                    });

                    return (
                      <tr key={cuadre.id} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium truncate">{cuadre.punto_de_venta?.nombre || 'N/A'}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm whitespace-nowrap">{formatDate(cuadre.fecha)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap">{formatCOP(cuadre.recaudo)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap">{formatCOP(metrics.totalGeneralAConsignar)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden lg:table-cell">{formatCOP(cuadre.venta_tarjetas)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden xl:table-cell">{formatCOP(cuadre.valor_consignado)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden sm:table-cell">{formatCOP(cuadre.consignacion_pendiente)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell">{formatCOP(gastos + turneros)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell">{formatCOP(cuadre.total_fisico)}</td>
                        <td className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell ${(Number(cuadre.sobrante) || 0) > 0 ? 'text-green-600' : (Number(cuadre.faltante) || 0) > 0 ? 'text-red-600' : ''}`}>
                          {(Number(cuadre.sobrante) || 0) > 0 ? `+${formatCOP(Number(cuadre.sobrante))}` : (Number(cuadre.faltante) || 0) > 0 ? `-${formatCOP(Number(cuadre.faltante))}` : '$0'}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4">{getEstadoBadge(cuadre.estado)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/30 max-w-full">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Consolidado Mensual</h3>
          </div>
          {useCardsLayout ? (
            <div className="p-4 space-y-3">
              {consolidadoMensual.length === 0 ? (
                <div className="text-center text-gray-500 py-6">
                  No hay datos para el consolidado mensual en este rango.
                </div>
              ) : (
                consolidadoMensual.map((row) => (
                  <div key={`${row.pdvId}|${row.mes}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{row.mes}</p>
                        <p className="text-sm text-gray-600 truncate">{row.pdv}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-600">Pendiente Fin</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.pendienteFinMes)}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="text-gray-600">Venta Total</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.ventaTotal)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Valor General a Consignar</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.valorGeneralAConsignar)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Datafono</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.ventaDatafono)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Consignado</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.valorConsignado)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Deducciones</p>
                        <p className="font-semibold text-gray-900">{formatCOP(row.deducciones)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[680px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-[110px] whitespace-nowrap">Mes</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-[220px]">Punto de Venta</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 w-[150px] whitespace-nowrap">Venta Total</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 w-[200px] whitespace-nowrap">Valor General a Consignar</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 w-[170px] whitespace-nowrap">Pendiente Fin</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[150px] whitespace-nowrap">Datafono</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[160px] whitespace-nowrap">Consignado</th>
                  <th className="px-3 sm:px-6 py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 hidden 2xl:table-cell w-[160px] whitespace-nowrap">Deducciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {consolidadoMensual.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No hay datos para el consolidado mensual en este rango.
                    </td>
                  </tr>
                ) : (
                  consolidadoMensual.map((row) => (
                    <tr key={`${row.pdvId}|${row.mes}`} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium whitespace-nowrap">{row.mes}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm truncate">{row.pdv}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap">{formatCOP(row.ventaTotal)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap">{formatCOP(row.valorGeneralAConsignar)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap">{formatCOP(row.pendienteFinMes)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell">{formatCOP(row.ventaDatafono)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell">{formatCOP(row.valorConsignado)}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-right whitespace-nowrap hidden 2xl:table-cell">{formatCOP(row.deducciones)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
