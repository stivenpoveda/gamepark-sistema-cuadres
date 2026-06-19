-- Agrega el rol "contabilidad" y le deja acceso de solo lectura a los datos
-- necesarios para ver cuadres, gastos, turneros, denominaciones y puntos de venta.
-- Ejecuta este script en el SQL Editor de Supabase.

DO $$
DECLARE
  role_constraint_name text;
BEGIN
  SELECT con.conname
  INTO role_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'usuarios'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%rol%';

  IF role_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', role_constraint_name);
  END IF;
END $$;

ALTER TABLE usuarios
ADD CONSTRAINT usuarios_rol_check
CHECK (rol IN ('superadmin', 'superadministrador', 'admin_pdv', 'contabilidad'));

DROP POLICY IF EXISTS "Usuarios pueden ver sus cuadres" ON cuadres_diarios;
CREATE POLICY "Usuarios pueden ver sus cuadres"
ON cuadres_diarios FOR SELECT
USING (
  usuario_id::uuid = auth.uid() OR
  EXISTS (
    SELECT 1
    FROM usuarios
    WHERE id::uuid = auth.uid()
      AND rol IN ('superadmin', 'superadministrador', 'contabilidad')
  )
);

DROP POLICY IF EXISTS "Usuarios pueden ver denominaciones de sus cuadres" ON denominaciones_cuadre;
CREATE POLICY "Usuarios pueden ver denominaciones de sus cuadres"
ON denominaciones_cuadre FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cuadres_diarios
    WHERE id = cuadre_id
      AND (
        usuario_id::uuid = auth.uid() OR
        EXISTS (
          SELECT 1
          FROM usuarios
          WHERE id::uuid = auth.uid()
            AND rol IN ('superadmin', 'superadministrador', 'contabilidad')
        )
      )
  )
);

DROP POLICY IF EXISTS "Usuarios pueden ver gastos de sus cuadres" ON gastos_diarios;
CREATE POLICY "Usuarios pueden ver gastos de sus cuadres"
ON gastos_diarios FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cuadres_diarios
    WHERE id = cuadre_id
      AND (
        usuario_id::uuid = auth.uid() OR
        EXISTS (
          SELECT 1
          FROM usuarios
          WHERE id::uuid = auth.uid()
            AND rol IN ('superadmin', 'superadministrador', 'contabilidad')
        )
      )
  )
);

DROP POLICY IF EXISTS "Usuarios pueden ver pagos de turneros de sus cuadres" ON pagos_turneros;
CREATE POLICY "Usuarios pueden ver pagos de turneros de sus cuadres"
ON pagos_turneros FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cuadres_diarios
    WHERE id = cuadre_id
      AND (
        usuario_id::uuid = auth.uid() OR
        EXISTS (
          SELECT 1
          FROM usuarios
          WHERE id::uuid = auth.uid()
            AND rol IN ('superadmin', 'superadministrador', 'contabilidad')
        )
      )
  )
);

-- puntos_de_venta ya tiene SELECT abierto con USING (TRUE), no requiere cambio.
-- usuarios ya permite que cada usuario vea su propia fila, suficiente para login y sesión.
