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

export const GASTO_CATEGORIA_TRANSPORTE_CODE = 'Transporte/Fletes/Acarreos/Maq/Repuestos';
export const GASTO_CATEGORIA_TRANSPORTE_LABEL = 'Transporte, Fletes y Acarreos Maquinaria y Repuestos';

export const normalizeGastoCategoria = (categoria: unknown) => {
  const raw = String(categoria ?? '').trim();
  if (!raw) return 'Otros';
  if (raw === GASTO_CATEGORIA_TRANSPORTE_CODE) return GASTO_CATEGORIA_TRANSPORTE_CODE;

  const simplified = raw.toLowerCase().replace(/\s+/g, ' ');
  const isTransporte =
    simplified.includes('transporte') &&
    (simplified.includes('fletes') || simplified.includes('flete')) &&
    simplified.includes('acarreos') &&
    simplified.includes('repuestos');

  if (isTransporte) return GASTO_CATEGORIA_TRANSPORTE_CODE;

  return raw.length > 50 ? raw.slice(0, 50) : raw;
};

export const getGastoCategoriaLabel = (categoria: unknown) => {
  const normalized = normalizeGastoCategoria(categoria);
  if (normalized === GASTO_CATEGORIA_TRANSPORTE_CODE) return GASTO_CATEGORIA_TRANSPORTE_LABEL;
  return normalized;
};

export type CuentaConsignacionPredefinida = {
  id: string;
  banco: string;
  numeroCuenta: string;
  tipoCuenta: string;
  titular: string;
};

export type OtraCuentaConsignacion = {
  banco: string;
  numeroCuenta: string;
  tipoCuenta: string;
  titular: string;
};

export type ConsignacionSoporte = {
  id: string;
  fotoUrl?: string;
  valor?: number;
  cuentaId?: string;
  otraCuenta?: OtraCuentaConsignacion | null;
  banco?: string;
  tipoCuenta?: string;
  numeroCuenta?: string;
};

export type ConsignacionMetadata = {
  version: 1 | 2;
  cuentaId?: string;
  otraCuenta?: OtraCuentaConsignacion | null;
  fotos?: string[];
  consignaciones?: ConsignacionSoporte[];
};

export const CUENTAS_CONSIGNACION: CuentaConsignacionPredefinida[] = [
  { id: 'bancolombia-20260566437', banco: 'Bancolombia', numeroCuenta: '20260566437', tipoCuenta: 'Corriente', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'bancolombia-20125684512', banco: 'Bancolombia', numeroCuenta: '20125684512', tipoCuenta: 'Ahorros', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'bancolombia-65663758696', banco: 'Bancolombia', numeroCuenta: '65663758696', tipoCuenta: 'Ahorros', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'bogota-223493834', banco: 'Banco Bogota', numeroCuenta: '223493834', tipoCuenta: 'Corriente', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'bogota-657000972', banco: 'Banco Bogota', numeroCuenta: '657000972', tipoCuenta: 'Ahorros', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'davivienda-2669997203', banco: 'Davivienda', numeroCuenta: '2669997203', tipoCuenta: 'Corriente', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'davivienda-260012-5575', banco: 'Davivienda', numeroCuenta: '260012-5575', tipoCuenta: 'Ahorros', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'occidente-22584-6112', banco: 'B. occidente', numeroCuenta: '22584-6112', tipoCuenta: 'Corriente', titular: 'DIVERSIONES DE COLOMBIA' },
  { id: 'davidarias-bogota-14207-6025', banco: 'Banco Bogota', numeroCuenta: '14207-6025', tipoCuenta: 'Ahorros', titular: 'DAVID ARIAS' },
  { id: 'davidarias-bancolombia-5142201-8682', banco: 'Bancolombia', numeroCuenta: '5142201-8682', tipoCuenta: 'Ahorros', titular: 'DAVID ARIAS' },
  { id: 'davidarias-davivienda-17977000-1354', banco: 'Davivienda', numeroCuenta: '17977000-1354', tipoCuenta: 'Ahorros', titular: 'DAVID ARIAS' },
];

const isJsonObject = (value: string) => value.trim().startsWith('{') && value.trim().endsWith('}');

export const parseConsignacionMetadata = (raw: unknown): ConsignacionMetadata | null => {
  const text = String(raw ?? '').trim();
  if (!text || !isJsonObject(text)) return null;

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      version: parsed.version === 2 ? 2 : 1,
      cuentaId: typeof parsed.cuentaId === 'string' ? parsed.cuentaId : undefined,
      otraCuenta: parsed.otraCuenta && typeof parsed.otraCuenta === 'object'
        ? {
            banco: String(parsed.otraCuenta.banco || ''),
            numeroCuenta: String(parsed.otraCuenta.numeroCuenta || ''),
            tipoCuenta: String(parsed.otraCuenta.tipoCuenta || ''),
            titular: String(parsed.otraCuenta.titular || ''),
          }
        : null,
      fotos: Array.isArray(parsed.fotos)
        ? parsed.fotos.map((item: unknown) => String(item || '')).filter(Boolean)
        : [],
      consignaciones: Array.isArray(parsed.consignaciones)
        ? parsed.consignaciones
            .map((item: unknown, index: number): ConsignacionSoporte | null => {
              if (!item || typeof item !== 'object') return null;
              const soporte = item as Record<string, unknown>;
              const otraCuenta =
                soporte.otraCuenta && typeof soporte.otraCuenta === 'object'
                  ? {
                      banco: String((soporte.otraCuenta as Record<string, unknown>).banco || ''),
                      numeroCuenta: String((soporte.otraCuenta as Record<string, unknown>).numeroCuenta || ''),
                      tipoCuenta: String((soporte.otraCuenta as Record<string, unknown>).tipoCuenta || ''),
                      titular: String((soporte.otraCuenta as Record<string, unknown>).titular || ''),
                    }
                  : null;
              return {
                id: String(soporte.id || `consignacion-${index + 1}`),
                fotoUrl: String(soporte.fotoUrl || ''),
                valor: Number(soporte.valor) || 0,
                cuentaId: typeof soporte.cuentaId === 'string' ? soporte.cuentaId : undefined,
                otraCuenta,
                banco: String(soporte.banco || ''),
                tipoCuenta: String(soporte.tipoCuenta || ''),
                numeroCuenta: String(soporte.numeroCuenta || ''),
              } satisfies ConsignacionSoporte;
            })
            .filter((item: ConsignacionSoporte | null): item is ConsignacionSoporte => Boolean(item))
        : [],
    };
  } catch {
    return null;
  }
};

export const serializeConsignacionMetadata = (input: {
  cuentaId?: string;
  otraCuenta?: OtraCuentaConsignacion | null;
  fotos?: string[];
  consignaciones?: ConsignacionSoporte[];
}) => {
  const consignaciones = (input.consignaciones || []).map((consignacion, index) => ({
    id: consignacion.id || `consignacion-${index + 1}`,
    fotoUrl: consignacion.fotoUrl || '',
    valor: Number(consignacion.valor) || 0,
    cuentaId: consignacion.cuentaId || undefined,
    otraCuenta: consignacion.cuentaId === 'otra' ? (consignacion.otraCuenta || null) : null,
    banco: consignacion.banco || '',
    tipoCuenta: consignacion.tipoCuenta || '',
    numeroCuenta: consignacion.numeroCuenta || '',
  }));
  const payload: ConsignacionMetadata = {
    version: consignaciones.length > 0 ? 2 : 1,
    cuentaId: input.cuentaId || undefined,
    otraCuenta: input.otraCuenta || null,
    fotos: (input.fotos || []).filter(Boolean),
    consignaciones,
  };
  return JSON.stringify(payload);
};

export const getCuentaConsignacionById = (cuentaId: string | null | undefined) =>
  CUENTAS_CONSIGNACION.find((cuenta) => cuenta.id === cuentaId);

export const getConsignacionSoportes = (input: {
  url_foto_consignacion?: string | null;
  firma_cajero_url?: string | null;
}) => {
  const metadata = parseConsignacionMetadata(input.firma_cajero_url);
  const soportesMetadata = (metadata?.consignaciones || []).map((consignacion, index) => ({
    id: consignacion.id || `consignacion-${index + 1}`,
    fotoUrl: consignacion.fotoUrl || '',
    valor: Number(consignacion.valor) || 0,
    cuentaId: consignacion.cuentaId || undefined,
    otraCuenta: consignacion.cuentaId === 'otra' ? consignacion.otraCuenta || null : null,
    banco: consignacion.banco || '',
    tipoCuenta: consignacion.tipoCuenta || '',
    numeroCuenta: consignacion.numeroCuenta || '',
  }));

  if (soportesMetadata.length > 0) {
    const principalUrl = input.url_foto_consignacion || '';
    const alreadyHasPrincipal = principalUrl
      ? soportesMetadata.some((consignacion) => consignacion.fotoUrl === principalUrl)
      : true;
    const soportes = alreadyHasPrincipal
      ? soportesMetadata
      : [
          {
            id: 'consignacion-principal',
            fotoUrl: principalUrl,
            valor: 0,
            cuentaId: metadata?.cuentaId || undefined,
            otraCuenta: metadata?.cuentaId === 'otra' ? metadata.otraCuenta || null : null,
            banco: '',
            tipoCuenta: '',
            numeroCuenta: '',
          },
          ...soportesMetadata,
        ];

    return soportes.filter(
      (consignacion) =>
        Boolean(consignacion.fotoUrl) ||
        (Number(consignacion.valor) || 0) > 0 ||
        Boolean(consignacion.cuentaId) ||
        Boolean(consignacion.otraCuenta?.banco) ||
        Boolean(consignacion.banco) ||
        Boolean(consignacion.numeroCuenta)
    );
  }

  const fotos = [input.url_foto_consignacion || '', ...(metadata?.fotos || [])].filter(Boolean);
  return fotos.map((fotoUrl, index) => ({
    id: `consignacion-${index + 1}`,
    fotoUrl,
    valor: 0,
    cuentaId: metadata?.cuentaId || undefined,
    otraCuenta: metadata?.cuentaId === 'otra' ? metadata.otraCuenta || null : null,
    banco: '',
    tipoCuenta: '',
    numeroCuenta: '',
  }));
};

export const getConsignacionFotos = (input: {
  url_foto_consignacion?: string | null;
  firma_cajero_url?: string | null;
}) => {
  return Array.from(
    new Set(
      getConsignacionSoportes(input)
        .map((consignacion) => consignacion.fotoUrl || '')
        .filter(Boolean)
    )
  );
};
