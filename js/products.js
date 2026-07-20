/**
 * products.js — Catálogo estático de respaldo.
 *
 * Es lo que ve el cliente cuando el sitio está en un hosting estático o el
 * backend local está apagado. Si el backend (backend/server.js) está activo,
 * app.js reemplaza esta lista con el inventario real de backend/data/products.json,
 * que se administra desde admin.html. El backend además regenera este archivo
 * automáticamente al guardar (no hace falta editarlo a mano si usas el panel).
 *
 * Campos: id (único), gender ("Hombre" | "Mujer"), name, category, collection,
 * material, price (S/), image (ruta relativa), description.
 *
 * EJES DE NAVEGACIÓN: género (Hombre/Mujer) → material (Plata 950 /
 * Cobre + enchape oro 18k / Reloj) → categoría (Aretes/Pulseras/Collares/Anillos;
 * los relojes usan categoría "Relojes" y no se subdividen).
 *
 * Campos OPCIONALES (si no existen, la tienda no los muestra y nada se rompe):
 *   stock, status ("active" | "sold_out"), images[] (galería; la 1ª es la portada),
 *   oldPrice (precio tachado + % OFF), badge ("nuevo" | "bestseller"),
 *   sizeMm, weightG, care, warranty, featured.
 */
const PRODUCTS = [
  {
    id: 1,
    gender: "Mujer",
    name: "Anillo Brillo Eterno",
    category: "Anillos",
    collection: "Silver",
    material: "Plata 950",
    price: 119,
    image: "assets/products/anillo-brillo-eterno.jpg",
    description: "Anillo delicado con brillo elegante, ideal para regalar.",
    badge: "bestseller",
    sizeMm: "Tallas 12 a 18",
    care: "Evita perfumes y cremas directas. Guárdalo seco en su bolsita."
  },
  {
    id: 2,
    gender: "Mujer",
    name: "Collar Dije Corazón",
    category: "Collares",
    collection: "Silver",
    material: "Plata 950",
    price: 139,
    image: "assets/products/collar-dije-corazon.jpg",
    images: ["assets/products/collar-dije-corazon.jpg", "assets/products/collar-dije-corazon-2.jpg"],
    description: "Collar delicado con dije de corazón para uso diario.",
    sizeMm: "Cadena de 40 + 5 cm",
    care: "Límpialo con un paño suave. Evita el contacto con agua de mar y cloro."
  },
  {
    id: 3,
    gender: "Mujer",
    name: "Aretes Dulce Luz",
    category: "Aretes",
    collection: "Rose",
    material: "Cobre + enchape oro 18k",
    price: 99,
    oldPrice: 129,
    image: "assets/products/aretes-dulce-luz.jpg",
    description: "Aretes delicados con brillo rosado."
  },
  {
    id: 4,
    gender: "Mujer",
    name: "Collar Mini Amor",
    category: "Collares",
    collection: "Golden",
    material: "Cobre + enchape oro 18k",
    price: 149,
    image: "assets/products/collar-mini-amor.jpg",
    description: "Collar con dije delicado y corazón."
  },
  {
    id: 5,
    gender: "Hombre",
    name: "Collar Placa Love",
    category: "Collares",
    collection: "Silver",
    material: "Plata 950",
    price: 159,
    image: "assets/products/collar-placa-love.jpg",
    description: "Collar fino con placa, sobrio y elegante."
  },
  {
    id: 6,
    gender: "Mujer",
    name: "Collar Mini Corazón",
    category: "Collares",
    collection: "Golden",
    material: "Cobre + enchape oro 18k",
    price: 149,
    image: "assets/products/collar-corazon-diario.jpg",
    description: "Collar clásico y elegante para ocasiones especiales."
  },
  {
    id: 7,
    gender: "Mujer",
    name: "Aretes Corazón",
    category: "Aretes",
    collection: "Rose",
    material: "Cobre + enchape oro 18k",
    price: 69,
    image: "assets/products/aretes-corazon.jpg",
    description: "Aretes pequeños con diseño de corazón."
  },
  {
    id: 8,
    gender: "Mujer",
    name: "Collar Niña Corazón",
    category: "Collares",
    collection: "Gold18k",
    material: "Cobre + enchape oro 18k",
    price: 189,
    image: "assets/products/collar-nina-corazon.jpg",
    description: "Collar fino con dije especial en acabado premium.",
    badge: "nuevo"
  },
  {
    id: 9,
    gender: "Mujer",
    name: "Collar Osito",
    category: "Dijes",
    collection: "Golden",
    material: "Cobre + enchape oro 18k",
    price: 129,
    image: "assets/products/collar-osito.jpg",
    description: "Dije tierno y delicado para regalar.",
    stock: 2
  },
  {
    id: 10,
    gender: "Hombre",
    name: "Pulsera Infinito",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 109,
    image: "assets/products/pulsera-infinito.jpg",
    images: ["assets/products/pulsera-infinito.jpg", "assets/products/pulsera-infinito-2.jpg"],
    description: "Pulsera ligera con detalle infinito.",
    sizeMm: "18 cm ajustable",
    weightG: 4,
    care: "Quítatela para dormir y bañarte. Guárdala seca para conservar el brillo."
  },
  // ⚠️ PRECIOS TEMPORALES (colección de hombre) — la dueña los corregirá.
  {
    id: 11,
    gender: "Hombre",
    name: "Reloj Casio Plateado",
    category: "Relojes",
    collection: "Silver",
    material: "Reloj",
    price: 189,
    stock: 5,
    image: "assets/products/reloj-casio-plateado.jpg",
    images: ["assets/products/reloj-casio-plateado.jpg", "assets/products/reloj-casio-plateado-2.jpg"],
    description: "Reloj Casio para caballero con esfera plateada y correa de acero. Resistente al agua.",
    badge: "nuevo"
  },
  {
    id: 12,
    gender: "Hombre",
    name: "Reloj Casio Negro",
    category: "Relojes",
    collection: "Silver",
    material: "Reloj",
    price: 199,
    stock: 5,
    image: "assets/products/reloj-casio-negro.jpg",
    description: "Reloj Casio para caballero con esfera negra y correa de acero. Elegante y resistente al agua.",
    badge: "nuevo"
  },
  {
    id: 13,
    gender: "Hombre",
    name: "Collar Cadena Cubana",
    category: "Collares",
    collection: "Silver",
    material: "Plata 950",
    price: 280,
    stock: 5,
    image: "assets/products/collar-cubano-plata.jpg",
    description: "Collar de cadena cubana en Plata 950, sobrio y masculino."
  },
  {
    id: 14,
    gender: "Hombre",
    name: "Collar Cadena Cubana Gruesa",
    category: "Collares",
    collection: "Silver",
    material: "Plata 950",
    price: 390,
    stock: 5,
    image: "assets/products/collar-cubano-grueso-plata.jpg",
    description: "Collar de cadena cubana gruesa en Plata 950, con presencia y peso."
  },
  {
    id: 15,
    gender: "Hombre",
    name: "Pulsera Cadena Cubana",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 160,
    stock: 5,
    image: "assets/products/pulsera-cubana-plata.jpg",
    description: "Pulsera de cadena cubana en Plata 950 para uso diario."
  },
  {
    id: 16,
    gender: "Hombre",
    name: "Pulsera Cordón",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 140,
    stock: 5,
    image: "assets/products/pulsera-cordon-plata.jpg",
    description: "Pulsera tipo cordón (torzal) en Plata 950, resistente y elegante."
  },
  {
    id: 17,
    gender: "Hombre",
    name: "Pulsera Rolo",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 170,
    stock: 5,
    image: "assets/products/pulsera-rolo-plata.jpg",
    description: "Pulsera de eslabón rolo/ancla en Plata 950, de líneas limpias."
  },
  {
    id: 18,
    gender: "Hombre",
    name: "Pulsera de Placa Personalizable",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 190,
    stock: 5,
    image: "assets/products/pulsera-placa-personalizada.jpg",
    description: "Pulsera de placa en Plata 950, personalizable con el nombre que elijas (grabado). En la foto, ejemplo \"Carlos\"."
  }
];
