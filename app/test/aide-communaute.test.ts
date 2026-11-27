// L'entrée d'aide de l'app (#3258) : son clic ouvre les Discussions dans le navigateur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { menuDeLApp, URL_DES_DISCUSSIONS } from "../src/aide-communaute.ts";

test("l'entrée d'aide ouvre les Discussions, et un échec d'ouverture ne casse pas le clic", async () => {
  const ouvertes: string[] = [];
  const aide = menuDeLApp((url) => (ouvertes.push(url), Promise.reject(new Error("pas de navigateur"))), false).find((m) => m.role === "help");
  const [entree] = aide?.submenu as { click: () => void }[];
  entree?.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ouvertes, ["https://github.com/benomite/brigade/discussions"]);
  assert.equal(URL_DES_DISCUSSIONS, ouvertes[0]);
});
