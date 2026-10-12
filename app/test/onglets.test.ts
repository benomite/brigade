// Les onglets de contenu d'un espace : quatre, chacun relaie une commande du
// runtime qui existe — et seul celui qui est affiché est lu, par la veille des
// box, contre un faux `ssh` écrit par le test.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ouvrirVeille, type Lecture } from "../src/box.ts";
import { commandeDe, EVENEMENTS_DU_LOG, ONGLETS } from "../src/onglets.ts";

describe("les onglets de contenu d'un espace", () => {
  test("ils sont quatre, dans cet ordre : Rail, Cooks, Grants, Log", () => {
    assert.deepEqual(ONGLETS.map(({ titre }) => titre), ["Rail", "Cooks", "Grants", "Log"]);
  });

  test("chacun relaie une commande que le geste de la box accepte : un script du runtime, tel qu'il existe", () => {
    const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../../runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.deepEqual(ONGLETS.map(({ commande }) => commande), ["rail", "station", "grant", `journal --derniers ${EVENEMENTS_DU_LOG}`]);
    for (const { commande } of ONGLETS) assert.ok(commande.split(" ")[0] in scripts, `« ${commande} » n'est pas un script du runtime`);
  });

  test("la vue nomme un onglet, pas une commande : un nom qui n'est pas celui d'un onglet ne lance rien", () => {
    assert.deepEqual(ONGLETS.map(({ id }) => commandeDe(id)), ["rail", "station", "grant", "journal --derniers 200"]);
    for (const autre of ["status", "start", "rail; rm -rf /", "", undefined, 3, null]) assert.equal(commandeDe(autre), undefined);
  });

  test("seul l'onglet affiché est lu : un `ssh`, pour sa commande — pas un par onglet", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-onglets-"));
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\necho "$*" >>'${racine}/appels'\necho "sortie de $*"\n`);
    chmodSync(ssh, 0o755);
    const { promise: premiere, resolve: surLecture } = Promise.withResolvers<Lecture>();
    const veille = ouvrirVeille({ ssh, intervalleMs: 3_600_000, delaiMs: 60_000, connexionS: 10, surLecture });
    t.after(() => {
      veille.fermer();
      rmSync(racine, { recursive: true, force: true });
    });

    veille.regarder([{ nom: "brigade", dossier: "/projets/brigade", box: { hote: "box" } }], [commandeDe("cooks") as string], 1);
    const lecture = await premiere;

    assert.deepEqual("sorties" in lecture && lecture.sorties.map(({ commande }) => commande), ["station"]);
    assert.deepEqual(readFileSync(join(racine, "appels"), "utf8").trim().split("\n"), ["-o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade station"]);
  });

  test("l'onglet Log ne demande que la fin du journal, et le dit", () => {
    const log = ONGLETS.find(({ id }) => id === "log");
    assert.equal(log?.commande, "journal --derniers 200");
    assert.match(log?.precision ?? "", /200 derniers événements/);
  });
});
