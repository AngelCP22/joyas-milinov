# Backend Milinov

Servidor local **sin dependencias** (Node.js ≥ 18) que sirve **el sitio completo y el API de inventario** en un solo puerto.

Documentación general del proyecto: [../README.md](../README.md) · Técnica: [../docs/DOCUMENTACION.md](../docs/DOCUMENTACION.md)

## Ejecutar

```bash
cd backend
npm start        # o: npm run dev (se reinicia solo al editar server.js)
```

Queda disponible:

- Sitio: <http://localhost:3001>
- Panel admin: <http://localhost:3001/admin.html>
- API: <http://localhost:3001/api/products>

Puerto alternativo: `PORT=3002 npm start` (en PowerShell: `$env:PORT=3002; npm start`).

## Endpoints del API

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | Ping del servicio |
| `GET /api/products` | Lista. Filtros: `?category=Collares`, `?status=active`, `?q=corazon` |
| `GET /api/products/:id` | Un producto |
| `POST /api/products` | Crea (requiere `sku`, `name`, `category`, `model`) |
| `PATCH /api/products/:id` | Actualiza campos parciales |
| `DELETE /api/products/:id` | Elimina |
| `GET /api/categories` | Categorías únicas |
| `POST /api/uploads` | Sube imagen `{filename, dataUrl}` — JPG/PNG/WebP, máx. 5 MB |

### Ejemplo: crear una joya (cmd de Windows)

```bash
curl -X POST http://localhost:3001/api/products ^
  -H "Content-Type: application/json" ^
  -d "{\"sku\":\"MIL-COL-011\",\"name\":\"Collar Luna\",\"category\":\"Collares\",\"collection\":\"Silver\",\"model\":\"Luna\",\"material\":\"Plata 950\",\"price\":129,\"stock\":5,\"image\":\"assets/products/collar-luna.jpg\",\"description\":\"Collar delicado con dije de luna.\"}"
```

## Datos

- Inventario: `backend/data/products.json` (escritura atómica: nunca queda corrupto).
- Imágenes subidas desde el admin: `../assets/uploads/`.

## Seguridad

⚠️ **Sin autenticación, solo para uso local.** No exponer a internet ni desplegar la carpeta `backend/` o `admin.html` en el hosting público. El servidor estático nunca expone `backend/` por HTTP, pero el API acepta cualquier petición de quien pueda alcanzar el puerto.
