'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildFinancialConsignacionAccountId,
  CUENTAS_CONSIGNACION,
  calcCuadreMetrics,
  formatCOP,
  formatDate,
  getConsignacionSoportes,
  getGastoCategoriaLabel,
  getCuentaConsignacionById,
  getTodayString,
  GASTO_CATEGORIA_MAQUINARIA_CODE,
  GASTO_CATEGORIA_TRANSPORTE_CODE,
  normalizeGastoCategoria,
  serializeConsignacionMetadata,
  type CuentaConsignacionPredefinida,
  type ConsignacionSoporte,
  type OtraCuentaConsignacion,
} from '@/lib/utils';
import { Loader2, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CuadreDiario, Usuario, PuntoDeVenta, GastoDiario, PagoTurnero, SupabaseError } from '@/types';
import UploadFoto from '@/components/UploadFoto';
import toast from 'react-hot-toast';

const categoriasGastos = [
  { value: 'Mantenimiento y Reparaciones', label: 'Mantenimiento y Reparaciones' },
  { value: 'Pagos Tecnico - Auditor Mecanico', label: 'Pagos Tecnico - Auditor Mecanico' },
  { value: 'Servicio Publicos y Telefono', label: 'Servicio Publicos y Telefono' },
  { value: 'Turnos', label: 'Turnos' },
  { value: GASTO_CATEGORIA_TRANSPORTE_CODE, label: 'Transporte, Fletes y Acarreos' },
  { value: GASTO_CATEGORIA_MAQUINARIA_CODE, label: 'Maquinaria y Repuestos' },
  { value: 'Fiestas', label: 'Fiestas' },
  { value: 'Abonos fiestas consignadas', label: 'Abonos fiestas consignadas' },
  { value: 'Compra redencion', label: 'Compra redencion' },
  { value: 'Peluches', label: 'Peluches' },
  { value: 'Utiles-Papeleria y Fotocopias', label: 'Utiles-Papeleria y Fotocopias' },
  { value: 'Base Refrigierios y H20', label: 'Base Refrigierios y H20' },
  { value: 'Bioseguridad', label: 'Bioseguridad' },
  { value: 'Publicidad y avisos varios', label: 'Publicidad y avisos varios' },
  { value: 'Compra de aseo', label: 'Compra de aseo' },
  { value: 'Viaticos-Pago hotel', label: 'Viaticos-Pago hotel' },
  { value: 'Tarjetas malas y devoluciones', label: 'Tarjetas malas y devoluciones' },
  { value: 'Anticipo a Contratistas y Otros', label: 'Anticipo a Contratistas y Otros' },
  { value: 'Reembolso de Caja Menor', label: 'Reembolso de Caja Menor' },
  { value: 'Otros', label: 'Otros' },
];

function CuadreWizardFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

type CuentaConsignacionRegistrada = CuentaConsignacionPredefinida;

function CuadreWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emptyOtraCuenta: OtraCuentaConsignacion = {
    banco: '',
    numeroCuenta: '',
    tipoCuenta: '',
    titular: '',
  };
  const createEmptyConsignacion = (): ConsignacionSoporte => ({
    id: `consignacion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fotoUrl: '',
    valor: 0,
    cuentaId: '',
    titular: '',
    otraCuenta: null,
    banco: '',
    tipoCuenta: '',
    numeroCuenta: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [cuadre, setCuadre] = useState<CuadreDiario | null>(null);
  const [gastos, setGastos] = useState<GastoDiario[]>([]);
  const [turneros, setTurneros] = useState<PagoTurnero[]>([]);
  const [showGastoModal, setShowGastoModal] = useState(false);
  const [showConsignacionModal, setShowConsignacionModal] = useState(false);
  const [newGasto, setNewGasto] = useState<Partial<GastoDiario>>({});
  const [consignacionCompleta, setConsignacionCompleta] = useState(true);
  const [valorConsignadoInput, setValorConsignadoInput] = useState<number | ''>('');
  const [nuevoPendienteConsignacion, setNuevoPendienteConsignacion] = useState<number | null>(null);
  const [readyToSend, setReadyToSend] = useState(false);
  const [pendienteArrastreActual, setPendienteArrastreActual] = useState(0);
  const initGuardRef = useRef<string | null>(null);
  const [cuentasConsignacionRegistradas, setCuentasConsignacionRegistradas] = useState<
    CuentaConsignacionRegistrada[]
  >(CUENTAS_CONSIGNACION);

  // Local state for form fields to prevent lag
  const [localCuadre, setLocalCuadre] = useState<Partial<CuadreDiario>>({});
  const [consignacionSoportes, setConsignacionSoportes] = useState<ConsignacionSoporte[]>([]);

  // Obtener la fecha desde App Router para evitar que el primer render use la fecha de hoy por error.
  const fechaSeleccionada = searchParams.get('date') || getTodayString();

  const normalizeCuadreVentas = (c: any) => {
    const ventaAreasComunes = Number(c?.venta_confiteria ?? c?.recibos ?? 0) || 0;
    const recibos = Number(c?.recibos ?? c?.venta_confiteria ?? 0) || 0;
    return {
      ...c,
      venta_confiteria: ventaAreasComunes,
      recibos,
    };
  };

  const hydrateConsignacionState = (record: any) => {
    setConsignacionSoportes(getConsignacionSoportes(record));
  };

  const hydrateConsignacionConfirmationState = (record: any, pendienteBase: number) => {
    const consignaHoyRecord = (record?.consigna_hoy ?? true) === true;
    const valorConsignadoRecord = Number(record?.valor_consignado || 0);
    const pendienteRecord = Number(record?.consignacion_pendiente || 0);

    setPendienteArrastreActual(pendienteBase);

    if (!consignaHoyRecord) {
      setConsignacionCompleta(false);
      setValorConsignadoInput(0);
      setNuevoPendienteConsignacion(pendienteRecord);
      setReadyToSend(true);
      return;
    }

    if (valorConsignadoRecord > 0 || pendienteRecord > 0) {
      setConsignacionCompleta(pendienteRecord === 0);
      setValorConsignadoInput(valorConsignadoRecord);
      setNuevoPendienteConsignacion(pendienteRecord);
      setReadyToSend(true);
      return;
    }

    setConsignacionCompleta(true);
    setValorConsignadoInput('');
    setNuevoPendienteConsignacion(null);
    setReadyToSend(false);
  };

  const getConsignacionMetadataPayload = (overrides?: {
    consignaciones?: ConsignacionSoporte[];
  }) => {
    const nextConsignaciones = overrides?.consignaciones ?? consignacionSoportes;
    const consignacionesConFoto = nextConsignaciones.filter((consignacion) => Boolean(consignacion.fotoUrl));
    const primeraConsignacion = consignacionesConFoto[0];

    return serializeConsignacionMetadata({
      cuentaId: primeraConsignacion?.cuentaId || undefined,
      otraCuenta: primeraConsignacion?.cuentaId === 'otra' ? primeraConsignacion.otraCuenta || null : null,
      fotos: consignacionesConFoto.map((consignacion) => consignacion.fotoUrl || '').filter(Boolean).slice(1),
      consignaciones: nextConsignaciones,
    });
  };

  useEffect(() => {
    if (initGuardRef.current === fechaSeleccionada) {
      return;
    }
    initGuardRef.current = fechaSeleccionada;

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userError || !userData) {
          toast.error('No se encontró el usuario en la base de datos');
          router.push('/login');
          return;
        }

        if (!userData.punto_de_venta_id) {
          toast.error('Este usuario no tiene asignado un punto de venta');
          router.push('/admin');
          setLoading(false);
          return;
        }

        const { data: puntoVentaData, error: pdvError } = await supabase
          .from('puntos_de_venta')
          .select('*')
          .eq('id', userData.punto_de_venta_id)
          .single();

        if (pdvError) {
          toast.error('Error al obtener el punto de venta: ' + pdvError.message);
        }

        const { data: cuentasFinancierasData } = await supabase
          .from('cuentas_financieras')
          .select('id,banco,titular,numero_cuenta,tipo_cuenta')
          .eq('estado', 'activa')
          .eq('tipo_entidad', 'bancaria')
          .order('nombre');

        const cuentasMap = new Map<string, CuentaConsignacionRegistrada>();
        CUENTAS_CONSIGNACION.forEach((cuenta) => {
          cuentasMap.set(`${cuenta.banco}::${cuenta.tipoCuenta}::${cuenta.numeroCuenta}`, cuenta);
        });
        (cuentasFinancierasData || []).forEach((cuenta) => {
          const banco = String(cuenta.banco || '').trim();
          const tipoCuenta = String(cuenta.tipo_cuenta || '').trim();
          const numeroCuenta = String(cuenta.numero_cuenta || '').trim();

          if (!banco || !tipoCuenta || !numeroCuenta) {
            return;
          }

          const key = `${banco}::${tipoCuenta}::${numeroCuenta}`;
          if (!cuentasMap.has(key)) {
            cuentasMap.set(key, {
              id: buildFinancialConsignacionAccountId(cuenta.id),
              banco,
              tipoCuenta,
              numeroCuenta,
              titular: String(cuenta.titular || '').trim(),
            });
          }
        });
        setCuentasConsignacionRegistradas(Array.from(cuentasMap.values()));

        setUser(userData);
        setPuntoVenta(puntoVentaData || null);

        const fetchCuadreByFecha = async () => {
          const { data, error } = await supabase
            .from('cuadres_diarios')
            .select('*')
            .eq('punto_de_venta_id', userData.punto_de_venta_id)
            .eq('fecha', fechaSeleccionada)
            .maybeSingle();
          if (error) throw error;
          return data;
        };

        const { data: cuadresAnteriores } = await supabase
          .from('cuadres_diarios')
          .select('consignacion_pendiente,fecha,consigna_hoy,url_foto_consignacion,valor_consignado,estado')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .lt('fecha', fechaSeleccionada)
          .order('fecha', { ascending: false })
          .limit(60);

        const ultimoCuadreCerrado = (cuadresAnteriores || []).find((c) => {
          if ((c.estado || '') === 'borrador' || (c.estado || '') === 'devuelto') {
            return false;
          }

          const consignaHoyAnterior = (c.consigna_hoy ?? true) === true;
          const cerrado =
            !consignaHoyAnterior ||
            Boolean(c.url_foto_consignacion) ||
            (Number(c.valor_consignado) || 0) > 0 ||
            (c.estado || '') === 'pendiente';

          if (!cerrado) return false;
          return true;
        });

        const pendienteArrastre = Number(ultimoCuadreCerrado?.consignacion_pendiente || 0);

        let existingCuadre = await fetchCuadreByFecha();

        if (existingCuadre) {
          // El cuadre ya existe, lo cargamos
          // Cargamos las relaciones por separado
          const [gastosRes, turnerosRes] = await Promise.all([
            supabase.from('gastos_diarios').select('*').eq('cuadre_id', existingCuadre.id),
            supabase.from('pagos_turneros').select('*').eq('cuadre_id', existingCuadre.id),
          ]);

          // Combinamos los datos
          const shouldApplyPendienteArrastre =
            (existingCuadre.estado === 'borrador' || existingCuadre.estado === 'pendiente') &&
            Number(existingCuadre.consignacion_pendiente || 0) === 0 &&
            pendienteArrastre > 0;

          const cuadreCompleto = {
            ...existingCuadre,
            consignacion_pendiente: shouldApplyPendienteArrastre ? pendienteArrastre : existingCuadre.consignacion_pendiente,
            gastos_diarios: gastosRes.data,
            pagos_turneros: turnerosRes.data,
          };

          const normalized = normalizeCuadreVentas(cuadreCompleto);
          setCuadre(normalized);
          setLocalCuadre(normalized);
          hydrateConsignacionState(normalized);
          const consignaHoyExistente = (existingCuadre.consigna_hoy ?? true) === true;
          const pendienteBaseActual =
            consignaHoyExistente && (Number(existingCuadre.valor_consignado || 0) > 0)
              ? pendienteArrastre
              : Number((shouldApplyPendienteArrastre ? pendienteArrastre : existingCuadre.consignacion_pendiente) || 0);
          hydrateConsignacionConfirmationState(normalized, pendienteBaseActual);
          if (shouldApplyPendienteArrastre) {
            await supabase
              .from('cuadres_diarios')
              .update({ consignacion_pendiente: pendienteArrastre, updated_at: new Date().toISOString() })
              .eq('id', existingCuadre.id);
          }
          if (cuadreCompleto.gastos_diarios) setGastos(cuadreCompleto.gastos_diarios);
          if (cuadreCompleto.pagos_turneros) setTurneros(cuadreCompleto.pagos_turneros);
        } else {
          // No hay cuadre, lo creamos
          const newCuadreData = {
            punto_de_venta_id: userData.punto_de_venta_id,
            usuario_id: userData.id,
            fecha: fechaSeleccionada,
            estado: 'borrador',
            recaudo: 0,
            venta_tarjetas: 0,
            venta_fiesta: 0,
            recibos: 0,
            venta_cajero_auto: 0,
            tar_inicial: 0,
            tar_consumo: 0,
            tar_fiestas: 0,
            tar_malas: 0,
            tar_final: 0,
            total_fisico: 0,
            total_sistema: 0,
            sobrante: 0,
            faltante: 0,
            consignacion_pendiente: pendienteArrastre,
            valor_consignado: 0,
            consigna_hoy: true,
          };
          
          const doInsert = async (payload: Record<string, any>) => {
            const { error } = await supabase.from('cuadres_diarios').insert(payload);
            if (error) throw error;
          };

          try {
            await doInsert(newCuadreData as any);
          } catch (e: any) {
            const msg = String(e?.message || '');
            const match = msg.match(/Could not find the '([^']+)' column/i);
            const missingColumn = match?.[1];
            if (e?.code === '23505') {
              // Ya existe (race condition / doble ejecución), continuamos y lo leemos abajo
            } else if (e?.code === 'PGRST204' && missingColumn && missingColumn in (newCuadreData as any)) {
              const retryData = { ...(newCuadreData as any) };
              delete retryData[missingColumn];
              try {
                await doInsert(retryData);
              } catch (e2: any) {
                if (e2?.code !== '23505') throw e2;
              }
            } else {
              throw e;
            }
          }

          const createdOrExisting = await fetchCuadreByFecha();
          if (!createdOrExisting) {
            throw new Error('No se pudo crear el cuadre');
          }

          const normalized = normalizeCuadreVentas(createdOrExisting);
          setCuadre(normalized);
          setLocalCuadre(normalized);
          hydrateConsignacionState(normalized);
          hydrateConsignacionConfirmationState(normalized, pendienteArrastre);
        }
      } catch (error) {
        console.error('Error en la inicialización:', error);
        const err = error as SupabaseError;
        toast.error(err?.message ? `Error al inicializar el cuadre: ${err.message}` : 'Ocurrió un error al inicializar el cuadre');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router, fechaSeleccionada]);

  const saveCuadre = async (
    updates: Partial<CuadreDiario>,
    options?: {
      background?: boolean;
    }
  ) => {
    if (!cuadre?.id) return;
    const shouldToggleSaving = options?.background !== true;
    if (shouldToggleSaving) {
      setSaving(true);
    }
    try {
      const normalizedUpdates: any = { ...(updates as any) };
      if (normalizedUpdates.venta_confiteria !== undefined && normalizedUpdates.recibos === undefined) {
        normalizedUpdates.recibos = normalizedUpdates.venta_confiteria;
      }
      delete normalizedUpdates.venta_confiteria;

      // Lista de campos que realmente existen en la tabla cuadres_diarios (conocidos)
      const allowedFields = [
        'punto_de_venta_id', 'usuario_id', 'fecha', 'estado',
        'recaudo', 'venta_tarjetas', 'venta_fiesta', 'venta_cajero_auto', 'recibos',
        'tar_inicial', 'tar_consumo', 'tar_fiestas', 'tar_malas', 'tar_final',
        'total_fisico', 'total_sistema', 'sobrante', 'faltante',
        'url_foto_consignacion', 'firma_cajero_url', 'nombre_administradora', 'cedula_administradora', 'observaciones',
        'fecha_envio', 'fecha_aprobacion', 'observacion_superadmin',
        'consignacion_pendiente', 'valor_consignado', 'consigna_hoy'
      ];

      // Filtrar solo los campos permitidos
      const cleanUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (normalizedUpdates[key] !== undefined) {
          cleanUpdates[key] = normalizedUpdates[key];
        }
      }

      const doUpdate = async (payload: Record<string, any>) => {
        const { data, error } = await supabase
          .from('cuadres_diarios')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', cuadre.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      };

      let data: any;
      try {
        data = await doUpdate(cleanUpdates);
      } catch (e: any) {
        const msg = String(e?.message || '');
        const match = msg.match(/Could not find the '([^']+)' column/i);
        const missingColumn = match?.[1];
        if (e?.code === 'PGRST204' && missingColumn && missingColumn in cleanUpdates) {
          const retryUpdates = { ...cleanUpdates };
          delete retryUpdates[missingColumn];
          data = await doUpdate(retryUpdates);
        } else {
          throw e;
        }
      }

      // Combinar la data guardada con las relaciones (gastos, etc.) que teníamos antes
      const updatedCuadre = {
        ...data,
        gastos_diarios: cuadre.gastos_diarios,
        pagos_turneros: cuadre.pagos_turneros,
        punto_de_venta: cuadre.punto_de_venta,
        usuario: cuadre.usuario,
      };
      
      const normalized = normalizeCuadreVentas(updatedCuadre);
      setCuadre(normalized);
      setLocalCuadre(normalized);
    } catch (error) {
      console.error('Error en saveCuadre:', error);
      toast.error('Error al guardar');
    } finally {
      if (shouldToggleSaving) {
        setSaving(false);
      }
    }
  };

  // Total Ventas por Medio (solo para información)
  const totalVentasMedio =
    (localCuadre?.venta_tarjetas || 0) +
    (localCuadre?.venta_fiesta || 0) +
    (localCuadre?.venta_cajero_auto || 0) +
    (localCuadre?.venta_confiteria || 0);
  
  const cuadreMetrics = calcCuadreMetrics({
    context: 'draft',
    recaudo: localCuadre?.recaudo,
    venta_tarjetas: localCuadre?.venta_tarjetas,
    consignacion_pendiente: pendienteArrastreActual,
    gastos,
    turneros,
  });

  const totalGastos = cuadreMetrics.totalGastos;
  const totalTurneros = cuadreMetrics.totalTurneros;
  const totalDeducciones = cuadreMetrics.totalDeducciones;
  const ventaSistema = cuadreMetrics.ventaSistema;
  const ventaDatafono = cuadreMetrics.ventaDatafono;
  const totalEfectivoEsperado = cuadreMetrics.totalEfectivoEsperado;
  const totalEfectivoConPendiente = cuadreMetrics.totalGeneralAConsignar;

  const tarFinal =
    (localCuadre?.tar_inicial || 0) -
    (localCuadre?.tar_consumo || 0) -
    (localCuadre?.tar_fiestas || 0) -
    (localCuadre?.tar_malas || 0);

  const consignaHoy = (localCuadre?.consigna_hoy ?? true) === true;
  const consignacionesConFoto = consignacionSoportes.filter((consignacion) => Boolean(consignacion.fotoUrl));
  const fotoConsignacionPrincipal =
    consignacionesConFoto[0]?.fotoUrl ||
    (typeof localCuadre?.url_foto_consignacion === 'string' ? localCuadre.url_foto_consignacion : null) ||
    cuadre?.url_foto_consignacion ||
    null;
  const hayFotoConsignacion = consignacionesConFoto.length > 0;
  const bancosConsignacionDisponibles = Array.from(
    new Set(cuentasConsignacionRegistradas.map((cuenta) => cuenta.banco))
  );

  const getTiposCuentaDisponibles = (banco: string) =>
    Array.from(
      new Set(
        cuentasConsignacionRegistradas
          .filter((cuenta) => cuenta.banco === banco)
          .map((cuenta) => cuenta.tipoCuenta)
      )
    );

  const getCuentasDisponibles = (banco: string, tipoCuenta: string) =>
    cuentasConsignacionRegistradas.filter(
      (cuenta) => cuenta.banco === banco && cuenta.tipoCuenta === tipoCuenta
    );

  const getCuentaPredefinidaSeleccionada = (consignacion: ConsignacionSoporte) =>
    cuentasConsignacionRegistradas.find((cuenta) => cuenta.id === consignacion.cuentaId) ||
    getCuentaConsignacionById(consignacion.cuentaId) ||
    getCuentasDisponibles(consignacion.banco || '', consignacion.tipoCuenta || '').find(
      (cuenta) => cuenta.numeroCuenta === consignacion.numeroCuenta
    ) ||
    null;

  const isOtraCuentaCompleta = (otraCuenta?: OtraCuentaConsignacion | null) =>
    [
      otraCuenta?.banco || '',
      otraCuenta?.numeroCuenta || '',
      otraCuenta?.tipoCuenta || '',
      otraCuenta?.titular || '',
    ].every((value) => value.trim());

  const isConsignacionSoporteValida = (consignacion: ConsignacionSoporte) =>
    consignacion.cuentaId === 'otra'
      ? isOtraCuentaCompleta(consignacion.otraCuenta)
      : Boolean(consignacion.cuentaId);

  const cuentaConsignacionValida =
    !consignaHoy ||
    consignacionSoportes.length === 0 ||
    consignacionSoportes.every(isConsignacionSoporteValida);
  const valorConsignadoConfirmado = readyToSend ? Number(valorConsignadoInput) || 0 : 0;
  const pendienteProximoCuadre = consignaHoy
    ? readyToSend
      ? Math.max(0, totalEfectivoConPendiente - valorConsignadoConfirmado)
      : totalEfectivoConPendiente
    : totalEfectivoConPendiente;

  const persistConsignacionMetadata = async (overrides?: {
    consignaciones?: ConsignacionSoporte[];
    consignaHoy?: boolean;
    valorConsignado?: number;
  }) => {
    const nextConsignaciones = overrides?.consignaciones ?? consignacionSoportes;
    const consignacionesConFoto = nextConsignaciones.filter((consignacion) => Boolean(consignacion.fotoUrl));
    const principal = consignacionesConFoto[0]?.fotoUrl ?? null;
    const primeraConsignacion = consignacionesConFoto[0];

    setConsignacionSoportes(nextConsignaciones);
    setLocalCuadre((prev) => ({
      ...prev,
      url_foto_consignacion: principal,
      consigna_hoy: overrides?.consignaHoy ?? prev?.consigna_hoy,
    }));

    await saveCuadre({
      url_foto_consignacion: principal,
      firma_cajero_url: serializeConsignacionMetadata({
        cuentaId: primeraConsignacion?.cuentaId || undefined,
        titular: primeraConsignacion?.titular || undefined,
        banco: primeraConsignacion?.banco || undefined,
        tipoCuenta: primeraConsignacion?.tipoCuenta || undefined,
        numeroCuenta: primeraConsignacion?.numeroCuenta || undefined,
        otraCuenta: primeraConsignacion?.cuentaId === 'otra' ? primeraConsignacion.otraCuenta || null : null,
        fotos: consignacionesConFoto.map((consignacion) => consignacion.fotoUrl || '').filter(Boolean).slice(1),
        consignaciones: nextConsignaciones,
      }),
      ...(overrides?.consignaHoy !== undefined ? { consigna_hoy: overrides.consignaHoy } : {}),
      ...(overrides?.valorConsignado !== undefined ? { valor_consignado: overrides.valorConsignado } : {}),
    });
  };

  const updateConsignacionLocal = (consignacionId: string, updater: (consignacion: ConsignacionSoporte) => ConsignacionSoporte) =>
    consignacionSoportes.map((consignacion) =>
      consignacion.id === consignacionId ? updater(consignacion) : consignacion
    );

  const handleAddConsignacion = () => {
    setConsignacionSoportes((prev) => [...prev, createEmptyConsignacion()]);
  };

  const handleDeleteConsignacion = async (consignacionId: string) => {
    const nextConsignaciones = consignacionSoportes.filter((consignacion) => consignacion.id !== consignacionId);
    await persistConsignacionMetadata({
      consignaciones: nextConsignaciones,
      valorConsignado: nextConsignaciones.some((consignacion) => consignacion.fotoUrl) ? undefined : 0,
    });

    if (!nextConsignaciones.some((consignacion) => consignacion.fotoUrl)) {
      setReadyToSend(false);
      setNuevoPendienteConsignacion(null);
      setValorConsignadoInput('');
    }
  };

  const handleConsignacionModeChange = async (consignacionId: string, mode: 'registrada' | 'otra') => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => ({
      ...consignacion,
      cuentaId: mode === 'otra' ? 'otra' : '',
      titular: '',
      otraCuenta: mode === 'otra' ? consignacion.otraCuenta || { ...emptyOtraCuenta } : null,
      banco: '',
      tipoCuenta: '',
      numeroCuenta: '',
    }));
    setConsignacionSoportes(nextConsignaciones);
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const handleBancoConsignacionChange = async (consignacionId: string, nextBanco: string) => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => ({
      ...consignacion,
      banco: nextBanco,
      tipoCuenta: '',
      numeroCuenta: '',
      cuentaId: '',
      titular: '',
      otraCuenta: null,
    }));
    setConsignacionSoportes(nextConsignaciones);
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const handleTipoCuentaConsignacionChange = async (consignacionId: string, nextTipoCuenta: string) => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => ({
      ...consignacion,
      tipoCuenta: nextTipoCuenta,
      numeroCuenta: '',
      cuentaId: '',
      titular: '',
      otraCuenta: null,
    }));
    setConsignacionSoportes(nextConsignaciones);
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const handleNumeroCuentaConsignacionChange = async (consignacionId: string, nextNumeroCuenta: string) => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => {
      const cuentaSeleccionada = cuentasConsignacionRegistradas.find(
        (cuenta) =>
          cuenta.banco === consignacion.banco &&
          cuenta.tipoCuenta === consignacion.tipoCuenta &&
          cuenta.numeroCuenta === nextNumeroCuenta
      );
      return {
        ...consignacion,
        numeroCuenta: nextNumeroCuenta,
        cuentaId: cuentaSeleccionada?.id || '',
        titular: cuentaSeleccionada?.titular || '',
        otraCuenta: null,
      };
    });
    setConsignacionSoportes(nextConsignaciones);
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const handleOtraCuentaFieldChange = (consignacionId: string, field: keyof OtraCuentaConsignacion, value: string) => {
    setConsignacionSoportes((prev) =>
      prev.map((consignacion) =>
        consignacion.id === consignacionId
          ? {
              ...consignacion,
              cuentaId: 'otra',
              otraCuenta: {
                ...(consignacion.otraCuenta || emptyOtraCuenta),
                [field]: value,
              },
            }
          : consignacion
      )
    );
  };

  const saveOtraCuentaConsignacion = async (consignacionId: string) => {
    const nextConsignaciones = consignacionSoportes.map((consignacion) =>
      consignacion.id === consignacionId
        ? {
            ...consignacion,
            cuentaId: 'otra',
            otraCuenta: consignacion.otraCuenta || { ...emptyOtraCuenta },
          }
        : consignacion
    );
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const nextStep = async () => {
    // Save local state to database before moving to next step
    await saveCuadre(localCuadre);
    if (step < 6) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const enviarCuadre = async () => {
    if (!cuadre?.id) return;
    if (!cuentaConsignacionValida) {
      toast.error('Completa la cuenta correspondiente en cada consignación registrada');
      return;
    }
    setSaving(true);
    try {
      const consignaHoy = (localCuadre?.consigna_hoy ?? true) === true;
      const nuevoEstado = consignaHoy ? (hayFotoConsignacion ? 'enviado' : 'pendiente') : 'enviado';
      
      const updates = {
        ...localCuadre,
        total_fisico: 0,
        total_sistema: totalEfectivoEsperado,
        sobrante: 0,
        faltante: 0,
        tar_final: tarFinal,
        estado: nuevoEstado as 'enviado' | 'pendiente',
        fecha_envio: new Date().toISOString(),
        observacion_superadmin: '',
        firma_cajero_url: consignaHoy
          ? getConsignacionMetadataPayload()
          : serializeConsignacionMetadata({ cuentaId: '', otraCuenta: null, fotos: [], consignaciones: [] }),
        ...(consignaHoy
          ? {
              url_foto_consignacion: fotoConsignacionPrincipal,
              valor_consignado: valorConsignadoConfirmado,
              consignacion_pendiente: pendienteProximoCuadre,
            }
          : {
              url_foto_consignacion: null,
              valor_consignado: 0,
              consignacion_pendiente: totalEfectivoConPendiente,
            }),
      };
      
      await saveCuadre(updates);
      
      toast.success(
        nuevoEstado === 'enviado'
          ? 'Cuadre enviado exitosamente'
          : 'Cuadre guardado como Pendiente (falta foto de consignación)'
      );
      router.push('/admin');
    } catch (error: unknown) {
      console.error('Error en enviarCuadre:', error);
      const err = error as SupabaseError;
      toast.error(err.message || 'Error al enviar el cuadre');
    } finally {
      setSaving(false);
    }
  };

  const handleFotoConsignacionUpload = async (consignacionId: string, url: string) => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => ({
      ...consignacion,
      fotoUrl: url,
    }));
    await persistConsignacionMetadata({
      consignaciones: nextConsignaciones,
      consignaHoy: true,
    });
  };

  const handleValorConsignacionSoporteChange = (consignacionId: string, value: number) => {
    setConsignacionSoportes((prev) =>
      prev.map((consignacion) =>
        consignacion.id === consignacionId
          ? {
              ...consignacion,
              valor: value,
            }
          : consignacion
      )
    );
  };

  const saveValorConsignacionSoporte = async (consignacionId: string) => {
    const nextConsignaciones = consignacionSoportes.map((consignacion) =>
      consignacion.id === consignacionId
        ? {
            ...consignacion,
            valor: Number(consignacion.valor) || 0,
          }
        : consignacion
    );
    await persistConsignacionMetadata({ consignaciones: nextConsignaciones });
  };

  const handleRemoveFotoConsignacion = async (consignacionId: string) => {
    const nextConsignaciones = updateConsignacionLocal(consignacionId, (consignacion) => ({
      ...consignacion,
      fotoUrl: '',
    }));
    await persistConsignacionMetadata({
      consignaciones: nextConsignaciones,
      valorConsignado: nextConsignaciones.some((consignacion) => consignacion.fotoUrl) ? undefined : 0,
    });

    if (!nextConsignaciones.some((consignacion) => consignacion.fotoUrl)) {
      setReadyToSend(false);
      setNuevoPendienteConsignacion(null);
      setValorConsignadoInput('');
    }
  };

  const handleConfirmConsignacion = async () => {
    const valorConsignado = consignacionCompleta
      ? totalEfectivoConPendiente
      : Number(valorConsignadoInput) || 0;
    const valorEsperado = totalEfectivoConPendiente;
    if (valorConsignado <= 0) {
      toast.error('Ingresa un valor consignado mayor a 0');
      return;
    }
    if (valorConsignado > valorEsperado) {
      toast.error('El valor consignado no puede ser mayor al total general a consignar');
      return;
    }
    const nuevoPendiente = Math.max(0, valorEsperado - valorConsignado);
    setValorConsignadoInput(valorConsignado);
    setNuevoPendienteConsignacion(nuevoPendiente);
    setShowConsignacionModal(false);
    setReadyToSend(true);
    await saveCuadre({
      consigna_hoy: true,
      valor_consignado: valorConsignado,
      consignacion_pendiente: nuevoPendiente,
    });
  };

  const handleAddGasto = async () => {
    if (!cuadre?.id) return;
    if (!newGasto.descripcion || !newGasto.valor) {
      toast.error('Completa la descripción y el valor del gasto');
      return;
    }
    if (!user?.id) {
      toast.error('Sesión no lista. Recarga la página e intenta de nuevo.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gastos_diarios')
        .insert({
          cuadre_id: cuadre.id,
          descripcion: newGasto.descripcion,
          categoria: normalizeGastoCategoria(newGasto.categoria || 'Otros'),
          valor: newGasto.valor,
          beneficiario: (newGasto.beneficiario || '').trim() || null,
          documento_beneficiario: (newGasto.documento_beneficiario || '').trim() || null,
          url_foto_factura: newGasto.url_foto_factura,
          fecha: cuadre.fecha,
          registrado_por: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No se pudo guardar el gasto');

      setGastos((prev) => [...prev, data]);
      setNewGasto({});
      setShowGastoModal(false);
      toast.success('Gasto agregado');
    } catch (error: any) {
      console.error('Error al agregar gasto:', error);
      toast.error(`Error al agregar gasto: ${error?.message || 'Intenta de nuevo'}`);
    }
  };

  const handleDeleteGasto = async (id: string) => {
    try {
      const { error } = await supabase.from('gastos_diarios').delete().eq('id', id);
      if (error) throw error;
      setGastos((prev) => prev.filter((g) => g.id !== id));
    } catch (error: any) {
      console.error('Error al eliminar gasto:', error);
      toast.error(`Error al eliminar gasto: ${error?.message || 'Intenta de nuevo'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const steps = [
    'Generales',
    'Venta Sistema',
    'Ventas por Medio',
    'Gastos y Turneros',
    'Tarjetas (TAR)',
    'Consignación y Envío',
  ];

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-white mb-4 hover:text-white/80 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            Volver al Inicio
          </button>
          <h1 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">Cuadre Diario</h1>
          <div className="flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  i + 1 === step
                    ? 'bg-primary text-white shadow-lg'
                    : i + 1 < step
                    ? 'bg-success text-white shadow-md'
                    : 'bg-white/80 text-gray-700 shadow-sm'
                }`}
              >
                {i + 1 < step ? <CheckCircle className="w-4 h-4" /> : <span className="w-5 h-5 flex items-center justify-center">{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-6 mb-6 border border-white/30">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Paso 1: Datos Generales</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
                <input
                  type="text"
                  value={puntoVenta?.nombre || ''}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <input
                  type="text"
                  value={puntoVenta?.ciudad || ''}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="text"
                  value={cuadre?.fecha ? formatDate(cuadre.fecha) : ''}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea
                  value={localCuadre?.observaciones || ''}
                  onChange={(e) => setLocalCuadre({ ...localCuadre, observaciones: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Paso 2: Venta Sistema</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Total Ventas del Día</label>
                <input
                  type="number"
                  value={localCuadre?.recaudo === 0 ? '' : localCuadre?.recaudo}
                  onChange={(e) => setLocalCuadre({ ...localCuadre, recaudo: Number(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor Consignación Pendiente (días anteriores)
                </label>
                <input
                  type="number"
                  value={pendienteArrastreActual === 0 ? '' : pendienteArrastreActual}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Este valor viene del pendiente del cierre anterior y no debe modificarse desde el PDV.
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">Venta Sistema Total</p>
                <p className="text-2xl font-bold text-blue-700">{formatCOP(localCuadre?.recaudo || 0)}</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Paso 3: Ventas por Medio</h2>
              {[
                { label: 'Venta Datafono', key: 'venta_tarjetas' },
                { label: 'Venta Fiesta', key: 'venta_fiesta' },
                { label: 'Venta Areas Comunes', key: 'venta_confiteria' },
                { label: 'Venta Cajero Automático', key: 'venta_cajero_auto' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type="number"
                    value={(localCuadre?.[field.key as keyof CuadreDiario] as number) === 0 ? '' : (localCuadre?.[field.key as keyof CuadreDiario] as number)}
                    onChange={(e) => {
                      const value = Number(e.target.value) || 0;
                      if (field.key === 'venta_confiteria') {
                        setLocalCuadre({ ...localCuadre, venta_confiteria: value, recibos: value });
                        return;
                      }
                      setLocalCuadre({ ...localCuadre, [field.key]: value });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  />
                </div>
              ))}
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700">Total Ventas por Medio</p>
                <p className="text-2xl font-bold text-green-700">{formatCOP(totalVentasMedio)}</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Paso 4: Gastos</h2>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Gastos</h3>
                  <button
                    onClick={() => setShowGastoModal(true)}
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                  >
                    + Agregar Gasto
                  </button>
                </div>
                <div className="space-y-3">
                  {gastos.map((g) => (
                    <div key={g.id} className="p-4 border rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium">{g.descripcion}</p>
                        <p className="text-sm text-gray-500">{getGastoCategoriaLabel(g.categoria)}</p>
                        {(g.beneficiario || g.documento_beneficiario) && (
                          <div className="mt-1 text-sm text-gray-600">
                            {g.beneficiario && <p>Beneficiario: {g.beneficiario}</p>}
                            {g.documento_beneficiario && <p>NIT/Cédula: {g.documento_beneficiario}</p>}
                          </div>
                        )}
                        {g.url_foto_factura && (
                          <img src={g.url_foto_factura} alt="Factura" className="w-20 h-20 object-cover rounded mt-2" />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-bold">{formatCOP(g.valor)}</p>
                        <button
                          onClick={() => handleDeleteGasto(g.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">Total Gastos</p>
                  <p className="text-xl font-bold">{formatCOP(totalGastos)}</p>
                </div>
              </div>

              {totalTurneros > 0 && (
                <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Turneros registrados (histórico): {formatCOP(totalTurneros)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Estos turneros pertenecen a cuadres anteriores y se mantienen para el cálculo.
                  </p>
                </div>
              )}

              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-700">Venta Datafono</p>
                <p className="text-2xl font-bold text-yellow-700">{formatCOP(ventaDatafono)}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">Total Deducciones (Gastos + Turneros)</p>
                <p className="text-2xl font-bold text-blue-700">{formatCOP(totalDeducciones)}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700">Total Efectivo a Consignar (Venta Sistema - Tarjetas - Deducciones + Pendiente)</p>
                <p className="text-2xl font-bold text-green-700">{formatCOP(totalEfectivoConPendiente)}</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Paso 5: Tarjetas (TAR)</h2>
              {[
                { label: 'TAR Inicial', key: 'tar_inicial' },
                { label: 'TAR Consumo', key: 'tar_consumo' },
                { label: 'TAR Fiestas', key: 'tar_fiestas' },
                { label: 'TAR Malas', key: 'tar_malas' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type="number"
                    value={(localCuadre?.[field.key as keyof CuadreDiario] as number) === 0 ? '' : (localCuadre?.[field.key as keyof CuadreDiario] as number)}
                    onChange={(e) => setLocalCuadre({ ...localCuadre, [field.key]: Number(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  />
                </div>
              ))}
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">TAR Final</p>
                <p className="text-2xl font-bold text-blue-700">{tarFinal}</p>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4">Paso 6: Consignación y Envío</h2>
              
              <div className="p-4 bg-white border border-gray-200 rounded-lg">
                <p className="font-medium text-gray-800">¿Vas a consignar hoy?</p>
                <div className="flex flex-wrap gap-4 mt-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="consignaHoy"
                      checked={consignaHoy}
                      onChange={async () => {
                        setLocalCuadre((prev) => ({ ...prev, consigna_hoy: true }));
                        setReadyToSend(false);
                        setNuevoPendienteConsignacion(null);
                        setConsignacionCompleta(true);
                        setValorConsignadoInput('');
                        await saveCuadre({ consigna_hoy: true });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Sí, voy a consignar</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="consignaHoy"
                      checked={!consignaHoy}
                      onChange={async () => {
                        setLocalCuadre((prev) => ({ ...prev, consigna_hoy: false }));
                        setConsignacionSoportes([]);
                        setReadyToSend(true);
                        setShowConsignacionModal(false);
                        setValorConsignadoInput(0);
                        setNuevoPendienteConsignacion(totalEfectivoConPendiente);
                        await saveCuadre({
                          consigna_hoy: false,
                          url_foto_consignacion: null,
                          firma_cajero_url: serializeConsignacionMetadata({ cuentaId: '', otraCuenta: null, fotos: [], consignaciones: [] }),
                          valor_consignado: 0,
                        });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">No, hoy no consigno</span>
                  </label>
                </div>
              </div>

              {consignaHoy && !hayFotoConsignacion && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 font-medium">⚠️ Sin foto de consignación</p>
                  <p className="text-yellow-700 text-sm mt-1">Si envías sin la foto, el cuadre quedará como <strong>Pendiente</strong> y podrás agregar la foto después.</p>
                </div>
              )}
              
              {consignaHoy && hayFotoConsignacion && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">✅ Soportes de consignación cargados</p>
                  <p className="text-green-700 text-sm mt-1">Puedes subir varias fotos para el mismo cuadre antes de reenviarlo.</p>
                </div>
              )}

              {!consignaHoy && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-800 font-medium">ℹ️ Hoy no se realizará consignación</p>
                  <p className="text-blue-700 text-sm mt-1">El <strong>Total General a Consignar</strong> quedará como pendiente para el próximo cuadre.</p>
                </div>
              )}

              {localCuadre?.estado === 'devuelto' && localCuadre?.observacion_superadmin && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 font-medium">Cuadre devuelto por Superadmin</p>
                  <p className="text-red-700 text-sm mt-1">{localCuadre.observacion_superadmin}</p>
                </div>
              )}
              
              {consignaHoy && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium text-blue-900">Definir Consignación del Día</h3>
                        <p className="text-sm text-blue-800">
                          Primero confirma si la consignación total del día será completa o parcial. Después puedes registrar los soportes en una o varias cuentas.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowConsignacionModal(true);
                          if (valorConsignadoInput === '') {
                            setValorConsignadoInput(totalEfectivoConPendiente);
                            setConsignacionCompleta(true);
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        {readyToSend ? 'Editar Valor Consignado' : 'Definir Completa o Parcial'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-medium">Consignaciones Realizadas</h3>
                        <p className="text-sm text-gray-600">
                          Cada soporte puede ir a una cuenta distinta.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddConsignacion}
                        disabled={!readyToSend}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        + Agregar Consignación
                      </button>
                    </div>

                    {!readyToSend && (
                      <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4 text-sm text-blue-800 mb-4">
                        Primero define si la consignación del día es completa o parcial. Ese valor total queda fijo y las fotos solo sirven como soporte.
                      </div>
                    )}

                    {readyToSend && consignacionSoportes.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                        Agrega una consignación por cada transacción realizada. Si todavía no tienes soporte, puedes enviar el cuadre como pendiente y cargarlo después.
                      </div>
                    )}

                    <div className="space-y-4">
                      {consignacionSoportes.map((consignacion, index) => {
                        const usaOtraCuentaConsignacion = consignacion.cuentaId === 'otra';
                        const usaCuentaPredefinida = !usaOtraCuentaConsignacion;
                        const tiposCuentaDisponibles = getTiposCuentaDisponibles(consignacion.banco || '');
                        const cuentasDisponibles = getCuentasDisponibles(consignacion.banco || '', consignacion.tipoCuenta || '');
                        const cuentaPredefinidaSeleccionada = getCuentaPredefinidaSeleccionada(consignacion);

                        return (
                          <div key={consignacion.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                              <div>
                                <p className="font-semibold text-gray-900">Consignación {index + 1}</p>
                                <p className="text-sm text-gray-600">
                                  {consignacion.fotoUrl ? 'Soporte cargado' : 'Pendiente por cargar soporte'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteConsignacion(consignacion.id)}
                                className="text-sm text-red-600 hover:text-red-700"
                              >
                                Eliminar consignación
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                              <button
                                type="button"
                                onClick={() => handleConsignacionModeChange(consignacion.id, 'registrada')}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                  usaCuentaPredefinida ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 hover:border-primary/50 text-gray-700'
                                }`}
                              >
                                <p className="font-semibold">Cuenta registrada</p>
                                <p className="text-sm text-gray-600">Selecciona banco, tipo y número disponible.</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConsignacionModeChange(consignacion.id, 'otra')}
                                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                                  usaOtraCuentaConsignacion ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 hover:border-primary/50 text-gray-700'
                                }`}
                              >
                                <p className="font-semibold">Otra cuenta</p>
                                <p className="text-sm text-gray-600">Escribe banco, número de cuenta, tipo y titular.</p>
                              </button>
                            </div>

                            {usaCuentaPredefinida && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                                  <select
                                    value={consignacion.banco || ''}
                                    onChange={(e) => handleBancoConsignacionChange(consignacion.id, e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  >
                                    <option value="">Selecciona un banco</option>
                                    {bancosConsignacionDisponibles.map((banco) => (
                                      <option key={banco} value={banco}>
                                        {banco}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cuenta</label>
                                  <select
                                    value={consignacion.tipoCuenta || ''}
                                    onChange={(e) => handleTipoCuentaConsignacionChange(consignacion.id, e.target.value)}
                                    disabled={!consignacion.banco}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                                  >
                                    <option value="">Selecciona tipo de cuenta</option>
                                    {tiposCuentaDisponibles.map((tipoCuenta) => (
                                      <option key={tipoCuenta} value={tipoCuenta}>
                                        {tipoCuenta}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                                  <select
                                    value={consignacion.numeroCuenta || ''}
                                    onChange={(e) => handleNumeroCuentaConsignacionChange(consignacion.id, e.target.value)}
                                    disabled={!consignacion.tipoCuenta}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                                  >
                                    <option value="">Selecciona el número de cuenta</option>
                                    {cuentasDisponibles.map((cuenta) => (
                                      <option key={cuenta.id} value={cuenta.numeroCuenta}>
                                        {cuenta.numeroCuenta}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Titular</label>
                                  <input
                                    type="text"
                                    value={cuentaPredefinidaSeleccionada?.titular || ''}
                                    readOnly
                                    placeholder="Se completa automáticamente"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                                  />
                                </div>
                              </div>
                            )}

                            {usaOtraCuentaConsignacion && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                                  <input
                                    type="text"
                                    value={consignacion.otraCuenta?.banco || ''}
                                    onChange={(e) => handleOtraCuentaFieldChange(consignacion.id, 'banco', e.target.value)}
                                    onBlur={() => saveOtraCuentaConsignacion(consignacion.id)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                                  <input
                                    type="text"
                                    value={consignacion.otraCuenta?.numeroCuenta || ''}
                                    onChange={(e) => handleOtraCuentaFieldChange(consignacion.id, 'numeroCuenta', e.target.value)}
                                    onBlur={() => saveOtraCuentaConsignacion(consignacion.id)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cuenta</label>
                                  <input
                                    type="text"
                                    value={consignacion.otraCuenta?.tipoCuenta || ''}
                                    onChange={(e) => handleOtraCuentaFieldChange(consignacion.id, 'tipoCuenta', e.target.value)}
                                    onBlur={() => saveOtraCuentaConsignacion(consignacion.id)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Titular</label>
                                  <input
                                    type="text"
                                    value={consignacion.otraCuenta?.titular || ''}
                                    onChange={(e) => handleOtraCuentaFieldChange(consignacion.id, 'titular', e.target.value)}
                                    onBlur={() => saveOtraCuentaConsignacion(consignacion.id)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  />
                                </div>
                              </div>
                            )}

                            {cuentaPredefinidaSeleccionada && usaCuentaPredefinida && (
                              <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
                                <p className="text-sm text-gray-600">Cuenta seleccionada</p>
                                <p className="font-semibold text-gray-900">
                                  {cuentaPredefinidaSeleccionada.banco} - {cuentaPredefinidaSeleccionada.numeroCuenta}
                                </p>
                                <p className="text-sm text-gray-700">
                                  {cuentaPredefinidaSeleccionada.tipoCuenta} - {cuentaPredefinidaSeleccionada.titular}
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Valor consignado en esta cuenta
                                </label>
                                <input
                                  type="number"
                                  value={consignacion.valor || ''}
                                  onChange={(e) =>
                                    handleValorConsignacionSoporteChange(
                                      consignacion.id,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  onBlur={() => saveValorConsignacionSoporte(consignacion.id)}
                                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                                  placeholder="Solo informativo"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Este valor no cambia el total confirmado del cuadre.
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Foto de consignación</label>
                                <UploadFoto
                                  bucket="soportes"
                                  currentUrl={consignacion.fotoUrl}
                                  onUpload={(url) => handleFotoConsignacionUpload(consignacion.id, url)}
                                  onRemove={() => handleRemoveFotoConsignacion(consignacion.id)}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Adjunta el comprobante correspondiente a esta consignación.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!cuentaConsignacionValida && consignacionSoportes.length > 0 && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mt-4">
                        Debes completar la cuenta de cada consignación registrada. Si eliges <strong>Cuenta registrada</strong>, selecciona banco, tipo y número. Si eliges <strong>Otra</strong>, completa todos los datos.
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-3">
                      Usa una tarjeta por cada consignación hecha. Así cada foto queda amarrada a su propia cuenta.
                    </p>
                    {consignacionSoportes.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Suma informativa registrada por soportes: {formatCOP(consignacionSoportes.reduce((sum, consignacion) => sum + (Number(consignacion.valor) || 0), 0))}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="text-lg font-medium mb-3">Administradora</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={localCuadre?.nombre_administradora || ''}
                      onChange={(e) => setLocalCuadre({ ...localCuadre, nombre_administradora: e.target.value })}
                      onBlur={() =>
                        saveCuadre(
                          { nombre_administradora: localCuadre?.nombre_administradora || '' },
                          { background: true }
                        )
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                      placeholder="Nombre de la administradora"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={localCuadre?.cedula_administradora || ''}
                      onChange={(e) => setLocalCuadre({ ...localCuadre, cedula_administradora: e.target.value })}
                      onBlur={() =>
                        saveCuadre(
                          { cedula_administradora: localCuadre?.cedula_administradora || '' },
                          { background: true }
                        )
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                      placeholder="Número de cédula"
                    />
                  </div>
                </div>
              </div>

              {(readyToSend || valorConsignadoInput !== '') && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Tipo de consignación</span>
                    <span className="font-semibold text-gray-900">
                      {consignacionCompleta ? 'Completa' : 'Parcial'}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg">
                    <span className="text-gray-700">Valor Consignado</span>
                    <span className="text-gray-900">{formatCOP(valorConsignadoConfirmado)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg mt-2">
                    <span className="text-orange-700">Pendiente Próximo Cuadre</span>
                    <span className="text-orange-800">
                      {formatCOP(nuevoPendienteConsignacion ?? pendienteProximoCuadre)}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Total General a Consignar</p>
                  <p className="text-xl font-bold">{formatCOP(totalEfectivoConPendiente)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pendiente al Iniciar</p>
                  <p className="text-xl font-bold">{formatCOP(localCuadre?.consignacion_pendiente || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">TAR Final</p>
                  <p className="text-xl font-bold">{tarFinal}</p>
                </div>
              </div>
              
              <button
                onClick={enviarCuadre}
                disabled={
                  saving ||
                  !localCuadre?.nombre_administradora ||
                  !localCuadre?.cedula_administradora ||
                  !cuentaConsignacionValida ||
                  (consignaHoy && !readyToSend)
                }
                className={`w-full py-3 font-medium rounded-lg hover:bg-opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 ${
                  consignaHoy ? (hayFotoConsignacion ? 'bg-success text-white' : 'bg-warning text-white') : 'bg-success text-white'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  consignaHoy ? (hayFotoConsignacion ? 'Enviar Cuadre' : 'Guardar como Pendiente') : 'Enviar Cuadre'
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="px-6 py-3 border border-gray-300 rounded-lg flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Anterior
            </button>
          )}
          {step < 6 && (
            <button
              onClick={nextStep}
              disabled={saving}
              className="px-6 py-3 bg-primary text-white rounded-lg flex items-center gap-2 ml-auto"
            >
              Siguiente
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {showGastoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-md my-8">
            <h3 className="text-xl font-semibold mb-4">Agregar Gasto</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={newGasto.descripcion || ''}
                  onChange={(e) => setNewGasto({ ...newGasto, descripcion: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  value={newGasto.categoria || 'Otros'}
                  onChange={(e) => setNewGasto({ ...newGasto, categoria: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                >
                  {categoriasGastos.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                <input
                  type="number"
                  value={newGasto.valor || ''}
                  onChange={(e) => setNewGasto({ ...newGasto, valor: Number(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiario</label>
                <input
                  type="text"
                  value={newGasto.beneficiario || ''}
                  onChange={(e) => setNewGasto({ ...newGasto, beneficiario: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Proveedor, persona o empresa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIT o Cédula</label>
                <input
                  type="text"
                  value={newGasto.documento_beneficiario || ''}
                  onChange={(e) =>
                    setNewGasto({ ...newGasto, documento_beneficiario: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Número de documento"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto Factura</label>
                <UploadFoto
                  bucket="soportes"
                  currentUrl={newGasto.url_foto_factura}
                  onUpload={(url) => setNewGasto({ ...newGasto, url_foto_factura: url })}
                  onRemove={() => setNewGasto({ ...newGasto, url_foto_factura: undefined })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowGastoModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddGasto}
                className="px-4 py-2 bg-primary text-white rounded-lg"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {showConsignacionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-md my-8">
            <h3 className="text-xl font-semibold mb-4">Confirmar Consignación</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="consignacionCompleta"
                  name="consignacion"
                  checked={consignacionCompleta}
                  onChange={() => {
                    setConsignacionCompleta(true);
                    const valorEsperado = totalEfectivoConPendiente;
                    setValorConsignadoInput(valorEsperado);
                  }}
                  className="w-4 h-4"
                />
                <label htmlFor="consignacionCompleta" className="text-sm font-medium text-gray-700">Consignación Completa</label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="consignacionParcial"
                  name="consignacion"
                  checked={!consignacionCompleta}
                  onChange={() => {
                    setConsignacionCompleta(false);
                    setValorConsignadoInput('');
                  }}
                  className="w-4 h-4"
                />
                <label htmlFor="consignacionParcial" className="text-sm font-medium text-gray-700">Consignación Parcial</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Consignado</label>
                <input
                  type="number"
                  value={valorConsignadoInput}
                  onChange={(e) => setValorConsignadoInput(e.target.value === '' ? '' : Number(e.target.value))}
                  readOnly={consignacionCompleta}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg read-only:bg-gray-100 read-only:text-gray-700"
                />
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total General a Consignar</span>
                  <span className="font-semibold">{formatCOP(totalEfectivoConPendiente)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-orange-700 font-medium">Queda Pendiente</span>
                  <span className="font-semibold text-orange-800">
                    {formatCOP(
                      Math.max(
                        0,
                        totalEfectivoConPendiente -
                          (consignacionCompleta ? totalEfectivoConPendiente : Number(valorConsignadoInput) || 0)
                      )
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConsignacionModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmConsignacion}
                className="px-4 py-2 bg-primary text-white rounded-lg"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CuadreWizard() {
  return (
    <Suspense fallback={<CuadreWizardFallback />}>
      <CuadreWizardContent />
    </Suspense>
  );
}
