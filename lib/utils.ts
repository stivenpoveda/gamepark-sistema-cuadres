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
