'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calcCuadreMetrics,
  formatCOP,
  formatDate,
  GASTO_CATEGORIA_TRANSPORTE_LABEL,
  getGastoCategoriaLabel,
} from '@/lib/utils';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import type { CuadreDiario, Usuario } from '@/types';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

export default function CuadreDetalle() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [cuadre, setCuadre] = useState<CuadreDiario | null>(null);
  const [user, setUser] = useState<Usuario | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [showObservacionModal, setShowObservacionModal] = useState(false);
  const [observacionSuperadmin, setObservacionSuperadmin] = useState('');
  const [accionModal, setAccionModal] = useState<'aprobar' | 'devuelto' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: userData } = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', session.user.email)
          .single();
        
        setUser(userData);
        setIsSuperadmin(userData?.rol === 'superadmin' || userData?.rol === 'superadministrador');
      }

      const { data: cuadreData } = await supabase
        .from('cuadres_diarios')
        .select('*')
        .eq('id', params.id)
        .single();

      if (cuadreData) {
        const puntoVentaPromise = supabase
          .from('puntos_de_venta')
          .select('*')
          .eq('id', cuadreData.punto_de_venta_id)
          .single();

        const usuarioPromise = supabase
          .from('usuarios')
          .select('*')
          .eq('id', cuadreData.usuario_id)
          .single();

        const denominacionesPromise = supabase
          .from('denominaciones_cuadre')
          .select('*')
          .eq('cuadre_id', params.id);

        const gastosPromise = supabase
          .from('gastos_diarios')
          .select('*')
          .eq('cuadre_id', params.id);

        const turnerosPromise = supabase
          .from('pagos_turneros')
          .select('*')
          .eq('cuadre_id', params.id);

        const [puntoVentaRes, usuarioRes, denominacionesRes, gastosRes, turnerosRes] = await Promise.all([
          puntoVentaPromise,
          usuarioPromise,
          denominacionesPromise,
          gastosPromise,
          turnerosPromise,
        ]);

        const cuadreCompleto = {
          ...cuadreData,
          punto_de_venta: puntoVentaRes.data,
          usuario: usuarioRes.data,
          denominaciones_cuadre: denominacionesRes.data,
          gastos_diarios: gastosRes.data,
          pagos_turneros: turnerosRes.data,
        };

        setCuadre(cuadreCompleto);
      }

      setLoading(false);
    };

    init();
  }, [params.id]);

  const handleAprobar = async () => {
    if (!cuadre) return;
    setSaving(true);
    try {
      const { data } = await supabase
        .from('cuadres_diarios')
        .update({
          estado: 'aprobado',
          fecha_aprobacion: new Date().toISOString(),
        })
        .eq('id', cuadre.id)
        .select()
        .single();
      
      setCuadre(data);
      toast.success('Cuadre aprobado exitosamente');
    } catch (error) {
      toast.error('Error al aprobar el cuadre');
    } finally {
      setSaving(false);
    }
  };

  const handleDevolver = async () => {
    if (!cuadre || !observacionSuperadmin.trim()) {
      toast.error('Debes agregar una observación');
      return;
    }
    setSaving(true);
    try {
      const { data } = await supabase
        .from('cuadres_diarios')
        .update({
          estado: 'devuelto',
          observacion_superadmin: observacionSuperadmin,
        })
        .eq('id', cuadre.id)
        .select()
        .single();
      
      setCuadre(data);
      setShowObservacionModal(false);
      setObservacionSuperadmin('');
      toast.success('Cuadre devuelto exitosamente');
    } catch (error) {
      toast.error('Error al devolver el cuadre');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cuadre) {
    return <div className="min-h-screen flex items-center justify-center">Cuadre no encontrado</div>;
  }

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

  const goBack = () => {
    if (isSuperadmin) {
      router.push('/superadmin');
    } else {
      router.push('/admin');
    }
  };

  const cuadreMetrics = calcCuadreMetrics({
    context: 'final',
    recaudo: cuadre.recaudo,
    venta_tarjetas: cuadre.venta_tarjetas,
    consignacion_pendiente: cuadre.consignacion_pendiente,
    valor_consignado: cuadre.valor_consignado,
    url_foto_consignacion: cuadre.url_foto_consignacion,
    consigna_hoy: cuadre.consigna_hoy,
    gastos: cuadre.gastos_diarios,
    turneros: cuadre.pagos_turneros,
    total_fisico: cuadre.total_fisico,
  });

  const totalGastos = cuadreMetrics.totalGastos;
  const totalTurneros = cuadreMetrics.totalTurneros;
  const totalGeneralAConsignar = cuadreMetrics.totalGeneralAConsignar;
  const pendienteInicial = cuadreMetrics.pendienteInicial;
  const ventaAreasComunes = Number(cuadre.venta_confiteria || 0) || Number(cuadre.recibos || 0);

  const exportarCuadroDiarioPDF = () => {
    const escapeHtml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const gastosArqueo = [
      'Mantenimiento y Reparaciones',
      'Pagos Tecnico - Auditor Mecanico',
      'Servicio Publicos y Telefono',
      'Turnos',
      GASTO_CATEGORIA_TRANSPORTE_LABEL,
      'Fiestas',
      'Abonos fiestas consignadas',
      'Compra redencion',
      'Peluches',
      'Utiles-Papeleria y Fotocopias',
      'Base Refrigierios y H20',
      'Bioseguridad',
      'Publicidad y avisos varios',
      'Compra de aseo',
      'Viaticos-Pago hotel',
      'Tarjetas malas y devoluciones',
      'Otros',
    ];

    const gastosPorCategoria: Record<string, number> = {};
    const detallesPorCategoria: Record<string, string[]> = {};

    if (cuadre.gastos_diarios) {
      cuadre.gastos_diarios.forEach((g) => {
        const categoria = getGastoCategoriaLabel(g.categoria || 'Otros');
        gastosPorCategoria[categoria] = (gastosPorCategoria[categoria] || 0) + (Number(g.valor) || 0);
        if (g.descripcion) {
          detallesPorCategoria[categoria] = detallesPorCategoria[categoria] || [];
          detallesPorCategoria[categoria].push(g.descripcion);
        }
      });
    }

    const totalTurnerosValue = cuadre.pagos_turneros?.reduce((sum, t) => sum + (Number(t.valor) || 0), 0) || 0;
    gastosPorCategoria['Turnos'] = (gastosPorCategoria['Turnos'] || 0) + totalTurnerosValue;
    if (cuadre.pagos_turneros) {
      cuadre.pagos_turneros.forEach((t) => {
        if (t.nombre_turnero) {
          detallesPorCategoria['Turnos'] = detallesPorCategoria['Turnos'] || [];
          detallesPorCategoria['Turnos'].push(t.nombre_turnero);
        }
      });
    }

    const operacionales = [
      { label: 'Ventas Caja', value: Number(cuadre.recaudo || 0) },
      { label: 'Venta Areas Comunes', value: ventaAreasComunes },
      { label: 'Ventas no registrada', value: 0 },
      { label: 'Fiesta Infantil', value: Number(cuadre.venta_fiesta || 0) },
    ];
    const totalIngresos = Number(cuadre.recaudo || 0);

    const consignaciones = (cuadre.consigna_hoy ?? true) === false ? 0 : Number(cuadre.valor_consignado || 0);

    const creditoAnticipo = gastosPorCategoria['Anticipo a Contratistas y Otros'] || 0;
    const creditoReembolso = gastosPorCategoria['Reembolso de Caja Menor'] || 0;
    const totalCreditos = creditoAnticipo + creditoReembolso;

    const sec2 = [
      { label: 'Efectivo en caja por consignar', value: Number(pendienteInicial || 0), highlight: true },
      { label: 'Venta Datafono', value: Number(cuadre.venta_tarjetas || 0) },
      { label: 'Consignaciones', value: consignaciones },
    ];
    const totalSec2 =
      totalIngresos + Number(pendienteInicial || 0) - Number(cuadre.venta_tarjetas || 0) - consignaciones;

    const totalGastosArqueo = gastosArqueo.reduce((sum, cat) => sum + (gastosPorCategoria[cat] || 0), 0);
    const totalEnCaja = totalSec2 - totalGastosArqueo - totalCreditos;

    const fileName = `ARQUEO_FISCAL_${(cuadre.punto_de_venta?.nombre || 'LOCAL').replace(/\s+/g, '_')}_${cuadre.fecha}.pdf`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .title { font-weight: 700; font-size: 18px; text-align: center; margin: 0 0 8px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 10px; font-size: 12px; }
    .meta strong { color: #374151; }
    .section { margin-top: 10px; }
    .section-header { background: #EBF1DE; border: 1px solid #111827; padding: 6px 8px; font-weight: 700; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #111827; padding: 6px 8px; font-size: 11px; vertical-align: top; }
    th { background: #F3F4F6; text-align: left; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .total-row td { background: #D9E2F3; font-weight: 700; }
    .yellow { background: #FFF2CC; }
    .wrap { white-space: pre-wrap; word-break: break-word; }
    .sign { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .sign-box { border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-size: 11px; }
    .note { margin-top: 10px; font-size: 11px; font-weight: 700; }
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="title">DIVERSIONES DE COLOMBIA</div>
  <div class="meta">
    <div><strong>Local:</strong> ${escapeHtml(cuadre.punto_de_venta?.nombre || '')}</div>
    <div><strong>Ciudad:</strong> ${escapeHtml(cuadre.punto_de_venta?.ciudad || '')}</div>
    <div><strong>Fecha:</strong> ${escapeHtml(formatDate(cuadre.fecha))}</div>
    <div><strong>Estado:</strong> ${escapeHtml(cuadre.estado)}</div>
  </div>

  <div class="section">
    <div class="section-header">1 OPERACIONALES</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%">CONCEPTO</th>
          <th style="width:20%" class="right">VALOR</th>
          <th style="width:28%">DETALLE</th>
        </tr>
      </thead>
      <tbody>
        ${operacionales
          .map(
            (r) => `<tr><td>${escapeHtml(r.label)}</td><td class="right">${escapeHtml(formatCOP(r.value))}</td><td></td></tr>`
          )
          .join('')}
        <tr class="total-row">
          <td class="right bold">TOTAL INGRESOS</td>
          <td class="right bold">${escapeHtml(formatCOP(totalIngresos))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">2 DINERO EN CAJA Y/O CONSIGNACIONES EN BANCOS</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%">CONCEPTO</th>
          <th style="width:20%" class="right">VALOR</th>
          <th style="width:28%">DETALLE</th>
        </tr>
      </thead>
      <tbody>
        ${sec2
          .map((r) => {
            const cls = r.highlight ? 'yellow' : '';
            return `<tr><td>${escapeHtml(r.label)}</td><td class="right ${cls}">${escapeHtml(formatCOP(r.value))}</td><td></td></tr>`;
          })
          .join('')}
        <tr class="total-row">
          <td class="right bold">TOTAL</td>
          <td class="right bold">${escapeHtml(formatCOP(totalSec2))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">3 Créditos Préstamos</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%">CONCEPTO</th>
          <th style="width:20%" class="right">VALOR</th>
          <th style="width:28%">DETALLE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Anticipo a Contratistas y Otros</td>
          <td class="right">${escapeHtml(formatCOP(creditoAnticipo))}</td>
          <td class="wrap">${escapeHtml((detallesPorCategoria['Anticipo a Contratistas y Otros'] || []).join('\n'))}</td>
        </tr>
        <tr>
          <td>Reembolso de Caja Menor</td>
          <td class="right">${escapeHtml(formatCOP(creditoReembolso))}</td>
          <td class="wrap">${escapeHtml((detallesPorCategoria['Reembolso de Caja Menor'] || []).join('\n'))}</td>
        </tr>
        <tr class="total-row">
          <td class="right bold">TOTAL</td>
          <td class="right bold">${escapeHtml(formatCOP(totalCreditos))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">4 GASTOS</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%">CONCEPTO</th>
          <th style="width:20%" class="right">VALOR</th>
          <th style="width:28%">DETALLE</th>
        </tr>
      </thead>
      <tbody>
        ${gastosArqueo
          .map((categoria) => {
            const value = gastosPorCategoria[categoria] || 0;
            const details = (detallesPorCategoria[categoria] || []).filter(Boolean).join(', ');
            return `<tr>
              <td>${escapeHtml(categoria)}</td>
              <td class="right">${escapeHtml(formatCOP(value))}</td>
              <td class="wrap">${escapeHtml(details)}</td>
            </tr>`;
          })
          .join('')}
        <tr class="total-row">
          <td class="right bold">TOTAL GASTOS</td>
          <td class="right bold">${escapeHtml(formatCOP(totalGastosArqueo))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">6 TOTAL EN CAJA</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%">CONCEPTO</th>
          <th style="width:20%" class="right">VALOR</th>
          <th style="width:28%">DETALLE</th>
        </tr>
      </thead>
      <tbody>
        <tr class="yellow">
          <td class="bold right">TOTAL EN CAJA</td>
          <td class="right bold">${escapeHtml(formatCOP(totalEnCaja))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="note">Sobrante(${escapeHtml(formatCOP(Number(cuadre.sobrante) || 0))}) Faltante(${escapeHtml(formatCOP(Number(cuadre.faltante) || 0))})</div>
  </div>

  <div class="sign">
    <div class="sign-box"><div class="bold">${escapeHtml(cuadre.nombre_administradora || '')}</div>Administradora</div>
    <div class="sign-box"><div class="bold">${escapeHtml(cuadre.cedula_administradora || '')}</div>Cédula</div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('No se pudo abrir la ventana para imprimir el PDF');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    const tryPrint = () => {
      try {
        win.print();
      } catch {
        toast.error('No se pudo abrir la impresión del PDF');
      }
    };
    win.onload = tryPrint;
    setTimeout(tryPrint, 400);
  };

  const exportarCuadroDiario = async () => {
    if (!cuadre) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ARQUEO FISCAL');

    const efectivoCajaConsignar = pendienteInicial;
    const consignaciones = (cuadre.consigna_hoy ?? true) === false ? 0 : Number(cuadre.valor_consignado || 0);
    const creditoAnticipoDetalles: string[] = [];
    const creditoReembolsoDetalles: string[] = [];
    let creditoAnticipo = 0;
    let creditoReembolso = 0;

    if (cuadre.gastos_diarios) {
      cuadre.gastos_diarios.forEach((g) => {
        const categoria = getGastoCategoriaLabel(g.categoria || 'Otros');
        if (categoria === 'Anticipo a Contratistas y Otros') {
          creditoAnticipo += Number(g.valor) || 0;
          if (g.descripcion) creditoAnticipoDetalles.push(g.descripcion);
        }
        if (categoria === 'Reembolso de Caja Menor') {
          creditoReembolso += Number(g.valor) || 0;
          if (g.descripcion) creditoReembolsoDetalles.push(g.descripcion);
        }
      });
    }

    // Establecer anchos de columna
    worksheet.columns = [
      { key: 'A', width: 15 },   // CÓDIGO
      { key: 'B', width: 40 },   // CONCEPTO
      { key: 'C', width: 18 },   // VALOR
      { key: 'D', width: 35 },   // DETALLE
    ];

    // FUNCIONES DE AYUDA PARA BORDES Y ESTILOS
    const cellToCoords = (cellRef: string) => {
      const match = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (!match) return { row: 1, col: 1 };
      const colStr = match[1];
      const row = parseInt(match[2], 10);
      let col = 0;
      for (let i = 0; i < colStr.length; i++) {
        col = col * 26 + (colStr.charCodeAt(i) - 64);
      }
      return { row, col };
    };

    const applyBorders = (startCell: string, endCell: string) => {
      const start = cellToCoords(startCell);
      const end = cellToCoords(endCell);
      for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
          const cell = worksheet.getCell(row, col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      }
    };

    // Encabezado principal
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'DIVERSIONES DE COLOMBIA';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' }
    };
    titleCell.font.color = { argb: 'FFFFFFFF' };

    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = 'NIT. 830,136,025-1';
    worksheet.getCell('A2').font = { bold: true, size: 14 };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A2').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };

    // Fecha y datos del local en encabezado
    worksheet.mergeCells('A3:D3');
    worksheet.getCell('A3').value = 'ARQUEO FISCAL DIARIO';
    worksheet.getCell('A3').font = { bold: true, size: 14 };
    worksheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

    // Datos del local
    worksheet.mergeCells('A4:D4');
    worksheet.getCell('A4').value = `LOCAL: ${cuadre.punto_de_venta?.nombre?.toUpperCase() || 'N/A'} - CIUDAD: ${cuadre.punto_de_venta?.ciudad?.toUpperCase() || 'N/A'} - FECHA: ${formatDate(cuadre.fecha)}`;
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    worksheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A4').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };

    worksheet.addRow([]);

    // Encabezados con el estilo de la imagen (24,5,26)
    worksheet.getCell('C6').value = 'VALOR';
    worksheet.getCell('C6').font = { bold: true, size: 12 };
    worksheet.getCell('C6').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('C6').border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getCell('C6').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };

    worksheet.getCell('D6').value = 'DETALLE';
    worksheet.getCell('D6').font = { bold: true, size: 12 };
    worksheet.getCell('D6').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('D6').border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    worksheet.getCell('D6').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };

    worksheet.addRow([]);

    // 1. OPERACIONALES
    worksheet.getCell('B8').value = '1 OPERACIONALES';
    worksheet.getCell('B8').font = { bold: true, size: 12 };
    worksheet.getCell('B8').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1DE' }
    };
    applyBorders('B8', 'D8');
    
    worksheet.getCell('B9').value = 'Ventas Caja';
    worksheet.getCell('C9').value = cuadre.recaudo;
    worksheet.getCell('C9').numFmt = '#,##0';
    worksheet.getCell('C9').alignment = { horizontal: 'right' };
    applyBorders('B9', 'D9');
    
    worksheet.getCell('B10').value = 'Venta Areas Comunes';
    worksheet.getCell('C10').value = ventaAreasComunes;
    worksheet.getCell('C10').numFmt = '#,##0';
    worksheet.getCell('C10').alignment = { horizontal: 'right' };
    applyBorders('B10', 'D10');
    
    worksheet.getCell('B11').value = 'Ventas no registrada';
    worksheet.getCell('C11').value = 0;
    worksheet.getCell('C11').numFmt = '#,##0';
    worksheet.getCell('C11').alignment = { horizontal: 'right' };
    applyBorders('B11', 'D11');
    
    worksheet.getCell('B12').value = 'Fiesta Infantil';
    worksheet.getCell('C12').value = cuadre.venta_fiesta;
    worksheet.getCell('C12').numFmt = '#,##0';
    worksheet.getCell('C12').alignment = { horizontal: 'right' };
    applyBorders('B12', 'D12');

    // TOTAL INGRESOS
    worksheet.getCell('B14').value = 'TOTAL INGRESOS';
    worksheet.getCell('B14').font = { bold: true };
    worksheet.getCell('B14').alignment = { horizontal: 'right' };
    worksheet.getCell('C14').value = { formula: '=C9' };
    worksheet.getCell('C14').font = { bold: true };
    worksheet.getCell('C14').numFmt = '#,##0';
    worksheet.getCell('C14').alignment = { horizontal: 'right' };
    worksheet.getCell('C14').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };
    applyBorders('B14', 'D14');

    worksheet.addRow([]);

    // 2. DINERO EN CAJA Y/O CONSIGNACIONES EN BANCOS
    worksheet.getCell('B16').value = '2 DINERO EN CAJA Y/O CONSIGNACIONES EN BANCOS';
    worksheet.getCell('B16').font = { bold: true, size: 12 };
    worksheet.getCell('B16').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1DE' }
    };
    applyBorders('B16', 'D16');

    worksheet.getCell('B17').value = 'Efectivo en caja por consignar';
    worksheet.getCell('C17').value = efectivoCajaConsignar;
    worksheet.getCell('C17').numFmt = '#,##0';
    worksheet.getCell('C17').alignment = { horizontal: 'right' };
    worksheet.getCell('C17').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    applyBorders('B17', 'D17');

    worksheet.getCell('B18').value = 'Venta Datafono';
    worksheet.getCell('C18').value = cuadre.venta_tarjetas;
    worksheet.getCell('C18').numFmt = '#,##0';
    worksheet.getCell('C18').alignment = { horizontal: 'right' };
    applyBorders('B18', 'D18');

    worksheet.getCell('B19').value = 'Consignaciones';
    worksheet.getCell('C19').value = consignaciones;
    worksheet.getCell('C19').numFmt = '#,##0';
    worksheet.getCell('C19').alignment = { horizontal: 'right' };
    applyBorders('B19', 'D19');

    // TOTAL sección 2
    worksheet.getCell('B21').value = 'TOTAL';
    worksheet.getCell('B21').font = { bold: true };
    worksheet.getCell('B21').alignment = { horizontal: 'right' };
    worksheet.getCell('C21').value = { formula: '=C14+C17-C18-C19' };
    worksheet.getCell('C21').font = { bold: true };
    worksheet.getCell('C21').numFmt = '#,##0';
    worksheet.getCell('C21').alignment = { horizontal: 'right' };
    worksheet.getCell('C21').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' }
    };
    applyBorders('B21', 'D21');

    worksheet.addRow([]);

    // 3. Créditos Préstamos
    worksheet.getCell('B23').value = '3 Créditos Préstamos';
    worksheet.getCell('B23').font = { bold: true, size: 12 };
    worksheet.getCell('B23').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1DE' }
    };
    applyBorders('B23', 'D23');

    worksheet.getCell('B24').value = 'Anticipo a Contratistas y Otros';
    worksheet.getCell('C24').value = creditoAnticipo;
    worksheet.getCell('C24').numFmt = '#,##0';
    worksheet.getCell('C24').alignment = { horizontal: 'right' };
    worksheet.getCell('D24').value = creditoAnticipoDetalles.join(', ');
    worksheet.getCell('D24').alignment = { wrapText: true, vertical: 'top' };
    applyBorders('B24', 'D24');

    worksheet.getCell('B25').value = 'Reembolso de Caja Menor';
    worksheet.getCell('C25').value = creditoReembolso;
    worksheet.getCell('C25').numFmt = '#,##0';
    worksheet.getCell('C25').alignment = { horizontal: 'right' };
    worksheet.getCell('D25').value = creditoReembolsoDetalles.join(', ');
    worksheet.getCell('D25').alignment = { wrapText: true, vertical: 'top' };
    applyBorders('B25', 'D25');

    // TOTAL sección 3
    worksheet.getCell('B27').value = 'TOTAL';
    worksheet.getCell('B27').font = { bold: true };
    worksheet.getCell('B27').alignment = { horizontal: 'right' };
    worksheet.getCell('C27').value = { formula: '=C24+C25' };
    worksheet.getCell('C27').font = { bold: true };
    worksheet.getCell('C27').numFmt = '#,##0';
    worksheet.getCell('C27').alignment = { horizontal: 'right' };
    worksheet.getCell('C27').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    applyBorders('B27', 'D27');

    worksheet.addRow([]);

    // 4. GASTOS
    worksheet.getCell('B29').value = '4 GASTOS';
    worksheet.getCell('B29').font = { bold: true, size: 12 };
    worksheet.getCell('B29').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1DE' }
    };
    applyBorders('B29', 'D29');

    // Lista de categorías de gastos
    const gastosArqueo = [
      'Mantenimiento y Reparaciones',
      'Pagos Tecnico - Auditor Mecanico',
      'Servicio Publicos y Telefono',
      'Turnos',
      GASTO_CATEGORIA_TRANSPORTE_LABEL,
      'Fiestas',
      'Abonos fiestas consignadas',
      'Compra redencion',
      'Peluches',
      'Utiles-Papeleria y Fotocopias',
      'Base Refrigierios y H20',
      'Bioseguridad',
      'Bioseguridad',
      'Publicidad y avisos varios',
      'Compra de aseo',
      'Viaticos-Pago hotel',
      'Tarjetas malas y devoluciones',
      'Otros'
    ];

    let filaActualGastos = 30;
    const gastosPorCategoria: Record<string, number> = {};
    const detallesPorCategoria: Record<string, string[]> = {};

    if (cuadre.gastos_diarios) {
      cuadre.gastos_diarios.forEach((g) => {
        const cat = getGastoCategoriaLabel(g.categoria || 'Otros');
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + (Number(g.valor) || 0);
        if (g.descripcion) {
          detallesPorCategoria[cat] = detallesPorCategoria[cat] || [];
          detallesPorCategoria[cat].push(g.descripcion);
        }
      });
    }

    gastosPorCategoria['Turnos'] = (gastosPorCategoria['Turnos'] || 0) + totalTurneros;
    if (cuadre.pagos_turneros) {
      cuadre.pagos_turneros.forEach((t) => {
        if (t.nombre_turnero) {
          detallesPorCategoria['Turnos'] = detallesPorCategoria['Turnos'] || [];
          detallesPorCategoria['Turnos'].push(t.nombre_turnero);
        }
      });
    }

    gastosArqueo.forEach((categoria) => {
      worksheet.getCell(`B${filaActualGastos}`).value = categoria;
      worksheet.getCell(`C${filaActualGastos}`).value = gastosPorCategoria[categoria] || 0;
      worksheet.getCell(`C${filaActualGastos}`).numFmt = '#,##0';
      worksheet.getCell(`C${filaActualGastos}`).alignment = { horizontal: 'right' };
      const detalles = detallesPorCategoria[categoria]?.filter(Boolean) || [];
      worksheet.getCell(`D${filaActualGastos}`).value = detalles.join(', ');
      worksheet.getCell(`D${filaActualGastos}`).alignment = { wrapText: true, vertical: 'top' };
      applyBorders(`B${filaActualGastos}`, `D${filaActualGastos}`);
      filaActualGastos++;
    });

    // TOTAL GASTOS
    worksheet.getCell(`B${filaActualGastos}`).value = 'TOTAL GASTOS';
    worksheet.getCell(`B${filaActualGastos}`).font = { bold: true };
    worksheet.getCell(`B${filaActualGastos}`).alignment = { horizontal: 'right' };
    
    const filaInicioGastos = 30;
    const filaFinGastos = filaActualGastos - 1;
    worksheet.getCell(`C${filaActualGastos}`).value = { formula: `=SUM(C${filaInicioGastos}:C${filaFinGastos})` };
    worksheet.getCell(`C${filaActualGastos}`).font = { bold: true };
    worksheet.getCell(`C${filaActualGastos}`).numFmt = '#,##0';
    worksheet.getCell(`C${filaActualGastos}`).alignment = { horizontal: 'right' };
    worksheet.getCell(`C${filaActualGastos}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    worksheet.getCell(`D${filaActualGastos}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    applyBorders(`B${filaActualGastos}`, `D${filaActualGastos}`);

    worksheet.addRow([]);

    // 6. TOTAL EN CAJA
    const filaTotalCaja = filaActualGastos + 2;
    worksheet.getCell(`B${filaTotalCaja}`).value = '6 TOTAL EN CAJA';
    worksheet.getCell(`B${filaTotalCaja}`).font = { bold: true, size: 12 };
    worksheet.getCell(`B${filaTotalCaja}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1DE' }
    };
    applyBorders(`B${filaTotalCaja}`, `D${filaTotalCaja}`);
    
    worksheet.getCell(`C${filaTotalCaja}`).value = { formula: `=C21-C${filaActualGastos}-C27` };
    worksheet.getCell(`C${filaTotalCaja}`).font = { bold: true, size: 14 };
    worksheet.getCell(`C${filaTotalCaja}`).numFmt = '#,##0';
    worksheet.getCell(`C${filaTotalCaja}`).alignment = { horizontal: 'center' };
    worksheet.getCell(`C${filaTotalCaja}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    worksheet.getCell(`D${filaTotalCaja}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };
    applyBorders(`B${filaTotalCaja}`, `D${filaTotalCaja}`);

    // Sobrante/Faltante
    worksheet.getCell(`B${filaTotalCaja + 1}`).value = `Sobrante(${formatCOP(Number(cuadre.sobrante) || 0)}) Faltante(${formatCOP(Number(cuadre.faltante) || 0)})`;
    worksheet.getCell(`B${filaTotalCaja + 1}`).font = { bold: true, size: 11 };

    worksheet.addRow([]);
    worksheet.addRow([]);

    // Datos Administradora
    const filaFirmas = filaTotalCaja + 5;
    worksheet.mergeCells(`B${filaFirmas}:C${filaFirmas}`);
    worksheet.getCell(`B${filaFirmas}`).value = 'Administradora';
    worksheet.getCell(`B${filaFirmas}`).font = { bold: true };
    worksheet.getCell(`B${filaFirmas}`).alignment = { horizontal: 'center' };

    worksheet.mergeCells(`D${filaFirmas}:E${filaFirmas}`);
    worksheet.getCell(`D${filaFirmas}`).value = 'Cédula';
    worksheet.getCell(`D${filaFirmas}`).font = { bold: true };
    worksheet.getCell(`D${filaFirmas}`).alignment = { horizontal: 'center' };

    const filaDatos = filaFirmas + 2;
    worksheet.mergeCells(`B${filaDatos}:C${filaDatos}`);
    worksheet.getCell(`B${filaDatos}`).value = cuadre.nombre_administradora || '';
    worksheet.getCell(`B${filaDatos}`).alignment = { horizontal: 'center' };

    worksheet.mergeCells(`D${filaDatos}:E${filaDatos}`);
    worksheet.getCell(`D${filaDatos}`).value = cuadre.cedula_administradora || '';
    worksheet.getCell(`D${filaDatos}`).alignment = { horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ARQUEO_FISCAL_${cuadre.punto_de_venta?.nombre?.replace(/\s+/g, '_') || 'LOCAL'}_${cuadre.fecha}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('ARQUEO FISCAL exportado exitosamente');
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <button onClick={goBack} className="flex items-center gap-2 text-white mb-6 hover:text-white/80 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-6 mb-6 border border-white/30">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{cuadre.punto_de_venta?.nombre}</h1>
              <p className="text-gray-600">{cuadre.punto_de_venta?.ciudad}</p>
              <p className="text-gray-600">{formatDate(cuadre.fecha)}</p>
            </div>
            <div className="flex gap-3 items-center">
              {getEstadoBadge(cuadre.estado)}
              <button
                onClick={exportarCuadroDiario}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 shadow-sm hover:shadow transition-all"
              >
                <Download className="w-4 h-4" />
                ARQUEO FISCAL Excel
              </button>
              <button
                onClick={exportarCuadroDiarioPDF}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-sm hover:shadow transition-all"
              >
                <Download className="w-4 h-4" />
                ARQUEO FISCAL PDF
              </button>
            </div>
          </div>

          {isSuperadmin && (cuadre.estado === 'enviado' || cuadre.estado === 'pendiente') && (
            <div className="flex gap-3 mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              {cuadre.estado === 'enviado' && (
                <button
                  onClick={handleAprobar}
                  disabled={saving}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm hover:shadow transition-all"
                >
                  Aprobar
                </button>
              )}
              {cuadre.estado === 'pendiente' && (
                <div className="text-yellow-800">
                  <p className="font-medium">⏳ Cuadre Pendiente</p>
                  <p className="text-sm">El PDV aún no ha cargado la foto de consignación.</p>
                </div>
              )}
              <button
                onClick={() => {
                  setAccionModal('devuelto');
                  setShowObservacionModal(true);
                }}
                disabled={saving}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 shadow-sm hover:shadow transition-all"
              >
                Devolver
              </button>
            </div>
          )}

          {cuadre.observacion_superadmin && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
              <h3 className="font-bold text-red-800 mb-1">Observación del Superadmin:</h3>
              <p className="text-red-700">{cuadre.observacion_superadmin}</p>
            </div>
          )}

          {cuadre.observaciones && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-1">Observaciones:</h3>
              <p className="text-gray-700">{cuadre.observaciones}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">Total Físico</p>
              <p className="text-2xl font-bold text-blue-700">{formatCOP(cuadre.total_fisico)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">Valor General a Consignar</p>
              <p className="text-2xl font-bold text-gray-700">{formatCOP(totalGeneralAConsignar)}</p>
            </div>
            <div className={`p-4 rounded-lg border ${(Number(cuadre.sobrante) || 0) > 0 ? 'bg-green-50 border-green-200' : (Number(cuadre.faltante) || 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-sm ${(Number(cuadre.sobrante) || 0) > 0 ? 'text-green-700' : (Number(cuadre.faltante) || 0) > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {(Number(cuadre.sobrante) || 0) > 0 ? 'Sobrante' : (Number(cuadre.faltante) || 0) > 0 ? 'Faltante' : 'Diferencia'}
              </p>
              <p className={`text-2xl font-bold ${(Number(cuadre.sobrante) || 0) > 0 ? 'text-green-700' : (Number(cuadre.faltante) || 0) > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {(Number(cuadre.sobrante) || 0) > 0 ? formatCOP(Number(cuadre.sobrante)) : (Number(cuadre.faltante) || 0) > 0 ? formatCOP(Number(cuadre.faltante)) : '$0'}
              </p>
            </div>
          </div>

          {cuadre.denominaciones_cuadre && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Denominaciones</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-light">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Denominación</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cantidad</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {cuadre.denominaciones_cuadre.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{formatCOP(d.denominacion)}</td>
                        <td className="px-4 py-3 text-sm">{d.cantidad}</td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCOP(d.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Ingresos y Deducciones</h2>
              <div className="space-y-2">
                <div className="flex justify-between font-semibold text-lg">
                  <span className="text-blue-600">Venta Sistema</span>
                  <span className="text-blue-600">{formatCOP(cuadre.recaudo)}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-yellow-600">Venta Datafono</span>
                    <span className="font-medium">{formatCOP(cuadre.venta_tarjetas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Venta Fiesta</span>
                    <span className="font-medium">{formatCOP(cuadre.venta_fiesta)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Venta Areas Comunes</span>
                    <span className="font-medium">{formatCOP(ventaAreasComunes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cajero Automático</span>
                    <span className="font-medium">{formatCOP(cuadre.venta_cajero_auto)}</span>
                  </div>
                </div>
                {totalGastos > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Gastos</span>
                      <span className="font-medium">{formatCOP(totalGastos)}</span>
                    </div>
                  </div>
                )}
                {totalTurneros > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Turneros</span>
                      <span className="font-medium">{formatCOP(totalTurneros)}</span>
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <div className="flex justify-between font-bold text-xl">
                    <span className="text-orange-800">Total General a Consignar</span>
                    <span className="text-orange-800">{formatCOP(totalGeneralAConsignar)}</span>
                  </div>
                </div>
                {pendienteInicial > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between font-semibold text-lg">
                      <span className="text-orange-700">Pendiente al Iniciar (Días Anteriores)</span>
                      <span className="text-orange-700">{formatCOP(pendienteInicial)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Tarjetas</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">TAR Inicial</span>
                  <span className="font-medium">{cuadre.tar_inicial}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">TAR Consumo</span>
                  <span className="font-medium">{cuadre.tar_consumo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">TAR Fiestas</span>
                  <span className="font-medium">{cuadre.tar_fiestas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">TAR Malas</span>
                  <span className="font-medium">{cuadre.tar_malas}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-blue-700">TAR Final</span>
                  <span className="text-blue-700">{cuadre.tar_final}</span>
                </div>
              </div>
            </div>
          </div>

          {(totalGastos > 0 || totalTurneros > 0) ? (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Gastos y Turneros</h2>
              
              {totalGastos > 0 && cuadre.gastos_diarios && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-3 text-gray-800">Gastos</h3>
                  <div className="space-y-3">
                    {cuadre.gastos_diarios.map((g) => (
                      <div key={g.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{g.descripcion}</p>
                            <p className="text-sm text-gray-600">{getGastoCategoriaLabel(g.categoria)}</p>
                          </div>
                          <p className="font-bold text-gray-900">{formatCOP(g.valor)}</p>
                        </div>
                        {g.url_foto_factura && (
                          <img
                            src={g.url_foto_factura}
                            alt="Factura"
                            className="w-full max-w-xs mt-3 rounded border border-gray-200"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {totalTurneros > 0 && cuadre.pagos_turneros && (
                <div>
                  <h3 className="text-lg font-medium mb-3 text-gray-800">Turneros</h3>
                  <div className="space-y-3">
                    {cuadre.pagos_turneros.map((t) => (
                      <div key={t.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{t.nombre_turnero}</p>
                            {t.horario && <p className="text-sm text-gray-600">{t.horario}</p>}
                          </div>
                          <p className="font-bold text-gray-900">{formatCOP(t.valor)}</p>
                        </div>
                        {t.url_foto_soporte && (
                          <img
                    src={t.url_foto_soporte}
                    alt="Soporte"
                    className="w-full max-w-xs mt-3 rounded border border-gray-200"
                  />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {cuadre.url_foto_consignacion || cuadre.nombre_administradora || cuadre.cedula_administradora ? (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Consignación y Administradora</h2>
              
              {cuadre.url_foto_consignacion && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-3 text-gray-800">Foto Consignación</h3>
                  <img
                    src={cuadre.url_foto_consignacion}
                    alt="Consignación"
                    className="w-full max-w-lg rounded border border-gray-200 shadow-sm"
                  />
                </div>
              )}

              {(cuadre.nombre_administradora || cuadre.cedula_administradora) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-medium mb-3 text-gray-800">Administradora</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Nombre</p>
                      <p className="text-base font-semibold text-gray-900">{cuadre.nombre_administradora || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Cédula</p>
                      <p className="text-base font-semibold text-gray-900">{cuadre.cedula_administradora || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {cuadre.url_foto_consignacion && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between font-semibold text-lg">
                    <span className="text-gray-700">Valor Consignado</span>
                    <span className="text-gray-900">{formatCOP(Number(cuadre.valor_consignado || 0))}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg mt-2">
                    <span className="text-orange-700">Pendiente Próximo Cuadre</span>
                    <span className="text-orange-800">{formatCOP(Number(cuadre.consignacion_pendiente || 0))}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showObservacionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Devolver Cuadre</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observación</label>
              <textarea
                value={observacionSuperadmin}
                onChange={(e) => setObservacionSuperadmin(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                rows={4}
                placeholder="Explica por qué se devuelve el cuadre..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowObservacionModal(false);
                  setObservacionSuperadmin('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleDevolver}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Devolver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
