/**
 * Regresión del tiempo real de la tienda (js/app.js). Carga el script real en
 * un contexto aislado con un cliente de Supabase simulado que reproduce el
 * comportamiento verificado del SDK: removeChannel() reinyecta `CLOSED` en el
 * callback de subscribe() (js/vendor/supabase.min.js → `_onClose(()=>e?.(CLOSED))`).
 *
 * Cubre los defectos encontrados en la revisión adversarial del 2026-08-11:
 *  - bucle infinito de reconexión (un error transitorio dejaba a cada visitante
 *    reconsultando el catálogo completo cada ~2 s para siempre),
 *  - un reintento pendiente mataba un canal que ya se había recuperado solo,
 *  - respuestas fuera de orden pisando datos más nuevos,
 *  - pérdida total de las capas de recuperación si el vendor no carga.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const immediate = setImmediate;

/** Deja correr las microtareas pendientes (los reintentos son async). */
function flush() {
  return new Promise(resolve => immediate(resolve));
}

/** DOM mínimo: solo lo que tocan las funciones bajo prueba. */
function createStoreContext() {
  const domListeners = { document: {}, window: {} };
  const noopEl = {
    setAttribute() {}, removeAttribute() {}, appendChild() {}, remove() {},
    addEventListener() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }
  };

  const context = {
    console,
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    setInterval: (...args) => globalThis.setInterval(...args),
    clearInterval: (...args) => globalThis.clearInterval(...args),
    Intl,
    URL,
    URLSearchParams,
    location: { protocol: "https:", hostname: "www.milinovjoyeria.com", port: "", search: "", href: "https://www.milinovjoyeria.com/" },
    history: { replaceState() {} },
    document: {
      addEventListener(type, fn) { (domListeners.document[type] ||= []).push(fn); },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ ...noopEl }),
      head: { ...noopEl },
      body: { ...noopEl },
      visibilityState: "visible",
      title: ""
    },
    domListeners
  };
  context.window = context;
  context.window.addEventListener = (type, fn) => { (domListeners.window[type] ||= []).push(fn); };
  context.window.matchMedia = () => ({ matches: false });
  context.window.scrollTo = () => {};

  vm.createContext(context);
  for (const file of ["js/config.js", "js/products.js", "js/app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  }
  // La hidratación y el repintado se sustituyen: aquí se prueba el control
  // de conexión y de frescura, no el render.
  vm.runInContext("refreshDynamicViews = function () { window.__renders = (window.__renders || 0) + 1; };", context);
  return context;
}

/**
 * Cliente simulado. `removeChannel` emite CLOSED en el callback del canal
 * cerrado, igual que el SDK real: ese detalle es el que provocaba el bucle.
 */
function createFakeClient() {
  const state = { channels: [], removeCalls: 0, setAuthCalls: 0 };
  const client = {
    realtime: { setAuth() { state.setAuthCalls++; } },
    channel(name, options) {
      const channel = {
        name, options, callback: null,
        on() { return channel; },
        subscribe(callback) { channel.callback = callback; state.channels.push(channel); return channel; },
        emit(status) { channel.callback?.(status); }
      };
      return channel;
    },
    removeChannel(channel) {
      state.removeCalls++;
      channel.emit("CLOSED"); // comportamiento real del SDK
      return Promise.resolve("ok");
    }
  };
  return { client, state };
}

/** Prepara el contexto con cliente simulado y una carga de catálogo controlada. */
function prepare(t, { loader } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const context = createStoreContext();
  const { client, state } = createFakeClient();
  context.__client = client;
  context.__loader = loader || (async () => null);
  vm.runInContext(
    // `catalogSupabaseClient` es un `let` de módulo: vive en el ámbito léxico
    // del contexto, así que hay que asignarlo desde dentro.
    `catalogSupabaseClient = __client;
     loadFromSupabase = async function () { window.__loads = (window.__loads || 0) + 1; return __loader(); };`,
    context
  );
  return { context, client, state };
}

test("un error transitorio del canal no dispara un bucle infinito de reconexión", async t => {
  const { context, state } = prepare(t);

  vm.runInContext("subscribeInventoryRealtime();", context);
  assert.equal(state.channels.length, 1, "se abre un canal");

  // Falla el canal: se programa un reintento.
  state.channels[0].emit("CHANNEL_ERROR");
  t.mock.timers.tick(2000);
  await flush();

  // El reintento cierra el canal viejo (que emite CLOSED) y abre uno nuevo.
  assert.equal(state.removeCalls, 1);
  assert.equal(state.channels.length, 2, "un solo canal de reemplazo");

  // El canal nuevo conecta bien.
  state.channels[1].emit("SUBSCRIBED");

  // Cinco minutos después no debe haber más reconexiones: antes del arreglo,
  // el CLOSED del teardown encadenaba un reintento nuevo cada ~2 s.
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(30000);
    await flush();
  }
  assert.equal(state.channels.length, 2, "no hay churn de canales");
  assert.equal(state.removeCalls, 1, "no hay teardowns extra");
});

test("un canal que se recupera solo cancela el reintento pendiente", async t => {
  const { context, state } = prepare(t);
  vm.runInContext("subscribeInventoryRealtime();", context);

  state.channels[0].emit("CHANNEL_ERROR"); // reintento a 2 s
  state.channels[0].emit("SUBSCRIBED");    // pero se recupera antes

  t.mock.timers.tick(60000);
  await flush();

  assert.equal(state.removeCalls, 0, "no se destruye un canal sano");
  assert.equal(state.channels.length, 1);
});

test("los eventos de un canal ya reemplazado se ignoran", async t => {
  const { context, state } = prepare(t);
  vm.runInContext("subscribeInventoryRealtime();", context);

  state.channels[0].emit("CHANNEL_ERROR");
  t.mock.timers.tick(2000);
  await flush();
  const viejo = state.channels[0];
  state.channels[1].emit("SUBSCRIBED");

  // El canal viejo sigue emitiendo (llega tarde un TIMED_OUT suyo).
  viejo.emit("TIMED_OUT");
  t.mock.timers.tick(60000);
  await flush();

  assert.equal(state.channels.length, 2, "un canal muerto no puede reconectar nada");
  assert.equal(state.removeCalls, 1);
});

test("una respuesta lenta no pisa el catálogo con datos viejos", async t => {
  let resolveA;
  let resolveB;
  const cola = [
    new Promise(resolve => { resolveA = resolve; }),
    new Promise(resolve => { resolveB = resolve; })
  ];
  let i = 0;
  const { context } = prepare(t, { loader: () => cola[i++] });

  const viejo = [{ id: 1, name: "Collar", price: 100, stock: 5, status: "active", images: [] }];
  const nuevo = [{ id: 1, name: "Collar", price: 100, stock: 0, status: "sold_out", images: [] }];

  // Dos consultas en vuelo (aviso + puesta al día).
  vm.runInContext("refreshCatalogFromSupabase(0);", context);
  t.mock.timers.tick(1);
  vm.runInContext("refreshCatalogFromSupabase(0);", context);
  t.mock.timers.tick(1);

  // La segunda (fresca) responde primero; la primera (obsoleta) llega después.
  resolveB(nuevo);
  await flush();
  resolveA(viejo);
  await flush();

  const estado = vm.runInContext("PRODUCTS[0].status", context);
  assert.equal(estado, "sold_out", "la respuesta obsoleta se descarta");
});

test("si el vendor no carga, las lecturas de recuperación quedan igualmente armadas", async t => {
  const { context } = prepare(t);
  vm.runInContext("catalogSupabaseClient = null;", context); // el script del SDK falló

  vm.runInContext("subscribeInventoryRealtime();", context);

  assert.ok(context.domListeners.document.visibilitychange?.length, "refetch al volver a la pestaña");
  assert.ok(context.domListeners.window.online?.length, "refetch al recuperar conexión");

  // Y hay un sondeo lento que permite recuperarse sin recargar la página.
  const antes = vm.runInContext("window.__loads || 0", context);
  t.mock.timers.tick(60000);
  await flush();
  const despues = vm.runInContext("window.__loads || 0", context);
  assert.ok(despues > antes, "el sondeo de respaldo sigue intentando");
});
