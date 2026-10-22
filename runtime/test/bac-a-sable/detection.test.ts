// La détection du bac à sable natif de Claude Code : disponible sur un Mac qui
// a Seatbelt et un `claude` assez récent, indisponible sinon — avec une raison
// que le chef lit. La machine est simulée : plateforme, fichiers, `claude`.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "../support/posix.ts";
import { auMoins, detecter, SEATBELT, sondesDeLaMachine, VERSION_MINIMALE, type Sondes } from "../../src/bac-a-sable/detection.ts";

const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n" };

test("un Mac avec Seatbelt et un `claude` récent : le bac à sable est disponible, et la version est dite", () => {
  assert.deepEqual(detecter(MAC), { disponible: true, version: "2.1.300" });
  assert.deepEqual(detecter({ ...MAC, versionDeClaude: () => VERSION_MINIMALE }), { disponible: true, version: VERSION_MINIMALE });
});

test("hors de macOS, le bac à sable des cooks est indisponible, et la raison nomme la plateforme — même si tout le reste y est", () => {
  for (const plateforme of ["linux", "win32", "freebsd"] as const) {
    const detection = detecter({ ...MAC, plateforme });
    assert.equal(detection.disponible, false);
    assert.match(!detection.disponible ? detection.raison : "", new RegExp(`macOS.*${plateforme}`));
  }
});

test("un Mac sans Seatbelt : indisponible, la raison nomme l'outil qui manque", () => {
  const detection = detecter({ ...MAC, existe: () => false });
  assert.equal(detection.disponible, false);
  assert.match(!detection.disponible ? detection.raison : "", /Seatbelt.*\/usr\/bin\/sandbox-exec/);
});

test("un Mac dont le `claude` ne répond pas, ou ne dit pas sa version : indisponible — la fonctionnalité n'est pas prouvée", () => {
  const muet = detecter({ ...MAC, versionDeClaude: () => null });
  assert.equal(muet.disponible, false);
  assert.match(!muet.disponible ? muet.raison : "", /`claude --version` n'a pas répondu/);
  const illisible = detecter({ ...MAC, versionDeClaude: () => "Claude Code (build maison)" });
  assert.equal(illisible.disponible, false);
  assert.match(!illisible.disponible ? illisible.raison : "", /pas de version lisible.*build maison/);
});

test("un `claude` plus ancien que la version qui lit toute la configuration : indisponible, la raison dit laquelle il faut", () => {
  const detection = detecter({ ...MAC, versionDeClaude: () => "2.1.245 (Claude Code)" });
  assert.equal(detection.disponible, false);
  assert.match(!detection.disponible ? detection.raison : "", new RegExp(`2\\.1\\.245 est trop ancien.*${VERSION_MINIMALE.replaceAll(".", "\\.")}`));
});

test("les versions se comparent nombre par nombre, pas comme du texte", () => {
  assert.equal(auMoins("2.1.246", "2.1.246"), true);
  assert.equal(auMoins("2.1.1000", "2.1.246"), true);
  assert.equal(auMoins("2.2.0", "2.1.246"), true);
  assert.equal(auMoins("10.0.0", "2.1.246"), true);
  assert.equal(auMoins("2.1.99", "2.1.246"), false);
  assert.equal(auMoins("1.9.999", "2.1.246"), false);
  assert.equal(auMoins("pas une version", "2.1.246"), false);
});

test("les sondes de la machine lisent la version du `claude` qu'on leur nomme, et null s'il échoue ou n'existe pas", (t) => {
  const dossier = mkdtempSync(join(tmpdir(), "bac-a-sable-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const bon = join(dossier, "claude");
  writeFileSync(bon, '#!/bin/sh\n[ "$1" = "--version" ] && echo "2.1.300 (Claude Code)"\n');
  const casse = join(dossier, "casse");
  writeFileSync(casse, "#!/bin/sh\nexit 3\n");
  chmodSync(bon, 0o755);
  chmodSync(casse, 0o755);
  assert.equal(sondesDeLaMachine(bon).versionDeClaude(), "2.1.300 (Claude Code)\n");
  assert.equal(sondesDeLaMachine(casse).versionDeClaude(), null);
  assert.equal(sondesDeLaMachine(join(dossier, "absent")).versionDeClaude(), null);
  assert.equal(sondesDeLaMachine(bon).plateforme, process.platform);
});
