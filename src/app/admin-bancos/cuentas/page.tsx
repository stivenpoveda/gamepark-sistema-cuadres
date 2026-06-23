'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatDate } from '@/lib/utils';
import {
  ACCOUNT_KINDS,
  ACCOUNT_STATES,
  authorizedJsonFetch,
  buildLedgerRows,
  CuentaFinanciera,
  getAccountBalance,
  getFinancialAccountTitular,
  MovimientoFinanciero,
} from '@/lib/admin-bancos';

export default function CuentasBancariasPage() {
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CuentaFinanciera | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [form, setForm] = useState({
    nombre: '',
    banco: '',
    titular: '',
    numeroCuenta: '',
    tipoCuenta: '',
    tipoEntidad: 'bancaria' as CuentaFinanciera['tipo_entidad'],
    saldoInicial: 0,
    estado: 'activa' as CuentaFinanciera['estado'],
    descripcion: '',
  });

  const fetchData = async () => {
    const [accountsRes, movementsRes] = await Promise.all([
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase.from('movimientos_financieros').select('*').eq('activo', true).order('fecha_movimiento', { ascending: false }),
    ]);

    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];
    setCuentas(nextAccounts);
    setMovimientos((movementsRes.data || []) as MovimientoFinanciero[]);
    setSelectedAccountId((current) => current || nextAccounts[0]?.id || '');
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedAccount = cuentas.find((account) => account.id === selectedAccountId) || null;
  const ledger = useMemo(
    () => (selectedAccount ? buildLedgerRows(selectedAccount, movimientos).reverse() : []),
    [selectedAccount, movimientos]
  );

  const resetForm = () => {
    setForm({
      nombre: '',
      banco: '',
      titular: '',
      numeroCuenta: '',
      tipoCuenta: '',
      tipoEntidad: 'bancaria',
      saldoInicial: 0,
      estado: 'activa',
      descripcion: '',
    });
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authorizedJsonFetch('/api/admin-bancos/cuentas', {
        method: 'POST',
        body: JSON.stringify({
          id: editing?.id,
          ...form,
        }),
      });

      toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada');
      setShowModal(false);
      resetForm();
      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo guardar la cuenta');
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
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white drop-shadow">Cuentas Bancarias</h1>
          <p className="text-white/80 mt-1 drop-shadow">Controla bancos, cajas, fondos, efectivo general y su saldo acumulado.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Nueva Cuenta
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Listado de Cuentas</h3>
          <div className="space-y-3">
            {cuentas.map((cuenta) => {
              const active = cuenta.id === selectedAccountId;
              return (
                <div
                  key={cuenta.id}
                  className={`w-full rounded-xl border p-4 transition-all ${
                    active ? 'border-primary bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedAccountId(cuenta.id)}
                      className="flex-1 text-left"
                    >
                      <p className="font-semibold text-gray-900">{cuenta.nombre}</p>
                      <p className="text-sm text-gray-500">
                        {cuenta.banco} {cuenta.numero_cuenta ? `- ${cuenta.numero_cuenta}` : ''}
                      </p>
                      <p className="text-sm text-gray-500">Titular: {getFinancialAccountTitular(cuenta)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {cuenta.tipo_entidad} · {cuenta.estado}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(cuenta);
                        setForm({
                          nombre: cuenta.nombre,
                          banco: cuenta.banco,
                          titular: getFinancialAccountTitular(cuenta) === 'No definido' ? '' : getFinancialAccountTitular(cuenta),
                          numeroCuenta: cuenta.numero_cuenta || '',
                          tipoCuenta: cuenta.tipo_cuenta || '',
                          tipoEntidad: cuenta.tipo_entidad,
                          saldoInicial: Number(cuenta.saldo_inicial || 0),
                          estado: cuenta.estado,
                          descripcion: cuenta.descripcion || '',
                        });
                        setShowModal(true);
                      }}
                      className="text-sm font-medium text-primary"
                    >
                      Editar
                    </button>
                  </div>
                  <p className="text-lg font-bold text-gray-900 mt-3">{formatCOP(getAccountBalance(cuenta, movimientos))}</p>
                </div>
              );
            })}
            {cuentas.length === 0 && <p className="text-sm text-gray-500">No hay cuentas registradas todavia.</p>}
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Libro Bancario / Extracto Interno</h3>
          <p className="text-sm text-gray-500 mb-4">
            {selectedAccount ? `Movimientos de ${selectedAccount.nombre}` : 'Selecciona una cuenta para ver su extracto interno.'}
          </p>

          {selectedAccount ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripcion</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Ingreso</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Egreso</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(selectedAccount.created_at.split('T')[0])}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">Saldo Inicial</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{selectedAccount.descripcion || 'Apertura de cuenta'}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(Number(selectedAccount.saldo_inicial || 0))}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">$0</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCOP(Number(selectedAccount.saldo_inicial || 0))}</td>
                  </tr>
                  {ledger.map((movement) => {
                    const isIngreso =
                      movement.tipo_movimiento === 'ingreso' ||
                      movement.tipo_movimiento === 'transferencia_entrada' ||
                      movement.tipo_movimiento === 'cuadre_aprobado';
                    return (
                      <tr key={movement.id}>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(movement.fecha_movimiento)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{movement.tipo_movimiento.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{movement.descripcion}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">
                          {isIngreso ? formatCOP(Number(movement.valor || 0)) : '$0'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-red-700">
                          {!isIngreso ? formatCOP(Number(movement.valor || 0)) : '$0'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {formatCOP(Number(movement.saldo_acumulado || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No hay cuenta seleccionada.</p>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
            <h3 className="text-xl font-semibold mb-4">{editing ? 'Editar Cuenta' : 'Nueva Cuenta'}</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nombre">
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Banco">
                <input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Titular">
                <input value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Numero de Cuenta">
                <input value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Tipo de Cuenta">
                <input value={form.tipoCuenta} onChange={(e) => setForm({ ...form, tipoCuenta: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <Field label="Tipo de Entidad">
                <select value={form.tipoEntidad} onChange={(e) => setForm({ ...form, tipoEntidad: e.target.value as CuentaFinanciera['tipo_entidad'] })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  {ACCOUNT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as CuentaFinanciera['estado'] })} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  {ACCOUNT_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </Field>
              <Field label="Saldo Inicial">
                <input type="number" value={form.saldoInicial || ''} onChange={(e) => setForm({ ...form, saldoInicial: Number(e.target.value || 0) })} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Descripcion">
                  <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg min-h-24" />
                </Field>
              </div>
              <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg">
                  {editing ? 'Guardar Cambios' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
