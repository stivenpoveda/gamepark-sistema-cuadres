import { supabaseServer } from '@/lib/supabase-server';
import type { CuentaFinanciera, MovimientoFinanciero, MovementType, CategoriaFinanciera } from '@/lib/admin-bancos';
import { CUENTAS_CONSIGNACION } from '@/lib/utils';
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
      nombre: 'Caja Menor',
      banco: 'Interno',
      titular: 'DIVERSIONES DE COLOMBIA',
      numero_cuenta: null,
      tipo_cuenta: 'Caja',
      tipo_entidad: 'caja',
      saldo_inicial: 0,
      estado: 'activa',
      descripcion: 'Caja menor operativa',
      created_by: actor.id,
      updated_by: actor.id,
    },
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
    .in('nombre', ['Caja Menor', 'Efectivo General']);

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

export async function syncApprovedCuadresBatch(actor: Usuario, cuentaId: string, cuadreIds?: string[]) {
  let query = supabaseServer
    .from('cuadres_diarios')
    .select('id')
    .eq('estado', 'aprobado')
    .or('movimiento_financiero_sync_id.is.null,cuenta_financiera_destino_id.is.null');

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
      const result = await syncApprovedCuadreToAccount(actor, {
        cuadreId: cuadre.id,
        cuentaId,
      });
      results.push({ cuadreId: cuadre.id, ok: true, ...result });
    } catch (syncError: any) {
      results.push({ cuadreId: cuadre.id, ok: false, error: syncError?.message || 'No se pudo sincronizar' });
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
    },
  });

  return {
    transferenciaGrupoId,
    salida,
    entrada,
  };
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
