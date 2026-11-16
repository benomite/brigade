// Les projets que l'app met de côté (`# held-back (served by X): …`, #2110) dans le bloc de la
// configuration : la réécriture du bloc par la station les garde, et la station ne sert jamais
// un projet ainsi mis de côté (#3704).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { DEBUT, FIN, lignesDuBloc, reecrireBloc } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { lireConfiguration } from "../../src/station/configuration.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const MIS_DE_COTE = [
  "# held-back (served by parade-box): brigade acme/brigade v2",
  "# held-back (served by parade-box): espace acme/espace main",
];
const DU_CHEF = "# à revoir en décembre";
const AVEC_BLOC = `${DEBUT}\n${MIS_DE_COTE[0]}\n${DU_CHEF}\nshop acme/shop main\n${MIS_DE_COTE[1]}\n${FIN}\n`;

test("réécrit, le bloc garde, tels quels, les `# held-back` et les autres commentaires qu'il portait", () => {
  const neuf = reecrireBloc(AVEC_BLOC, ["shop acme/shop main", "compta acme/compta main"]);
  for (const ligne of [...MIS_DE_COTE, DU_CHEF]) assert.ok(neuf.split("\n").includes(ligne), ligne);
  assert.deepEqual(lignesDuBloc(neuf), ["shop acme/shop main", "compta acme/compta main"]);
  // Vidé de ses projets, le bloc reste tant qu'il porte un commentaire.
  const vide = reecrireBloc(AVEC_BLOC, []);
  assert.equal(vide, `${DEBUT}\n${MIS_DE_COTE[0]}\n${DU_CHEF}\n${MIS_DE_COTE[1]}\n${FIN}\n`);
  assert.equal(reecrireBloc(vide, []), vide);
});

test("au démarrage de la station, un projet mis de côté n'est pas servi — ni cuisine, ni ticket — et les autres le sont", async (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: "gist1", appairee: true, code: null, expireLe: null, echus: [] }));
  writeFileSync(join(racine, "projets"), `# à la main\n${AVEC_BLOC}`);
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("aucun gist à créer"),
    async ecrire(_id, ecrits) {
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async () => ({ ...fichiers }),
  };
  const clones: string[] = [];
  const preparations: string[] = [];
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: () => lireConfiguration(readFileSync(join(racine, "projets"), "utf8")).projets.map(({ nom }) => nom), refus: () => null },
    apresEcriture: () => {},
    dire: () => {},
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-11-16T07:47:00Z"),
    autoriser: async () => ({ autorisee: true }),
    cloner: async (depot: string) => void clones.push(depot),
    verifierAcces: async () => ({ etat: "libre" as const }),
    enqueter: async () => ({ etat: "inconnu" }) as never,
    ouvrirLaPreparation: async (projet) => {
      preparations.push(projet.nom);
      return { ticket: 7, ouvert: true };
    },
  });
  aArreter(t, () => projets.arreter());
  const demande = (nom: string, base: string) => ({ nom, depot: `acme/${nom}`, base, principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: "2026-11-16T07:00:00.000Z", demandeLe: "2026-11-16T07:01:00.000Z" });
  fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: [demande("brigade", "v2"), demande("espace", "main"), demande("shop", "main"), demande("compta", "main")] });
  await projets.relire();

  const texte = readFileSync(join(racine, "projets"), "utf8");
  for (const ligne of [...MIS_DE_COTE, DU_CHEF, "# à la main"]) assert.ok(texte.split("\n").includes(ligne), ligne);
  const servis = lireConfiguration(texte).projets.map(({ nom }) => nom);
  assert.deepEqual(servis.sort(), ["compta", "shop"]);
  assert.deepEqual(clones, ["acme/compta"]);
  assert.deepEqual(preparations, ["compta"]);
  const suivi = (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] }).projets;
  assert.deepEqual(suivi.filter(({ etat }) => etat === "refuse").map(({ nom }) => nom).sort(), ["brigade", "espace"]);
});
