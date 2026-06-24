'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { authorizedJsonFetch, CategoriaFinanciera, CuentaFinanciera } from '@/lib/admin-bancos';
import { formatCOP, formatDate, getCuadreConsignacionesRegistrables } from '@/lib/utils';

type CuadreAprobado = {
  id: string;
  fecha: string;
  punto_de_venta_id: string;
  valor_consignado: number;
  estado: string;
  firma_cajero_url?: string | null;
  url_foto_consignacion?: string | null;
  punto_de_venta?: {
    id: string;
    nombre: string;
    ciudad: string;
  } | null;
};

type MovimientoCuadreRegistrado = {
  id: string;
  cuadre_id?: string | null;
  cuenta_id: string;
  metadata?: Record<string, unknown> | null;
};

type ConsignacionFila = {
  key: string;
  cuadreId: string;
  consignacionId: string;
  valor: number;
  descripcionCuenta: string;
  suggestedAccountId: string;
  titular: string;
  isInformative: boolean;
};

const getConsignacionKey = (cuadreId: string, consignacionId: string) => `${cuadreId}::${consignacionId}`;

const findAccountIdByConsignacion = (
  cuentas: CuentaFinanciera[],
  consignacion: ReturnType<typeof getCuadreConsignacionesRegistrables>[number]
) => {
  if (consignacion.isInformative) {
    return '';
  }

  if (!consignacion.banco || !consignacion.tipoCuenta || !consignacion.numeroCuenta) {
    return '';
  }

  return (
    cuentas.find(
      (cuenta) =>
        cuenta.banco === consignacion.banco &&
        cuenta.tipo_cuenta === consignacion.tipoCuenta &&
        cuenta.numero_cuenta === consignacion.numeroCuenta
    )?.id || ''
  );
};

export default function GestionAdminBancosPage() {
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [cuadres, setCuadres] = useState<CuadreAprobado[]>([]);
  const [movimientosCuadre, setMovimientosCuadre] = useState<MovimientoCuadreRegistrado[]>([]);
  const [syncAccountByConsignacion, setSyncAccountByConsignacion] = useState<Record<string, string>>({});
  const [syncingCuadreId, setSyncingCuadreId] = useState('');
  const [selectedPdvId, setSelectedPdvId] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    nombre: '',
    tipo: 'ambos' as CategoriaFinanciera['tipo'],
    descripcion: '',
    activa: true,
  });

  const fetchData = async () => {
    setLoading(true);
    const [categoriesRes, accountsRes, cuadresRes, pdvRes, movementsRes] = await Promise.all([
      supabase.from('categorias_financieras').select('*').order('nombre'),
      supabase.from('cuentas_financieras').select('*').order('nombre'),
      supabase
        .from('cuadres_diarios')
        .select('id,fecha,punto_de_venta_id,valor_consignado,estado,firma_cajero_url,url_foto_consignacion')
        .eq('estado', 'aprobado')
        .order('fecha', { ascending: false }),
      supabase.from('puntos_de_venta').select('*'),
      supabase
        .from('movimientos_financieros')
        .select('id,cuadre_id,cuenta_id,metadata')
        .eq('tipo_movimiento', 'cuadre_aprobado')
        .eq('activo', true),
    ]);

    const pdvs = pdvRes.data || [];
    const nextAccounts = (accountsRes.data || []) as CuentaFinanciera[];
    const nextCuadres = ((cuadresRes.data || []) as CuadreAprobado[]).map((cuadre) => ({
      ...cuadre,
      punto_de_venta: pdvs.find((pdv) => pdv.id === cuadre.punto_de_venta_id) || null,
    }));

    setCategorias((categoriesRes.data || []) as CategoriaFinanciera[]);
    setCuentas(nextAccounts);
    setCuadres(nextCuadres);
    setMovimientosCuadre((movementsRes.data || []) as MovimientoCuadreRegistrado[]);

    setSyncAccountByConsignacion((current) => {
      const nextState = { ...current };

      nextCuadres.forEach((cuadre) => {
        const consignaciones = getCuadreConsignacionesRegistrables({
          firma_cajero_url: cuadre.firma_cajero_url,
          url_foto_consignacion: cuadre.url_foto_consignacion,
          valor_consignado: cuadre.valor_consignado,
        });

        consignaciones.forEach((consignacion) => {
          if (consignacion.isInformative) {
            return;
          }

          const key = getConsignacionKey(cuadre.id, consignacion.id);
          const movimiento = (movementsRes.data || []).find((item: any) => {
            const metadata = (item.metadata || {}) as Record<string, unknown>;
            return item.cuadre_id === cuadre.id && String(metadata.consignacion_id || '') === consignacion.id;
          }) as MovimientoCuadreRegistrado | undefined;

          nextState[key] =
            current[key] ||
            movimiento?.cuenta_id ||
            findAccountIdByConsignacion(nextAccounts, consignacion);
        });
      });

      return nextState;
    });

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

  const movimientosPorClave = useMemo(() => {
    const map = new Map<string, MovimientoCuadreRegistrado>();

    movimientosCuadre.forEach((movement) => {
      const metadata = (movement.metadata || {}) as Record<string, unknown>;
      const consignacionId = String(metadata.consignacion_id || '').trim();
      if (!movement.cuadre_id || !consignacionId) {
        return;
      }
      map.set(getConsignacionKey(movement.cuadre_id, consignacionId), movement);
    });

    return map;
  }, [movimientosCuadre]);

  const legacyCuadres = useMemo(() => {
    const set = new Set<string>();

    movimientosCuadre.forEach((movement) => {
      const metadata = (movement.metadata || {}) as Record<string, unknown>;
      const consignacionId = String(metadata.consignacion_id || '').trim();
      if (movement.cuadre_id && !consignacionId) {
        set.add(movement.cuadre_id);
      }
    });

    return set;
  }, [movimientosCuadre]);

  const pdvOptions = useMemo(
    () =>
      Array.from(
        new Map(
          cuadres
            .filter((cuadre) => cuadre.punto_de_venta?.id)
            .map((cuadre) => [
              cuadre.punto_de_venta!.id,
              {
                id: cuadre.punto_de_venta!.id,
                nombre: cuadre.punto_de_venta?.nombre || 'PDV sin nombre',
                ciudad: cuadre.punto_de_venta?.ciudad || '',
              },
            ])
        ).values()
      ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [cuadres]
  );

  const visibleCuadres = useMemo(
    () =>
      cuadres.filter((cuadre) =>
        selectedPdvId ? cuadre.punto_de_venta_id === selectedPdvId : true
      ),
    [cuadres, selectedPdvId]
  );

  const syncCuadre = async (cuadre: CuadreAprobado, consignaciones: ConsignacionFila[]) => {
    const consignacionesRegistrables = consignaciones.filter((consignacion) => !consignacion.isInformative);

    if (consignacionesRegistrables.length === 0) {
      toast.success(
        'Este cuadre solo tiene movimientos informativos a cuenta no registrada. No genera ingreso en libro.'
      );
      return;
    }

    if (consignaciones.length === 0) {
      toast.error('Este cuadre no tiene consignaciones con valor para registrar');
      return;
    }

    const missingAccount = consignacionesRegistrables.find(
      (consignacion) => !syncAccountByConsignacion[consignacion.key]
    );

    if (missingAccount) {
      toast.error('Debes seleccionar la cuenta real de cada consignacion pendiente');
      return;
    }

    const currentMovements = consignacionesRegistrables.filter((consignacion) =>
      movimientosPorClave.has(consignacion.key)
    );
    const accountChanged = currentMovements.some((consignacion) => {
      const existingMovement = movimientosPorClave.get(consignacion.key);
      return existingMovement && existingMovement.cuenta_id !== syncAccountByConsignacion[consignacion.key];
    });

    const forceHistorical = legacyCuadres.has(cuadre.id) || accountChanged;
    const overridesByConsignacionId = Object.fromEntries(
      consignacionesRegistrables.map((consignacion) => [
        consignacion.consignacionId,
        syncAccountByConsignacion[consignacion.key],
      ])
    );

    setSyncingCuadreId(cuadre.id);
    try {
      const response = await authorizedJsonFetch<{
        success: boolean;
        result: {
          createdCount: number;
          pendingCount: number;
          informativeCount?: number;
        };
      }>('/api/admin-bancos/cuadres/sincronizar', {
        method: 'POST',
        body: JSON.stringify({
          cuadreId: cuadre.id,
          overridesByConsignacionId,
          forceHistorical,
        }),
      });

      if (response.result.createdCount > 0 && response.result.pendingCount === 0) {
        toast.success(
          forceHistorical
            ? 'Cuadre reprocesado y distribuido correctamente entre sus consignaciones'
            : 'Consignaciones registradas en el libro bancario'
        );
      } else if (response.result.createdCount > 0) {
        toast.success('Se registraron las consignaciones con cuenta resuelta y quedaron otras pendientes');
      } else if (response.result.informativeCount) {
        toast.success('Solo habia movimientos informativos a cuenta no registrada. No se genero ingreso en libro.');
      } else {
        toast.error('No hubo cambios nuevos para registrar');
      }

      await fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo registrar el cuadre en libro bancario');
    } finally {
      setSyncingCuadreId('');
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
        <h1 className="text-3xl font-bold text-white drop-shadow">Ingresos Bancarios</h1>
        <p className="text-white/80 mt-1 drop-shadow">
          Primero registra en libro cada consignacion real del cuadre y luego administra categorias,
          pagos y flujo de dinero.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Registro de Consignaciones Aprobadas</h3>
            <p className="text-sm text-gray-500 mt-1">
              Cada cuadre puede generar uno o varios ingresos segun las consignaciones que haya
              realizado el PDV.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Filtrar por PDV">
              <select
                value={selectedPdvId}
                onChange={(e) => setSelectedPdvId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="">Todos los PDV</option>
                {pdvOptions.map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>
                    {pdv.nombre}{pdv.ciudad ? ` - ${pdv.ciudad}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-5">
            {visibleCuadres.map((cuadre) => {
              const consignaciones = getCuadreConsignacionesRegistrables({
                firma_cajero_url: cuadre.firma_cajero_url,
                url_foto_consignacion: cuadre.url_foto_consignacion,
                valor_consignado: cuadre.valor_consignado,
              }).map((consignacion) => ({
                key: getConsignacionKey(cuadre.id, consignacion.id),
                cuadreId: cuadre.id,
                consignacionId: consignacion.id,
                valor: consignacion.valor,
                descripcionCuenta: consignacion.descripcionCuenta,
                suggestedAccountId: findAccountIdByConsignacion(cuentas, consignacion),
                titular: consignacion.titular,
                isInformative: consignacion.isInformative,
              }));

              const consignacionesRegistrables = consignaciones.filter(
                (consignacion) => !consignacion.isInformative
              );
              const consignacionesInformativas = consignaciones.filter(
                (consignacion) => consignacion.isInformative
              );
              const totalRegistrado = consignacionesRegistrables.filter((consignacion) =>
                movimientosPorClave.has(consignacion.key)
              ).length;
              const onlyInformative =
                consignaciones.length > 0 && consignacionesRegistrables.length === 0;
              const allRegistered =
                consignacionesRegistrables.length > 0 &&
                totalRegistrado === consignacionesRegistrables.length &&
                !legacyCuadres.has(cuadre.id);

              return (
                <div key={cuadre.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {cuadre.punto_de_venta?.nombre || 'PDV sin nombre'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(cuadre.fecha)} · {cuadre.punto_de_venta?.ciudad || 'Sin ciudad'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Total consignado reportado: {formatCOP(Number(cuadre.valor_consignado || 0))}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          consignaciones.length === 0
                            ? 'bg-gray-100 text-gray-700'
                            : onlyInformative
                              ? 'bg-slate-100 text-slate-700'
                            : allRegistered
                              ? 'bg-green-100 text-green-700'
                              : legacyCuadres.has(cuadre.id)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {consignaciones.length === 0
                          ? 'Sin consignacion'
                          : onlyInformative
                            ? 'Solo informativo'
                          : allRegistered
                            ? 'Todo registrado'
                            : legacyCuadres.has(cuadre.id)
                              ? 'Carga antigua por repartir'
                              : 'Pendiente por completar'}
                      </span>
                      {consignacionesInformativas.length > 0 && (
                        <p className="text-xs text-slate-600">
                          Las consignaciones hechas a cuenta no registrada se muestran como soporte y no se asignan al libro.
                        </p>
                      )}
                      {legacyCuadres.has(cuadre.id) && (
                        <p className="text-xs text-amber-700">
                          Este cuadre tenia una carga vieja global. Al guardarlo se reparte por consignacion.
                        </p>
                      )}
                    </div>
                  </div>

                  {consignaciones.length > 0 ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[920px] table-fixed">
                        <thead className="bg-light">
                          <tr>
                            <th className="px-3 py-3 text-left text-sm font-semibold text-gray-700">Consignacion</th>
                            <th className="px-3 py-3 text-right text-sm font-semibold text-gray-700">Valor</th>
                            <th className="px-3 py-3 text-left text-sm font-semibold text-gray-700">Cuenta Detectada</th>
                            <th className="px-3 py-3 text-left text-sm font-semibold text-gray-700">Cuenta en Libro</th>
                            <th className="px-3 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {consignaciones.map((consignacion, index) => {
                            const selectedAccountId =
                              syncAccountByConsignacion[consignacion.key] || consignacion.suggestedAccountId || '';
                            const existingMovement = consignacion.isInformative
                              ? undefined
                              : movimientosPorClave.get(consignacion.key);
                            const accountChanged = existingMovement
                              ? existingMovement.cuenta_id !== selectedAccountId
                              : false;

                            return (
                              <tr key={consignacion.key}>
                                <td className="px-3 py-3 text-sm text-gray-900">
                                  <p className="font-medium">Consignacion {index + 1}</p>
                                  <p className="text-xs text-gray-500">{consignacion.descripcionCuenta}</p>
                                </td>
                                <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900">
                                  {formatCOP(consignacion.valor)}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-600">
                                  <p>{consignacion.descripcionCuenta}</p>
                                  {consignacion.titular && (
                                    <p className="text-xs text-gray-500">Titular: {consignacion.titular}</p>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-600">
                                  {consignacion.isInformative ? (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="font-medium text-slate-700">No aplica</p>
                                      <p className="text-xs text-slate-600">
                                        Movimiento informado a cuenta no registrada o de tercero.
                                      </p>
                                    </div>
                                  ) : (
                                    <select
                                      value={selectedAccountId}
                                      disabled={syncingCuadreId === cuadre.id}
                                      onChange={(e) =>
                                        setSyncAccountByConsignacion((current) => ({
                                          ...current,
                                          [consignacion.key]: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                                    >
                                      <option value="">Selecciona la cuenta real</option>
                                      {cuentas.map((account) => (
                                        <option key={account.id} value={account.id}>
                                          {account.nombre}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-sm">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs ${
                                      consignacion.isInformative
                                        ? 'bg-slate-100 text-slate-700'
                                        : existingMovement && !accountChanged
                                        ? 'bg-green-100 text-green-700'
                                        : selectedAccountId
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {consignacion.isInformative
                                      ? 'Informativo'
                                      : existingMovement && !accountChanged
                                      ? 'Registrado'
                                      : selectedAccountId
                                        ? 'Listo para guardar'
                                        : 'Pendiente'}
                                  </span>
                                  {consignacion.isInformative && (
                                    <p className="mt-1 text-xs text-slate-600">
                                      Se conserva como justificacion del movimiento, pero no genera ingreso en libro.
                                    </p>
                                  )}
                                  {accountChanged && (
                                    <p className="mt-1 text-xs text-amber-700">
                                      Cambiaste la cuenta. Al guardar se reprocesa el cuadre.
                                    </p>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">
                      Este cuadre no tiene consignaciones con valor para llevar al libro bancario.
                    </p>
                  )}

                  {consignacionesRegistrables.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => syncCuadre(cuadre, consignaciones)}
                        disabled={syncingCuadreId === cuadre.id}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {syncingCuadreId === cuadre.id
                          ? 'Guardando...'
                          : legacyCuadres.has(cuadre.id) || totalRegistrado > 0
                            ? 'Reprocesar cuadre'
                            : 'Registrar consignaciones'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleCuadres.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                {selectedPdvId
                  ? 'No hay cuadres aprobados de ese PDV para revisar en ingresos bancarios.'
                  : 'No hay cuadres aprobados para revisar en ingresos bancarios.'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-white/30 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Categorias Financieras</h3>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <Field label="Nombre">
              <input
                value={categoryForm.nombre}
                onChange={(e) => setCategoryForm({ ...categoryForm, nombre: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
            </Field>
            <Field label="Tipo">
              <select
                value={categoryForm.tipo}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, tipo: e.target.value as CategoriaFinanciera['tipo'] })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="ambos">Ambos</option>
              </select>
            </Field>
            <Field label="Descripcion">
              <textarea
                value={categoryForm.descripcion}
                onChange={(e) => setCategoryForm({ ...categoryForm, descripcion: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg min-h-24"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={categoryForm.activa}
                onChange={(e) => setCategoryForm({ ...categoryForm, activa: e.target.checked })}
              />
              Categoria activa
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingCategory}
                className="flex-1 px-4 py-3 bg-primary text-white rounded-lg"
              >
                {categoryForm.id ? 'Guardar Categoria' : 'Crear Categoria'}
              </button>
              {categoryForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setCategoryForm({ id: '', nombre: '', tipo: 'ambos', descripcion: '', activa: true })
                  }
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
                    <p className="text-xs text-gray-500">
                      {category.tipo} · {category.es_sistema ? 'Sistema' : 'Personalizada'}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      category.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {category.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </button>
            ))}
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
