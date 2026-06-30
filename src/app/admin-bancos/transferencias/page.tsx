'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { authorizedJsonFetch, CuentaFinanciera, MovimientoFinanciero } from '@/lib/admin-bancos';
import { formatCOP, formatDate } from '@/lib/utils';

type TransferGroupRow = {
  id: string;
  fecha: string;
  descripcion: string;
  valor: number;
  origen: string;
  destino: string;
  cuentaOrigenId: string;
  destinoModo: 'interna' | 'externa';
  cuentaDestinoId: string;
  cuentaExternaBanco: string;
  cuentaExternaNumero: string;
  cuentaExternaTitular: string;
};

export default function TransferenciasAdminBancosPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState('');
  const [actionTransferId, setActionTransferId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [form, setForm] = useState({
    cuentaOrigenId: '',
    destinoModo: 'interna',
    cuentaDestinoId: '',
    cuentaExternaBanco: '',
    cuentaExternaNumero: '',
    cuentaExternaTitular: '',
    valor: 0,
    descripcion: '',
    fechaMovimiento: new Date().toISOString().split('T')[0],
  });
  const submitLockRef = useRef(false);

  const resetForm = (originId?: string, destinoId?: string) => {
    setForm({
      cuentaOrigenId: originId || cuentas[0]?.id || '',
      destinoModo: 'interna',
      cuentaDestinoId: destinoId || cuentas[1]?.id || cuentas[0]?.id || '',
      cuentaExternaBanco: '',
      cuentaExternaNumero: '',
      cuentaExternaTitular: '',
      valor: 0,
      descripcion: '',
      fechaMovimiento: new Date().toISOString().split('T')[0],
    });
    setEditingTransferId('');
  };

  const fetchData = async () => {
    const [accountsRes, movementsRes] = await Promise.all([
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase
        .from('movimientos_financieros')
        .select('*')
        .eq('activo', true)
        .not('transferencia_grupo_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];
    setCuentas(nextAccounts);
    setMovimientos((movementsRes.data || []) as MovimientoFinanciero[]);
    setForm((current) => ({
      ...current,
      cuentaOrigenId: current.cuentaOrigenId || nextAccounts[0]?.id || '',
      cuentaDestinoId: current.cuentaDestinoId || nextAccounts[1]?.id || nextAccounts[0]?.id || '',
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const transferGroups = useMemo(() => {
    const groups = new Map<string, TransferGroupRow>();

    movimientos.forEach((movement) => {
      const groupId = movement.transferencia_grupo_id;
      if (!groupId) return;

      const existing = groups.get(groupId) || {
        id: groupId,
        fecha: movement.fecha_movimiento,
        descripcion: movement.descripcion,
        valor: Number(movement.valor || 0),
        origen: '',
        destino: '',
        cuentaOrigenId: '',
        destinoModo: 'interna' as const,
        cuentaDestinoId: '',
        cuentaExternaBanco: '',
        cuentaExternaNumero: '',
        cuentaExternaTitular: '',
      };
      const externalAccount = movement.metadata?.cuenta_externa as
        | { banco?: string; numeroCuenta?: string; titular?: string }
        | undefined;

      if (movement.tipo_movimiento === 'transferencia_salida') {
        existing.origen = cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A';
        existing.cuentaOrigenId = movement.cuenta_id;
        if (externalAccount?.numeroCuenta) {
          existing.destinoModo = 'externa';
          existing.cuentaExternaBanco = externalAccount.banco || '';
          existing.cuentaExternaNumero = externalAccount.numeroCuenta || '';
          existing.cuentaExternaTitular = externalAccount.titular || '';
          existing.destino = `${externalAccount.banco || 'Cuenta Externa'} - ${externalAccount.numeroCuenta}${
            externalAccount.titular ? ` (${externalAccount.titular})` : ''
          }`;
        }
      }
      if (movement.tipo_movimiento === 'transferencia_entrada') {
        existing.destinoModo = 'interna';
        existing.cuentaDestinoId = movement.cuenta_id;
        existing.destino = cuentas.find((item) => item.id === movement.cuenta_id)?.nombre || 'N/A';
      }

      groups.set(groupId, existing);
    });

    return Array.from(groups.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [movimientos, cuentas]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      await authorizedJsonFetch('/api/admin-bancos/transferencias', {
        method: editingTransferId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id: editingTransferId || undefined,
          cuentaOrigenId: form.cuentaOrigenId,
          cuentaDestinoId: form.destinoModo === 'interna' ? form.cuentaDestinoId : null,
          cuentaExterna:
            form.destinoModo === 'externa'
              ? {
                  banco: form.cuentaExternaBanco,
                  numeroCuenta: form.cuentaExternaNumero,
                  titular: form.cuentaExternaTitular,
                }
              : null,
          valor: form.valor,
          descripcion: form.descripcion,
          fechaMovimiento: form.fechaMovimiento,
          idempotencyKey: editingTransferId ? undefined : crypto.randomUUID(),
        }),
      });
      toast.success(editingTransferId ? 'Transferencia actualizada' : 'Transferencia registrada');
      resetForm();
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo guardar la transferencia');
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const startEditingTransfer = (transfer: TransferGroupRow) => {
    setEditingTransferId(transfer.id);
    setForm({
      cuentaOrigenId: transfer.cuentaOrigenId,
      destinoModo: transfer.destinoModo,
      cuentaDestinoId: transfer.cuentaDestinoId,
      cuentaExternaBanco: transfer.cuentaExternaBanco,
      cuentaExternaNumero: transfer.cuentaExternaNumero,
      cuentaExternaTitular: transfer.cuentaExternaTitular,
      valor: transfer.valor,
      descripcion: transfer.descripcion,
      fechaMovimiento: transfer.fecha,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReverseTransfer = async (transfer: TransferGroupRow) => {
    const confirmed = window.confirm(
      `Vas a reversar la transferencia "${transfer.descripcion}". Esta accion saca del libro la salida y la entrada relacionadas.`
    );

    if (!confirmed) {
      return;
    }

    setActionTransferId(transfer.id);
    try {
      await authorizedJsonFetch('/api/admin-bancos/transferencias', {
        method: 'DELETE',
        body: JSON.stringify({ id: transfer.id }),
      });

      if (editingTransferId === transfer.id) {
        resetForm();
      }

      toast.success('Transferencia reversada');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo reversar la transferencia');
    } finally {
      setActionTransferId('');
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
        <h1 className="text-3xl font-bold text-white drop-shadow">Transferencias</h1>
        <p className="text-white/80 mt-1 drop-shadow">Traslada dinero entre cuentas descontando automaticamente en origen y sumando en destino.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {editingTransferId ? 'Editar Transferencia' : 'Nueva Transferencia'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {editingTransferId
              ? 'Ajusta origen, destino, fecha, descripcion o valor sin perder la trazabilidad del grupo.'
              : 'Traslada dinero entre cuentas registradas o hacia una cuenta externa.'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Cuenta Origen">
              <select value={form.cuentaOrigenId} onChange={(e) => setForm({ ...form, cuentaOrigenId: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="">Selecciona</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de Destino">
              <select value={form.destinoModo} onChange={(e) => setForm({ ...form, destinoModo: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                <option value="interna">Cuenta registrada</option>
                <option value="externa">Cuenta externa manual</option>
              </select>
            </Field>
            {form.destinoModo === 'interna' ? (
              <Field label="Cuenta Destino">
                <select value={form.cuentaDestinoId} onChange={(e) => setForm({ ...form, cuentaDestinoId: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option value="">Selecciona</option>
                  {cuentas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Banco Destino">
                  <input value={form.cuentaExternaBanco} onChange={(e) => setForm({ ...form, cuentaExternaBanco: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                </Field>
                <Field label="Numero de Cuenta Destino">
                  <input value={form.cuentaExternaNumero} onChange={(e) => setForm({ ...form, cuentaExternaNumero: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                </Field>
                <Field label="Titular Destino">
                  <input value={form.cuentaExternaTitular} onChange={(e) => setForm({ ...form, cuentaExternaTitular: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                </Field>
              </>
            )}
            <Field label="Fecha">
              <input type="date" value={form.fechaMovimiento} onChange={(e) => setForm({ ...form, fechaMovimiento: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Descripcion">
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <Field label="Valor">
              <input type="number" value={form.valor || ''} onChange={(e) => setForm({ ...form, valor: Number(e.target.value || 0) })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting
                ? editingTransferId
                  ? 'Guardando...'
                  : 'Registrando...'
                : editingTransferId
                  ? 'Guardar Cambios'
                  : 'Registrar Transferencia'}
            </button>
            {editingTransferId && (
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

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6 overflow-x-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Transferencias</h3>
          <table className="w-full min-w-[860px] table-fixed">
            <thead className="bg-light">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Origen</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Destino</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {transferGroups.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(transfer.fecha)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{transfer.descripcion}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{transfer.origen || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{transfer.destino || 'N/A'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(transfer.valor)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingTransfer(transfer)}
                        disabled={submitting || actionTransferId === transfer.id}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReverseTransfer(transfer)}
                        disabled={actionTransferId === transfer.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 disabled:opacity-50"
                      >
                        {actionTransferId === transfer.id ? 'Reversando...' : 'Reversar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {transferGroups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay transferencias registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
