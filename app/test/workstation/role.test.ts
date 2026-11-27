// Ce qu'est l'app sur sa machine : une station sur un ordinateur, un poste sur un téléphone — et
// rien d'autre ne dépend de la plateforme.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PRINCIPAL, roleOf, PHONES } from "../../src/workstation/role.ts";

const RUNTIME = join(import.meta.dirname, "../../../runtime");

test("sur un ordinateur — Mac, Windows, Linux de bureau —, l'app est une station : elle lance le point d'entrée du runtime à côté d'elle", () => {
  for (const platform of ["darwin", "win32", "linux", "freebsd"]) {
    assert.deepEqual(roleOf({ plateforme: platform, runtime: RUNTIME, env: {} }), { role: "station", principal: join(RUNTIME, "src/kitchen/main.ts") }, platform);
  }
});

test("sur un téléphone, l'app est un poste : elle pilote, elle ne cuit pas", () => {
  for (const platform of PHONES) {
    const role = roleOf({ plateforme: platform, runtime: RUNTIME, env: {} });
    assert.deepEqual(role, { role: "poste", pourquoi: "a phone pilots, it does not cook" }, platform);
  }
});

test("sans runtime à côté d'elle, ou avec BRIGADE_APP_STATION=0, l'app d'un ordinateur est un poste, et dit pourquoi", () => {
  assert.deepEqual(roleOf({ plateforme: "linux", runtime: "/nulle/part", env: {} }), { role: "poste", pourquoi: `no station runtime beside the app (${join("/nulle/part", PRINCIPAL)})` });
  assert.deepEqual(roleOf({ plateforme: "linux", runtime: RUNTIME, env: { BRIGADE_APP_STATION: "0" } }), { role: "poste", pourquoi: "BRIGADE_APP_STATION=0" });
  assert.equal(roleOf({ plateforme: "linux", runtime: RUNTIME, env: { BRIGADE_APP_STATION: "1" } }).role, "station");
});

test("la station d'un ordinateur est la cuisine : le même point d'entrée que l'unité brigade-kitchen de la box (#4603)", () => {
  const unite = readFileSync(join(RUNTIME, "deploy/brigade-kitchen.service"), "utf8");
  const [, launches] = /^ExecStart=\S+ (\S+)$/m.exec(unite) ?? [];
  // L'unité écrit le chemin à la façon de la box ; `join` le dit à celle de ce poste.
  assert.equal(join(launches ?? ""), PRINCIPAL);
});

test("hors du choix station ou poste, rien dans app/src/workstation ne dépend de la plateforme", () => {
  const folder = join(import.meta.dirname, "../../src/workstation");
  for (const file of readdirSync(folder).filter((name) => name !== "role.ts")) {
    const source = readFileSync(join(folder, file), "utf8");
    assert.doesNotMatch(source, /process\.platform|\bos\.(platform|type)\b|darwin|win32|android|\bios\b|Windows_NT/, file);
  }
});
