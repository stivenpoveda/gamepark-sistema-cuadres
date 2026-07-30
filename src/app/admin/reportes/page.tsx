'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcCuadreMetrics, formatCOP, formatDate, getGastoCategoriaLabel } from '@/lib/utils';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CuadreDiario, Usuario, PuntoDeVenta } from '@/types';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateOnly = (value: string) => value.split('T')[0];
const formatExcelDate = (value: string) => formatDate(normalizeDateOnly(value));
const isComparableBankApprovedCuadre = (cuadre: { estado?: string | null }) =>
  cuadre.estado === 'aprobado';

const applyNumericFormat = (worksheet: ExcelJS.Worksheet, keys: string[]) => {
  keys.forEach((key) => {
    worksheet.getColumn(key).numFmt = '"$"#,##0';
  });
};

type GastoDetalleReporte = {
  categoria: string;
  descripcion: string;
  valor: number;
  beneficiario?: string | null;
  documento_beneficiario?: string | null;
};

type TurneroDetalleReporte = {
  descripcion: string;
  valor: number;
};

export default function ReportesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [cuadres, setCuadres] = useState<CuadreDiario[]>([]);
  const [gastosByCuadreId, setGastosByCuadreId] = useState<Record<string, number>>({});
  const [gastoDetallesByCuadreId, setGastoDetallesByCuadreId] = useState<Record<string, GastoDetalleReporte[]>>({});
  const [turnerosByCuadreId, setTurnerosByCuadreId] = useState<Record<string, number>>({});
  const [turneroDetallesByCuadreId, setTurneroDetallesByCuadreId] = useState<Record<string, TurneroDetalleReporte[]>>({});
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

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
        const [pdvRes, cuadresRes] = await Promise.all([
          supabase.from('puntos_de_venta').select('*').eq('id', userData.punto_de_venta_id).single(),
          supabase.from('cuadres_diarios').select('*').eq('punto_de_venta_id', userData.punto_de_venta_id).order('fecha', { ascending: false })
        ]);

        const cuadresWithData = cuadresRes.data?.map(cuadre => ({
          ...cuadre,
          punto_de_venta: pdvRes.data,
        })) || [];

        setCuadres(cuadresWithData);

        const cuadreIds = (cuadresRes.data || []).map((c) => c.id).filter(Boolean) as string[];
        if (cuadreIds.length > 0) {
          const [gastosRes, turnerosRes] = await Promise.all([
            supabase
              .from('gastos_diarios')
              .select('cuadre_id,categoria,descripcion,valor,beneficiario,documento_beneficiario')
              .in('cuadre_id', cuadreIds),
            supabase.from('pagos_turneros').select('cuadre_id,valor,nombre_turnero,horario').in('cuadre_id', cuadreIds),
          ]);

          const gastosMap: Record<string, number> = {};
          const gastoDetallesMap: Record<string, GastoDetalleReporte[]> = {};
          (gastosRes.data || []).forEach((g: any) => {
            const id = g.cuadre_id as string | undefined;
            if (!id) return;
            gastosMap[id] = (gastosMap[id] || 0) + (Number(g.valor) || 0);
            gastoDetallesMap[id] = gastoDetallesMap[id] || [];
            gastoDetallesMap[id].push({
              categoria: getGastoCategoriaLabel(g.categoria || 'Otros'),
              descripcion: String(g.descripcion || ''),
              valor: Number(g.valor) || 0,
              beneficiario: g.beneficiario || null,
              documento_beneficiario: g.documento_beneficiario || null,
            });
          });
          setGastosByCuadreId(gastosMap);
          setGastoDetallesByCuadreId(gastoDetallesMap);

          const turnerosMap: Record<string, number> = {};
          const turneroDetallesMap: Record<string, TurneroDetalleReporte[]> = {};
          (turnerosRes.data || []).forEach((t: any) => {
            const id = t.cuadre_id as string | undefined;
            if (!id) return;
            turnerosMap[id] = (turnerosMap[id] || 0) + (Number(t.valor) || 0);
            const nombre = String(t.nombre_turnero || 'Turnero');
            const horario = String(t.horario || '').trim();
            turneroDetallesMap[id] = turneroDetallesMap[id] || [];
            turneroDetallesMap[id].push({
              descripcion: horario ? `${nombre} - ${horario}` : nombre,
              valor: Number(t.valor) || 0,
            });
          });
          setTurnerosByCuadreId(turnerosMap);
          setTurneroDetallesByCuadreId(turneroDetallesMap);
        } else {
          setGastosByCuadreId({});
          setGastoDetallesByCuadreId({});
          setTurnerosByCuadreId({});
          setTurneroDetallesByCuadreId({});
        }
      }

      const today = new Date();
      const lastMonth = new Date(today);
      lastMonth.setMonth(today.getMonth() - 1);
      setFechaFin(toDateInputValue(today));
      setFechaInicio(toDateInputValue(lastMonth));

      setLoading(false);
    };

    fetchData();
  }, []);

  const cuadresFiltrados = cuadres.filter((c) => {
    if (!fechaInicio || !fechaFin) return true;
    // Aseguramos que la fecha del cuadre esté en formato YYYY-MM-DD
    const fechaCuadre = c.fecha.split('T')[0];
    return fechaCuadre >= fechaInicio && fechaCuadre <= fechaFin;
  });

  const totals = cuadresFiltrados.reduce(
    (acc, c) => {
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const desembolsos = gastos + turneros;
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

      const consignaHoy = (c.consigna_hoy ?? true) === true;
      const consignaciones = consignaHoy ? Number(c.valor_consignado) || 0 : 0;
      const datafono = isComparableBankApprovedCuadre(c) ? Number(c.venta_tarjetas) || 0 : 0;

      acc.ventaTotal += Number(c.recaudo) || 0;
      acc.datafono += datafono;
      acc.desembolsos += desembolsos;
      acc.efectivo += metrics.totalEfectivoEsperado;
      acc.consignaciones += consignaciones;
      return acc;
    },
    { ventaTotal: 0, datafono: 0, desembolsos: 0, efectivo: 0, consignaciones: 0 }
  );

  const saldoEnCaja = cuadresFiltrados.reduce<{ fecha: string; pendiente: number } | null>((acc, c) => {
    const fecha = c.fecha.split('T')[0];
    const consignaHoy = (c.consigna_hoy ?? true) === true;
    const cerrado = !consignaHoy || Boolean(c.url_foto_consignacion) || (Number(c.valor_consignado) || 0) > 0;
    if (!cerrado) return acc;

    const pendiente = Number(c.consignacion_pendiente) || 0;
    if (!acc || fecha > acc.fecha) return { fecha, pendiente };
    return acc;
  }, null)?.pendiente || 0;

  const renderDesembolsoDetalle = (cuadreId: string) => {
    const gastos = gastoDetallesByCuadreId[cuadreId] || [];
    const turneros = turneroDetallesByCuadreId[cuadreId] || [];

    if (gastos.length === 0 && turneros.length === 0) {
      return null;
    }

    return (
      <div className="mt-2 space-y-1 text-[11px] leading-4 text-gray-500">
        {gastos.map((gasto, index) => (
          <p key={`gasto-${cuadreId}-${index}`}>
            {`Gasto: ${gasto.descripcion || 'Sin descripción'} | ${gasto.categoria} | ${formatCOP(gasto.valor)}`}
            {gasto.beneficiario ? ` | Beneficiario: ${gasto.beneficiario}` : ''}
            {gasto.documento_beneficiario ? ` | NIT/Cédula: ${gasto.documento_beneficiario}` : ''}
          </p>
        ))}
        {turneros.map((turnero, index) => (
          <p key={`turnero-${cuadreId}-${index}`}>
            {`Turnero: ${turnero.descripcion} | ${formatCOP(turnero.valor)}`}
          </p>
        ))}
      </div>
    );
  };

  const getDesembolsoDetalleExport = (cuadreId: string) => {
    const gastos = gastoDetallesByCuadreId[cuadreId] || [];
    const turneros = turneroDetallesByCuadreId[cuadreId] || [];

    return [
      ...gastos.map((gasto) =>
        [
          `Gasto: ${gasto.descripcion || 'Sin descripción'}`,
          gasto.categoria,
          `Valor: ${formatCOP(gasto.valor)}`,
          gasto.beneficiario ? `Beneficiario: ${gasto.beneficiario}` : '',
          gasto.documento_beneficiario ? `NIT/Cédula: ${gasto.documento_beneficiario}` : '',
        ]
          .filter(Boolean)
          .join(' | ')
      ),
      ...turneros.map((turnero) => `Turnero: ${turnero.descripcion} | Valor: ${formatCOP(turnero.valor)}`),
    ].join(' || ');
  };

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cuadres');

    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Venta Total', key: 'ventaTotal', width: 15 },
      { header: 'Valor General a Consignar', key: 'valorGeneralAConsignar', width: 22 },
      { header: 'Venta Datafono', key: 'ventaDatafono', width: 15 },
      { header: 'Valor Consignado', key: 'valorConsignado', width: 18 },
      { header: 'Deducciones (Gastos + Turneros)', key: 'deducciones', width: 22 },
      { header: 'Detalle Desembolsos', key: 'detalleDesembolsos', width: 80 },
      { header: 'Pendiente', key: 'pendiente', width: 15 },
      { header: 'Total Físico', key: 'totalFisico', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
    ];

    cuadresFiltrados.forEach((c) => {
      const gastos = gastosByCuadreId[c.id] || 0;
      const turneros = turnerosByCuadreId[c.id] || 0;
      const datafono = isComparableBankApprovedCuadre(c) ? Number(c.venta_tarjetas) || 0 : 0;
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
        fecha: formatExcelDate(c.fecha),
        ventaTotal: Number(c.recaudo) || 0,
        valorGeneralAConsignar: Number(metrics.totalGeneralAConsignar) || 0,
        ventaDatafono: datafono,
        valorConsignado: Number(c.valor_consignado) || 0,
        deducciones: Number(gastos + turneros) || 0,
        detalleDesembolsos: getDesembolsoDetalleExport(c.id),
        pendiente: Number(c.consignacion_pendiente) || 0,
        totalFisico: Number(c.total_fisico) || 0,
        estado: c.estado,
      });
    });

    applyNumericFormat(worksheet, [
      'ventaTotal',
      'valorGeneralAConsignar',
      'ventaDatafono',
      'valorConsignado',
      'deducciones',
      'pendiente',
      'totalFisico',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_cuadres_${puntoVenta?.nombre || 'reporte'}.xlsx`;
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
    <div className="flex min-h-screen bg-gray-50 overflow-x-hidden">
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
          <a href="/admin/turneros" className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-lg mb-2">
            Turneros
          </a>
          <a href="/admin/reportes" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg mb-2">
            Reportes
          </a>
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-6 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')} className="text-primary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-600">{puntoVenta?.nombre}</p>
          </div>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg"
          >
            <Download className="w-5 h-5" />
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Venta Total</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.ventaTotal)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Datafono</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.datafono)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Desembolsos</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.desembolsos)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Efectivo</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.efectivo)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Consignaciones</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(totals.consignaciones)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md">
            <p className="text-sm text-gray-600">Saldo en Caja</p>
            <p className="text-2xl font-bold text-gray-900">{formatCOP(saldoEnCaja)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[900px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 w-[120px] whitespace-nowrap">Fecha</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[150px] whitespace-nowrap">Venta Total</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[140px] whitespace-nowrap">Datafono</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[320px] whitespace-nowrap">Desembolsos</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[150px] whitespace-nowrap">Efectivo</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[160px] whitespace-nowrap">Consignaciones</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 w-[160px] whitespace-nowrap">Saldo en Caja</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 w-[120px] whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cuadresFiltrados.map((cuadre) => {
                  const gastos = gastosByCuadreId[cuadre.id] || 0;
                  const turneros = turnerosByCuadreId[cuadre.id] || 0;
                  const desembolsos = gastos + turneros;
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
                  const consignaciones = (cuadre.consigna_hoy ?? true) === false ? 0 : Number(cuadre.valor_consignado) || 0;

                  return (
                    <tr key={cuadre.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm whitespace-nowrap">{formatDate(cuadre.fecha)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">{formatCOP(cuadre.recaudo)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">
                        {formatCOP(
                          isComparableBankApprovedCuadre(cuadre) ? Number(cuadre.venta_tarjetas) || 0 : 0
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-right align-top">
                        <div className="whitespace-nowrap">{formatCOP(desembolsos)}</div>
                        {renderDesembolsoDetalle(cuadre.id)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">{formatCOP(metrics.totalEfectivoEsperado)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">{formatCOP(consignaciones)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">{formatCOP(cuadre.consignacion_pendiente)}</td>
                      <td className="px-6 py-4">{getEstadoBadge(cuadre.estado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
