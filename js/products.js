/**
 * products.js — Catálogo estático de respaldo.
 *
 * Es lo que ve el cliente cuando el sitio está en un hosting estático o el
 * backend local está apagado. Si el backend (backend/server.js) está activo,
 * app.js reemplaza esta lista con el inventario real de backend/data/products.json,
 * que se administra desde admin.html.
 *
 * IMPORTANTE: si publicas el sitio sin backend, mantén esta lista sincronizada
 * con backend/data/products.json (mismos id, nombres, precios e imágenes).
 *
 * Campos: id (único), name, category, collection, material, price (S/),
 * image (ruta relativa), description. Opcionales: stock, status
 * ("active" | "sold_out") — si existen, la tienda muestra "Agotado" y
 * limita el carrito al stock disponible.
 */
const PRODUCTS = [
  {
    id: 1,
    name: "Anillo Brillo Eterno",
    category: "Anillos",
    collection: "Silver",
    material: "Plata 950",
    price: 119,
    image: "assets/products/anillo-brillo-eterno.jpg",
    description: "Anillo delicado con brillo elegante, ideal para regalar."
  },
  {
    id: 2,
    name: "Collar Dije Corazón",
    category: "Collares",
    collection: "Silver",
    material: "Plata 950",
    price: 139,
    image: "assets/products/collar-dije-corazon.jpg",
    description: "Collar delicado con dije de corazón para uso diario."
  },
  {
    id: 3,
    name: "Aretes Dulce Luz",
    category: "Aretes",
    collection: "Rose",
    material: "Cobre + enchape oro 18k",
    price: 99,
    image: "assets/products/aretes-dulce-luz.jpg",
    description: "Aretes delicados con brillo rosado."
  },
  {
    id: 4,
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
    name: "Collar Placa Love",
    category: "Dijes",
    collection: "Silver",
    material: "Plata 950",
    price: 159,
    image: "assets/products/collar-placa-love.jpg",
    description: "Collar fino con placa delicada de amor."
  },
  {
    id: 6,
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
    name: "Collar Niña Corazón",
    category: "Collares",
    collection: "Gold18k",
    material: "Cobre + enchape oro 18k",
    price: 189,
    image: "assets/products/collar-nina-corazon.jpg",
    description: "Collar fino con dije especial en acabado premium."
  },
  {
    id: 9,
    name: "Collar Osito",
    category: "Dijes",
    collection: "Golden",
    material: "Cobre + enchape oro 18k",
    price: 129,
    image: "assets/products/collar-osito.jpg",
    description: "Dije tierno y delicado para regalar."
  },
  {
    id: 10,
    name: "Pulsera Infinito",
    category: "Pulseras",
    collection: "Silver",
    material: "Plata 950",
    price: 109,
    image: "assets/products/pulsera-infinito.jpg",
    description: "Pulsera ligera con detalle infinito."
  }
];
