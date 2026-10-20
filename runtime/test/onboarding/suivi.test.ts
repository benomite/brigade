// L'onboarding tel que l'app le lit : dans le suivi que la station écrit dans
// son gist (`brigade-projets-suivi.json`), par projet dont elle est la
// principale. Contre un gist en mémoire, une autorisation et un clone doublés,
// comme `../projets/tenir.test.ts`.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import type { Onboarding } from "../../src/onboarding/etat.ts";
import { FICHIER } from "../../src/preparation-depot/ouvrir.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import type { Autorisation } from "../../src/projets/preparer.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const GIST = "gist1";
const projet = (nom: string, principale = true) => ({
  nom,
  depot: `benomite/${nom}`,
  base: "main",
  principale,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-20T10:00:00.000Z",
  demandeLe: "2026-10-20T10:01:00.000Z",
});

function uneStation(t: TestContext) {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST, appairee: true, code: null, expireLe: null, echus: [] }));
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist pour ses projets"),
    async ecrire(_id, ecrits) {
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === GIST ? { ...fichiers } : null),
  };
  const autorisations = new Map<string, Autorisation>();
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    // La station sert tout ce que sa configuration nomme.
    servis: { projets: () => ["parade"], refus: () => null },
    apresEcriture: () => {},
    dire: () => {},
    cadenceMs: 3_600_000,
    maintenant: () => Date.parse("2026-10-20T10:02:00Z"),
    autoriser: async (depot) => autorisations.get(depot) ?? { autorisee: true },
    cloner: async (_depot, clone) => void mkdirSync(join(clone, ".git"), { recursive: true }),
    // Le clone doublé n'a pas de remote : son accès au dépôt se prouve dans `../projets/acces.test.ts`.
    verifierAcces: async () => ({ etat: "libre" }),
    // Le ticket ouvert est noté comme la station le note.
    ouvrirLaPreparation: async (_projet, repertoireEtat) => {
      mkdirSync(repertoireEtat, { recursive: true });
      writeFileSync(join(repertoireEtat, FICHIER), JSON.stringify({ ticket: 7, ouvertLe: "2026-10-20T10:02:00.000Z" }));
      return { ticket: 7, ouvert: true };
    },
  });
  aArreter(t, () => projets.arreter());
  const demander = (...demandes: object[]) => void (fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: demandes }));
  const document = () => JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[]; onboarding?: Record<string, Onboarding> } | null;
  return { projets, demander, document, autorisations };
}

test("le suivi porte l'onboarding de chaque projet dont la station est la principale : la préparation ouverte, son lien, l'étape courante", async (t) => {
  const station = uneStation(t);
  station.demander(projet("parade"), projet("cortege", false));
  await station.projets.relire();

  const document = station.document();
  // Les projets du suivi n'en changent pas : l'onboarding est à côté.
  assert.deepEqual(document?.projets.map(({ nom, etat }) => [nom, etat]), [
    ["parade", "servi"],
    ["cortege", "secondaire"],
  ]);
  assert.deepEqual(Object.keys(document?.onboarding ?? {}), ["parade"]);
  const onboarding = document?.onboarding?.parade;
  assert.equal(onboarding?.courante, "preparation");
  assert.deepEqual(
    onboarding?.etapes.map(({ etape, etat }) => [etape, etat]),
    [
      ["depot", "faite"],
      ["machine", "faite"],
      ["preparation", "courante"],
      ["premier-ticket", "a-venir"],
    ],
  );
  assert.deepEqual(onboarding?.preparation, { ticket: 7, url: "https://github.com/benomite/parade/issues/7", etat: "en-cours", raison: null, prochainEssai: null, pr: null });
  assert.equal(onboarding?.termine, false);
});

test("les Apps à autoriser : l'onboarding attend le chef sur le dépôt, avec les pages où les autoriser", async (t) => {
  const station = uneStation(t);
  const pages = ["https://github.com/apps/brigade-cook/installations/new"];
  station.autorisations.set("benomite/parade", { autorisee: false, pages });
  station.demander(projet("parade"));
  await station.projets.relire();

  const onboarding = station.document()?.onboarding?.parade;
  assert.equal(onboarding?.courante, "depot");
  assert.deepEqual(onboarding?.etapes[0]?.geste, { quoi: "Authorize brigade's GitHub Apps on benomite/parade.", ou: "On GitHub, one click per page.", liens: pages });
});

test("suivi.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
