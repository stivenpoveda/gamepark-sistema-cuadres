'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatCOP, getCuadreConsignacionesRegistrables } from '@/lib/utils';
import { assertNoDbError } from '@/lib/batchDb';
import {
  buildFinancialSummary,
  CuentaFinanciera,
  CategoriaFinanciera,
  getAccountBalance,
  getEffectiveFinancialMovements,
  getFinancialAccountTitular,
  getTopDatafonoByPdv,
  getTopExpensesByCategory,
  groupMovementsByMonth,
  MovimientoFinanciero,
} from '@/lib/admin-bancos';
import type { PuntoDeVenta } from '@/types';

type CuadreSyncResumen = {
  id: string;
  fecha: string;
  punto_de_venta_id: string;
  estado: string;
  valor_consignado: number;
  firma_cajero_url?: string | null;
  url_foto_consignacion?: string | null;
  movimiento_financiero_sync_id?: string | null;
};

const formatChartTooltipValue: NonNullable<
  TooltipProps<TooltipValueType, string | number>['formatter']
> = (value) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  return formatCOP(Number(normalized || 0));
};

export default function AdminBancosDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [cuadres, setCuadres] = useState<CuadreSyncResumen[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [accountsRes, movementsRes, categoriesRes, pdvRes, cuadresRes] = await Promise.all([
        supabase.from('cuentas_financieras').select('*').order('nombre').limit(999999),
        supabase.from('movimientos_financieros').select('*').eq('activo', true).order('fecha_movimiento', { ascending: false }).limit(999999),
        supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre').limit(999999),
        supabase.from('puntos_de_venta').select('*').order('nombre').limit(999999),
        supabase
          .from('cuadres_diarios')
          .select('id,fecha,punto_de_venta_id,estado,valor_consignado,firma_cajero_url,url_foto_consignacion,movimiento_financiero_sync_id')
          .neq('estado', 'borrador')
          .order('fecha', { ascending: false })
          .limit(999999),
      ]);

      setCuentas(assertNoDbError<CuentaFinanciera>(accountsRes, 'Admin Bancos - cuentas_financieras'));
      setMovimientos(
        getEffectiveFinancialMovements(assertNoDbError<MovimientoFinanciero>(movementsRes, 'Admin Bancos - movimientos_financieros'))
      );
      setCategorias(assertNoDbError<CategoriaFinanciera>(categoriesRes, 'Admin Bancos - categorias_financieras'));
      setPuntosVenta(assertNoDbError<PuntoDeVenta>(pdvRes, 'Admin Bancos - puntos_de_venta'));
      setCuadres(assertNoDbError<CuadreSyncResumen>(cuadresRes, 'Admin Bancos - cuadres_diarios'));
      setLoading(false);
    };

    fetchData();
  }, []);

  const summary = useMemo(() => buildFinancialSummary(cuentas, movimientos), [cuentas, movimientos]);
  const monthlyData = useMemo(() => groupMovementsByMonth(movimientos), [movimientos]);
  const topExpenses = useMemo(
    () => getTopExpensesByCategory(movimientos, categorias),
    [movimientos, categorias]
  );
  const topDatafono = useMemo(
    () => getTopDatafonoByPdv(movimientos, puntosVenta),
    [movimientos, puntosVenta]
  );
  const today = new Date().toISOString().split('T')[0];
  const ingresosHoyPorPdv = useMemo(() => {
    const totals = new Map<string, number>();

    cuadres
      .filter((cuadre) => cuadre.fecha === today && Number(cuadre.valor_consignado || 0) > 0)
      .forEach((cuadre) => {
        const name = puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id)?.nombre || 'Sin PDV';
        totals.set(name, (totals.get(name) || 0) + Number(cuadre.valor_consignado || 0));
      });

    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [cuadres, puntosVenta, today]);
  const pendientesSincronizar = useMemo(
    () => {
      const movementKeys = new Set(
        movimientos
          .filter((movement) => movement.activo !== false && movement.tipo_movimiento === 'cuadre_aprobado')
          .map((movement) => {
            const consignacionId = String(
              (movement.metadata as Record<string, unknown> | null)?.consignacion_id || ''
            ).trim();
            return consignacionId ? `${movement.cuadre_id || ''}::${consignacionId}` : '';
          })
          .filter(Boolean)
      );

      const legacyMovementCuadres = new Set(
        movimientos
          .filter((movement) => movement.activo !== false && movement.tipo_movimiento === 'cuadre_aprobado')
          .filter((movement) => {
            const consignacionId = String(
              (movement.metadata as Record<string, unknown> | null)?.consignacion_id || ''
            ).trim();
            return !consignacionId && movement.cuadre_id;
          })
          .map((movement) => String(movement.cuadre_id))
      );

      return cuadres
        .filter((cuadre) => cuadre.estado === 'aprobado')
        .flatMap((cuadre) => {
          const pdvNombre =
            puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id)?.nombre || 'Sin PDV';

          return getCuadreConsignacionesRegistrables({
            firma_cajero_url: cuadre.firma_cajero_url,
            url_foto_consignacion: cuadre.url_foto_consignacion,
            valor_consignado: cuadre.valor_consignado,
          })
            .filter((consignacion) => {
              if (consignacion.isInformative) {
                return false;
              }
              const key = `${cuadre.id}::${consignacion.id}`;
              if (movementKeys.has(key)) {
                return false;
              }
              if (consignacion.isLegacy && legacyMovementCuadres.has(cuadre.id)) {
                return false;
              }
              return true;
            })
            .map((consignacion) => ({
              id: `${cuadre.id}-${consignacion.id}`,
              fecha: cuadre.fecha,
              valor_consignado: consignacion.valor,
              pdvNombre,
            }));
        });
    },
    [cuadres, movimientos, puntosVenta]
  );
  const totalPendienteSincronizar = pendientesSincronizar.reduce(
    (sum, cuadre) => sum + Number(cuadre.valor_consignado || 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 xl:space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white drop-shadow">Dashboard Financiero</h1>
        <p className="text-white/80 mt-1 drop-shadow">Consolidado bancario, flujo neto y analitica por cuenta, categoria y PDV.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 xl:gap-5">
        <MetricCard label="Saldo Total Consolidado" value={formatCOP(summary.saldoTotal)} />
        <MetricCard label="Ingresos del Mes" value={formatCOP(summary.ingresosMes)} />
        <MetricCard label="Egresos del Mes" value={formatCOP(summary.egresosMes)} />
        <MetricCard label="Ingresos por Datafono" value={formatCOP(summary.ingresosDatafonoMes)} />
        <MetricCard label="Cuentas Activas" value={String(cuentas.filter((item) => item.estado === 'activa').length)} />
        <MetricCard label="Pendiente por Registrar" value={formatCOP(totalPendienteSincronizar)} />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)] gap-6 xl:gap-8">
        <div className="min-w-0 overflow-hidden bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Saldo por Cuenta</h3>
          <div className="space-y-3">
            {cuentas.map((cuenta) => (
              <div key={cuenta.id} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{cuenta.nombre}</p>
                  <p className="text-sm text-gray-500">
                    {cuenta.banco} {cuenta.numero_cuenta ? `- ${cuenta.numero_cuenta}` : ''}
                  </p>
                  <p className="text-sm text-gray-500">Titular: {getFinancialAccountTitular(cuenta)}</p>
                </div>
                <p className="shrink-0 text-right font-bold text-gray-900">{formatCOP(getAccountBalance(cuenta, movimientos))}</p>
              </div>
            ))}
            {cuentas.length === 0 && <p className="text-sm text-gray-500">Aun no hay cuentas financieras registradas.</p>}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Flujo Mensual</h3>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={formatChartTooltipValue} />
                <Legend />
                <Line type="monotone" dataKey="ingresos" stroke="#1d4ed8" strokeWidth={3} name="Ingresos" />
                <Line type="monotone" dataKey="egresos" stroke="#dc2626" strokeWidth={3} name="Egresos" />
                <Line type="monotone" dataKey="neto" stroke="#059669" strokeWidth={3} name="Neto" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 xl:gap-8">
        <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Lo de Hoy por PDV</h3>
          <div className="space-y-3">
            {ingresosHoyPorPdv.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-500">Registrado hoy</p>
                </div>
                <p className="font-bold text-gray-900">{formatCOP(item.value)}</p>
              </div>
            ))}
            {ingresosHoyPorPdv.length === 0 && (
              <p className="text-sm text-gray-500">Hoy todavia no hay ingresos reportados por PDV.</p>
            )}
          </div>
        </div>

        <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Pendiente por Registrar en Cuenta</h3>
          <div className="space-y-3">
            {pendientesSincronizar.slice(0, 8).map((cuadre) => (
              <div key={cuadre.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-900">{cuadre.pdvNombre}</p>
                  <p className="text-sm text-gray-500">{cuadre.fecha}</p>
                </div>
                <p className="font-bold text-gray-900">{formatCOP(Number(cuadre.valor_consignado || 0))}</p>
              </div>
            ))}
            {pendientesSincronizar.length === 0 && (
              <p className="text-sm text-gray-500">No hay cuadres aprobados pendientes de registrar en cuenta.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 xl:gap-8">
        <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Gastos por Categoria</h3>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={formatChartTooltipValue} />
                <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {topExpenses.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                <span className="text-gray-600">{item.name}</span>
                <span className="font-semibold text-gray-900">{formatCOP(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ingresos Datafono por PDV</h3>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDatafono}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={formatChartTooltipValue} />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {topDatafono.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                <span className="text-gray-600">{item.name}</span>
                <span className="font-semibold text-gray-900">{formatCOP(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl border border-white/30 p-5 shadow-2xl">
      <p className="text-sm leading-5 text-gray-600">{label}</p>
      <p className="mt-2 break-words text-[1.75rem] font-bold leading-tight text-gray-900 xl:text-3xl">{value}</p>
    </div>
  );
}
