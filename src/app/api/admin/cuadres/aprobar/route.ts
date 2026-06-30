import { NextResponse } from 'next/server';
import {
  ensureFinancialBaseData,
  buildCuadreConsignacionSyncPlan,
  syncApprovedCuadreConsignaciones,
} from '@/lib/admin-bancos-server';
import { requireRoleFromRequest } from '@/lib/server-auth';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const auth = await requireRoleFromRequest(request, { allowSuper: true, allowTreasury: false });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const cuadreId = String(body?.cuadreId || '').trim();

    if (!cuadreId) {
      return NextResponse.json({ error: 'Debes indicar el cuadre a aprobar' }, { status: 400 });
    }

    await ensureFinancialBaseData(auth.profile);

    const { data: cuadre, error: cuadreError } = await supabaseServer
      .from('cuadres_diarios')
      .select('id,estado,fecha,valor_consignado,venta_tarjetas,url_foto_consignacion,firma_cajero_url,cuenta_financiera_destino_id,movimiento_financiero_sync_id')
      .eq('id', cuadreId)
      .single();

    if (cuadreError || !cuadre) {
      return NextResponse.json({ error: 'No se encontro el cuadre' }, { status: 404 });
    }

    const fechaAprobacion = new Date().toISOString();
    const { data: approvedCuadre, error: approveError } = await supabaseServer
      .from('cuadres_diarios')
      .update({
        estado: 'aprobado',
        fecha_aprobacion: fechaAprobacion,
      })
      .eq('id', cuadreId)
      .select()
      .single();

    if (approveError || !approvedCuadre) {
      return NextResponse.json({ error: 'No se pudo aprobar el cuadre' }, { status: 400 });
    }

    const valorConsignado = Number(approvedCuadre.valor_consignado || 0);
    const valorDatafono = Number(approvedCuadre.venta_tarjetas || 0);
    if (valorConsignado <= 0 && valorDatafono <= 0) {
      return NextResponse.json({
        success: true,
        cuadre: approvedCuadre,
        autoRegistered: false,
        reason: 'sin_consignacion',
      });
    }

    const plan = await buildCuadreConsignacionSyncPlan(approvedCuadre);
    const autoRegistrables = plan.filter((item) => item.cuentaFinancieraId);
    const hasPendingResolution = plan.some((item) => !item.isInformative && !item.cuentaFinancieraId);
    const hasInformativeOnly =
      plan.length > 0 && !hasPendingResolution && autoRegistrables.length === 0;
    const hasDatafono = valorDatafono > 0;

    if (autoRegistrables.length === 0 && !hasDatafono) {
      return NextResponse.json({
        success: true,
        cuadre: approvedCuadre,
        autoRegistered: false,
        reason: hasInformativeOnly ? 'solo_informativo' : 'cuentas_no_resueltas',
      });
    }

    const result = await syncApprovedCuadreConsignaciones(auth.profile, {
      cuadreId,
      forceHistorical: false,
    });

    const { data: syncedCuadre } = await supabaseServer
      .from('cuadres_diarios')
      .select('*')
      .eq('id', cuadreId)
      .single();

    return NextResponse.json({
      success: true,
      cuadre: syncedCuadre || approvedCuadre,
      autoRegistered: result.createdCount > 0,
      reason:
        result.pendingCount > 0
          ? (result.createdCount > 0 ? 'registro_parcial' : 'cuentas_no_resueltas')
          : 'registro_completo',
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'No se pudo aprobar el cuadre' }, { status: 400 });
  }
}
