const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createCartContext() {
  const events = [];
  const products = [{
    id: 1,
    sku: "ANI-001",
    name: "Anillo Brillo Eterno",
    category: "Anillos",
    material: "Plata 950",
    price: 119,
    stock: 5,
    status: "active"
  }];
  const context = {
    PRODUCTS: products,
    window: {
      MILINOV: { brand: "Milinov Jewelry" },
      trackEvent(name, payload) { events.push({ name, payload }); }
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    isSoldOut(product) { return product.status === "sold_out" || product.stock === 0; },
    closeMobileMenu() {},
    showToast() {},
    console
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../../js/cart.js"), "utf8");
  vm.runInContext(source, context);
  return { context, events };
}

test("commercePayload genera datos compatibles con GA4 y Meta", () => {
  const { context } = createCartContext();
  const payload = JSON.parse(vm.runInContext(
    "JSON.stringify(commercePayload([{ product: PRODUCTS[0], qty: 2 }]))",
    context
  ));

  assert.equal(payload.currency, "PEN");
  assert.equal(payload.value, 238);
  assert.equal(payload.num_items, 2);
  assert.deepEqual(payload.content_ids, ["ANI-001"]);
  assert.deepEqual(payload.items[0], {
    item_id: "ANI-001",
    item_name: "Anillo Brillo Eterno",
    item_brand: "Milinov Jewelry",
    item_category: "Anillos",
    item_variant: "Plata 950",
    price: 119,
    quantity: 2
  });
});

test("agregar y retirar emite el embudo comercial correcto", () => {
  const { context, events } = createCartContext();
  vm.runInContext("addToCart(1, 2)", context);
  vm.runInContext("removeFromCart(1)", context);

  assert.deepEqual(events.map(event => event.name), [
    "add_to_cart",
    "view_cart",
    "remove_from_cart"
  ]);
  assert.equal(events[0].payload.value, 238);
  assert.equal(events[2].payload.num_items, 2);
});
