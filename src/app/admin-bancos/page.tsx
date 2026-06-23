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
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/utils';
import {
  buildFinancialSummary,
  CuentaFinanciera,
  CategoriaFinanciera,
  getAccountBalance,
  getTopExpensesByCategory,
  getTopIncomeByPdv,
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
  movimiento_financiero_sync_id?: string | null;
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
        supabase.from('cuentas_financieras').select('*').order('nombre'),
        supabase.from('movimientos_financieros').select('*').eq('activo', true).order('fecha_movimiento', { ascending: false }),
        supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre'),
        supabase.from('puntos_de_venta').select('*').order('nombre'),
        supabase
          .from('cuadres_diarios')
          .select('id,fecha,punto_de_venta_id,estado,valor_consignado,movimiento_financiero_sync_id')
          .neq('estado', 'borrador')
          .order('fecha', { ascending: false }),
      ]);

      setCuentas((accountsRes.data || []) as CuentaFinanciera[]);
      setMovimientos((movementsRes.data || []) as MovimientoFinanciero[]);
      setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
      setPuntosVenta((pdvRes.data || []) as PuntoDeVenta[]);
      setCuadres((cuadresRes.data || []) as CuadreSyncResumen[]);
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
  const topIncomes = useMemo(
    () => getTopIncomeByPdv(movimientos, puntosVenta),
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
    () =>
      cuadres
        .filter(
          (cuadre) =>
            cuadre.estado === 'aprobado' &&
            Number(cuadre.valor_consignado || 0) > 0 &&
            !cuadre.movimiento_financiero_sync_id
        )
        .map((cuadre) => ({
          ...cuadre,
          pdvNombre: puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id)?.nombre || 'Sin PDV',
        })),
    [cuadres, puntosVenta]
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white drop-shadow">Dashboard Financiero</h1>
        <p className="text-white/80 mt-1 drop-shadow">Consolidado bancario, flujo neto y analitica por cuenta, categoria y PDV.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard label="Saldo Total Consolidado" value={formatCOP(summary.saldoTotal)} />
        <MetricCard label="Ingresos del Mes" value={formatCOP(summary.ingresosMes)} />
        <MetricCard label="Egresos del Mes" value={formatCOP(summary.egresosMes)} />
        <MetricCard label="Flujo Neto" value={formatCOP(summary.flujoNeto)} />
        <MetricCard label="Cuentas Activas" value={String(cuentas.filter((item) => item.estado === 'activa').length)} />
        <MetricCard label="Pendiente por Sincronizar" value={formatCOP(totalPendienteSincronizar)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="min-w-0 overflow-hidden bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Saldo por Cuenta</h3>
          <div className="space-y-3">
            {cuentas.map((cuenta) => (
              <div key={cuenta.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-900">{cuenta.nombre}</p>
                  <p className="text-sm text-gray-500">
                    {cuenta.banco} {cuenta.numero_cuenta ? `- ${cuenta.numero_cuenta}` : ''}
                  </p>
                  <p className="text-sm text-gray-500">Titular: {cuenta.titular || 'No definido'}</p>
                </div>
                <p className="font-bold text-gray-900">{formatCOP(getAccountBalance(cuenta, movimientos))}</p>
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
                <Tooltip formatter={(value: number) => formatCOP(Number(value || 0))} />
                <Legend />
                <Line type="monotone" dataKey="ingresos" stroke="#1d4ed8" strokeWidth={3} name="Ingresos" />
                <Line type="monotone" dataKey="egresos" stroke="#dc2626" strokeWidth={3} name="Egresos" />
                <Line type="monotone" dataKey="neto" stroke="#059669" strokeWidth={3} name="Neto" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Pendiente por Sincronizar</h3>
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
              <p className="text-sm text-gray-500">No hay cuadres aprobados pendientes de sincronizar.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="min-w-0 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Gastos por Categoria</h3>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topExpenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCOP(Number(value || 0))} />
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Ingresos por PDV</h3>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topIncomes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCOP(Number(value || 0))} />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {topIncomes.map((item) => (
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
    <div className="bg-white/95 backdrop-blur-sm p-5 rounded-xl shadow-2xl border border-white/30">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
