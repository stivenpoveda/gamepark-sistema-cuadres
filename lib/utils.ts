export const formatCOP = (v: number | string | null | undefined) => {
  const num = Number(v) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(num);
};

// Función para formatear fechas sin problemas de timezone
export const formatDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-');
  // Creamos la fecha sin timezone:
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// Función para obtener la fecha actual en formato YYYY-MM-DD sin timezone
export const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const sumValores = (
  items: Array<{ valor: number | string | null | undefined }> | null | undefined
) => (items || []).reduce((sum, item) => sum + (Number(item.valor) || 0), 0);

export const calcCuadreMetrics = (input: {
  recaudo?: number | string | null | undefined;
  venta_tarjetas?: number | string | null | undefined;
  consignacion_pendiente?: number | string | null | undefined;
  valor_consignado?: number | string | null | undefined;
  url_foto_consignacion?: string | null | undefined;
  consigna_hoy?: boolean | null | undefined;
  gastos?: Array<{ valor: number | string | null | undefined }> | null | undefined;
  turneros?: Array<{ valor: number | string | null | undefined }> | null | undefined;
  total_fisico?: number | string | null | undefined;
  context?: 'draft' | 'final';
}) => {
  const totalGastos = sumValores(input.gastos);
  const totalTurneros = sumValores(input.turneros);
  const totalDeducciones = totalGastos + totalTurneros;

  const ventaSistema = Number(input.recaudo) || 0;
  const ventaDatafono = Number(input.venta_tarjetas) || 0;
  const totalEfectivoEsperado = ventaSistema - ventaDatafono - totalDeducciones;

  const consignacionPendiente = Number(input.consignacion_pendiente) || 0;
  const totalFisico = Number(input.total_fisico) || 0;

  const context = input.context || 'final';
  const consignaHoy = (input.consigna_hoy ?? true) === true;
  const hayFotoConsignacion = Boolean(input.url_foto_consignacion);
  const valorConsignado = Number(input.valor_consignado) || 0;

  const totalGeneralAConsignar =
    context === 'draft'
      ? totalEfectivoEsperado + consignacionPendiente
      : consignaHoy === false
        ? consignacionPendiente
        : hayFotoConsignacion
          ? valorConsignado + consignacionPendiente
          : totalEfectivoEsperado + consignacionPendiente;

  const pendienteInicial =
    context === 'draft' ? consignacionPendiente : Math.max(0, totalGeneralAConsignar - totalEfectivoEsperado);

  const sobrante = Math.max(0, totalFisico - totalGeneralAConsignar);
  const faltante = Math.max(0, totalGeneralAConsignar - totalFisico);

  return {
    totalGastos,
    totalTurneros,
    totalDeducciones,
    ventaSistema,
    ventaDatafono,
    totalEfectivoEsperado,
    totalGeneralAConsignar,
    pendienteInicial,
    totalFisico,
    sobrante,
    faltante,
  };
};
