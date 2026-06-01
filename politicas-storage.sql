-- POLÍTICAS DE STORAGE PARA SUPABASE
-- Ejecuta estas consultas en el Editor SQL de Supabase

-- POLÍTICAS PARA BUCKET "soportes"
CREATE POLICY "Usuarios autenticados pueden ver soportes"
ON storage.objects FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden subir soportes"
ON storage.objects FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden actualizar soportes"
ON storage.objects FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden borrar soportes"
ON storage.objects FOR DELETE
USING (auth.role() = 'authenticated');

-- POLÍTICAS PARA BUCKET "firmas"
CREATE POLICY "Usuarios autenticados pueden ver firmas"
ON storage.objects FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden subir firmas"
ON storage.objects FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden actualizar firmas"
ON storage.objects FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden borrar firmas"
ON storage.objects FOR DELETE
USING (auth.role() = 'authenticated');
