'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import UploadFoto from '@/components/UploadFoto';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate, getCuadreConsignacionesRegistrables } from '@/lib/utils';
import {
  authorizedJsonFetch,
  CategoriaFinanciera,
  CuentaFinanciera,
  formatMovementDisplayTypeLabel,
  formatMovementOriginLabel,
  getEffectiveFinancialMovements,
  isDatafonoMovement,
  isAutomaticBookMovement,
  isManualBookMovement,
  MovimientoFinanciero,
} from '@/lib/admin-bancos';
import type { PuntoDeVenta } from '@/types';

type CuadreAprobadoReporte = {
  id: string;
  fecha: string;
  punto_de_venta_id: string;
  valor_consignado: number;
  firma_cajero_url?: string | null;
  url_foto_consignacion?: string | null;
};

type InformativeMovementRow = {
  id: string;
  fecha: string;
  pdv: string;
  ciudad: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  valor: number;
  descripcion: string;
};

export default function MovimientosAdminBancosPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingMovementId, setEditingMovementId] = useState('');
  const [actionMovementId, setActionMovementId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoDeVenta[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [cuadresAprobados, setCuadresAprobados] = useState<CuadreAprobadoReporte[]>([]);
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
    vistaHistorial: 'todos' as 'todos' | 'manual' | 'automatico' | 'informativo',
    tipoMovimiento: '',
    cuentaId: '',
    categoriaId: '',
    pdvId: '',
  });
  const submitLockRef = useRef(false);

  const resetForm = (nextAccountId?: string) => {
    setForm({
      tipoMovimiento: 'ingreso',
      cuentaId: nextAccountId || cuentas[0]?.id || '',
      categoriaId: '',
      descripcion: '',
      fechaMovimiento: new Date().toISOString().split('T')[0],
      valor: 0,
      pdvId: '',
      centroCosto: '',
      soporteUrl: '',
    });
    setEditingMovementId('');
  };

  const fetchData = async () => {
    const [accountsRes, categoriesRes, pdvRes, movementsRes, cuadresRes] = await Promise.all([
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase.from('categorias_financieras').select('*').eq('activa', true).order('nombre'),
      supabase.from('puntos_de_venta').select('*').order('nombre'),
      supabase.from('movimientos_financieros').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase
        .from('cuadres_diarios')
        .select('id,fecha,punto_de_venta_id,valor_consignado,firma_cajero_url,url_foto_consignacion')
        .eq('estado', 'aprobado')
        .order('fecha', { ascending: false }),
    ]);

    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];
    setCuentas(nextAccounts);
    setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
    setPuntosVenta((pdvRes.data || []) as PuntoDeVenta[]);
    setMovimientos(
      getEffectiveFinancialMovements((movementsRes.data || []) as MovimientoFinanciero[])
    );
    setCuadresAprobados((cuadresRes.data || []) as CuadreAprobadoReporte[]);
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

  const filteredMovements = useMemo(
    () =>
      movimientos.filter((movement) => {
        if (filters.vistaHistorial === 'informativo') return false;
        if (
          filters.tipoMovimiento === 'ingreso_datafono' &&
          !(
            movement.tipo_movimiento === 'cuadre_aprobado' &&
            String((movement.metadata as Record<string, unknown> | null)?.entry_kind || '') ===
              'datafono'
          )
        ) {
          return false;
        }
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
        if (filters.cuentaId && movement.cuenta_id !== filters.cuentaId) return false;
        if (filters.categoriaId && movement.categoria_id !== filters.categoriaId) return false;
        if (filters.pdvId && movement.pdv_id !== filters.pdvId) return false;
        return true;
      }),
    [filters, movimientos]
  );

  const manualMovements = useMemo(
    () => filteredMovements.filter((movement) => isManualBookMovement(movement)),
    [filteredMovements]
  );

  const automaticMovements = useMemo(
    () => filteredMovements.filter((movement) => isAutomaticBookMovement(movement)),
    [filteredMovements]
  );

  const informativeRows = useMemo(() => {
    return cuadresAprobados.flatMap((cuadre) => {
      if (filters.pdvId && cuadre.punto_de_venta_id !== filters.pdvId) {
        return [];
      }
      const pdv = puntosVenta.find((item) => item.id === cuadre.punto_de_venta_id);

      return getCuadreConsignacionesRegistrables({
        firma_cajero_url: cuadre.firma_cajero_url,
        url_foto_consignacion: cuadre.url_foto_consignacion,
        valor_consignado: cuadre.valor_consignado,
      })
        .filter((consignacion) => consignacion.isInformative)
        .map((consignacion, index): InformativeMovementRow => ({
          id: `${cuadre.id}-${consignacion.id}-${index}`,
          fecha: cuadre.fecha,
          pdv: pdv?.nombre || '',
          ciudad: pdv?.ciudad || '',
          banco: consignacion.banco || consignacion.otraCuenta?.banco || '',
          tipoCuenta: consignacion.tipoCuenta || consignacion.otraCuenta?.tipoCuenta || '',
          numeroCuenta: consignacion.numeroCuenta || consignacion.otraCuenta?.numeroCuenta || '',
          titular: consignacion.titular || consignacion.otraCuenta?.titular || '',
          valor: Number(consignacion.valor || 0),
          descripcion: 'Consignacion a cuenta no registrada o de tercero',
        }));
    });
  }, [cuadresAprobados, filters.pdvId, puntosVenta]);

  const showManualSection =
    filters.vistaHistorial === 'todos' || filters.vistaHistorial === 'manual';
  const showAutomaticSection =
    filters.vistaHistorial === 'todos' || filters.vistaHistorial === 'automatico';
  const showInformativeSection =
    filters.vistaHistorial === 'todos' || filters.vistaHistorial === 'informativo';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      await authorizedJsonFetch('/api/admin-bancos/movimientos', {
        method: editingMovementId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id: editingMovementId || undefined,
          ...form,
          idempotencyKey: editingMovementId ? undefined : crypto.randomUUID(),
        }),
      });

      toast.success(editingMovementId ? 'Movimiento actualizado' : 'Movimiento registrado');
      resetForm();
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo guardar el movimiento');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const isManualEditableMovement = (movement: MovimientoFinanciero) => isManualBookMovement(movement);

  const startEditingMovement = (movement: MovimientoFinanciero) => {
    if (!isManualEditableMovement(movement)) {
      toast.error('Solo puedes editar movimientos manuales');
      return;
    }

    setEditingMovementId(movement.id);
    setForm({
      tipoMovimiento: movement.tipo_movimiento,
      cuentaId: movement.cuenta_id,
      categoriaId: movement.categoria_id || '',
      descripcion: movement.descripcion || '',
      fechaMovimiento: movement.fecha_movimiento,
      valor: Number(movement.valor || 0),
      pdvId: movement.pdv_id || '',
      centroCosto: movement.centro_costo || '',
      soporteUrl: movement.soporte_url || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReverseMovement = async (movement: MovimientoFinanciero) => {
    if (!isManualEditableMovement(movement)) {
      toast.error('Solo puedes reversar movimientos manuales');
      return;
    }

    const confirmed = window.confirm(
      `Vas a reversar el movimiento "${movement.descripcion}". Esta accion lo saca del libro activo.`
    );

    if (!confirmed) {
      return;
    }

    setActionMovementId(movement.id);
    try {
      await authorizedJsonFetch('/api/admin-bancos/movimientos', {
        method: 'DELETE',
        body: JSON.stringify({
          id: movement.id,
        }),
      });

      if (editingMovementId === movement.id) {
        resetForm();
      }

      toast.success('Movimiento reversado');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo reversar el movimiento');
    } finally {
      setActionMovementId('');
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
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {editingMovementId ? 'Editar Movimiento' : 'Nuevo Movimiento'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {editingMovementId
              ? 'Solo se pueden editar movimientos manuales creados desde esta pantalla.'
              : 'Registra ingresos y egresos manuales en el libro bancario.'}
          </p>
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
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting
                ? editingMovementId
                  ? 'Guardando...'
                  : 'Registrando...'
                : editingMovementId
                  ? 'Guardar Cambios'
                  : 'Registrar Movimiento'}
            </button>
            {editingMovementId && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-700"
              >
                Cancelar Edicion
              </button>
            )}
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Vista del Historial">
                <select
                  value={filters.vistaHistorial}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      vistaHistorial: e.target.value as 'todos' | 'manual' | 'automatico' | 'informativo',
                      tipoMovimiento: e.target.value === 'informativo' ? '' : filters.tipoMovimiento,
                      cuentaId: e.target.value === 'informativo' ? '' : filters.cuentaId,
                      categoriaId: e.target.value === 'informativo' ? '' : filters.categoriaId,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                >
                  <option value="todos">Todos</option>
                  <option value="manual">Solo manuales</option>
                  <option value="automatico">Solo automaticos</option>
                  <option value="informativo">Cuentas no registradas</option>
                </select>
              </Field>
              <Field label="Tipo">
                <select value={filters.tipoMovimiento} disabled={filters.vistaHistorial === 'informativo'} onChange={(e) => setFilters({ ...filters, tipoMovimiento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todos</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                  <option value="ingreso_datafono">Ingreso Datafono</option>
                  <option value="transferencia_entrada">Transferencia Entrada</option>
                  <option value="transferencia_salida">Transferencia Salida</option>
                  <option value="cuadre_aprobado">Cuadre Aprobado</option>
                </select>
              </Field>
              <Field label="Cuenta">
                <select value={filters.cuentaId} disabled={filters.vistaHistorial === 'informativo'} onChange={(e) => setFilters({ ...filters, cuentaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todas</option>
                  {cuentas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Categoria">
                <select value={filters.categoriaId} disabled={filters.vistaHistorial === 'informativo'} onChange={(e) => setFilters({ ...filters, categoriaId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todas</option>
                  {categorias.map((category) => (
                    <option key={category.id} value={category.id}>{category.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="PDV">
                <select value={filters.pdvId} onChange={(e) => setFilters({ ...filters, pdvId: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Todos</option>
                  {puntosVenta.map((pdv) => (
                    <option key={pdv.id} value={pdv.id}>{pdv.nombre}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/95 border border-white/30 p-5 shadow-2xl">
              <p className="text-sm text-gray-500">Movimientos Manuales</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{manualMovements.length}</p>
              <p className="text-xs text-gray-500 mt-1">Pagos, egresos e ingresos creados manualmente por Admin Bancos.</p>
            </div>
            <div className="rounded-xl bg-white/95 border border-white/30 p-5 shadow-2xl">
              <p className="text-sm text-gray-500">Movimientos Automaticos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{automaticMovements.length}</p>
              <p className="text-xs text-gray-500 mt-1">Incluye ingresos por cuadre, ingresos por datafono, historicos y transferencias.</p>
            </div>
            <div className="rounded-xl bg-white/95 border border-white/30 p-5 shadow-2xl md:col-span-2">
              <p className="text-sm text-gray-500">Cuentas No Registradas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{informativeRows.length}</p>
              <p className="text-xs text-gray-500 mt-1">Consignaciones informativas a cuentas de terceros o no registradas en el libro.</p>
            </div>
          </div>

          {showManualSection && (
          <MovementHistoryTable
            title="Historial de Movimientos Manuales"
            description="Aqui ves pagos como arriendo, administracion y otros movimientos creados manualmente."
            movements={manualMovements}
            cuentas={cuentas}
            puntosVenta={puntosVenta}
            actionMovementId={actionMovementId}
            submitting={submitting}
            onEdit={startEditingMovement}
            onReverse={handleReverseMovement}
            emptyMessage="No hay movimientos manuales con los filtros seleccionados."
          />
          )}

          {showInformativeSection && (
            <InformativeHistoryTable
              rows={informativeRows}
              emptyMessage="No hay consignaciones informativas para mostrar."
            />
          )}

          {showAutomaticSection && (
          <MovementHistoryTable
            title="Historial de Movimientos Automaticos"
            description="Aqui ves lo que entra o sale del libro por procesos automaticos del sistema."
            movements={automaticMovements}
            cuentas={cuentas}
            puntosVenta={puntosVenta}
            actionMovementId={actionMovementId}
            submitting={submitting}
            onEdit={startEditingMovement}
            onReverse={handleReverseMovement}
            emptyMessage="No hay movimientos automaticos con los filtros seleccionados."
          />
          )}
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

function MovementHistoryTable({
  title,
  description,
  movements,
  cuentas,
  puntosVenta,
  actionMovementId,
  submitting,
  onEdit,
  onReverse,
  emptyMessage,
}: {
  title: string;
  description: string;
  movements: MovimientoFinanciero[];
  cuentas: CuentaFinanciera[];
  puntosVenta: PuntoDeVenta[];
  actionMovementId: string;
  submitting: boolean;
  onEdit: (movement: MovimientoFinanciero) => void;
  onReverse: (movement: MovimientoFinanciero) => void;
  emptyMessage: string;
}) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>

      <table className="w-full min-w-[1120px] table-fixed">
        <thead className="bg-light">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Origen</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cuenta</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Centro de Costo</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {movements.map((movement) => {
            const isEditable = isManualBookMovement(movement);
            return (
              <tr key={movement.id}>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(movement.fecha_movimiento)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatMovementDisplayTypeLabel(movement)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatMovementOriginLabel(movement.origen)}</td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{movement.descripcion}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {puntosVenta.find((item) => item.id === movement.pdv_id)?.nombre || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{movement.centro_costo || '-'}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatCOP(Number(movement.valor || 0))}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {isEditable ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(movement)}
                        disabled={submitting || actionMovementId === movement.id}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onReverse(movement)}
                        disabled={actionMovementId === movement.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 disabled:opacity-50"
                      >
                        {actionMovementId === movement.id ? 'Reversando...' : 'Reversar'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {movement.origen === 'transferencia'
                        ? 'Se gestiona desde Transferencias'
                        : 'Movimiento automatico'}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {movements.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InformativeHistoryTable({
  rows,
  emptyMessage,
}: {
  rows: InformativeMovementRow[];
  emptyMessage: string;
}) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Historial de Cuentas No Registradas</h3>
        <p className="text-sm text-gray-500 mt-1">
          Aqui ves consignaciones informativas que no afectan el saldo del libro bancario.
        </p>
      </div>

      <table className="w-full min-w-[1120px] table-fixed">
        <thead className="bg-light">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">PDV</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ciudad</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Banco</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo Cuenta</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Numero Cuenta</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Titular</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 text-sm text-gray-600">{formatDate(row.fecha)}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{row.pdv || '-'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{row.ciudad || '-'}</td>
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
