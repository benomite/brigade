// Deux stations servent le même projet (#2713) : aucune n'en est la
// principale, aucune n'en « rejoint » la cuisine de l'autre. Chacune prépare le
// projet que l'app lui demande et en ouvre la cuisine (`projets/tenir.ts`) —
// coché sur sa page ou ajouté depuis celle du projet (« + station ») —, puis
// prend, cuisine et merge ses tickets sur GitHub (`brigade-github.ts`), comme
// l'autre. Le cas vu le 2026-11-05 avec mirrorscreen : la seconde station
// ajoutée ne cuisait rien.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { FauxGitHub } from "../faux-github.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const SHOP = { nom: "shop", depot: "acme/shop", base: "main", cooks: 1, manager: null, reviewer: null, ouvertLe: null, demandeLe: null };

// Une station, son gist d'appairage et sa configuration : ce que l'app lui
// demande, ce qu'elle en écrit, et ce qu'elle en dit.
function uneStation(t: TestContext, nom: string) {
  const racine = repertoireTemporaire(t);
  const gist = `gist-${nom}`;
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist, appairee: true, code: null, expireLe: null, echus: [] }));
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist pour ses projets"),
    async ecrire(id, ecrits) {
      assert.equal(id, gist);
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === gist ? { ...fichiers } : null),
  };
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  const servis = () =>
    configuration()
      .split("\n")
      .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"))
      .map((ligne) => ligne.split(/\s+/)[0] ?? "");
  const lignes: string[] = [];
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: nom,
    env: {},
    servis: { projets: servis, refus: () => null },
    apresEcriture: () => {},
    dire: (ligne) => lignes.push(ligne),
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-11-07T12:00:00Z"),
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => void mkdirSync(join(clone, ".git"), { recursive: true }),
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async () => ({ ticket: 7, ouvert: false }),
  });
  aArreter(t, () => projets.arreter());
  const demander = (...demandes: object[]) => void (fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: demandes }));
  const suivi = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets;
  return { projets, demander, suivi, configuration, lignes };
}

test("deux stations demandées pour le même projet — l'une cochée sur sa page, l'autre ajoutée depuis celle du projet : chacune en ouvre la cuisine, aucune n'est dite secondaire", async (t) => {
  const box = uneStation(t, "box");
  const mac = uneStation(t, "mac");
  box.demander({ ...SHOP, principale: true });
  // « + station » : la ligne que l'app écrit ne la dit pas principale.
  mac.demander({ ...SHOP, principale: false, fournit: ["macos"] });
  await Promise.all([box.projets.relire(), mac.projets.relire()]);

  for (const station of [box, mac]) {
    assert.equal(station.configuration(), `${DEBUT}\nshop acme/shop main\n${FIN}\n`);
    assert.deepEqual(station.suivi()?.map(({ nom, etat }) => [nom, etat]), [["shop", "servi"]]);
    assert.ok(!station.lignes.some((ligne) => /cuisine ne s'ouvre|rejoint/.test(ligne)), station.lignes.join("\n"));
  }
  assert.equal(box.suivi()?.[0]?.cuitSur, "box");
  assert.equal(mac.suivi()?.[0]?.cuitSur, "mac");
});

test("deux stations qui servent le même dépôt prennent et cuisinent chacune un ticket, et en ouvrent chacune la PR", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  faux.feu(2);
  const [box, mac] = [faux.station("box/claude"), faux.station("mac/claude")];
  // Une place chacune : la première prend un ticket, la seconde prend l'autre.
  await box.tour();
  await mac.tour();
  await Promise.all([box.calme(), mac.calme()]);
  assert.deepEqual(faux.cuissons.map(({ station }) => station).sort(), ["box/claude", "mac/claude"]);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue).sort(), [1, 2]);
  assert.equal(faux.prs.length, 2);
});
