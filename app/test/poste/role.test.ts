// Ce qu'est l'app sur sa machine : une station sur un ordinateur, un poste sur un téléphone — et
// rien d'autre ne dépend de la plateforme.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cuisinesIci, PRINCIPAL, roleDe, TELEPHONES } from "../../src/poste/role.ts";

const RUNTIME = join(import.meta.dirname, "../../../runtime");

test("sur un ordinateur — Mac, Windows, Linux de bureau —, l'app est une station : elle lance le point d'entrée du runtime à côté d'elle", () => {
  for (const plateforme of ["darwin", "win32", "linux", "freebsd"]) {
    assert.deepEqual(roleDe({ plateforme, runtime: RUNTIME, env: {} }), { role: "station", principal: join(RUNTIME, "src/station/main.ts") }, plateforme);
  }
});

test("sur un téléphone, l'app est un poste : elle pilote, elle ne cuit pas — aucun projet n'y cuit", () => {
  for (const plateforme of TELEPHONES) {
    const role = roleDe({ plateforme, runtime: RUNTIME, env: {} });
    assert.deepEqual(role, { role: "poste", pourquoi: "a phone pilots, it does not cook" }, plateforme);
    assert.deepEqual(cuisinesIci(role, ["brigade", "espace"]), []);
  }
  const station = roleDe({ plateforme: "darwin", runtime: RUNTIME, env: {} });
  assert.deepEqual(cuisinesIci(station, ["brigade", "espace"]), ["brigade", "espace"]);
});

test("sans runtime à côté d'elle, ou avec BRIGADE_APP_STATION=0, l'app d'un ordinateur est un poste, et dit pourquoi", () => {
  assert.deepEqual(roleDe({ plateforme: "linux", runtime: "/nulle/part", env: {} }), { role: "poste", pourquoi: `no station runtime beside the app (${join("/nulle/part", PRINCIPAL)})` });
  assert.deepEqual(roleDe({ plateforme: "linux", runtime: RUNTIME, env: { BRIGADE_APP_STATION: "0" } }), { role: "poste", pourquoi: "BRIGADE_APP_STATION=0" });
  assert.equal(roleDe({ plateforme: "linux", runtime: RUNTIME, env: { BRIGADE_APP_STATION: "1" } }).role, "station");
});

test("la station d'un ordinateur est celle d'un serveur : le même point d'entrée que le service du paquet Debian", () => {
  const unite = readFileSync(join(RUNTIME, "paquet/systemd/brigade-station.service"), "utf8");
  const [, lance] = /^ExecStart=\S+ (\S+)$/m.exec(unite) ?? [];
  // L'unité écrit le chemin à la façon de la box ; `join` le dit à celle de ce poste.
  assert.equal(join(lance ?? ""), PRINCIPAL);
});

test("hors du choix station ou poste, rien dans app/src/poste ne dépend de la plateforme", () => {
  const dossier = join(import.meta.dirname, "../../src/poste");
  for (const fichier of readdirSync(dossier).filter((nom) => nom !== "role.ts")) {
    const source = readFileSync(join(dossier, fichier), "utf8");
    assert.doesNotMatch(source, /process\.platform|\bos\.(platform|type)\b|darwin|win32|android|\bios\b|Windows_NT/, fichier);
  }
});
