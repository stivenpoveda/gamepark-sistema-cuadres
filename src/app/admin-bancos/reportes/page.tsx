'use client';

import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Download, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { CuentaFinanciera, CategoriaFinanciera } from '@/lib/admin-bancos';
import { formatCOP, formatDate } from '@/lib/utils';
import { getCurrentMonthRange, MovimientoFinanciero, formatMovementTypeLabel } from '@/lib/admin-bancos';
import type { PuntoDeVenta } from '@/types';

export default function ReportesAdminBancosPage() {
  const monthRange = getCurrentMonthRange();
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [filters, setFilters] = useState({
    fechaInicio: monthRange.start,
    fechaFin: monthRange.end,
    cuentaId: '',
    ciudad: '',
    puntoVentaId: '',
    categoriaId: '',
    tipoMovimiento: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      const [accountsRes, categoriesRes, pdvRes, movementsRes] = await Promise.all([
        supabase.from('cuentas_financieras').select('*').order('nombre'),
        supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre'),
        supabase.from('puntos_de_venta').select('*').order('nombre'),
        supabase.from('movimientos_financieros').select('*').eq('activo', true).order('fecha_movimiento', { ascending: false }),
      ]);

      setCuentas((accountsRes.data || []) as CuentaFinanciera[]);
      setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
      setPuntosVenta((pdvRes.data || []) as PuntoDeVenta[]);
      setMovimientos((movementsRes.data || []) as MovimientoFinanciero[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const cityOptions = Array.from(new Set(puntosVenta.map((item) => item.ciudad).filter(Boolean)));

  const filteredMovements = useMemo(() => {
    return movimientos.filter((movement) => {
      if (filters.fechaInicio && movement.fecha_movimiento < filters.fechaInicio) return false;
      if (filters.fechaFin && movement.fecha_movimiento > filters.fechaFin) return false;
      if (filters.cuentaId && movement.cuenta_id !== filters.cuentaId) return false;
      if (filters.puntoVentaId && movement.pdv_id !== filters.puntoVentaId) return false;
      if (filters.categoriaId && movement.categoria_id !== filters.categoriaId) return false;
      if (filters.tipoMovimiento && movement.tipo_movimiento !== filters.tipoMovimiento) return false;
      if (filters.ciudad) {
        const city = puntosVenta.find((item) => item.id === movement.pdv_id)?.ciudad || '';
        if (city !== filters.ciudad) return false;
      }
      return true;
    });
  }, [filters, movimientos, puntosVenta]);

  const reportRows = filteredMovements.map((movement) => ({
    fecha: movement.fecha_movimiento,
    tipo: formatMovementTypeLabel(movement.tipo_movimiento),
    cuenta: cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A',
    ciudad: puntosVenta.find((item) => item.id === movement.pdv_id)?.ciudad || '',
    pdv: puntosVenta.find((item) => item.id === movement.pdv_id)?.nombre || '',
    categoria: categorias.find((item) => item.id === movement.categoria_id)?.nombre || '',
    descripcion: movement.descripcion,
    valor: Number(movement.valor || 0),
  }));

  const totals = reportRows.reduce(
    (acc, row) => {
      const isIngreso = row.tipo === 'Ingreso' || row.tipo === 'Transferencia Entrada' || row.tipo === 'Ingreso por Cuadre';
      if (isIngreso) acc.ingresos += row.valor;
      else acc.egresos += row.valor;
      return acc;
    },
    { ingresos: 0, egresos: 0 }
  );

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Admin Bancos');
    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 22 },
      { header: 'Cuenta', key: 'cuenta', width: 28 },
      { header: 'Ciudad', key: 'ciudad', width: 18 },
      { header: 'Punto de Venta', key: 'pdv', width: 28 },
      { header: 'Categoria', key: 'categoria', width: 20 },
      { header: 'Descripcion', key: 'descripcion', width: 42 },
      { header: 'Valor', key: 'valor', width: 16 },
    ];

    reportRows.forEach((row) => worksheet.addRow(row));
    worksheet.getColumn('valor').numFmt = '"$"#,##0';

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
    p { margin: 0 0 10px; color: #4b5563; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0 16px; }
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
      <div class="card"><div class="label">Ingresos</div><div class="value">${formatCOP(totals.ingresos)}</div></div>
      <div class="card"><div class="label">Egresos</div><div class="value">${formatCOP(totals.egresos)}</div></div>
      <div class="card"><div class="label">Flujo Neto</div><div class="value">${formatCOP(totals.ingresos - totals.egresos)}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
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
              <td>${row.cuenta}</td>
              <td>${row.ciudad || '-'}</td>
              <td>${row.pdv || '-'}</td>
              <td>${row.categoria || '-'}</td>
              <td>${row.descripcion}</td>
              <td>${formatCOP(row.valor)}</td>
            </tr>`
          )
          .join('')}
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
          <p className="text-white/80 mt-1 drop-shadow">Analiza movimientos financieros por rango, cuenta, ciudad, PDV, categoria y tipo.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-lg">
            <Download className="w-5 h-5" />
            Excel
          </button>
          <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg">
            <FileText className="w-5 h-5" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <FilterField label="Fecha Inicial">
            <input type="date" value={filters.fechaInicio} onChange={(e) => setFilters({ ...filters, fechaInicio: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
          </FilterField>
          <FilterField label="Fecha Final">
            <input type="date" value={filters.fechaFin} onChange={(e) => setFilters({ ...filters, fechaFin: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
          </FilterField>
          <FilterField label="Cuenta">
            <select value={filters.cuentaId} onChange={(e) => setFilters({ ...filters, cuentaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
              <option value="">Todas</option>
              {cuentas.map((account) => (
                <option key={account.id} value={account.id}>{account.nombre}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Ciudad">
            <select value={filters.ciudad} onChange={(e) => setFilters({ ...filters, ciudad: e.target.value, puntoVentaId: '' })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
              <option value="">Todas</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Punto de Venta">
            <select value={filters.puntoVentaId} onChange={(e) => setFilters({ ...filters, puntoVentaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
              <option value="">Todos</option>
              {puntosVenta
                .filter((pdv) => !filters.ciudad || pdv.ciudad === filters.ciudad)
                .map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>{pdv.nombre}</option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Categoria">
            <select value={filters.categoriaId} onChange={(e) => setFilters({ ...filters, categoriaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
              <option value="">Todas</option>
              {categorias.map((category) => (
                <option key={category.id} value={category.id}>{category.nombre}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Tipo de Movimiento">
            <select value={filters.tipoMovimiento} onChange={(e) => setFilters({ ...filters, tipoMovimiento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
              <option value="">Todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
              <option value="transferencia_entrada">Transferencia Entrada</option>
              <option value="transferencia_salida">Transferencia Salida</option>
            </select>
          </FilterField>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ReportMetric label="Ingresos" value={formatCOP(totals.ingresos)} />
        <ReportMetric label="Egresos" value={formatCOP(totals.egresos)} />
        <ReportMetric label="Flujo Neto" value={formatCOP(totals.ingresos - totals.egresos)} />
      </div>

      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
        <table className="w-full min-w-[1100px] table-fixed">
          <thead className="bg-light">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
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
                <td className="px-4 py-3 text-sm text-gray-900">{row.cuenta}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.ciudad || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.pdv || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{row.categoria || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.descripcion}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(row.valor)}</td>
              </tr>
            ))}
            {reportRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                  No hay movimientos para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
