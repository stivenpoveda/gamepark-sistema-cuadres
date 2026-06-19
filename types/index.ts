export type PuntoDeVenta = {
  id: string;
  nombre: string;
  ciudad: string;
  direccion?: string;
  activo: boolean;
  created_at: string;
};

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: 'superadmin' | 'superadministrador' | 'admin_pdv' | 'contabilidad';
  punto_de_venta_id?: string;
  activo: boolean;
  created_at: string;
  punto_de_venta?: PuntoDeVenta;
};

export type DenominacionCuadre = {
  id: string;
  cuadre_id: string;
  denominacion: number;
  cantidad: number;
  valor_total: number;
};

export type GastoDiario = {
  id: string;
  cuadre_id: string;
  descripcion: string;
  categoria: string;
  valor: number;
  url_foto_factura?: string;
  fecha: string;
  registrado_por?: string;
  created_at: string;
};

export type PagoTurnero = {
  id: string;
  cuadre_id: string;
  nombre_turnero: string;
  valor: number;
  horario?: string;
  url_foto_soporte?: string;
  fecha: string;
  registrado_por?: string;
  created_at: string;
};

export type SupabaseError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type CuadreDiario = {
  id: string;
  punto_de_venta_id: string;
  usuario_id: string;
  fecha: string;
  recaudo: number;
  venta_tarjetas: number;
  venta_fiesta: number;
  venta_confiteria: number;
  recibos: number;
  venta_cajero_auto: number;
  tar_inicial: number;
  tar_consumo: number;
  tar_fiestas: number;
  tar_malas: number;
  tar_final: number;
  total_fisico: number;
  total_sistema: number;
  sobrante: number;
  faltante: number;
  consignacion_pendiente: number;
  valor_consignado: number;
  consigna_hoy?: boolean;
  url_foto_consignacion?: string | null;
  firma_cajero_url?: string;
  firma_admin_url?: string;
  nombre_administradora?: string;
  cedula_administradora?: string;
  observaciones?: string;
  estado: 'borrador' | 'pendiente' | 'enviado' | 'aprobado' | 'devuelto';
  observacion_superadmin?: string;
  fecha_envio?: string;
  fecha_aprobacion?: string;
  created_at: string;
  updated_at: string;
  punto_de_venta?: PuntoDeVenta;
  usuario?: Usuario;
  denominaciones?: DenominacionCuadre[];
  denominaciones_cuadre?: DenominacionCuadre[];
  gastos?: GastoDiario[];
  gastos_diarios?: GastoDiario[];
  turneros?: PagoTurnero[];
  pagos_turneros?: PagoTurnero[];
};
