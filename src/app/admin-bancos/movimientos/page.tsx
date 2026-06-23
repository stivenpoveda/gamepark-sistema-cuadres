'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import UploadFoto from '@/components/UploadFoto';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate } from '@/lib/utils';
import {
  authorizedJsonFetch,
  CategoriaFinanciera,
  CuentaFinanciera,
  formatMovementTypeLabel,
  MovimientoFinanciero,
} from '@/lib/admin-bancos';
import type { PuntoDeVenta } from '@/types';

export default function MovimientosAdminBancosPage() {
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [form, setForm] = useState({
    tipoMovimiento: 'ingreso',
    cuentaId: '',
    categoriaId: '',
    descripcion: '',
    fechaMovimiento: new Date().toISOString().split('T')[0],
    valor: 0,
    pdvId: '',
    centroCosto: '',
    soporteUrl: '',
  });
  const [filters, setFilters] = useState({
    tipoMovimiento: '',
    cuentaId: '',
    categoriaId: '',
  });

  const fetchData = async () => {
    const [accountsRes, categoriesRes, pdvRes, movementsRes] = await Promise.all([
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre'),
      supabase.from('puntos_de_venta').select('*').order('nombre'),
      supabase.from('movimientos_financieros').select('*').eq('activo', true).order('created_at', { ascending: false }),
    ]);

    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];
    setCuentas(nextAccounts);
    setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
    setPuntosVenta((pdvRes.data || []) as PuntoDeVenta[]);
    setMovimientos((movementsRes.data || []) as MovimientoFinanciero[]);
    setForm((current) => ({
      ...current,
      cuentaId: current.cuentaId || nextAccounts[0]?.id || '',
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredCategories = useMemo(
    () =>
      categorias.filter((category) =>
        category.tipo === 'ambos' || category.tipo === form.tipoMovimiento
      ),
    [categorias, form.tipoMovimiento]
  );

  const filteredMovements = movimientos.filter((movement) => {
    if (filters.tipoMovimiento && movement.tipo_movimiento !== filters.tipoMovimiento) return false;
    if (filters.cuentaId && movement.cuenta_id !== filters.cuentaId) return false;
    if (filters.categoriaId && movement.categoria_id !== filters.categoriaId) return false;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authorizedJsonFetch('/api/admin-bancos/movimientos', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      toast.success('Movimiento registrado');
      setForm({
        tipoMovimiento: 'ingreso',
        cuentaId: cuentas[0]?.id || '',
        categoriaId: '',
        descripcion: '',
        fechaMovimiento: new Date().toISOString().split('T')[0],
        valor: 0,
        pdvId: '',
        centroCosto: '',
        soporteUrl: '',
      });
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo crear el movimiento');
    }
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
      <div>
        <h1 className="text-3xl font-bold text-white drop-shadow">Movimientos</h1>
        <p className="text-white/80 mt-1 drop-shadow">Registra ingresos y egresos con categoria, cuenta, centro de costo, PDV y soporte adjunto.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Movimiento</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Tipo de Movimiento">
              <select value={form.tipoMovimiento} onChange={(e) => setForm({ ...form, tipoMovimiento: e.target.value, categoriaId: '' })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </Field>
            <Field label={form.tipoMovimiento === 'ingreso' ? 'Cuenta Destino' : 'Cuenta Origen'}>
              <select value={form.cuentaId} onChange={(e) => setForm({ ...form, cuentaId: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="">Selecciona</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Categoria">
              <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="">Sin categoria</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" value={form.fechaMovimiento} onChange={(e) => setForm({ ...form, fechaMovimiento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Descripcion">
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Valor">
              <input type="number" value={form.valor || ''} onChange={(e) => setForm({ ...form, valor: Number(e.target.value || 0) })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="PDV Relacionado (Opcional)">
              <select value={form.pdvId} onChange={(e) => setForm({ ...form, pdvId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="">Sin PDV</option>
                {puntosVenta.map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>{pdv.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Centro de Costo / Referencia">
              <input value={form.centroCosto} onChange={(e) => setForm({ ...form, centroCosto: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Soporte Adjunto">
              <UploadFoto
                bucket="soportes"
                currentUrl={form.soporteUrl}
                onUpload={(url) => setForm({ ...form, soporteUrl: url })}
                onRemove={() => setForm({ ...form, soporteUrl: '' })}
              />
            </Field>
            <button type="submit" className="w-full px-4 py-3 bg-primary text-white rounded-lg">
              Registrar Movimiento
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Tipo">
                <select value={filters.tipoMovimiento} onChange={(e) => setFilters({ ...filters, tipoMovimiento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todos</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                  <option value="transferencia_entrada">Transferencia Entrada</option>
                  <option value="transferencia_salida">Transferencia Salida</option>
                  <option value="cuadre_aprobado">Cuadre Aprobado</option>
                </select>
              </Field>
              <Field label="Cuenta">
                <select value={filters.cuentaId} onChange={(e) => setFilters({ ...filters, cuentaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todas</option>
                  {cuentas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Categoria">
                <select value={filters.categoriaId} onChange={(e) => setFilters({ ...filters, categoriaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todas</option>
                  {categorias.map((category) => (
                    <option key={category.id} value={category.id}>{category.nombre}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cuenta</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Centro de Costo</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(movement.fecha_movimiento)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatMovementTypeLabel(movement.tipo_movimiento)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{movement.descripcion}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{puntosVenta.find((item) => item.id === movement.pdv_id)?.nombre || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{movement.centro_costo || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(Number(movement.valor || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
