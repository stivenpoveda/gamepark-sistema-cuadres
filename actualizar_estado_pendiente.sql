-- ACTUALIZAR RESTRICCIÓN DE ESTADO PARA INCLUIR 'pendiente'
-- Ejecuta esto en el editor SQL de Supabase (SQL Editor)

-- 1. Eliminar la restricción existente
ALTER TABLE cuadres_diarios DROP CONSTRAINT IF EXISTS cuadres_diarios_estado_check;

-- 2. Crear la nueva restricción que incluya 'pendiente'
ALTER TABLE cuadres_diarios 
ADD CONSTRAINT cuadres_diarios_estado_check 
CHECK (estado IN ('borrador', 'pendiente', 'enviado', 'aprobado', 'devuelto'));
