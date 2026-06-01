'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate } from '@/lib/utils';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CuadreDiario, PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

export default function SuperadminReportesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cuadres, setCuadres] = useState<CuadreDiario[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [pdvSeleccionado, setPdvSeleccionado] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const [pdvRes, cuadresRes] = await Promise.all([
        supabase.from('puntos_de_venta').select('*'),
        supabase.from('cuadres_diarios').select('*').order('fecha', { ascending: false }),
      ]);

      // Combine data como en la página principal
      const cuadresWithData = cuadresRes.data?.map(cuadre => ({
        ...cuadre,
        punto_de_venta: pdvRes.data?.find(p => p.id === cuadre.punto_de_venta_id),
      })) || [];

      console.log('✅ Cuadres cargados del superadmin:', cuadresWithData);
      setCuadres(cuadresWithData);
      setPuntosVenta(pdvRes.data || []);

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
      acc.totalSistema += Number(c.total_sistema) || 0;
      acc.sobrante += Number(c.sobrante) || 0;
      acc.faltante += Number(c.faltante) || 0;
      return acc;
    },
    { totalFisico: 0, totalSistema: 0, sobrante: 0, faltante: 0 }
  );

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cuadres');

    worksheet.columns = [
      { header: 'Punto de Venta', key: 'pdv', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Total Físico', key: 'totalFisico', width: 15 },
      { header: 'Total Sistema', key: 'totalSistema', width: 15 },
      { header: 'Sobrante', key: 'sobrante', width: 15 },
      { header: 'Faltante', key: 'faltante', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
    ];

    cuadresFiltrados.forEach((c) => {
      worksheet.addRow({
        pdv: c.punto_de_venta?.nombre || 'N/A',
        fecha: new Date(c.fecha).toLocaleDateString(),
        totalFisico: formatCOP(c.total_fisico),
        totalSistema: formatCOP(c.total_sistema),
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
          <a href="/superadmin/reportes" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
            Reportes
          </a>
          <a href="/superadmin/usuarios" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Usuarios
          </a>
          <a href="/superadmin/puntos-de-venta" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
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
            <h1 className="text-3xl font-bold text-gray-900">Reportes Generales</h1>
          </div>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Download className="w-5 h-5" />
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Total Físico</p>
            <p className="text-2xl font-bold text-blue-700">{formatCOP(totals.totalFisico)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Total Sistema</p>
            <p className="text-2xl font-bold text-gray-700">{formatCOP(totals.totalSistema)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Total Sobrante</p>
            <p className="text-2xl font-bold text-green-700">{formatCOP(totals.sobrante)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Total Faltante</p>
            <p className="text-2xl font-bold text-red-700">{formatCOP(totals.faltante)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-light">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Punto de Venta</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total Físico</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total Sistema</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Diferencia</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No hay cuadres para mostrar en este rango de fechas.
                    </td>
                  </tr>
                ) : (
                  cuadresFiltrados.map((cuadre) => (
                    <tr key={cuadre.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium">{cuadre.punto_de_venta?.nombre || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm">{formatDate(cuadre.fecha)}</td>
                      <td className="px-6 py-4 text-sm font-medium">{formatCOP(cuadre.total_fisico)}</td>
                      <td className="px-6 py-4 text-sm font-medium">{formatCOP(cuadre.total_sistema)}</td>
                      <td className={`px-6 py-4 text-sm font-medium ${(Number(cuadre.sobrante) || 0) > 0 ? 'text-green-600' : (Number(cuadre.faltante) || 0) > 0 ? 'text-red-600' : ''}`}>
                        {(Number(cuadre.sobrante) || 0) > 0 ? `+${formatCOP(Number(cuadre.sobrante))}` : (Number(cuadre.faltante) || 0) > 0 ? `-${formatCOP(Number(cuadre.faltante))}` : '$0'}
                      </td>
                      <td className="px-6 py-4">{getEstadoBadge(cuadre.estado)}</td>
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
