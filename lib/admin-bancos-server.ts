import { supabaseServer } from '@/lib/supabase-server';
import type { CuentaFinanciera, MovimientoFinanciero, MovementType, CategoriaFinanciera } from '@/lib/admin-bancos';
import {
  CUENTAS_CONSIGNACION,
  getFinancialAccountIdFromConsignacionId,
  getCuentaConsignacionById,
  getCuadreConsignacionesRegistrables,
  type CuadreConsignacionRegistrable,
} from '@/lib/utils';
import type { Usuario } from '@/types';

type CreateMovementInput = {
  cuentaId: string;
  tipoMovimiento: MovementType;
  categoriaId?: string | null;
  descripcion: string;
  fechaMovimiento: string;
  valor: number;
  pdvId?: string | null;
  centroCosto?: string | null;
  soporteUrl?: string | null;
  cuentaContraparteId?: string | null;
  transferenciaGrupoId?: string | null;
  cuadreId?: string | null;
  origen: 'manual' | 'transferencia' | 'cuadre_aprobado' | 'historico';
  metadata?: Record<string, unknown>;
};

type UpdateMovementInput = {
  movementId: string;
  cuentaId: string;
  tipoMovimiento: Extract<MovementType, 'ingreso' | 'egreso'>;
  categoriaId?: string | null;
  descripcion: string;
  fechaMovimiento: string;
  valor: number;
  pdvId?: string | null;
  centroCosto?: string | null;
  soporteUrl?: string | null;
};

type UpdateTransferInput = {
  transferGroupId: string;
  cuentaOrigenId: string;
  cuentaDestinoId?: string | null;
  cuentaExterna?: {
    banco?: string | null;
    numeroCuenta?: string | null;
    titular?: string | null;
  } | null;
  valor: number;
  descripcion: string;
  fechaMovimiento: string;
};

const ACTIVE_MOVEMENTS_SELECT = `
  id,
  cuenta_id,
  tipo_movimiento,
  categoria_id,
  descripcion,
  fecha_movimiento,
  valor,
  pdv_id,
  centro_costo,
  soporte_url,
  cuenta_contraparte_id,
  transferencia_grupo_id,
  cuadre_id,
  origen,
  metadata,
  activo,
  created_by,
  updated_by,
  deleted_by,
  deleted_at,
  created_at,
  updated_at
`;

type CuadreSyncPlanItem = CuadreConsignacionRegistrable & {
  cuentaFinancieraId: string | null;
};

const getFinancialAccountNameFromPreset = (cuentaId: string) => {
  const selectedAccount = getCuentaConsignacionById(cuentaId);
  if (!selectedAccount) {
    return null;
  }

  return `${selectedAccount.banco} ${selectedAccount.tipoCuenta} ${selectedAccount.numeroCuenta}`;
};

const DATAFONO_DEFAULT_ACCOUNT = {
  banco: 'B. occidente',
  tipoCuenta: 'Corriente',
  numeroCuenta: '22584-6112',
};

const DATAFONO_VILLAVICENCIO_ACCOUNT = {
  banco: 'Bancolombia',
  tipoCuenta: 'Ahorros',
  numeroCuenta: '20125684512',
};

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isDatafonoLedgerMovement = (movement: {
  tipo_movimiento: string;
  metadata?: Record<string, unknown> | null;
}) =>
  movement.tipo_movimiento === 'cuadre_aprobado' &&
  String((movement.metadata as Record<string, unknown> | null)?.entry_kind || '') === 'datafono';

const findFinancialAccountIdByDetails = async (input: {
  banco?: string | null;
  tipoCuenta?: string | null;
  numeroCuenta?: string | null;
}) => {
  const banco = String(input.banco || '').trim();
  const tipoCuenta = String(input.tipoCuenta || '').trim();
  const numeroCuenta = String(input.numeroCuenta || '').trim();

  if (!banco || !tipoCuenta || !numeroCuenta) {
    return null;
  }

  const { data: financialAccount } = await supabaseServer
    .from('cuentas_financieras')
    .select('id')
    .eq('banco', banco)
    .eq('tipo_cuenta', tipoCuenta)
    .eq('numero_cuenta', numeroCuenta)
    .maybeSingle();

  return financialAccount?.id || null;
};

const resolveDatafonoDestinationAccountId = async (city?: string | null) => {
  const normalizedCity = normalizeText(city);
  const targetAccount = normalizedCity.includes('villavicencio')
    ? DATAFONO_VILLAVICENCIO_ACCOUNT
    : DATAFONO_DEFAULT_ACCOUNT;

  return findFinancialAccountIdByDetails(targetAccount);
};

export async function resolveFinancialAccountIdFromConsignacion(
  consignacion: Pick<
    CuadreConsignacionRegistrable,
    'cuentaId' | 'banco' | 'tipoCuenta' | 'numeroCuenta' | 'isLegacy'
  >
) {
  const financialAccountId = getFinancialAccountIdFromConsignacionId(consignacion.cuentaId);
  if (financialAccountId) {
    return financialAccountId;
  }

  if (consignacion.cuentaId === 'otra') {
    return null;
  }

  if (consignacion.cuentaId && consignacion.cuentaId !== 'otra') {
    const financialAccountName = getFinancialAccountNameFromPreset(consignacion.cuentaId);

    if (financialAccountName) {
      const { data: financialAccount } = await supabaseServer
        .from('cuentas_financieras')
        .select('id')
        .eq('nombre', financialAccountName)
        .maybeSingle();

      if (financialAccount?.id) {
        return financialAccount.id;
      }
    }
  }

  if (consignacion.isLegacy) {
    return null;
  }

  return findFinancialAccountIdByDetails({
    banco: consignacion.banco,
    tipoCuenta: consignacion.tipoCuenta,
    numeroCuenta: consignacion.numeroCuenta,
  });
}

export async function buildCuadreConsignacionSyncPlan(
  cuadre: {
    valor_consignado?: number | string | null;
    firma_cajero_url?: string | null;
    url_foto_consignacion?: string | null;
    cuenta_financiera_destino_id?: string | null;
  }
) {
  const consignaciones = getCuadreConsignacionesRegistrables({
    firma_cajero_url: cuadre.firma_cajero_url,
    url_foto_consignacion: cuadre.url_foto_consignacion,
    valor_consignado: cuadre.valor_consignado,
  });

  const plan: CuadreSyncPlanItem[] = [];

  for (const consignacion of consignaciones) {
    const cuentaFinancieraId =
      consignacion.isLegacy && cuadre.cuenta_financiera_destino_id
        ? cuadre.cuenta_financiera_destino_id
        : await resolveFinancialAccountIdFromConsignacion(consignacion);

    plan.push({
      ...consignacion,
      cuentaFinancieraId,
    });
  }

  return plan;
}

export async function resolveFinancialAccountIdFromCuadre(
  cuadre: {
    firma_cajero_url?: string | null;
    url_foto_consignacion?: string | null;
    valor_consignado?: number | string | null;
    cuenta_financiera_destino_id?: string | null;
  },
  actor?: Usuario
) {
  if (cuadre.cuenta_financiera_destino_id) {
    return cuadre.cuenta_financiera_destino_id;
  }

  if (actor) {
    await ensureFinancialBaseData(actor);
  }

  const plan = await buildCuadreConsignacionSyncPlan(cuadre);
  const cuentaIds = Array.from(
    new Set(
      plan
        .map((item) => item.cuentaFinancieraId)
        .filter((cuentaId): cuentaId is string => Boolean(cuentaId))
    )
  );

  if (cuentaIds.length !== 1 || plan.some((item) => !item.cuentaFinancieraId)) {
    return null;
  }

  return cuentaIds[0];
}

export async function ensureFinancialBaseData(actor: Usuario) {
  const { data: existingCategories } = await supabaseServer
    .from('categorias_financieras')
    .select('nombre');

  const existingNames = new Set((existingCategories || []).map((item) => item.nombre));
  const seedCategories = [
    'Arriendo',
    'Administracion',
    'Nomina',
    'Servicios Publicos',
    'Publicidad',
    'Mantenimiento',
    'Impuestos',
    'Compras',
    'Transporte',
    'Otros',
  ]
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      nombre: name,
      tipo: 'ambos',
      activa: true,
      es_sistema: true,
      created_by: actor.id,
      updated_by: actor.id,
    }));

  if (seedCategories.length > 0) {
    await supabaseServer.from('categorias_financieras').insert(seedCategories);
  }

  const { data: existingAccounts } = await supabaseServer
    .from('cuentas_financieras')
    .select('id,nombre,titular');

  const existingAccountNames = new Set((existingAccounts || []).map((item) => item.nombre));
  const systemAccounts = [
    ...CUENTAS_CONSIGNACION.map((account) => ({
      nombre: `${account.banco} ${account.tipoCuenta} ${account.numeroCuenta}`,
      banco: account.banco,
      titular: account.titular,
      numero_cuenta: account.numeroCuenta,
      tipo_cuenta: account.tipoCuenta,
      tipo_entidad: 'bancaria',
      saldo_inicial: 0,
      estado: 'activa',
      descripcion: `Cuenta base importada para ${account.titular}`,
      created_by: actor.id,
      updated_by: actor.id,
    })),
    {
      nombre: 'Efectivo General',
      banco: 'Interno',
      titular: 'DIVERSIONES DE COLOMBIA',
      numero_cuenta: null,
      tipo_cuenta: 'Efectivo',
      tipo_entidad: 'efectivo',
      saldo_inicial: 0,
      estado: 'activa',
      descripcion: 'Fondo general de efectivo',
      created_by: actor.id,
      updated_by: actor.id,
    },
  ]
    .filter((account) => !existingAccountNames.has(account.nombre));

  if (systemAccounts.length > 0) {
    await supabaseServer.from('cuentas_financieras').insert(systemAccounts);
  }

  for (const account of CUENTAS_CONSIGNACION) {
    const seededName = `${account.banco} ${account.tipoCuenta} ${account.numeroCuenta}`;
    await supabaseServer
      .from('cuentas_financieras')
      .update({
        titular: account.titular,
        descripcion: `Cuenta base importada para ${account.titular}`,
        updated_by: actor.id,
      })
      .eq('nombre', seededName);
  }

  await supabaseServer
    .from('cuentas_financieras')
    .update({
      titular: 'DIVERSIONES DE COLOMBIA',
      updated_by: actor.id,
    })
    .in('nombre', ['Efectivo General']);

  const { data: cajaMenorAccount } = await supabaseServer
    .from('cuentas_financieras')
    .select('id')
    .eq('nombre', 'Caja Menor')
    .maybeSingle();

  if (cajaMenorAccount?.id) {
    const { count } = await supabaseServer
      .from('movimientos_financieros')
      .select('id', { count: 'exact', head: true })
      .eq('cuenta_id', cajaMenorAccount.id);

    if (!count) {
      await supabaseServer.from('cuentas_financieras').delete().eq('id', cajaMenorAccount.id);
    } else {
      await supabaseServer
        .from('cuentas_financieras')
        .update({ estado: 'inactiva', updated_by: actor.id })
        .eq('id', cajaMenorAccount.id);
    }
  }

  const { data: nequiAccount } = await supabaseServer
    .from('cuentas_financieras')
    .select('id')
    .eq('nombre', 'Nequi Empresarial')
    .maybeSingle();

  if (nequiAccount?.id) {
    const { count } = await supabaseServer
      .from('movimientos_financieros')
      .select('id', { count: 'exact', head: true })
      .eq('cuenta_id', nequiAccount.id);

    if (!count) {
      await supabaseServer.from('cuentas_financieras').delete().eq('id', nequiAccount.id);
    } else {
      await supabaseServer
        .from('cuentas_financieras')
        .update({ estado: 'inactiva', updated_by: actor.id })
        .eq('id', nequiAccount.id);
    }
  }
}

export async function createFinancialMovement(actor: Usuario, input: CreateMovementInput) {
  const idempotencyKey = String(
    (input.metadata as Record<string, unknown> | null)?.idempotency_key || ''
  ).trim();

  if (idempotencyKey) {
    const { data: existingMovement } = await supabaseServer
      .from('movimientos_financieros')
      .select(ACTIVE_MOVEMENTS_SELECT)
      .eq('activo', true)
      .eq('metadata->>idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingMovement) {
      return existingMovement as MovimientoFinanciero;
    }
  }

  const payload = {
    cuenta_id: input.cuentaId,
    tipo_movimiento: input.tipoMovimiento,
    categoria_id: input.categoriaId || null,
    descripcion: input.descripcion,
    fecha_movimiento: input.fechaMovimiento,
    valor: Number(input.valor || 0),
    pdv_id: input.pdvId || null,
    centro_costo: input.centroCosto || null,
    soporte_url: input.soporteUrl || null,
    cuenta_contraparte_id: input.cuentaContraparteId || null,
    transferencia_grupo_id: input.transferenciaGrupoId || null,
    cuadre_id: input.cuadreId || null,
    origen: input.origen,
    metadata: input.metadata || {},
    activo: true,
    created_by: actor.id,
    updated_by: actor.id,
  };

  const { data, error } = await supabaseServer
    .from('movimientos_financieros')
    .insert(payload)
    .select(ACTIVE_MOVEMENTS_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as MovimientoFinanciero;
}

const getManualEditableMovement = async (movementId: string) => {
  const { data: movement, error } = await supabaseServer
    .from('movimientos_financieros')
    .select(ACTIVE_MOVEMENTS_SELECT)
    .eq('id', movementId)
    .eq('activo', true)
    .single();

  if (error || !movement) {
    throw new Error('No se encontro el movimiento');
  }

  if (movement.origen !== 'manual' || !['ingreso', 'egreso'].includes(movement.tipo_movimiento)) {
    throw new Error('Solo puedes editar o reversar movimientos manuales');
  }

  return movement as MovimientoFinanciero;
};

export async function updateManualFinancialMovement(actor: Usuario, input: UpdateMovementInput) {
  await getManualEditableMovement(input.movementId);

  const payload = {
    cuenta_id: input.cuentaId,
    tipo_movimiento: input.tipoMovimiento,
    categoria_id: input.categoriaId || null,
    descripcion: input.descripcion.trim(),
    fecha_movimiento: input.fechaMovimiento,
    valor: Number(input.valor || 0),
    pdv_id: input.pdvId || null,
    centro_costo: input.centroCosto?.trim() || null,
    soporte_url: input.soporteUrl || null,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from('movimientos_financieros')
    .update(payload)
    .eq('id', input.movementId)
    .select(ACTIVE_MOVEMENTS_SELECT)
    .single();

  if (error || !data) {
    throw error || new Error('No se pudo actualizar el movimiento');
  }

  return data as MovimientoFinanciero;
}

export async function reverseManualFinancialMovement(actor: Usuario, movementId: string) {
  await getManualEditableMovement(movementId);
  await softDeleteFinancialMovement(actor, movementId);
  return true;
}

export async function syncApprovedCuadreToAccount(
  actor: Usuario,
  params: {
    cuadreId: string;
    cuentaId: string;
    forceHistorical?: boolean;
  }
) {
  const { data: cuadre, error: cuadreError } = await supabaseServer
    .from('cuadres_diarios')
    .select('*, punto_de_venta:puntos_de_venta(id,nombre,ciudad)')
    .eq('id', params.cuadreId)
    .single();

  if (cuadreError || !cuadre) {
    throw new Error('No se encontro el cuadre a sincronizar');
  }

  if (cuadre.estado !== 'aprobado') {
    throw new Error('Solo se pueden sincronizar cuadres aprobados');
  }

  const valor = Number(cuadre.valor_consignado || 0);
  if (valor <= 0) {
    throw new Error('El cuadre no tiene un valor consignado valido para generar el ingreso');
  }

  const { data: existingMovement } = await supabaseServer
    .from('movimientos_financieros')
    .select('id,cuenta_id')
    .eq('cuadre_id', params.cuadreId)
    .eq('tipo_movimiento', 'cuadre_aprobado')
    .eq('activo', true)
    .maybeSingle();

  if (existingMovement && !params.forceHistorical) {
    return {
      synced: false,
      message: 'El cuadre ya habia sido sincronizado previamente',
      movementId: existingMovement.id,
    };
  }

  if (existingMovement && params.forceHistorical) {
    await softDeleteFinancialMovement(actor, existingMovement.id);
  }

  const movement = await createFinancialMovement(actor, {
    cuentaId: params.cuentaId,
    tipoMovimiento: 'cuadre_aprobado',
    descripcion: `Ingreso por cuadre aprobado ${cuadre.punto_de_venta?.nombre || 'PDV'} ${cuadre.fecha}`,
    fechaMovimiento: cuadre.fecha,
    valor,
    pdvId: cuadre.punto_de_venta_id,
    cuadreId: cuadre.id,
    cuentaContraparteId: null,
    origen: params.forceHistorical ? 'historico' : 'cuadre_aprobado',
    metadata: {
      fecha_cuadre: cuadre.fecha,
      pdv_nombre: cuadre.punto_de_venta?.nombre || null,
      pdv_ciudad: cuadre.punto_de_venta?.ciudad || null,
    },
  });

  await supabaseServer
    .from('cuadres_diarios')
    .update({
      cuenta_financiera_destino_id: params.cuentaId,
      movimiento_financiero_sync_id: movement.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.cuadreId);

  return {
    synced: true,
    message: 'Cuadre sincronizado exitosamente',
    movementId: movement.id,
  };
}

export async function syncApprovedCuadreConsignaciones(
  actor: Usuario,
  params: {
    cuadreId: string;
    overridesByConsignacionId?: Record<string, string>;
    forceHistorical?: boolean;
  }
) {
  const { data: cuadre, error: cuadreError } = await supabaseServer
    .from('cuadres_diarios')
    .select('*, punto_de_venta:puntos_de_venta(id,nombre,ciudad)')
    .eq('id', params.cuadreId)
    .single();

  if (cuadreError || !cuadre) {
    throw new Error('No se encontro el cuadre a registrar');
  }

  if (cuadre.estado !== 'aprobado') {
    throw new Error('Solo se pueden registrar cuadres aprobados');
  }

  await ensureFinancialBaseData(actor);

  const plan = await buildCuadreConsignacionSyncPlan(cuadre);
  const valorDatafono = Number(cuadre.venta_tarjetas || 0);
  if (plan.length === 0 && valorDatafono <= 0) {
    throw new Error('El cuadre no tiene consignaciones ni datafono validos para registrar en libro');
  }

  const { data: existingMovements, error: existingError } = await supabaseServer
    .from('movimientos_financieros')
    .select(ACTIVE_MOVEMENTS_SELECT)
    .eq('cuadre_id', params.cuadreId)
    .eq('tipo_movimiento', 'cuadre_aprobado')
    .eq('activo', true);

  if (existingError) {
    throw existingError;
  }

  if (params.forceHistorical) {
    for (const movement of existingMovements || []) {
      await softDeleteFinancialMovement(actor, movement.id);
    }
  }

  const activeApprovedMovements = (existingMovements || []) as MovimientoFinanciero[];
  const existingDatafonoMovement = activeApprovedMovements.find((movement) =>
    isDatafonoLedgerMovement(movement)
  );
  const bankApprovedMovements = activeApprovedMovements.filter(
    (movement) => !isDatafonoLedgerMovement(movement)
  );

  const activeMovementMap = new Map<string, { id: string; cuenta_id: string }>();
  let hasLegacyMovement = false;

  for (const movement of bankApprovedMovements) {
    const consignacionId = String(
      (movement.metadata as Record<string, unknown> | null)?.consignacion_id || ''
    ).trim();

    if (consignacionId) {
      activeMovementMap.set(consignacionId, movement);
    } else {
      hasLegacyMovement = true;
    }
  }

  const createdMovements: MovimientoFinanciero[] = [];
  const skipped: Array<{ consignacionId: string; reason: string }> = [];

  for (const consignacion of plan) {
    if (consignacion.isInformative) {
      skipped.push({
        consignacionId: consignacion.id,
        reason: 'consignacion_informativa',
      });
      continue;
    }

    const cuentaId =
      params.overridesByConsignacionId?.[consignacion.id] || consignacion.cuentaFinancieraId;

    if (!cuentaId) {
      skipped.push({
        consignacionId: consignacion.id,
        reason: 'cuenta_no_resuelta',
      });
      continue;
    }

    const existingMovement = activeMovementMap.get(consignacion.id);
    if (existingMovement && !params.forceHistorical) {
      skipped.push({
        consignacionId: consignacion.id,
        reason:
          existingMovement.cuenta_id === cuentaId ? 'ya_registrada' : 'requiere_reproceso_historico',
      });
      continue;
    }

    if (hasLegacyMovement && !params.forceHistorical) {
      skipped.push({
        consignacionId: consignacion.id,
        reason: 'requiere_reproceso_historico',
      });
      continue;
    }

    const movement = await createFinancialMovement(actor, {
      cuentaId,
      tipoMovimiento: 'cuadre_aprobado',
      descripcion: `Ingreso por cuadre aprobado ${cuadre.punto_de_venta?.nombre || 'PDV'} ${cuadre.fecha} - ${consignacion.descripcionCuenta}`,
      fechaMovimiento: cuadre.fecha,
      valor: consignacion.valor,
      pdvId: cuadre.punto_de_venta_id,
      cuadreId: cuadre.id,
      cuentaContraparteId: null,
      origen: params.forceHistorical ? 'historico' : 'cuadre_aprobado',
      soporteUrl: consignacion.fotoUrl || null,
      metadata: {
        fecha_cuadre: cuadre.fecha,
        pdv_nombre: cuadre.punto_de_venta?.nombre || null,
        pdv_ciudad: cuadre.punto_de_venta?.ciudad || null,
        consignacion_id: consignacion.id,
        consignacion_cuenta: consignacion.descripcionCuenta,
        consignacion_banco: consignacion.banco || null,
        consignacion_tipo_cuenta: consignacion.tipoCuenta || null,
        consignacion_numero_cuenta: consignacion.numeroCuenta || null,
        consignacion_titular: consignacion.titular || null,
        consignacion_valor: consignacion.valor,
        consignacion_es_legacy: consignacion.isLegacy,
      },
    });

    createdMovements.push(movement);
  }

  let datafonoMovement: MovimientoFinanciero | null = null;
  let datafonoSkippedReason: string | null = null;

  if (valorDatafono > 0) {
    if (existingDatafonoMovement && !params.forceHistorical) {
      datafonoSkippedReason = 'ya_registrado';
    } else {
      const cuentaDatafonoId = await resolveDatafonoDestinationAccountId(
        cuadre.punto_de_venta?.ciudad || null
      );

      if (!cuentaDatafonoId) {
        datafonoSkippedReason = 'cuenta_datafono_no_configurada';
      } else {
        datafonoMovement = await createFinancialMovement(actor, {
          cuentaId: cuentaDatafonoId,
          tipoMovimiento: 'cuadre_aprobado',
          descripcion: `Ingreso por datafono ${cuadre.punto_de_venta?.nombre || 'PDV'} ${cuadre.fecha}`,
          fechaMovimiento: cuadre.fecha,
          valor: valorDatafono,
          pdvId: cuadre.punto_de_venta_id,
          cuadreId: cuadre.id,
          cuentaContraparteId: null,
          origen: params.forceHistorical ? 'historico' : 'cuadre_aprobado',
          metadata: {
            entry_kind: 'datafono',
            payment_channel: 'datafono',
            fecha_cuadre: cuadre.fecha,
            pdv_nombre: cuadre.punto_de_venta?.nombre || null,
            pdv_ciudad: cuadre.punto_de_venta?.ciudad || null,
            datafono_valor: valorDatafono,
          },
        });
      }
    }
  }

  const { data: remainingMovements, error: remainingError } = await supabaseServer
    .from('movimientos_financieros')
    .select('id,cuenta_id,metadata')
    .eq('cuadre_id', params.cuadreId)
    .eq('tipo_movimiento', 'cuadre_aprobado')
    .eq('activo', true)
    .order('created_at', { ascending: true });

  if (remainingError) {
    throw remainingError;
  }

  const remainingConsignacionMovements = ((remainingMovements || []) as Array<{
    id: string;
    cuenta_id: string;
    metadata?: Record<string, unknown> | null;
  }>).filter((movement) => !isDatafonoLedgerMovement({ tipo_movimiento: 'cuadre_aprobado', metadata: movement.metadata }));

  const uniqueAccountIds = Array.from(
    new Set(remainingConsignacionMovements.map((movement) => movement.cuenta_id).filter(Boolean))
  );
  const referenceMovementId =
    remainingConsignacionMovements.length === 1 ? remainingConsignacionMovements[0].id : null;
  const referenceAccountId =
    uniqueAccountIds.length === 1 ? uniqueAccountIds[0] : null;

  await supabaseServer
    .from('cuadres_diarios')
    .update({
      cuenta_financiera_destino_id: referenceAccountId,
      movimiento_financiero_sync_id: referenceMovementId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.cuadreId);

  const totalCreatedCount = createdMovements.length + (datafonoMovement ? 1 : 0);

  return {
    synced: totalCreatedCount > 0,
    message:
      totalCreatedCount > 0
        ? 'Consignaciones registradas en el libro bancario'
        : 'No hubo consignaciones nuevas para registrar',
    createdCount: totalCreatedCount,
    consignacionesCreatedCount: createdMovements.length,
    datafonoCreated: Boolean(datafonoMovement),
    datafonoAmount: datafonoMovement ? valorDatafono : 0,
    datafonoSkippedReason,
    pendingCount: skipped.filter((item) => item.reason === 'cuenta_no_resuelta').length,
    informativeCount: skipped.filter((item) => item.reason === 'consignacion_informativa').length,
    skipped,
    movements: datafonoMovement ? [...createdMovements, datafonoMovement] : createdMovements,
  };
}

export async function syncApprovedCuadresBatch(actor: Usuario, cuadreIds?: string[]) {
  let query = supabaseServer
    .from('cuadres_diarios')
    .select('id')
    .eq('estado', 'aprobado')
    .order('fecha', { ascending: false });

  if (cuadreIds && cuadreIds.length > 0) {
    query = query.in('id', cuadreIds);
  }

  const { data: pendingCuadres, error } = await query;
  if (error) {
    throw error;
  }

  const results = [];
  for (const cuadre of pendingCuadres || []) {
    try {
      const result = await syncApprovedCuadreConsignaciones(actor, {
        cuadreId: cuadre.id,
      });
      results.push({ cuadreId: cuadre.id, ok: true, ...result });
    } catch (syncError: any) {
      results.push({
        cuadreId: cuadre.id,
        ok: false,
        error: syncError?.message || 'No se pudo registrar',
      });
    }
  }

  return results;
}

export async function createTransferBetweenAccounts(
  actor: Usuario,
  input: {
    cuentaOrigenId: string;
    cuentaDestinoId?: string | null;
    cuentaExterna?: {
      banco?: string | null;
      numeroCuenta?: string | null;
      titular?: string | null;
    } | null;
    valor: number;
    descripcion: string;
    fechaMovimiento: string;
    idempotencyKey?: string | null;
  }
) {
  if (!input.cuentaDestinoId && !input.cuentaExterna?.numeroCuenta) {
    throw new Error('Debes seleccionar una cuenta destino o registrar una cuenta externa');
  }

  if (input.cuentaDestinoId && input.cuentaOrigenId === input.cuentaDestinoId) {
    throw new Error('La cuenta origen y destino deben ser diferentes');
  }

  const valor = Number(input.valor || 0);
  if (valor <= 0) {
    throw new Error('El valor de la transferencia debe ser mayor a cero');
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey) {
    const { data: existingMovements } = await supabaseServer
      .from('movimientos_financieros')
      .select(ACTIVE_MOVEMENTS_SELECT)
      .eq('activo', true)
      .eq('metadata->>idempotency_key', idempotencyKey)
      .order('created_at', { ascending: true });

    const salidaExistente =
      (existingMovements || []).find((movement) => movement.tipo_movimiento === 'transferencia_salida') ||
      null;
    const entradaExistente =
      (existingMovements || []).find((movement) => movement.tipo_movimiento === 'transferencia_entrada') ||
      null;

    if (salidaExistente) {
      return {
        transferenciaGrupoId: salidaExistente.transferencia_grupo_id || entradaExistente?.transferencia_grupo_id || null,
        salida: salidaExistente as MovimientoFinanciero,
        entrada: (entradaExistente as MovimientoFinanciero | null) || null,
      };
    }
  }

  const transferenciaGrupoId = crypto.randomUUID();
  const externalAccount = input.cuentaExterna || null;

  const salida = await createFinancialMovement(actor, {
    cuentaId: input.cuentaOrigenId,
    cuentaContraparteId: input.cuentaDestinoId || null,
    tipoMovimiento: 'transferencia_salida',
    descripcion: input.descripcion,
    fechaMovimiento: input.fechaMovimiento,
    valor,
    transferenciaGrupoId,
    origen: 'transferencia',
    metadata: {
      direccion: 'salida',
      cuenta_externa: externalAccount,
      idempotency_key: idempotencyKey || null,
    },
  });

  if (!input.cuentaDestinoId) {
    return {
      transferenciaGrupoId,
      salida,
      entrada: null,
    };
  }

  const entrada = await createFinancialMovement(actor, {
    cuentaId: input.cuentaDestinoId,
    cuentaContraparteId: input.cuentaOrigenId,
    tipoMovimiento: 'transferencia_entrada',
    descripcion: input.descripcion,
    fechaMovimiento: input.fechaMovimiento,
    valor,
    transferenciaGrupoId,
    origen: 'transferencia',
    metadata: {
      direccion: 'entrada',
      idempotency_key: idempotencyKey || null,
    },
  });

  return {
    transferenciaGrupoId,
    salida,
    entrada,
  };
}

const getEditableTransferGroup = async (transferGroupId: string) => {
  const { data: movements, error } = await supabaseServer
    .from('movimientos_financieros')
    .select(ACTIVE_MOVEMENTS_SELECT)
    .eq('transferencia_grupo_id', transferGroupId)
    .eq('activo', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  if (!movements || movements.length === 0) {
    throw new Error('No se encontro la transferencia');
  }

  const salida =
    movements.find((movement) => movement.tipo_movimiento === 'transferencia_salida') || null;
  const entrada =
    movements.find((movement) => movement.tipo_movimiento === 'transferencia_entrada') || null;

  if (!salida || salida.origen !== 'transferencia') {
    throw new Error('La transferencia no se puede editar desde esta pantalla');
  }

  return {
    salida: salida as MovimientoFinanciero,
    entrada: (entrada as MovimientoFinanciero | null) || null,
  };
};

export async function updateTransferBetweenAccounts(actor: Usuario, input: UpdateTransferInput) {
  if (!input.cuentaDestinoId && !input.cuentaExterna?.numeroCuenta) {
    throw new Error('Debes seleccionar una cuenta destino o registrar una cuenta externa');
  }

  if (input.cuentaDestinoId && input.cuentaOrigenId === input.cuentaDestinoId) {
    throw new Error('La cuenta origen y destino deben ser diferentes');
  }

  const valor = Number(input.valor || 0);
  if (valor <= 0) {
    throw new Error('El valor de la transferencia debe ser mayor a cero');
  }

  const { salida, entrada } = await getEditableTransferGroup(input.transferGroupId);
  const externalAccount = input.cuentaExterna || null;
  const now = new Date().toISOString();

  const { data: updatedSalida, error: salidaError } = await supabaseServer
    .from('movimientos_financieros')
    .update({
      cuenta_id: input.cuentaOrigenId,
      cuenta_contraparte_id: input.cuentaDestinoId || null,
      descripcion: input.descripcion.trim(),
      fecha_movimiento: input.fechaMovimiento,
      valor,
      metadata: {
        ...((salida.metadata as Record<string, unknown> | null) || {}),
        direccion: 'salida',
        cuenta_externa: externalAccount,
      },
      updated_by: actor.id,
      updated_at: now,
    })
    .eq('id', salida.id)
    .select(ACTIVE_MOVEMENTS_SELECT)
    .single();

  if (salidaError || !updatedSalida) {
    throw salidaError || new Error('No se pudo actualizar la salida de la transferencia');
  }

  if (!input.cuentaDestinoId) {
    if (entrada) {
      await softDeleteFinancialMovement(actor, entrada.id);
    }

    return {
      transferenciaGrupoId: input.transferGroupId,
      salida: updatedSalida as MovimientoFinanciero,
      entrada: null,
    };
  }

  if (entrada) {
    const { data: updatedEntrada, error: entradaError } = await supabaseServer
      .from('movimientos_financieros')
      .update({
        cuenta_id: input.cuentaDestinoId,
        cuenta_contraparte_id: input.cuentaOrigenId,
        descripcion: input.descripcion.trim(),
        fecha_movimiento: input.fechaMovimiento,
        valor,
        metadata: {
          ...((entrada.metadata as Record<string, unknown> | null) || {}),
          direccion: 'entrada',
        },
        updated_by: actor.id,
        updated_at: now,
      })
      .eq('id', entrada.id)
      .select(ACTIVE_MOVEMENTS_SELECT)
      .single();

    if (entradaError || !updatedEntrada) {
      throw entradaError || new Error('No se pudo actualizar la entrada de la transferencia');
    }

    return {
      transferenciaGrupoId: input.transferGroupId,
      salida: updatedSalida as MovimientoFinanciero,
      entrada: updatedEntrada as MovimientoFinanciero,
    };
  }

  const createdEntrada = await createFinancialMovement(actor, {
    cuentaId: input.cuentaDestinoId,
    cuentaContraparteId: input.cuentaOrigenId,
    tipoMovimiento: 'transferencia_entrada',
    descripcion: input.descripcion,
    fechaMovimiento: input.fechaMovimiento,
    valor,
    transferenciaGrupoId: input.transferGroupId,
    origen: 'transferencia',
    metadata: {
      direccion: 'entrada',
    },
  });

  return {
    transferenciaGrupoId: input.transferGroupId,
    salida: updatedSalida as MovimientoFinanciero,
    entrada: createdEntrada,
  };
}

export async function reverseTransferBetweenAccounts(actor: Usuario, transferGroupId: string) {
  const { salida, entrada } = await getEditableTransferGroup(transferGroupId);

  await softDeleteFinancialMovement(actor, salida.id);
  if (entrada) {
    await softDeleteFinancialMovement(actor, entrada.id);
  }

  return true;
}

export async function softDeleteFinancialMovement(actor: Usuario, movementId: string) {
  const { data: movement, error: movementError } = await supabaseServer
    .from('movimientos_financieros')
    .select(ACTIVE_MOVEMENTS_SELECT)
    .eq('id', movementId)
    .single();

  if (movementError || !movement) {
    throw new Error('No se encontro el movimiento a eliminar logicamente');
  }

  const { error } = await supabaseServer
    .from('movimientos_financieros')
    .update({
      activo: false,
      deleted_at: new Date().toISOString(),
      deleted_by: actor.id,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', movementId);

  if (error) {
    throw error;
  }

  return true;
}

export async function deleteCuadreWithFinancialCleanup(actor: Usuario, cuadreId: string) {
  const { data: cuadre, error: cuadreError } = await supabaseServer
    .from('cuadres_diarios')
    .select('id')
    .eq('id', cuadreId)
    .single();

  if (cuadreError || !cuadre) {
    throw new Error('No se encontro el cuadre a eliminar');
  }

  const { data: activeMovements, error: movementsError } = await supabaseServer
    .from('movimientos_financieros')
    .select('id')
    .eq('cuadre_id', cuadreId)
    .eq('activo', true);

  if (movementsError) {
    throw movementsError;
  }

  for (const movement of activeMovements || []) {
    await softDeleteFinancialMovement(actor, movement.id);
  }

  const { data: relatedMovements, error: relatedMovementsError } = await supabaseServer
    .from('movimientos_financieros')
    .select('id,metadata')
    .eq('cuadre_id', cuadreId);

  if (relatedMovementsError) {
    throw relatedMovementsError;
  }

  for (const movement of relatedMovements || []) {
    const metadata = (movement.metadata as Record<string, unknown> | null) || {};
    const nextMetadata = {
      ...metadata,
      deleted_cuadre_id: cuadreId,
      deleted_cuadre_at: new Date().toISOString(),
    };

    const { error: releaseCuadreError } = await supabaseServer
      .from('movimientos_financieros')
      .update({
        cuadre_id: null,
        metadata: nextMetadata,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', movement.id);

    if (releaseCuadreError) {
      throw releaseCuadreError;
    }
  }

  const [{ error: denominacionesError }, { error: gastosError }, { error: turnerosError }] =
    await Promise.all([
      supabaseServer.from('denominaciones_cuadre').delete().eq('cuadre_id', cuadreId),
      supabaseServer.from('gastos_diarios').delete().eq('cuadre_id', cuadreId),
      supabaseServer.from('pagos_turneros').delete().eq('cuadre_id', cuadreId),
    ]);

  if (denominacionesError) throw denominacionesError;
  if (gastosError) throw gastosError;
  if (turnerosError) throw turnerosError;

  const { error: deleteCuadreError } = await supabaseServer
    .from('cuadres_diarios')
    .delete()
    .eq('id', cuadreId);

  if (deleteCuadreError) {
    throw deleteCuadreError;
  }

  return {
    deletedFinancialMovements: (activeMovements || []).length,
  };
}

export async function upsertFinancialCategory(
  actor: Usuario,
  input: {
    id?: string;
    nombre: string;
    tipo: 'ingreso' | 'egreso' | 'ambos';
    descripcion?: string | null;
    activa: boolean;
  }
) {
  const payload = {
    nombre: input.nombre.trim(),
    tipo: input.tipo,
    descripcion: input.descripcion || null,
    activa: input.activa,
    updated_by: actor.id,
  };

  if (input.id) {
    const { data, error } = await supabaseServer
      .from('categorias_financieras')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CategoriaFinanciera;
  }

  const { data, error } = await supabaseServer
    .from('categorias_financieras')
    .insert({
      ...payload,
      es_sistema: false,
      created_by: actor.id,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as CategoriaFinanciera;
}

export async function upsertFinancialAccount(
  actor: Usuario,
  input: {
    id?: string;
    nombre: string;
    banco: string;
    titular?: string | null;
    numeroCuenta?: string | null;
    tipoCuenta?: string | null;
    tipoEntidad: CuentaFinanciera['tipo_entidad'];
    saldoInicial: number;
    estado: CuentaFinanciera['estado'];
    descripcion?: string | null;
  }
) {
  const payload = {
    nombre: input.nombre.trim(),
    banco: input.banco.trim(),
    titular: input.titular?.trim() || null,
    numero_cuenta: input.numeroCuenta || null,
    tipo_cuenta: input.tipoCuenta || null,
    tipo_entidad: input.tipoEntidad,
    saldo_inicial: Number(input.saldoInicial || 0),
    estado: input.estado,
    descripcion: input.descripcion || null,
    updated_by: actor.id,
  };

  if (input.id) {
    const { data, error } = await supabaseServer
      .from('cuentas_financieras')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CuentaFinanciera;
  }

  const { data, error } = await supabaseServer
    .from('cuentas_financieras')
    .insert({
      ...payload,
      created_by: actor.id,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as CuentaFinanciera;
}
