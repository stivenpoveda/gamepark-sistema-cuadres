import { supabase } from '@/lib/supabase';

const ONE_YEAR_IN_DAYS = 365;

export async function cleanupPdvSupportHistory(puntoDeVentaId: string) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ONE_YEAR_IN_DAYS);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  const { data: expiredCuadres, error: cuadresError } = await supabase
    .from('cuadres_diarios')
    .select('id')
    .eq('punto_de_venta_id', puntoDeVentaId)
    .lt('fecha', cutoff);

  if (cuadresError) {
    throw cuadresError;
  }

  const cuadreIds = expiredCuadres?.map((item) => item.id) || [];
  if (cuadreIds.length === 0) {
    return { deletedGastos: 0, deletedTurneros: 0 };
  }

  const [{ error: gastosError }, { error: turnerosError }] = await Promise.all([
    supabase.from('gastos_diarios').delete().in('cuadre_id', cuadreIds),
    supabase.from('pagos_turneros').delete().in('cuadre_id', cuadreIds),
  ]);

  if (gastosError) {
    throw gastosError;
  }

  if (turnerosError) {
    throw turnerosError;
  }

  return {
    deletedGastos: cuadreIds.length,
    deletedTurneros: cuadreIds.length,
  };
}
