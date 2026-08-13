# Lessons learned

## LESSON-001 — Un CHECK que evalúa a NULL se considera satisfecho

- What happened: `products_portada_coherente` comparaba `image = images ->> 0`
  para exigir que la portada fuese la primera foto. Con `image` en NULL la
  expresión da NULL y Postgres acepta la fila, así que una joya publicada podía
  guardarse con galería llena y sin portada.
- Symptom and root cause: la tienda pintaría `src="undefined"` (cae al
  placeholder por `onerror`). Causa raíz: en un CHECK solo bloquea FALSE;
  NULL pasa. La intuición de "la comparación es falsa" es incorrecta.
- Why controls missed it: la prueba de la constraint solo cubría el caso
  "portada distinta a la primera foto", nunca el caso NULL.
- Solution and prevention: `image is not null and image = images ->> 0`. Para
  cualquier CHECK futuro sobre columnas nullables, escribir explícitamente la
  condición de NULL o usar `coalesce`.
- Regression test: `backend/test/supabase-schema.test.js` → "constraints: la
  portada debe ser la primera foto de la galería (D3)" (INSERT y UPDATE con
  `image = null`). Verificado: falla si se quita `image is not null`.
- Reusable rule proposal: al revisar constraints, probar siempre el valor NULL
  de cada columna involucrada, no solo valores incorrectos.
- Evidence/recurrence: 1 incidencia (2026-08-11), detectada en autorrevisión
  antes de cualquier despliegue.

## LESSON-002 — `removeChannel()` de supabase-js reinyecta CLOSED en el callback

- What happened: la reconexión de Realtime trataba `CLOSED` como fallo y, al
  reintentar, llamaba `removeChannel()`, que emite `CLOSED` en el callback del
  canal cerrado y encadenaba otro reintento. Además `SUBSCRIBED` no cancelaba
  el reintento pendiente, que luego mataba el canal ya sano.
- Symptom and root cause: bucle infinito de teardown/resubscribe cada ~2 s, con
  un `select *` del catálogo completo y un repintado por ciclo, en cada pestaña
  abierta y para siempre. Verificado en el bundle:
  `_onClose(()=>e?.(D.CLOSED))`.
- Why controls missed it: no había prueba del ciclo de vida del canal; la
  verificación manual solo cubría el camino feliz.
- Solution and prevention: identidad de canal (los eventos de un canal ya
  reemplazado se ignoran) + `clearTimeout` del reintento al conectar. Regla
  general: un teardown propio nunca debe alimentar la política de reintentos.
- Regression test: `backend/test/store-realtime.test.js` (5 pruebas con
  temporizadores simulados). Verificado: 3 fallan con la lógica anterior.
- Reusable rule proposal: al implementar reconexión con backoff, probar
  siempre "falla → reintenta → conecta" y "falla → se recupera solo" con
  temporizadores simulados, y asegurarse de que el evento de cierre propio no
  se confunda con el del servidor.
- Evidence/recurrence: 1 incidencia (2026-08-11), detectada en revisión
  adversarial antes de cualquier despliegue.

## LESSON-XXX — title

- What happened:
- Symptom and root cause:
- Why controls missed it:
- Solution and prevention:
- Regression test:
- Reusable rule proposal:
- Evidence/recurrence:
