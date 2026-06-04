# Backend Milinov

API local para administrar joyas, precios, stock, categorías, colecciones y modelos.

## Ejecutar

```bash
cd backend
npm start
```

La API queda en `http://localhost:3001`.

## Endpoints

- `GET /api/health`
- `GET /api/products`
- `GET /api/products?category=Collares`
- `GET /api/products?q=corazon`
- `GET /api/products/:id`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/categories`
- `POST /api/uploads`

## Ejemplo para crear una joya

```bash
curl -X POST http://localhost:3001/api/products ^
  -H "Content-Type: application/json" ^
  -d "{\"sku\":\"MIL-COL-011\",\"name\":\"Collar Luna\",\"category\":\"Collares\",\"collection\":\"Silver\",\"model\":\"Luna\",\"material\":\"Plata 950\",\"price\":129,\"stock\":5,\"image\":\"assets/products/collar-luna.jpg\",\"description\":\"Collar delicado con dije de luna.\"}"
```

Por ahora guarda los datos en `backend/data/products.json`. Las imágenes subidas desde `admin.html` se guardan en `assets/uploads/`.
