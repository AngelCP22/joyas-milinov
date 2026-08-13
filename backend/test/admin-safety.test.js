const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adminSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "admin.js"),
  "utf8"
);

test("el cliente exige version para editar y eliminar en Supabase", () => {
  const guardedBranches = adminSource.match(
    /if \(method === "(?:PATCH|DELETE)" && id\) \{\s*if \(!Number\.isInteger\(options\.expectedVersion\)\) throw new ConflictError\(\);/g
  );

  assert.equal(guardedBranches?.length, 2);
  assert.match(adminSource, /delete\(\)\.eq\("id", id\);\s*query = query\.eq\("version", options\.expectedVersion\)/);
});

test("el navegador no elimina objetos de Storage", () => {
  assert.doesNotMatch(adminSource, /\.storage\.from\([^)]*\)\.remove\(/);
});
