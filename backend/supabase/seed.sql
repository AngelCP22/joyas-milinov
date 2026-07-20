-- ============================================================
-- Milinov Jewelry — Productos de ejemplo para Supabase
-- Ejecútalo DESPUÉS de schema.sql. Reemplaza estos datos por los reales
-- desde el Table Editor de Supabase (o vuelve a correr este script).
-- ============================================================

insert into public.products
  (id, sku, gender, name, category, collection, model, material, price, stock, status, image, images, description)
values
  (1,  'MIL-ANI-001', 'Mujer',  'Anillo Brillo Eterno', 'Anillos',  'Silver',  'Brillo Eterno', 'Plata 950', 119, 6, 'active', 'assets/products/anillo-brillo-eterno.jpg', '[]'::jsonb, 'Anillo delicado con brillo elegante, ideal para regalar.'),
  (2,  'MIL-COL-002', 'Mujer',  'Collar Dije Corazón',  'Collares', 'Silver',  'Dije Corazón',  'Plata 950', 139, 8, 'active', 'assets/products/collar-dije-corazon.jpg', '["assets/products/collar-dije-corazon.jpg","assets/products/collar-dije-corazon-2.jpg"]'::jsonb, 'Collar delicado con dije de corazón para uso diario.'),
  (3,  'MIL-ARE-003', 'Mujer',  'Aretes Dulce Luz',     'Aretes',   'Rose',    'Dulce Luz',     'Cobre + enchape oro 18k', 99,  10, 'active', 'assets/products/aretes-dulce-luz.jpg', '[]'::jsonb, 'Aretes delicados con brillo rosado.'),
  (4,  'MIL-COL-004', 'Mujer',  'Collar Mini Amor',     'Collares', 'Golden',  'Mini Amor',     'Cobre + enchape oro 18k', 149, 5, 'active', 'assets/products/collar-mini-amor.jpg', '[]'::jsonb, 'Collar con dije delicado y corazón.'),
  (5,  'MIL-COL-005', 'Hombre', 'Collar Placa Love',    'Collares', 'Silver',  'Placa Love',    'Plata 950', 159, 4, 'active', 'assets/products/collar-placa-love.jpg', '[]'::jsonb, 'Collar fino con placa, sobrio y elegante.'),
  (6,  'MIL-COL-006', 'Mujer',  'Collar Mini Corazón',  'Collares', 'Golden',  'Mini Corazón',  'Cobre + enchape oro 18k', 149, 7, 'active', 'assets/products/collar-corazon-diario.jpg', '[]'::jsonb, 'Collar clásico y elegante para ocasiones especiales.'),
  (7,  'MIL-ARE-007', 'Mujer',  'Aretes Corazón',       'Aretes',   'Rose',    'Corazón',       'Cobre + enchape oro 18k', 69,  12, 'active', 'assets/products/aretes-corazon.jpg', '[]'::jsonb, 'Aretes pequeños con diseño de corazón.'),
  (8,  'MIL-COL-008', 'Mujer',  'Collar Niña Corazón',  'Collares', 'Gold18k', 'Niña Corazón',  'Cobre + enchape oro 18k', 189, 3, 'active', 'assets/products/collar-nina-corazon.jpg', '[]'::jsonb, 'Collar fino con dije especial en acabado premium.'),
  (9,  'MIL-DIJ-009', 'Mujer',  'Collar Osito',         'Dijes',    'Golden',  'Osito',         'Cobre + enchape oro 18k', 129, 2, 'active', 'assets/products/collar-osito.jpg', '[]'::jsonb, 'Dije tierno y delicado para regalar.'),
  (10, 'MIL-PUL-010', 'Hombre', 'Pulsera Infinito',     'Pulseras', 'Silver',  'Infinito',      'Plata 950', 109, 6, 'active', 'assets/products/pulsera-infinito.jpg', '["assets/products/pulsera-infinito.jpg","assets/products/pulsera-infinito-2.jpg"]'::jsonb, 'Pulsera ligera con detalle infinito.'),
  (11, 'MIL-REL-011', 'Hombre', 'Reloj Casio Plateado',        'Relojes',  'Silver', 'Casio Plateado',       'Reloj',     189, 5, 'active', 'assets/products/reloj-casio-plateado.jpg', '["assets/products/reloj-casio-plateado.jpg","assets/products/reloj-casio-plateado-2.jpg"]'::jsonb, 'Reloj Casio para caballero con esfera plateada y correa de acero. Resistente al agua.'),
  (12, 'MIL-REL-012', 'Hombre', 'Reloj Casio Negro',           'Relojes',  'Silver', 'Casio Negro',          'Reloj',     199, 5, 'active', 'assets/products/reloj-casio-negro.jpg', '["assets/products/reloj-casio-negro.jpg"]'::jsonb, 'Reloj Casio para caballero con esfera negra y correa de acero. Elegante y resistente al agua.'),
  (13, 'MIL-COL-013', 'Hombre', 'Collar Cadena Cubana',        'Collares', 'Silver', 'Cadena Cubana',        'Plata 950', 280, 5, 'active', 'assets/products/collar-cubano-plata.jpg', '["assets/products/collar-cubano-plata.jpg"]'::jsonb, 'Collar de cadena cubana en Plata 950, sobrio y masculino.'),
  (14, 'MIL-COL-014', 'Hombre', 'Collar Cadena Cubana Gruesa', 'Collares', 'Silver', 'Cadena Cubana Gruesa', 'Plata 950', 390, 5, 'active', 'assets/products/collar-cubano-grueso-plata.jpg', '["assets/products/collar-cubano-grueso-plata.jpg"]'::jsonb, 'Collar de cadena cubana gruesa en Plata 950, con presencia y peso.'),
  (15, 'MIL-PUL-015', 'Hombre', 'Pulsera Cadena Cubana',       'Pulseras', 'Silver', 'Cadena Cubana',        'Plata 950', 160, 5, 'active', 'assets/products/pulsera-cubana-plata.jpg', '["assets/products/pulsera-cubana-plata.jpg"]'::jsonb, 'Pulsera de cadena cubana en Plata 950 para uso diario.'),
  (16, 'MIL-PUL-016', 'Hombre', 'Pulsera Cordón',              'Pulseras', 'Silver', 'Cordón',               'Plata 950', 140, 5, 'active', 'assets/products/pulsera-cordon-plata.jpg', '["assets/products/pulsera-cordon-plata.jpg"]'::jsonb, 'Pulsera tipo cordón (torzal) en Plata 950, resistente y elegante.'),
  (17, 'MIL-PUL-017', 'Hombre', 'Pulsera Rolo',                'Pulseras', 'Silver', 'Rolo',                 'Plata 950', 170, 5, 'active', 'assets/products/pulsera-rolo-plata.jpg', '["assets/products/pulsera-rolo-plata.jpg"]'::jsonb, 'Pulsera de eslabón rolo/ancla en Plata 950, de líneas limpias.'),
  (18, 'MIL-PUL-018', 'Hombre', 'Pulsera de Placa Personalizable', 'Pulseras', 'Silver', 'Placa Personalizable', 'Plata 950', 190, 5, 'active', 'assets/products/pulsera-placa-personalizada.jpg', '["assets/products/pulsera-placa-personalizada.jpg"]'::jsonb, 'Pulsera de placa en Plata 950, personalizable con el nombre que elijas (grabado). En la foto, ejemplo Carlos.')
on conflict (id) do nothing;

-- Reinicia el contador de ids para que los próximos productos no choquen con los sembrados.
select setval(pg_get_serial_sequence('public.products', 'id'), (select max(id) from public.products));
