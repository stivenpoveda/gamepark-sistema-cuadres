-- POLÍTICAS DE SEGURIDAD ACTUALIZADAS

-- POLÍTICAS PARA CUADRES_DIARIOS
CREATE POLICY "Usuarios pueden ver sus cuadres"
ON cuadres_diarios FOR SELECT
USING (
  auth.uid()::text = usuario_id OR 
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

CREATE POLICY "Usuarios pueden crear cuadres"
ON cuadres_diarios FOR INSERT
WITH CHECK (
  auth.uid()::text = usuario_id OR
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

CREATE POLICY "Usuarios pueden actualizar sus cuadres"
ON cuadres_diarios FOR UPDATE
USING (
  auth.uid()::text = usuario_id OR
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

CREATE POLICY "Superadmin pueden eliminar cuadres"
ON cuadres_diarios FOR DELETE
USING (
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

-- POLÍTICAS PARA DENOMINACIONES_CUADRE
CREATE POLICY "Usuarios pueden ver denominaciones de sus cuadres"
ON denominaciones_cuadre FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden crear denominaciones para sus cuadres"
ON denominaciones_cuadre FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden actualizar denominaciones de sus cuadres"
ON denominaciones_cuadre FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Superadmin pueden eliminar denominaciones"
ON denominaciones_cuadre FOR DELETE
USING (
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

-- POLÍTICAS PARA GASTOS_DIARIOS
CREATE POLICY "Usuarios pueden ver gastos de sus cuadres"
ON gastos_diarios FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden crear gastos para sus cuadres"
ON gastos_diarios FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden actualizar gastos de sus cuadres"
ON gastos_diarios FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Superadmin pueden eliminar gastos"
ON gastos_diarios FOR DELETE
USING (
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

-- POLÍTICAS PARA PAGOS_TURNEROS
CREATE POLICY "Usuarios pueden ver pagos de turneros de sus cuadres"
ON pagos_turneros FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden crear pagos de turneros para sus cuadres"
ON pagos_turneros FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Usuarios pueden actualizar pagos de turneros de sus cuadres"
ON pagos_turneros FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM cuadres_diarios WHERE id = cuadre_id AND (usuario_id = auth.uid()::text OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))))
);

CREATE POLICY "Superadmin pueden eliminar pagos de turneros"
ON pagos_turneros FOR DELETE
USING (
  EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador'))
);

-- POLÍTICAS PARA USUARIOS
CREATE POLICY "Usuarios pueden ver sus propios datos"
ON usuarios FOR SELECT
USING (auth.uid()::text = id OR rol IN ('superadmin', 'superadministrador'));

CREATE POLICY "Superadmin pueden crear usuarios"
ON usuarios FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador')));

CREATE POLICY "Usuarios pueden actualizar sus propios datos"
ON usuarios FOR UPDATE
USING (auth.uid()::text = id OR EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador')));

-- POLÍTICAS PARA PUNTOS_DE_VENTA
CREATE POLICY "Todos pueden ver puntos de venta activos"
ON puntos_de_venta FOR SELECT
USING (TRUE);

CREATE POLICY "Superadmin pueden crear puntos de venta"
ON puntos_de_venta FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador')));

CREATE POLICY "Superadmin pueden actualizar puntos de venta"
ON puntos_de_venta FOR UPDATE
USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid()::text AND rol IN ('superadmin', 'superadministrador')));
