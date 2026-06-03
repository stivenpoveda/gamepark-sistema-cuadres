'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcCuadreMetrics, formatCOP, formatDate, getTodayString } from '@/lib/utils';
import { Loader2, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CuadreDiario, Usuario, PuntoDeVenta, DenominacionCuadre, GastoDiario, PagoTurnero, SupabaseError } from '@/types';
import UploadFoto from '@/components/UploadFoto';
import toast from 'react-hot-toast';

const denominacionesList = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const categoriasGastos = [
  'Mantenimiento y Reparaciones',
  'Pagos Tecnico - Auditor Mecanico',
  'Servicio Publicos y Telefono',
  'Turnos',
  'Transporte, Fletes y Acarreos Maquinaria y Repuestos',
  'Fiestas',
  'Compra redencion',
  'Peluches',
  'Utiles-Papeleria y Fotocopias',
  'Base Refrigierios y H20',
  'Bioseguridad',
  'Publicidad y avisos varios',
  'Compra de aseo',
  'Viaticos-Pago hotel',
  'Tarjetas malas y devoluciones',
  'Otros'
];

export default function CuadreWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [user, setUser] = useState<Usuario | null>(null);
  const [puntoVenta, setPuntoVenta] = useState<PuntoDeVenta | null>(null);
  const [cuadre, setCuadre] = useState<CuadreDiario | null>(null);
  const [denominaciones, setDenominaciones] = useState<DenominacionCuadre[]>(
    denominacionesList.map((d) => ({ id: '', cuadre_id: '', denominacion: d, cantidad: 0, valor_total: 0 }))
  );
  const [gastos, setGastos] = useState<GastoDiario[]>([]);
  const [turneros, setTurneros] = useState<PagoTurnero[]>([]);
  const [showGastoModal, setShowGastoModal] = useState(false);
  const [showTurneroModal, setShowTurneroModal] = useState(false);
  const [showConsignacionModal, setShowConsignacionModal] = useState(false);
  const [newGasto, setNewGasto] = useState<Partial<GastoDiario>>({});
  const [newTurnero, setNewTurnero] = useState<Partial<PagoTurnero>>({});
  const [consignacionCompleta, setConsignacionCompleta] = useState(true);
  const [valorConsignadoInput, setValorConsignadoInput] = useState<number | ''>('');
  const [nuevoPendienteConsignacion, setNuevoPendienteConsignacion] = useState<number | null>(null);
  const [readyToSend, setReadyToSend] = useState(false);

  // Local state for form fields to prevent lag
  const [localCuadre, setLocalCuadre] = useState<Partial<CuadreDiario>>({});

  // Obtener la fecha de los query params
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const fechaSeleccionada = searchParams.get('date') || getTodayString();

  useEffect(() => {
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
          .eq('email', session.user.email)
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

        setUser(userData);
        setPuntoVenta(puntoVentaData || null);

        const { data: ultimosCuadresEnviados } = await supabase
          .from('cuadres_diarios')
          .select('consignacion_pendiente,fecha')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .lt('fecha', fechaSeleccionada)
          .not('url_foto_consignacion', 'is', null)
          .order('fecha', { ascending: false })
          .limit(1);

        const pendienteArrastre = Number(ultimosCuadresEnviados?.[0]?.consignacion_pendiente || 0);

        // Consulta simplificada sin relaciones anidadas
        const { data: existingCuadre, error: cuadreError } = await supabase
          .from('cuadres_diarios')
          .select('*')
          .eq('punto_de_venta_id', userData.punto_de_venta_id)
          .eq('fecha', fechaSeleccionada)
          .single();

        if (existingCuadre && !cuadreError) {
          // El cuadre ya existe, lo cargamos
          // Cargamos las relaciones por separado
          const [denominacionesRes, gastosRes, turnerosRes] = await Promise.all([
            supabase.from('denominaciones_cuadre').select('*').eq('cuadre_id', existingCuadre.id),
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
            denominaciones_cuadre: denominacionesRes.data,
            gastos_diarios: gastosRes.data,
            pagos_turneros: turnerosRes.data,
          };

          setCuadre(cuadreCompleto);
          setLocalCuadre(cuadreCompleto);
          if (shouldApplyPendienteArrastre) {
            await supabase
              .from('cuadres_diarios')
              .update({ consignacion_pendiente: pendienteArrastre, updated_at: new Date().toISOString() })
              .eq('id', existingCuadre.id);
          }
          if (cuadreCompleto.denominaciones_cuadre) {
            const existingDens = cuadreCompleto.denominaciones_cuadre;
            setDenominaciones(
              denominacionesList.map((d) => {
                const existing = existingDens.find((ed: DenominacionCuadre) => ed.denominacion === d);
                return existing || { id: '', cuadre_id: '', denominacion: d, cantidad: 0, valor_total: 0 };
              })
            );
          }
          if (cuadreCompleto.gastos_diarios) setGastos(cuadreCompleto.gastos_diarios);
          if (cuadreCompleto.pagos_turneros) setTurneros(cuadreCompleto.pagos_turneros);
        } else if (cuadreError && cuadreError.code !== 'PGRST116') {
          // Error que NO es "no hay filas"
          console.error('Error al buscar cuadre:', cuadreError);
          toast.error('Error al buscar el cuadre: ' + cuadreError.message);
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
            venta_confiteria: 0,
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
            const { data, error } = await supabase.from('cuadres_diarios').insert(payload).select().single();
            if (error) throw error;
            return data;
          };

          let newCuadre: any;
          try {
            newCuadre = await doInsert(newCuadreData as any);
          } catch (e: any) {
            const msg = String(e?.message || '');
            const match = msg.match(/Could not find the '([^']+)' column/i);
            const missingColumn = match?.[1];
            if (e?.code === 'PGRST204' && missingColumn && missingColumn in (newCuadreData as any)) {
              const retryData = { ...(newCuadreData as any) };
              delete retryData[missingColumn];
              newCuadre = await doInsert(retryData);
            } else {
              throw e;
            }
          }

          setCuadre(newCuadre);
          setLocalCuadre(newCuadre);
        }
      } catch (error) {
        console.error('Error en la inicialización:', error);
        toast.error('Ocurrió un error al inicializar el cuadre');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router, fechaSeleccionada]);

  const saveCuadre = async (updates: Partial<CuadreDiario>) => {
    if (!cuadre?.id) return;
    setSaving(true);
    try {
      // Lista de campos que realmente existen en la tabla cuadres_diarios (conocidos)
      const allowedFields = [
        'punto_de_venta_id', 'usuario_id', 'fecha', 'estado',
        'recaudo', 'venta_tarjetas', 'venta_fiesta', 'venta_cajero_auto', 'venta_confiteria',
        'tar_inicial', 'tar_consumo', 'tar_fiestas', 'tar_malas', 'tar_final',
        'total_fisico', 'total_sistema', 'sobrante', 'faltante',
        'url_foto_consignacion', 'firma_cajero_url', 'nombre_administradora', 'cedula_administradora', 'observaciones',
        'fecha_envio', 'fecha_aprobacion', 'observacion_superadmin',
        'consignacion_pendiente', 'valor_consignado', 'consigna_hoy'
      ];

      // Filtrar solo los campos permitidos
      const cleanUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if ((updates as any)[key] !== undefined) {
          cleanUpdates[key] = (updates as any)[key];
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

      // Combinar la data guardada con las relaciones (denominaciones, gastos, etc.) que teníamos antes
      const updatedCuadre = {
        ...data,
        denominaciones_cuadre: cuadre.denominaciones_cuadre,
        gastos_diarios: cuadre.gastos_diarios,
        pagos_turneros: cuadre.pagos_turneros,
        punto_de_venta: cuadre.punto_de_venta,
        usuario: cuadre.usuario,
      };
      
      setCuadre(updatedCuadre);
      setLocalCuadre(updatedCuadre);
    } catch (error) {
      console.error('Error en saveCuadre:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveDenominaciones = async () => {
    if (!cuadre?.id) return;
    setSaving(true);
    try {
      await supabase.from('denominaciones_cuadre').delete().eq('cuadre_id', cuadre.id);
      const densToSave = denominaciones.map((d) => ({
        cuadre_id: cuadre.id,
        denominacion: d.denominacion,
        cantidad: d.cantidad,
        valor_total: d.denominacion * d.cantidad,
      }));
      await supabase.from('denominaciones_cuadre').insert(densToSave);
    } catch (error) {
      toast.error('Error al guardar denominaciones');
    } finally {
      setSaving(false);
    }
  };

  const totalFisico = denominaciones.reduce((sum, d) => sum + d.denominacion * d.cantidad, 0);

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
    consignacion_pendiente: localCuadre?.consignacion_pendiente,
    gastos,
    turneros,
    total_fisico: totalFisico,
  });

  const totalGastos = cuadreMetrics.totalGastos;
  const totalTurneros = cuadreMetrics.totalTurneros;
  const totalDeducciones = cuadreMetrics.totalDeducciones;
  const ventaSistema = cuadreMetrics.ventaSistema;
  const ventaDatafono = cuadreMetrics.ventaDatafono;
  const totalEfectivoEsperado = cuadreMetrics.totalEfectivoEsperado;
  const totalEfectivoConPendiente = cuadreMetrics.totalGeneralAConsignar;
  const sobrante = cuadreMetrics.sobrante;
  const faltante = cuadreMetrics.faltante;

  const tarFinal =
    (localCuadre?.tar_inicial || 0) -
    (localCuadre?.tar_consumo || 0) -
    (localCuadre?.tar_fiestas || 0) -
    (localCuadre?.tar_malas || 0);

  const consignaHoy = (localCuadre?.consigna_hoy ?? true) === true;

  const nextStep = async () => {
    // Save local state to database before moving to next step
    await saveCuadre(localCuadre);
    if (step === 5) await saveDenominaciones();
    if (step < 7) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const enviarCuadre = async () => {
    if (!cuadre?.id) return;
    setSaving(true);
    try {
      await saveDenominaciones();
      
      const consignaHoy = (localCuadre?.consigna_hoy ?? true) === true;
      const nuevoEstado = consignaHoy ? (cuadre.url_foto_consignacion ? 'enviado' : 'pendiente') : 'enviado';
      
      const updates = {
        ...localCuadre,
        total_fisico: totalFisico,
        total_sistema: totalEfectivoEsperado,
        sobrante,
        faltante,
        tar_final: tarFinal,
        estado: nuevoEstado as 'enviado' | 'pendiente',
        fecha_envio: new Date().toISOString(),
        ...(nuevoEstado === 'enviado'
          ? consignaHoy
            ? {
                valor_consignado: Number(valorConsignadoInput) || 0,
                consignacion_pendiente: Math.max(0, nuevoPendienteConsignacion ?? 0),
              }
            : {
                url_foto_consignacion: null,
                valor_consignado: 0,
                consignacion_pendiente: totalEfectivoConPendiente,
              }
          : {}),
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

  const handleFotoConsignacionUpload = async (url: string) => {
    // First, save the URL
    setLocalCuadre((prev) => ({ ...prev, consigna_hoy: true }));
    await saveCuadre({ url_foto_consignacion: url, consigna_hoy: true });
    // Then show the modal to confirm consignacion details
    setShowConsignacionModal(true);
    // Calculate the expected consignacion value (pendiente anterior + total de hoy)
    const valorEsperado = totalEfectivoConPendiente;
    setValorConsignadoInput(valorEsperado);
    setConsignacionCompleta(true);
  };

  const handleConfirmConsignacion = () => {
    const valorConsignado = Number(valorConsignadoInput) || 0;
    const valorEsperado = totalEfectivoConPendiente;
    const nuevoPendiente = Math.max(0, valorEsperado - valorConsignado);
    setNuevoPendienteConsignacion(nuevoPendiente);
    setShowConsignacionModal(false);
    setReadyToSend(true);
  };

  const handleAddGasto = async () => {
    if (!cuadre?.id || !newGasto.descripcion || !newGasto.valor) return;
    const { data } = await supabase
      .from('gastos_diarios')
      .insert({
        cuadre_id: cuadre.id,
        descripcion: newGasto.descripcion,
        categoria: newGasto.categoria || 'Otros',
        valor: newGasto.valor,
        url_foto_factura: newGasto.url_foto_factura,
        fecha: cuadre.fecha,
        registrado_por: user?.id,
      })
      .select()
      .single();
    setGastos([...gastos, data]);
    setNewGasto({});
    setShowGastoModal(false);
    toast.success('Gasto agregado');
  };

  const handleDeleteGasto = async (id: string) => {
    await supabase.from('gastos_diarios').delete().eq('id', id);
    setGastos(gastos.filter((g) => g.id !== id));
  };

  const handleAddTurnero = async () => {
    if (!cuadre?.id || !newTurnero.nombre_turnero || !newTurnero.valor) return;
    const { data } = await supabase
      .from('pagos_turneros')
      .insert({
        cuadre_id: cuadre.id,
        nombre_turnero: newTurnero.nombre_turnero,
        valor: newTurnero.valor,
        horario: newTurnero.horario,
        url_foto_soporte: newTurnero.url_foto_soporte,
        fecha: cuadre.fecha,
        registrado_por: user?.id,
      })
      .select()
      .single();
    setTurneros([...turneros, data]);
    setNewTurnero({});
    setShowTurneroModal(false);
    toast.success('Turnero agregado');
  };

  const handleDeleteTurnero = async (id: string) => {
    await supabase.from('pagos_turneros').delete().eq('id', id);
    setTurneros(turneros.filter((t) => t.id !== id));
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
    'Billetes y Monedas',
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Consignación Pendiente (días anteriores)</label>
                <input
                  type="number"
                  value={localCuadre?.consignacion_pendiente === 0 ? '' : localCuadre?.consignacion_pendiente}
                  onChange={(e) => setLocalCuadre({ ...localCuadre, consignacion_pendiente: Number(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                />
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
                { label: 'Venta Confitería', key: 'venta_confiteria' },
                { label: 'Venta Cajero Automático', key: 'venta_cajero_auto' },
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
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700">Total Ventas por Medio</p>
                <p className="text-2xl font-bold text-green-700">{formatCOP(totalVentasMedio)}</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Paso 4: Gastos y Turneros</h2>
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
                        <p className="text-sm text-gray-500">{g.categoria}</p>
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

              <div className="space-y-4 pt-6 border-t">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Turneros</h3>
                  <button
                    onClick={() => setShowTurneroModal(true)}
                    className="px-4 py-2 bg-primary text-white rounded-lg"
                  >
                    + Agregar Turnero
                  </button>
                </div>
                <div className="space-y-3">
                  {turneros.map((t) => (
                    <div key={t.id} className="p-4 border rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium">{t.nombre_turnero}</p>
                        {t.horario && <p className="text-sm text-gray-500">{t.horario}</p>}
                        {t.url_foto_soporte && (
                          <img src={t.url_foto_soporte} alt="Soporte" className="w-20 h-20 object-cover rounded mt-2" />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-bold">{formatCOP(t.valor)}</p>
                        <button
                          onClick={() => handleDeleteTurnero(t.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">Total Turneros</p>
                  <p className="text-xl font-bold">{formatCOP(totalTurneros)}</p>
                </div>
              </div>

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
              <h2 className="text-xl font-semibold mb-4">Paso 5: Billetes y Monedas</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-light">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Denominación</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Cantidad</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {denominaciones.map((d, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-sm font-medium">{formatCOP(d.denominacion)}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={d.cantidad}
                            onChange={(e) => {
                              const newDens = [...denominaciones];
                              newDens[i].cantidad = Number(e.target.value) || 0;
                              setDenominaciones(newDens);
                            }}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCOP(d.denominacion * d.cantidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 space-y-3">
                <div className="p-4 bg-orange-200 rounded-lg border border-orange-300">
                  <p className="text-sm text-orange-900 font-bold">Total General a Consignar</p>
                  <p className="text-3xl font-bold text-orange-900">{formatCOP(totalEfectivoConPendiente)}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">Valor a Consignar Hoy</p>
                  <p className="text-xl font-bold text-green-700">{formatCOP(totalEfectivoEsperado)}</p>
                </div>
                {(localCuadre?.consignacion_pendiente || 0) > 0 && (
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-sm text-orange-800 font-medium">Pendiente al Iniciar (Días Anteriores)</p>
                    <p className="text-2xl font-bold text-orange-800">{formatCOP(localCuadre?.consignacion_pendiente || 0)}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">Total Físico Contado</p>
                  <p className="text-xl font-bold text-blue-700">{formatCOP(totalFisico)}</p>
                </div>
                <div className={`p-4 rounded-lg ${sobrante > 0 ? 'bg-green-50' : faltante > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${sobrante > 0 ? 'text-green-700' : faltante > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {sobrante > 0 ? 'Sobrante' : faltante > 0 ? 'Faltante' : 'Diferencia'}
                  </p>
                  <p className={`text-xl font-bold ${sobrante > 0 ? 'text-green-700' : faltante > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {sobrante > 0 ? formatCOP(Number(sobrante)) : faltante > 0 ? formatCOP(Number(faltante)) : '$0'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Paso 6: Tarjetas (TAR)</h2>
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

          {step === 7 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4">Paso 7: Consignación y Envío</h2>
              
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
                        if (!cuadre?.url_foto_consignacion) {
                          setValorConsignadoInput('');
                        }
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
                        setReadyToSend(true);
                        setShowConsignacionModal(false);
                        setValorConsignadoInput(0);
                        setNuevoPendienteConsignacion(totalEfectivoConPendiente);
                        if (cuadre?.url_foto_consignacion) {
                          await saveCuadre({ url_foto_consignacion: null });
                        }
                        await saveCuadre({ consigna_hoy: false });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">No, hoy no consigno</span>
                  </label>
                </div>
              </div>

              {consignaHoy && !cuadre?.url_foto_consignacion && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 font-medium">⚠️ Sin foto de consignación</p>
                  <p className="text-yellow-700 text-sm mt-1">Si envías sin la foto, el cuadre quedará como <strong>Pendiente</strong> y podrás agregar la foto después.</p>
                </div>
              )}
              
              {consignaHoy && cuadre?.url_foto_consignacion && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">✅ Foto de consignación cargada</p>
                  <p className="text-green-700 text-sm mt-1">El cuadre se marcará como <strong>Enviado</strong> y ya no podrás editarlo.</p>
                </div>
              )}

              {!consignaHoy && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-800 font-medium">ℹ️ Hoy no se realizará consignación</p>
                  <p className="text-blue-700 text-sm mt-1">El <strong>Total General a Consignar</strong> quedará como pendiente para el próximo cuadre.</p>
                </div>
              )}
              
              {consignaHoy && (
                <div>
                  <h3 className="text-lg font-medium mb-3">Foto Consignación</h3>
                  <UploadFoto
                    bucket="soportes"
                    currentUrl={cuadre?.url_foto_consignacion}
                    onUpload={handleFotoConsignacionUpload}
                    onRemove={async () => {
                      await saveCuadre({ url_foto_consignacion: null, valor_consignado: 0 });
                      setReadyToSend(false);
                      setNuevoPendienteConsignacion(null);
                      setValorConsignadoInput('');
                    }}
                  />
                  {cuadre?.url_foto_consignacion && (
                    <button
                      onClick={() => {
                        setShowConsignacionModal(true);
                        if (valorConsignadoInput === '') {
                          setValorConsignadoInput(totalEfectivoConPendiente);
                        }
                      }}
                      className="mt-3 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Editar Confirmación de Consignación
                    </button>
                  )}
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
                      onBlur={() => saveCuadre({ nombre_administradora: localCuadre?.nombre_administradora || '' })}
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
                      onBlur={() => saveCuadre({ cedula_administradora: localCuadre?.cedula_administradora || '' })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                      placeholder="Número de cédula"
                    />
                  </div>
                </div>
              </div>

              {cuadre?.url_foto_consignacion && (readyToSend || valorConsignadoInput !== '') && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <div className="flex justify-between font-semibold text-lg">
                    <span className="text-gray-700">Valor Consignado</span>
                    <span className="text-gray-900">{formatCOP(Number(valorConsignadoInput) || 0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg mt-2">
                    <span className="text-orange-700">Pendiente Próximo Cuadre</span>
                    <span className="text-orange-800">
                      {formatCOP(
                        nuevoPendienteConsignacion ?? Math.max(0, totalEfectivoConPendiente - (Number(valorConsignadoInput) || 0))
                      )}
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
                  <p className="text-sm text-gray-600">Valor a Consignar Hoy</p>
                  <p className="text-xl font-bold">{formatCOP(totalEfectivoEsperado)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pendiente al Iniciar</p>
                  <p className="text-xl font-bold">{formatCOP(localCuadre?.consignacion_pendiente || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Físico Contado</p>
                  <p className="text-xl font-bold">{formatCOP(totalFisico)}</p>
                </div>
                <div className={`${sobrante > 0 ? 'text-success' : faltante > 0 ? 'text-danger' : ''}`}>
                  <p className="text-sm">
                    {sobrante > 0 ? 'Sobrante' : faltante > 0 ? 'Faltante' : 'Diferencia'}
                  </p>
                  <p className="text-xl font-bold">
                    {sobrante > 0 ? formatCOP(Number(sobrante)) : faltante > 0 ? formatCOP(Number(faltante)) : '$0'}
                  </p>
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
                  (consignaHoy && !!cuadre?.url_foto_consignacion && !readyToSend)
                }
                className={`w-full py-3 font-medium rounded-lg hover:bg-opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 ${
                  consignaHoy ? (cuadre?.url_foto_consignacion ? 'bg-success text-white' : 'bg-warning text-white') : 'bg-success text-white'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  consignaHoy ? (cuadre?.url_foto_consignacion ? 'Enviar Cuadre' : 'Guardar como Pendiente') : 'Enviar Cuadre'
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
          {step < 7 && (
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
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
                    <option key={c} value={c}>{c}</option>
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

      {showTurneroModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Agregar Turnero</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Turnero</label>
                <input
                  type="text"
                  value={newTurnero.nombre_turnero || ''}
                  onChange={(e) => setNewTurnero({ ...newTurnero, nombre_turnero: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newTurnero.horario || ''}
                  onChange={(e) => setNewTurnero({ ...newTurnero, horario: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                <input
                  type="number"
                  value={newTurnero.valor || ''}
                  onChange={(e) => setNewTurnero({ ...newTurnero, valor: Number(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto Soporte</label>
                <UploadFoto
                  bucket="soportes"
                  currentUrl={newTurnero.url_foto_soporte}
                  onUpload={(url) => setNewTurnero({ ...newTurnero, url_foto_soporte: url })}
                  onRemove={() => setNewTurnero({ ...newTurnero, url_foto_soporte: undefined })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTurneroModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddTurnero}
                className="px-4 py-2 bg-primary text-white rounded-lg"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {showConsignacionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
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
                  onChange={() => setConsignacionCompleta(false)}
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
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
                    {formatCOP(Math.max(0, totalEfectivoConPendiente - (Number(valorConsignadoInput) || 0)))}
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
