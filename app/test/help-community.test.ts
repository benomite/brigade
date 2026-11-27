// L'entrée d'aide de l'app (#3258) : son clic ouvre les Discussions dans le navigateur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { menuOfTheApp, URL_OF_DISCUSSIONS } from "../src/help-community.ts";

test("l'entrée d'aide ouvre les Discussions, et un échec d'ouverture ne casse pas le clic", async () => {
  const openEntries: string[] = [];
  const help = menuOfTheApp((url) => (openEntries.push(url), Promise.reject(new Error("pas de navigateur"))), false).find((m) => m.role === "help");
  const [entry] = help?.submenu as { click: () => void }[];
  entry?.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(openEntries, ["https://github.com/benomite/brigade/discussions"]);
  assert.equal(URL_OF_DISCUSSIONS, openEntries[0]);
});
