-- POLÍTICAS DE SEGURIDAD (RLS) ACTUALIZADAS PARA SUPABASE

-- Habilitar RLS en todas las tablas (si no lo está ya)
ALTER TABLE puntos_de_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuadres_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE denominaciones_cuadre ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_turneros ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas antiguas (si existen)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer puntos de venta" ON puntos_de_venta;
DROP POLICY IF EXISTS "Superadmin puede modificar puntos de venta" ON puntos_de_venta;
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer usuarios" ON usuarios;
DROP POLICY IF EXISTS "Superadmin puede modificar usuarios" ON usuarios;
DROP POLICY IF EXISTS "Usuarios pueden leer cuadres de su PDV" ON cuadres_diarios;
DROP POLICY IF EXISTS "Usuarios pueden crear/modificar cuadres de su PDV" ON cuadres_diarios;
DROP POLICY IF EXISTS "Usuarios pueden acceder a denominaciones" ON denominaciones_cuadre;
DROP POLICY IF EXISTS "Usuarios pueden acceder a gastos" ON gastos_diarios;
DROP POLICY IF EXISTS "Usuarios pueden acceder a turneros" ON pagos_turneros;

-- Políticas para puntos_de_venta (todos los usuarios autenticados pueden leer)
CREATE POLICY "Usuarios autenticados pueden leer puntos de venta"
  ON puntos_de_venta FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Superadmin puede modificar puntos de venta"
  ON puntos_de_venta FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND (usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador')
    )
  );

-- Políticas para usuarios
CREATE POLICY "Usuarios autenticados pueden leer usuarios"
  ON usuarios FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Superadmin puede modificar usuarios"
  ON usuarios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND (usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador')
    )
  );

-- Políticas para cuadres_diarios
CREATE POLICY "Usuarios pueden leer cuadres de su PDV"
  ON cuadres_diarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND (
        usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador'
        OR usuarios.punto_de_venta_id = cuadres_diarios.punto_de_venta_id
      )
    )
  );

CREATE POLICY "Usuarios pueden crear/modificar cuadres de su PDV"
  ON cuadres_diarios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND (
        usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador'
        OR usuarios.punto_de_venta_id = cuadres_diarios.punto_de_venta_id
      )
    )
  );

-- Políticas para denominaciones_cuadre
CREATE POLICY "Usuarios pueden acceder a denominaciones"
  ON denominaciones_cuadre FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cuadres_diarios
      JOIN usuarios ON usuarios.punto_de_venta_id = cuadres_diarios.punto_de_venta_id OR usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador'
      WHERE cuadres_diarios.id = denominaciones_cuadre.cuadre_id
      AND usuarios.id = auth.uid()
    )
  );

-- Políticas para gastos_diarios
CREATE POLICY "Usuarios pueden acceder a gastos"
  ON gastos_diarios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cuadres_diarios
      JOIN usuarios ON usuarios.punto_de_venta_id = cuadres_diarios.punto_de_venta_id OR usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador'
      WHERE cuadres_diarios.id = gastos_diarios.cuadre_id
      AND usuarios.id = auth.uid()
    )
  );

-- Políticas para pagos_turneros
CREATE POLICY "Usuarios pueden acceder a turneros"
  ON pagos_turneros FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cuadres_diarios
      JOIN usuarios ON usuarios.punto_de_venta_id = cuadres_diarios.punto_de_venta_id OR usuarios.rol = 'superadmin' OR usuarios.rol = 'superadministrador'
      WHERE cuadres_diarios.id = pagos_turneros.cuadre_id
      AND usuarios.id = auth.uid()
    )
  );
