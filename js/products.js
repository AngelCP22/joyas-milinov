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
  {
    id: 11,
    gender: "Mujer",
    name: "Reloj Aurora (ejemplo)",
    category: "Relojes",
    collection: "Gold18k",
    material: "Reloj",
    price: 189,
    image: "assets/placeholder.svg",
    description: "Reloj de ejemplo. Reemplaza la foto y los datos desde el panel."
  },
  {
    id: 12,
    gender: "Hombre",
    name: "Reloj Clásico (ejemplo)",
    category: "Relojes",
    collection: "Silver",
    material: "Reloj",
    price: 219,
    image: "assets/placeholder.svg",
    description: "Reloj de ejemplo. Reemplaza la foto y los datos desde el panel."
  }
];
