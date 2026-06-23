'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { authorizedJsonFetch, CategoriaFinanciera, CuentaFinanciera } from '@/lib/admin-bancos';
import { formatCOP, formatDate } from '@/lib/utils';

type CuadreAprobadoSync = {
  id: string;
  fecha: string;
  punto_de_venta_id: string;
  valor_consignado: number;
  estado: string;
  cuenta_financiera_destino_id?: string | null;
  movimiento_financiero_sync_id?: string | null;
  punto_de_venta?: {
    id: string;
    nombre: string;
    ciudad: string;
  } | null;
};

export default function GestionAdminBancosPage() {
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [cuadres, setCuadres] = useState<CuadreAprobadoSync[]>([]);
  const [defaultSyncAccountId, setDefaultSyncAccountId] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    nombre: '',
    tipo: 'ambos' as CategoriaFinanciera['tipo'],
    descripcion: '',
    activa: true,
  });

  const fetchData = async () => {
    const [categoriesRes, accountsRes, cuadresRes, pdvRes] = await Promise.all([
      supabase.from('categorias_financieras').select('*').order('nombre'),
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase
        .from('cuadres_diarios')
        .select('id,fecha,punto_de_venta_id,valor_consignado,estado,cuenta_financiera_destino_id,movimiento_financiero_sync_id')
        .eq('estado', 'aprobado')
        .order('fecha', { ascending: false }),
      supabase.from('puntos_de_venta').select('*'),
    ]);

    const pdvs = pdvRes.data || [];
    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];

    setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
    setCuentas(nextAccounts);
    setDefaultSyncAccountId((current) => current || nextAccounts[0]?.id || '');
    setCuadres(
      ((cuadresRes.data || []) as CuadreAprobadoSync[]).map((cuadre) => ({
        ...cuadre,
        punto_de_venta: pdvs.find((pdv) => pdv.id === cuadre.punto_de_venta_id) || null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCategory(true);
    try {
      await authorizedJsonFetch('/api/admin-bancos/categorias', {
        method: 'POST',
        body: JSON.stringify({
          id: categoryForm.id || undefined,
          nombre: categoryForm.nombre,
          tipo: categoryForm.tipo,
          descripcion: categoryForm.descripcion,
          activa: categoryForm.activa,
        }),
      });
      toast.success(categoryForm.id ? 'Categoria actualizada' : 'Categoria creada');
      setCategoryForm({ id: '', nombre: '', tipo: 'ambos', descripcion: '', activa: true });
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo guardar la categoria');
    } finally {
      setSavingCategory(false);
    }
  };

  const syncOne = async (cuadreId: string) => {
    try {
      await authorizedJsonFetch('/api/admin-bancos/cuadres/sincronizar', {
        method: 'POST',
        body: JSON.stringify({
          cuadreId,
          cuentaId: defaultSyncAccountId,
          forceHistorical: true,
        }),
      });
      toast.success('Cuadre sincronizado');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo sincronizar el cuadre');
    }
  };

  const syncAll = async () => {
    try {
      await authorizedJsonFetch('/api/admin-bancos/cuadres/sincronizar', {
        method: 'POST',
        body: JSON.stringify({
          cuentaId: defaultSyncAccountId,
        }),
      });
      toast.success('Sincronizacion masiva completada');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo completar la sincronizacion');
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
        <h1 className="text-3xl font-bold text-white drop-shadow">Gestion de Cuentas</h1>
        <p className="text-white/80 mt-1 drop-shadow">Administra categorias financieras y sincroniza cuadres aprobados historicos al libro bancario.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Categorias Financieras</h3>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <Field label="Nombre">
              <input value={categoryForm.nombre} onChange={(e) => setCategoryForm({ ...categoryForm, nombre: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Tipo">
              <select value={categoryForm.tipo} onChange={(e) => setCategoryForm({ ...categoryForm, tipo: e.target.value as CategoriaFinanciera['tipo'] })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="ambos">Ambos</option>
              </select>
            </Field>
            <Field label="Descripcion">
              <textarea value={categoryForm.descripcion} onChange={(e) => setCategoryForm({ ...categoryForm, descripcion: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg min-h-24" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={categoryForm.activa} onChange={(e) => setCategoryForm({ ...categoryForm, activa: e.target.checked })} />
              Categoria activa
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={savingCategory} className="flex-1 px-4 py-3 bg-primary text-white rounded-lg">
                {categoryForm.id ? 'Guardar Categoria' : 'Crear Categoria'}
              </button>
              {categoryForm.id && (
                <button
                  type="button"
                  onClick={() => setCategoryForm({ id: '', nombre: '', tipo: 'ambos', descripcion: '', activa: true })}
                  className="px-4 py-3 border border-gray-300 rounded-lg"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 space-y-2">
            {categorias.map((category) => (
              <button
                key={category.id}
                onClick={() =>
                  setCategoryForm({
                    id: category.id,
                    nombre: category.nombre,
                    tipo: category.tipo,
                    descripcion: category.descripcion || '',
                    activa: category.activa,
                  })
                }
                className="w-full text-left rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{category.nombre}</p>
                    <p className="text-xs text-gray-500">{category.tipo} · {category.es_sistema ? 'Sistema' : 'Personalizada'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${category.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {category.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Sincronizacion de Cuadres Aprobados</h3>
              <p className="text-sm text-gray-500 mt-1">Asocia cuadres historicos aprobados a una cuenta para generar el ingreso automatico en Admin Bancos.</p>
            </div>
            <div className="flex gap-3">
              <select value={defaultSyncAccountId} onChange={(e) => setDefaultSyncAccountId(e.target.value)} className="px-4 py-3 border border-gray-300 rounded-lg bg-white">
                <option value="">Cuenta por defecto</option>
                {cuentas.map((account) => (
                  <option key={account.id} value={account.id}>{account.nombre}</option>
                ))}
              </select>
              <button onClick={syncAll} disabled={!defaultSyncAccountId} className="px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50">
                Sincronizar Pendientes
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ciudad</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor Consignado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cuenta Asociada</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Estado Sync</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {cuadres.map((cuadre) => (
                  <tr key={cuadre.id}>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(cuadre.fecha)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{cuadre.punto_de_venta?.nombre || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{cuadre.punto_de_venta?.ciudad || 'N/A'}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(Number(cuadre.valor_consignado || 0))}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {cuentas.find((account) => account.id === cuadre.cuenta_financiera_destino_id)?.nombre || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${cuadre.movimiento_financiero_sync_id ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>
                        {cuadre.movimiento_financiero_sync_id ? 'Sincronizado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => syncOne(cuadre.id)}
                        disabled={!defaultSyncAccountId}
                        className="px-3 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-50"
                      >
                        Sincronizar
                      </button>
                    </td>
                  </tr>
                ))}
                {cuadres.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      No hay cuadres aprobados para sincronizar.
                    </td>
                  </tr>
                )}
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
