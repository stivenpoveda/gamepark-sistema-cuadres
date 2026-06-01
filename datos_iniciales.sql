-- DATOS INICIALES DE PRUEBA PARA GAME PARK

-- Insertar puntos de venta
INSERT INTO puntos_de_venta (nombre, ciudad, direccion) VALUES
('Unicentro Villavicencio', 'Villavicencio', 'Centro Comercial Unicentro'),
('Llanocentro Villavicencio', 'Villavicencio', 'Centro Comercial Llanocentro'),
('Gran Estación Bogotá', 'Bogotá', 'Centro Comercial Gran Estación'),
('Chipichape Cali', 'Cali', 'Centro Comercial Chipichape');

-- NOTA: Para crear los usuarios, debes primero crear las cuentas en Supabase Auth y luego insertarlas aquí
-- Ejemplo de inserción de usuarios (reemplaza los IDs con los generados por Supabase Auth):

-- INSERT INTO usuarios (id, nombre, email, rol, punto_de_venta_id) VALUES
-- ('ID-SUPERADMIN-SUPABASE', 'Super Admin', 'admin@gamepark.com', 'superadmin', NULL),
-- ('ID-ADMIN-UNICENTRO', 'Admin Unicentro', 'pdv.unicentro@gamepark.com', 'admin_pdv', 'ID-PUNTO-DE-VENTA-UNICENTRO'),
-- ('ID-ADMIN-LLANOCENTRO', 'Admin Llanocentro', 'pdv.llanocentro@gamepark.com', 'admin_pdv', 'ID-PUNTO-DE-VENTA-LLANOCENTRO'),
-- ('ID-ADMIN-GRAN-ESTACION', 'Admin Gran Estación', 'pdv.granestacion@gamepark.com', 'admin_pdv', 'ID-PUNTO-DE-VENTA-GRAN-ESTACION'),
-- ('ID-ADMIN-CHIPICHAPE', 'Admin Chipichape', 'pdv.chipichape@gamepark.com', 'admin_pdv', 'ID-PUNTO-DE-VENTA-CHIPICHAPE');
