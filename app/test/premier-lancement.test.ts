// Ouvrir un projet qu'une station porte, depuis le premier lancement (#1434) : la copie est celle du runtime
// (#1429) — reprise ou clonée, ses étapes relayées —, puis le projet entre dans le vrai fichier des projets avec son
// dépôt et la branche que son origine désigne. Un projet que le fichier a déjà garde son dossier ; un échec du
// runtime passe tel quel ; un fichier qui refuse le projet le dit ; un second clic pendant un clone ne clone rien.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { CopieLocale, OptionsDOuverture, Progres } from "../../runtime/src/projets/copie-locale.ts";
import { lireConfiguration } from "../src/config.ts";
import { ouvrirDUneStation } from "../src/premier-lancement.ts";
import { suivreConfiguration } from "../src/suivi.ts";

type Demande = Pick<OptionsDOuverture, "repository" | "project" | "folder" | "progres">;

function unFichier(t: TestContext, contenu?: unknown) {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-premier-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const chemin = join(dossier, "app.json");
  if (contenu !== undefined) writeFileSync(chemin, JSON.stringify(contenu));
  const suivi = suivreConfiguration({ chemin, maison: dossier, surChangement: () => {} });
  t.after(() => suivi.fermer());
  return { dossier, chemin, suivi, lu: () => JSON.parse(readFileSync(chemin, "utf8")) as { projets: unknown[] } };
}

// Le runtime, doublé : il note chaque demande, dit ses étapes, et rend la copie qu'on lui dicte.
function unRuntime(rendre: (demande: Demande) => CopieLocale | Promise<CopieLocale>) {
  const demandes: Demande[] = [];
  return {
    demandes,
    ouvrirLaCopie: async (demande: Demande) => {
      demandes.push(demande);
      demande.progres?.({ stage: "looking", sentence: `Looking for a local copy of ${demande.repository}.` });
      return rendre(demande);
    },
  };
}

test("sans copie : le runtime clone, ses étapes partent à la vue, et le projet entre dans le fichier — créé s'il manquait", async (t) => {
  const { dossier, suivi, lu } = unFichier(t);
  const copie = join(dossier, "projects", "parade");
  // Le clone que le runtime a posé : le fichier ne prend qu'un dossier qui existe.
  const runtime = unRuntime(() => (mkdirSync(copie, { recursive: true }), { state: "open", project: "parade", repository: "benomite/parade", folder: copie, cloned: true }));
  const etapes: Array<[string, Progres]> = [];
  const bases: string[] = [];
  const ouvrir = ouvrirDUneStation({ ...runtime, lireLaBase: async (lui) => (bases.push(lui), "v2"), configuration: suivi.configuration, ajouter: suivi.ajouter, progres: (depot, etape) => etapes.push([depot, etape]) });
  assert.deepEqual(await ouvrir("parade", "benomite/parade"), { state: "open", project: "parade", repository: "benomite/parade", folder: copie, cloned: true });
  assert.deepEqual(
    runtime.demandes.map(({ repository, project, folder }) => ({ repository, project, folder })),
    [{ repository: "benomite/parade", project: "parade", folder: undefined }],
  );
  assert.deepEqual(etapes, [["benomite/parade", { stage: "looking", sentence: "Looking for a local copy of benomite/parade." }]]);
  assert.deepEqual(bases, [copie]);
  assert.deepEqual(lu().projets, [{ nom: "parade", dossier: copie, depot: "benomite/parade", base: "v2" }]);
  assert.deepEqual(
    lireConfiguration(suivi.configuration().chemin, dossier).projets.map(({ nom, dossier: ou }) => [nom, ou]),
    [["parade", copie]],
  );
});

test("un projet que le fichier a déjà : sa copie est reprise par son dossier, et rien n'est réécrit", async (t) => {
  const { dossier, suivi, lu } = unFichier(t, { projets: [{ nom: "parade", dossier: join("/", "chef", "parade"), depot: "benomite/parade" }] });
  const avant = lu();
  const runtime = unRuntime((demande) => ({ state: "open", project: "parade", repository: "benomite/parade", folder: demande.folder ?? "", cloned: false }));
  const ouvrir = ouvrirDUneStation({ ...runtime, lireLaBase: async () => assert.fail("rien à relire"), configuration: suivi.configuration, ajouter: suivi.ajouter, progres: () => {} });
  const ouvert = await ouvrir("parade", "benomite/parade");
  assert.equal(ouvert.state, "open");
  assert.equal(runtime.demandes[0]?.folder, join("/", "chef", "parade"));
  assert.deepEqual(lu(), avant);
  assert.ok(dossier !== "");
});

test("le clone qui échoue : l'état du runtime passe tel quel, et le fichier n'est pas touché", async (t) => {
  const { suivi, lu } = unFichier(t, { projets: [] });
  const echec: CopieLocale = { state: "failed", project: "parade", repository: "benomite/parade", cause: "git-missing", reason: "Git is not installed on this computer, so benomite/parade cannot be cloned: install it, then open the project again.", link: "https://git-scm.com/downloads" };
  const ouvrir = ouvrirDUneStation({ ...unRuntime(() => echec), lireLaBase: async () => "main", configuration: suivi.configuration, ajouter: suivi.ajouter, progres: () => {} });
  assert.deepEqual(await ouvrir("parade", "benomite/parade"), echec);
  assert.deepEqual(lu().projets, []);
});

test("une copie faite que le fichier refuse : la phrase le dit, et le refus du fichier est au détail", async (t) => {
  const { dossier, suivi } = unFichier(t, { projets: [{ nom: "parade", dossier: join("/", "ailleurs", "parade") }] });
  const copie = join(dossier, "projects", "parade");
  const ouvrir = ouvrirDUneStation({
    ...unRuntime(() => ({ state: "open", project: "parade", repository: "benomite/parade", folder: copie, cloned: true })),
    lireLaBase: async () => undefined,
    configuration: suivi.configuration,
    ajouter: suivi.ajouter,
    progres: () => {},
  });
  const ouvert = await ouvrir("parade", "benomite/parade");
  assert.equal(ouvert.state, "failed");
  assert.equal(ouvert.state === "failed" && ouvert.cause, "not-added");
  assert.equal(ouvert.state === "failed" && ouvert.reason, `benomite/parade is in ${copie}, but the app could not add parade to its projects file.`);
  assert.match((ouvert.state === "failed" && ouvert.detail) || "", /two projects are named “parade”/);
});

test("un clone à la fois ; sans dépôt, rien ne part", async (t) => {
  const { suivi } = unFichier(t, { projets: [] });
  let finir: (copie: CopieLocale) => void = () => {};
  const runtime = unRuntime(() => new Promise<CopieLocale>((resoudre) => (finir = resoudre)));
  const ouvrir = ouvrirDUneStation({ ...runtime, lireLaBase: async () => "main", configuration: suivi.configuration, ajouter: suivi.ajouter, progres: () => {} });
  const premier = ouvrir("parade", "benomite/parade");
  assert.deepEqual(await ouvrir("brigade", "benomite/brigade"), { state: "failed", project: "brigade", repository: "benomite/brigade", cause: "busy", reason: "parade is being opened: wait until it is, then open brigade." });
  finir({ state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "GitHub cannot be reached." });
  assert.equal((await premier).state, "failed");
  assert.equal((await ouvrir("cantine", null)).state, "failed");
  assert.equal(runtime.demandes.length, 1);
  // Fini, un autre s'ouvre.
  const suivant = ouvrir("brigade", "benomite/brigade");
  finir({ state: "failed", project: "brigade", repository: "benomite/brigade", cause: "network", reason: "GitHub cannot be reached." });
  assert.equal((await suivant).state, "failed");
  assert.equal(runtime.demandes.length, 2);
});
