import { supabase } from '@/lib/supabase';
import { CUENTAS_CONSIGNACION } from '@/lib/utils';

export const ADMIN_BANCOS_DEFAULT_CATEGORIES = [
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
] as const;

export const ACCOUNT_KINDS = ['bancaria', 'caja', 'fondo', 'efectivo', 'billetera'] as const;
export const ACCOUNT_STATES = ['activa', 'inactiva'] as const;
export const MOVEMENT_TYPES = [
  'ingreso',
  'egreso',
  'transferencia_entrada',
  'transferencia_salida',
  'cuadre_aprobado',
] as const;
export const CATEGORY_TYPES = ['ingreso', 'egreso', 'ambos'] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type AccountState = (typeof ACCOUNT_STATES)[number];
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export type CuentaFinanciera = {
  id: string;
  nombre: string;
  banco: string;
  titular?: string | null;
  numero_cuenta?: string | null;
  tipo_cuenta?: string | null;
  tipo_entidad: AccountKind;
  saldo_inicial: number;
  estado: AccountState;
  descripcion?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type CategoriaFinanciera = {
  id: string;
  nombre: string;
  tipo: CategoryType;
  descripcion?: string | null;
  activa: boolean;
  es_sistema: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type MovimientoFinanciero = {
  id: string;
  cuenta_id: string;
  tipo_movimiento: MovementType;
  categoria_id?: string | null;
  descripcion: string;
  fecha_movimiento: string;
  valor: number;
  pdv_id?: string | null;
  centro_costo?: string | null;
  soporte_url?: string | null;
  cuenta_contraparte_id?: string | null;
  transferencia_grupo_id?: string | null;
  cuadre_id?: string | null;
  origen: 'manual' | 'transferencia' | 'cuadre_aprobado' | 'historico';
  metadata?: Record<string, unknown> | null;
  activo: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_by?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type MovimientoAudit = {
  id: string;
  movimiento_id: string;
  accion: 'insert' | 'update' | 'soft_delete' | 'restore';
  previous_data?: Record<string, unknown> | null;
  next_data?: Record<string, unknown> | null;
  actor_id?: string | null;
  actor_email?: string | null;
  created_at: string;
};

export type LedgerRow = MovimientoFinanciero & {
  saldo_acumulado: number;
};

export type FinancialSummary = {
  saldoTotal: number;
  ingresosMes: number;
  egresosMes: number;
  flujoNeto: number;
};

const BASE_ACCOUNT_TITULARS = new Map<string, string>([
  ...CUENTAS_CONSIGNACION.map(
    (account): [string, string] => [
    `${account.banco} ${account.tipoCuenta} ${account.numeroCuenta}`,
    account.titular,
  ]),
  ['Efectivo General', 'DIVERSIONES DE COLOMBIA'],
]);

export const getFinancialAccountTitular = (
  account: Pick<CuentaFinanciera, 'nombre' | 'titular'>
) => {
  const storedTitular = account.titular?.trim();
  if (storedTitular) {
    return storedTitular;
  }

  return BASE_ACCOUNT_TITULARS.get(account.nombre) || 'No definido';
};

export const formatMovementTypeLabel = (type: MovementType) => {
  const labels: Record<MovementType, string> = {
    ingreso: 'Ingreso',
    egreso: 'Egreso',
    transferencia_entrada: 'Transferencia Entrada',
    transferencia_salida: 'Transferencia Salida',
    cuadre_aprobado: 'Ingreso por Cuadre',
  };

  return labels[type] || type;
};

export const formatMovementOriginLabel = (origin: MovimientoFinanciero['origen']) => {
  const labels: Record<MovimientoFinanciero['origen'], string> = {
    manual: 'Manual',
    transferencia: 'Transferencia',
    cuadre_aprobado: 'Cuadre Aprobado',
    historico: 'Historico',
  };

  return labels[origin] || origin;
};

export const isManualBookMovement = (
  movement: Pick<MovimientoFinanciero, 'origen' | 'tipo_movimiento'>
) => movement.origen === 'manual' && (movement.tipo_movimiento === 'ingreso' || movement.tipo_movimiento === 'egreso');

export const isAutomaticBookMovement = (
  movement: Pick<MovimientoFinanciero, 'origen' | 'tipo_movimiento'>
) => !isManualBookMovement(movement);

export const isMovementIncome = (type: MovementType) =>
  type === 'ingreso' || type === 'transferencia_entrada' || type === 'cuadre_aprobado';

export const isMovementExpense = (type: MovementType) =>
  type === 'egreso' || type === 'transferencia_salida';

export const getMovementSignedValue = (movement: Pick<MovimientoFinanciero, 'tipo_movimiento' | 'valor'>) =>
  isMovementIncome(movement.tipo_movimiento) ? Number(movement.valor || 0) : -Number(movement.valor || 0);

export const buildLedgerRows = (
  account: Pick<CuentaFinanciera, 'id' | 'saldo_inicial'>,
  movements: MovimientoFinanciero[]
) => {
  const rows = movements
    .filter((movement) => movement.activo !== false && movement.cuenta_id === account.id)
    .sort((a, b) => {
      const dateA = `${a.fecha_movimiento}T${a.created_at || ''}`;
      const dateB = `${b.fecha_movimiento}T${b.created_at || ''}`;
      return dateA.localeCompare(dateB);
    });

  let runningBalance = Number(account.saldo_inicial || 0);

  return rows.map((movement) => {
    runningBalance += getMovementSignedValue(movement);
    return {
      ...movement,
      saldo_acumulado: runningBalance,
    };
  });
};

export const getAccountBalance = (
  account: Pick<CuentaFinanciera, 'id' | 'saldo_inicial'>,
  movements: MovimientoFinanciero[]
) => {
  const ledger = buildLedgerRows(account, movements);
  if (ledger.length === 0) {
    return Number(account.saldo_inicial || 0);
  }

  return Number(ledger[ledger.length - 1].saldo_acumulado || 0);
};

export const getMonthKey = (value: string) => value.slice(0, 7);

export const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

export const groupMovementsByMonth = (movements: MovimientoFinanciero[]) => {
  const map = new Map<string, { month: string; ingresos: number; egresos: number; neto: number }>();

  movements
    .filter((movement) => movement.activo !== false)
    .forEach((movement) => {
      const month = getMonthKey(movement.fecha_movimiento);
      const entry = map.get(month) || { month, ingresos: 0, egresos: 0, neto: 0 };
      const value = Number(movement.valor || 0);

      if (isMovementIncome(movement.tipo_movimiento)) {
        entry.ingresos += value;
        entry.neto += value;
      } else {
        entry.egresos += value;
        entry.neto -= value;
      }

      map.set(month, entry);
    });

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
};

export const getTopExpensesByCategory = (
  movements: MovimientoFinanciero[],
  categories: CategoriaFinanciera[]
) => {
  const categoryMap = new Map(categories.map((category) => [category.id, category.nombre]));
  const totals = new Map<string, number>();

  movements
    .filter((movement) => movement.activo !== false && isMovementExpense(movement.tipo_movimiento))
    .forEach((movement) => {
      const categoryName = categoryMap.get(movement.categoria_id || '') || 'Sin categoria';
      totals.set(categoryName, (totals.get(categoryName) || 0) + Number(movement.valor || 0));
    });

  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
};

export const getTopIncomeByPdv = (
  movements: MovimientoFinanciero[],
  puntosDeVenta: Array<{ id: string; nombre: string }>
) => {
  const pdvMap = new Map(puntosDeVenta.map((item) => [item.id, item.nombre]));
  const totals = new Map<string, number>();

  movements
    .filter((movement) => movement.activo !== false && isMovementIncome(movement.tipo_movimiento))
    .forEach((movement) => {
      const pdvName = pdvMap.get(movement.pdv_id || '') || 'Sin PDV';
      totals.set(pdvName, (totals.get(pdvName) || 0) + Number(movement.valor || 0));
    });

  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
};

export const buildFinancialSummary = (
  accounts: CuentaFinanciera[],
  movements: MovimientoFinanciero[]
): FinancialSummary => {
  const currentMonth = getCurrentMonthRange();

  const saldoTotal = accounts.reduce((sum, account) => sum + getAccountBalance(account, movements), 0);

  const monthlyMovements = movements.filter(
    (movement) =>
      movement.activo !== false &&
      movement.fecha_movimiento >= currentMonth.start &&
      movement.fecha_movimiento <= currentMonth.end
  );

  const ingresosMes = monthlyMovements
    .filter((movement) => isMovementIncome(movement.tipo_movimiento))
    .reduce((sum, movement) => sum + Number(movement.valor || 0), 0);

  const egresosMes = monthlyMovements
    .filter((movement) => isMovementExpense(movement.tipo_movimiento))
    .reduce((sum, movement) => sum + Number(movement.valor || 0), 0);

  return {
    saldoTotal,
    ingresosMes,
    egresosMes,
    flujoNeto: ingresosMes - egresosMes,
  };
};

export async function getClientAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

export async function authorizedJsonFetch<T>(url: string, init: RequestInit = {}) {
  const token = await getClientAccessToken();
  if (!token) {
    throw new Error('No se pudo validar la sesion');
  }

  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const json = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json?.error || 'No se pudo completar la solicitud');
  }

  return json;
}
