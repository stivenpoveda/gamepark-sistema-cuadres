'use client';

import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Download, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  CategoriaFinanciera,
  CuentaFinanciera,
  formatMovementDisplayTypeLabel,
  formatMovementOriginLabel,
  getEffectiveFinancialMovements,
  getCurrentMonthRange,
  isAutomaticBookMovement,
  isConsignacionMovement,
  isDatafonoMovement,
  isManualBookMovement,
  isMovementIncome,
  MovimientoFinanciero,
} from '@/lib/admin-bancos';
import { formatCOP, formatDate, getCuadreConsignacionesRegistrables } from '@/lib/utils';
import type { PuntoDeVenta } from '@/types';

type CuadreAprobadoReporte = {
  id: string;
  fecha: string;
  punto_de_venta_id: string;
  valor_consignado: number;
  firma_cajero_url?: string | null;
  url_foto_consignacion?: string | null;
};

type InformativeReportRow = {
  fecha: string;
  ciudad: string;
  pdv: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  descripcion: string;
  valor: number;
};

type LedgerReportRow = {
  fecha: string;
  tipo: string;
  origen: string;
  cuenta: string;
  ciudad: string;
  pdv: string;
  categoria: string;
  descripcion: string;
  valor: number;
  tipoMovimiento: MovimientoFinanciero['tipo_movimiento'];
  entryKind: 'consignacion' | 'datafono' | 'otro';
};

type ReportView = 'todos' | 'libro' | 'manual' | 'automatico' | 'informativo';

export default function ReportesAdminBancosPage() {
  const monthRange = getCurrentMonthRange();
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [cuadresAprobados, setCuadresAprobados] = useState<CuadreAprobadoReporte[]>([]);
  const [filters, setFilters] = useState({
    fechaInicio: monthRange.start,
    fechaFin: monthRange.end,
    cuentaId: '',
    ciudad: '',
    puntoVentaId: '',
    categoriaId: '',
    tipoMovimiento: '',
    vistaReporte: 'todos' as ReportView,
  });

  useEffect(() => {
    const fetchData = async () => {
      const [accountsRes, categoriesRes, pdvRes, movementsRes, cuadresRes] = await Promise.all([
        supabase.from('cuentas_financieras').select('*').order('nombre'),
        supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre'),
        supabase.from('puntos_de_venta').select('*').order('nombre'),
        supabase
          .from('movimientos_financieros')
          .select('*')
          .eq('activo', true)
          .order('fecha_movimiento', { ascending: false }),
        supabase
          .from('cuadres_diarios')
          .select('id,fecha,punto_de_venta_id,valor_consignado,firma_cajero_url,url_foto_consignacion')
          .eq('estado', 'aprobado')
          .order('fecha', { ascending: false }),
      ]);

      setCuentas((accountsRes.data || []) as CuentaFinanciera[]);
      setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
      setPuntosVenta((pdvRes.data || []) as PuntoDeVenta[]);
      setMovimientos(
        getEffectiveFinancialMovements((movementsRes.data || []) as MovimientoFinanciero[])
      );
      setCuadresAprobados((cuadresRes.data || []) as CuadreAprobadoReporte[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const cityOptions = useMemo(
    () => Array.from(new Set(puntosVenta.map((item) => item.ciudad).filter(Boolean))),
    [puntosVenta]
  );

  const informativeOnlyCuadreIds = useMemo(() => {
    const ids = new Set<string>();

    cuadresAprobados.forEach((cuadre) => {
      const consignaciones = getCuadreConsignacionesRegistrables({
        firma_cajero_url: cuadre.firma_cajero_url,
        url_foto_consignacion: cuadre.url_foto_consignacion,
        valor_consignado: cuadre.valor_consignado,
      });

      if (consignaciones.length > 0 && consignaciones.every((consignacion) => consignacion.isInformative)) {
        ids.add(cuadre.id);
      }
    });

    return ids;
  }, [cuadresAprobados]);

  const filteredMovements = useMemo(() => {
    return movimientos.filter((movement) => {
      if (
        movement.tipo_movimiento === 'cuadre_aprobado' &&
        movement.cuadre_id &&
        informativeOnlyCuadreIds.has(movement.cuadre_id) &&
        !isDatafonoMovement(movement)
      ) {
        return false;
      }
      if (filters.fechaInicio && movement.fecha_movimiento < filters.fechaInicio) return false;
      if (filters.fechaFin && movement.fecha_movimiento > filters.fechaFin) return false;
      if (filters.cuentaId && movement.cuenta_id !== filters.cuentaId) return false;
      if (filters.puntoVentaId && movement.pdv_id !== filters.puntoVentaId) return false;
      if (filters.categoriaId && movement.categoria_id !== filters.categoriaId) return false;
      if (filters.tipoMovimiento === 'ingreso_datafono' && !isDatafonoMovement(movement)) return false;
      if (
        filters.tipoMovimiento &&
        filters.tipoMovimiento !== 'ingreso_datafono' &&
        (
          movement.tipo_movimiento !== filters.tipoMovimiento ||
          (filters.tipoMovimiento === 'cuadre_aprobado' && isDatafonoMovement(movement))
        )
      ) {
        return false;
      }
      if (filters.vistaReporte === 'manual' && !isManualBookMovement(movement)) return false;
      if (filters.vistaReporte === 'automatico' && !isAutomaticBookMovement(movement)) return false;
      if (filters.vistaReporte === 'informativo') return false;
      if (filters.ciudad) {
        const city = puntosVenta.find((item) => item.id === movement.pdv_id)?.ciudad || '';
        if (city !== filters.ciudad) return false;
      }
      return true;
    });
  }, [filters, movimientos, puntosVenta, informativeOnlyCuadreIds]);

  const reportRows = useMemo(
    () =>
      filteredMovements.map((movement): LedgerReportRow => ({
        fecha: movement.fecha_movimiento,
        tipo: formatMovementDisplayTypeLabel(movement),
        origen: formatMovementOriginLabel(movement.origen),
        cuenta: cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A',
        ciudad: puntosVenta.find((item) => item.id === movement.pdv_id)?.ciudad || '',
        pdv: puntosVenta.find((item) => item.id === movement.pdv_id)?.nombre || '',
        categoria: categorias.find((item) => item.id === movement.categoria_id)?.nombre || '',
        descripcion: movement.descripcion,
        valor: Number(movement.valor || 0),
        tipoMovimiento: movement.tipo_movimiento,
        entryKind: isDatafonoMovement(movement)
          ? 'datafono'
          : isConsignacionMovement(movement)
            ? 'consignacion'
            : 'otro',
      })),
    [filteredMovements, cuentas, puntosVenta, categorias]
  );

  const ledgerTotals = useMemo(
    () =>
      reportRows.reduce(
        (acc, row) => {
          if (!isMovementIncome(row.tipoMovimiento)) {
            acc.egresos += row.valor;
            return acc;
          }

          if (row.entryKind === 'consignacion') {
            acc.consignaciones += row.valor;
            return acc;
          }

          if (row.entryKind === 'datafono') {
            acc.datafono += row.valor;
            return acc;
          }

          acc.otrosIngresos += row.valor;
          return acc;
        },
        { consignaciones: 0, datafono: 0, otrosIngresos: 0, egresos: 0 }
      ),
    [reportRows]
  );

  const informativeRows = useMemo(() => {
    return cuadresAprobados
      .filter((cuadre) => {
        if (filters.fechaInicio && cuadre.fecha < filters.fechaInicio) return false;
        if (filters.fechaFin && cuadre.fecha > filters.fechaFin) return false;
        if (filters.puntoVentaId && cuadre.punto_de_venta_id !== filters.puntoVentaId) return false;
        if (filters.ciudad) {
          const city = puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id)?.ciudad || '';
          if (city !== filters.ciudad) return false;
        }
        return true;
      })
      .flatMap((cuadre) => {
        const pdv = puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id);
        return getCuadreConsignacionesRegistrables({
          firma_cajero_url: cuadre.firma_cajero_url,
          url_foto_consignacion: cuadre.url_foto_consignacion,
          valor_consignado: cuadre.valor_consignado,
        })
          .filter((consignacion) => consignacion.isInformative)
          .map((consignacion): InformativeReportRow => ({
            fecha: cuadre.fecha,
            ciudad: pdv?.ciudad || '',
            pdv: pdv?.nombre || '',
            banco: consignacion.banco || consignacion.otraCuenta?.banco || '',
            tipoCuenta: consignacion.tipoCuenta || consignacion.otraCuenta?.tipoCuenta || '',
            numeroCuenta: consignacion.numeroCuenta || consignacion.otraCuenta?.numeroCuenta || '',
            titular: consignacion.titular || consignacion.otraCuenta?.titular || '',
            descripcion: 'Consignacion a cuenta no registrada o de tercero',
            valor: Number(consignacion.valor || 0),
          }));
      });
  }, [cuadresAprobados, filters, puntosVenta]);

  const informativeTotals = useMemo(
    () =>
      informativeRows.reduce(
        (acc, row) => {
          acc.total += row.valor;
          acc.cantidad += 1;
          return acc;
        },
        { total: 0, cantidad: 0 }
      ),
    [informativeRows]
  );

  const showLedgerSection =
    filters.vistaReporte === 'todos' ||
    filters.vistaReporte === 'libro' ||
    filters.vistaReporte === 'manual' ||
    filters.vistaReporte === 'automatico';

  const showInformativeSection =
    filters.vistaReporte === 'todos' || filters.vistaReporte === 'informativo';

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const buildLedgerSheet = (title: string, rows: LedgerReportRow[]) => {
      const sheet = workbook.addWorksheet(title);
      sheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Tipo', key: 'tipo', width: 22 },
        { header: 'Origen', key: 'origen', width: 18 },
        { header: 'Cuenta', key: 'cuenta', width: 28 },
        { header: 'Ciudad', key: 'ciudad', width: 18 },
        { header: 'Punto de Venta', key: 'pdv', width: 28 },
        { header: 'Categoria', key: 'categoria', width: 20 },
        { header: 'Descripcion', key: 'descripcion', width: 42 },
        { header: 'Valor', key: 'valor', width: 16 },
      ];

      rows.forEach((row) => sheet.addRow(row));
      sheet.getColumn('valor').numFmt = '"$"#,##0';
      return sheet;
    };

    buildLedgerSheet('Libro Bancario', reportRows);
    buildLedgerSheet(
      'Consignaciones Libro',
      reportRows.filter((row) => row.entryKind === 'consignacion')
    );
    buildLedgerSheet(
      'Ingresos Datafono',
      reportRows.filter((row) => row.entryKind === 'datafono')
    );

    const informativeSheet = workbook.addWorksheet('Ctas No Registradas');
    informativeSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Ciudad', key: 'ciudad', width: 18 },
      { header: 'Punto de Venta', key: 'pdv', width: 28 },
      { header: 'Banco', key: 'banco', width: 18 },
      { header: 'Tipo de Cuenta', key: 'tipoCuenta', width: 16 },
      { header: 'Numero de Cuenta', key: 'numeroCuenta', width: 22 },
      { header: 'Titular', key: 'titular', width: 24 },
      { header: 'Descripcion', key: 'descripcion', width: 38 },
      { header: 'Valor', key: 'valor', width: 16 },
    ];

    informativeRows.forEach((row) => informativeSheet.addRow(row));
    informativeSheet.getColumn('valor').numFmt = '"$"#,##0';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'admin_bancos_reporte.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado en Excel');
  };

  const exportPdf = () => {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporte Admin Bancos</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
    .page { width: 100%; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    p { margin: 0 0 10px; color: #4b5563; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 16px; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
    .label { font-size: 12px; color: #6b7280; }
    .value { font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 6px; font-size: 11px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Reporte Admin Bancos</h1>
    <p>Rango: ${filters.fechaInicio || 'N/A'} a ${filters.fechaFin || 'N/A'}</p>
    <div class="summary">
      <div class="card"><div class="label">Ingresos Consignaciones</div><div class="value">${formatCOP(ledgerTotals.consignaciones)}</div></div>
      <div class="card"><div class="label">Ingresos Datafono</div><div class="value">${formatCOP(ledgerTotals.datafono)}</div></div>
      <div class="card"><div class="label">Otros Ingresos Libro</div><div class="value">${formatCOP(ledgerTotals.otrosIngresos)}</div></div>
      <div class="card"><div class="label">Egresos Libro</div><div class="value">${formatCOP(ledgerTotals.egresos)}</div></div>
      <div class="card"><div class="label">Ctas No Registradas</div><div class="value">${formatCOP(informativeTotals.total)}</div></div>
    </div>

    <h2>Libro Bancario</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Origen</th>
          <th>Cuenta</th>
          <th>Ciudad</th>
          <th>PDV</th>
          <th>Categoria</th>
          <th>Descripcion</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${reportRows
          .map(
            (row) => `<tr>
              <td>${formatDate(row.fecha)}</td>
              <td>${row.tipo}</td>
              <td>${row.origen}</td>
              <td>${row.cuenta}</td>
              <td>${row.ciudad || '-'}</td>
              <td>${row.pdv || '-'}</td>
              <td>${row.categoria || '-'}</td>
              <td>${row.descripcion}</td>
              <td>${formatCOP(row.valor)}</td>
            </tr>`
          )
          .join('') || '<tr><td colspan="9">No hay movimientos para los filtros seleccionados.</td></tr>'}
      </tbody>
    </table>

    <h2>Cuentas No Registradas</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Ciudad</th>
          <th>PDV</th>
          <th>Banco</th>
          <th>Tipo Cuenta</th>
          <th>Numero Cuenta</th>
          <th>Titular</th>
          <th>Descripcion</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${informativeRows
          .map(
            (row) => `<tr>
              <td>${formatDate(row.fecha)}</td>
              <td>${row.ciudad || '-'}</td>
              <td>${row.pdv || '-'}</td>
              <td>${row.banco || '-'}</td>
              <td>${row.tipoCuenta || '-'}</td>
              <td>${row.numeroCuenta || '-'}</td>
              <td>${row.titular || '-'}</td>
              <td>${row.descripcion}</td>
              <td>${formatCOP(row.valor)}</td>
            </tr>`
          )
          .join('') || '<tr><td colspan="9">No hay consignaciones informativas para los filtros seleccionados.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('No se pudo abrir la ventana del PDF');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    const print = () => win.print();
    win.onload = print;
    setTimeout(print, 400);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white drop-shadow">Reportes</h1>
          <p className="text-white/80 mt-1 drop-shadow">
            Analiza por separado movimientos manuales, automaticos y consignaciones a cuentas no registradas.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-lg"
          >
            <Download className="w-5 h-5" />
            Excel
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg"
          >
            <FileText className="w-5 h-5" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <FilterField label="Fecha Inicial">
            <input
              type="date"
              value={filters.fechaInicio}
              onChange={(e) => setFilters({ ...filters, fechaInicio: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </FilterField>
          <FilterField label="Fecha Final">
            <input
              type="date"
              value={filters.fechaFin}
              onChange={(e) => setFilters({ ...filters, fechaFin: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </FilterField>
          <FilterField label="Vista del Reporte">
            <select
              value={filters.vistaReporte}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  vistaReporte: e.target.value as ReportView,
                  cuentaId: e.target.value === 'informativo' ? '' : filters.cuentaId,
                  categoriaId: e.target.value === 'informativo' ? '' : filters.categoriaId,
                  tipoMovimiento: e.target.value === 'informativo' ? '' : filters.tipoMovimiento,
                })
              }
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="todos">Todos</option>
              <option value="libro">Libro bancario</option>
              <option value="manual">Solo manuales</option>
              <option value="automatico">Solo automaticos</option>
              <option value="informativo">Cuentas no registradas</option>
            </select>
          </FilterField>
          <FilterField label="Cuenta del Libro">
            <select
              value={filters.cuentaId}
              onChange={(e) => setFilters({ ...filters, cuentaId: e.target.value })}
              disabled={filters.vistaReporte === 'informativo'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todas</option>
              {cuentas.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Ciudad">
            <select
              value={filters.ciudad}
              onChange={(e) => setFilters({ ...filters, ciudad: e.target.value, puntoVentaId: '' })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todas</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Punto de Venta">
            <select
              value={filters.puntoVentaId}
              onChange={(e) => setFilters({ ...filters, puntoVentaId: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              {puntosVenta
                .filter((pdv) => !filters.ciudad || pdv.ciudad === filters.ciudad)
                .map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>
                    {pdv.nombre}
                  </option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Categoria">
            <select
              value={filters.categoriaId}
              onChange={(e) => setFilters({ ...filters, categoriaId: e.target.value })}
              disabled={filters.vistaReporte === 'informativo'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todas</option>
              {categorias.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Tipo de Movimiento">
            <select
              value={filters.tipoMovimiento}
              onChange={(e) => setFilters({ ...filters, tipoMovimiento: e.target.value })}
              disabled={filters.vistaReporte === 'informativo'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
              <option value="ingreso_datafono">Ingreso Datafono</option>
              <option value="transferencia_entrada">Transferencia Entrada</option>
              <option value="transferencia_salida">Transferencia Salida</option>
              <option value="cuadre_aprobado">Ingreso por Consignaciones</option>
            </select>
          </FilterField>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ReportMetric label="Ingresos Consignaciones" value={formatCOP(ledgerTotals.consignaciones)} />
        <ReportMetric label="Ingresos Datafono" value={formatCOP(ledgerTotals.datafono)} />
        <ReportMetric label="Otros Ingresos Libro" value={formatCOP(ledgerTotals.otrosIngresos)} />
        <ReportMetric label="Egresos Libro" value={formatCOP(ledgerTotals.egresos)} />
        <ReportMetric label="Ctas No Registradas" value={formatCOP(informativeTotals.total)} />
      </div>

      {showLedgerSection && (
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Reporte del Libro Bancario</h3>
          <p className="text-sm text-gray-500 mt-1">
            Este bloque mantiene separado el ingreso por consignaciones del ingreso por datafono para facilitar el cruce.
          </p>
        </div>
        <table className="w-full min-w-[1220px] table-fixed">
          <thead className="bg-light">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Origen</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cuenta</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ciudad</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Categoria</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {reportRows.map((row, index) => (
              <tr key={`${row.fecha}-${row.descripcion}-${index}`}>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(row.fecha)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.tipo}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.origen}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.cuenta}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.ciudad || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.pdv || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.categoria || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.descripcion}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatCOP(row.valor)}
                </td>
              </tr>
            ))}
            {reportRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                  No hay movimientos del libro para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {showInformativeSection && (
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
        <div className="mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Reporte de Cuentas No Registradas
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Estas consignaciones se muestran como soporte informativo y no afectan el saldo del libro.
            </p>
          </div>
          <div className="text-sm text-gray-600">
            {informativeTotals.cantidad} movimientos informativos
          </div>
        </div>
        <table className="w-full min-w-[1220px] table-fixed">
          <thead className="bg-light">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ciudad</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Banco</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo Cuenta</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Numero Cuenta</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Titular</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {informativeRows.map((row, index) => (
              <tr key={`${row.fecha}-${row.numeroCuenta}-${index}`}>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(row.fecha)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.ciudad || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.pdv || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.banco || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.tipoCuenta || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.numeroCuenta || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.titular || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.descripcion}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatCOP(row.valor)}
                </td>
              </tr>
            ))}
            {informativeRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                  No hay consignaciones a cuentas no registradas para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm p-5 rounded-xl shadow-2xl border border-white/30">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
