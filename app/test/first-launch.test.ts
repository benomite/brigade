// Ouvrir un projet qu'une station porte, depuis le premier lancement (#1434) : la copie est celle du runtime
// (#1429) — reprise ou clonée, ses étapes relayées —, puis le projet entre dans le vrai fichier des projets avec son
// dépôt et sa branche d'intégration — celle que GitHub a donnée, quand l'écran « Add a project » la passe (#3181),
// sinon celle que son origine désigne. Un projet que le fichier a déjà garde son dossier ; un échec du
// runtime passe tel quel ; un fichier qui refuse le projet le dit ; un second clic pendant un clone ne clone rien.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { CopieLocale, OptionsDOuverture, Progres } from "../../runtime/src/projets/copie-locale.ts";
import { readConfiguration } from "../src/config.ts";
import { openOfAStation } from "../src/first-launch.ts";
import { followConfiguration } from "../src/tracking.ts";

type Request = Pick<OptionsDOuverture, "repository" | "project" | "folder" | "progres">;

function oneFile(t: TestContext, content?: unknown) {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-premier-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "app.json");
  if (content !== undefined) writeFileSync(path, JSON.stringify(content));
  const tracking = followConfiguration({ chemin: path, maison: folder, surChangement: () => {} });
  t.after(() => tracking.fermer());
  return { dossier: folder, chemin: path, suivi: tracking, lu: () => JSON.parse(readFileSync(path, "utf8")) as { projets: unknown[] } };
}

// Le runtime, doublé : il note chaque demande, dit ses étapes, et rend la copie qu'on lui dicte.
function oneRuntime(render: (request: Request) => CopieLocale | Promise<CopieLocale>) {
  const requests: Request[] = [];
  return {
    demandes: requests,
    connexionClaude: async () => "connectee" as const,
    ouvrirLaCopie: async (request: Request) => {
      requests.push(request);
      request.progres?.({ stage: "looking", sentence: `Looking for a local copy of ${request.repository}.` });
      return render(request);
    },
  };
}

test("sans copie : le runtime clone, ses étapes partent à la vue, et le projet entre dans le fichier — créé s'il manquait", async (t) => {
  const { dossier: folder, suivi: tracking, lu: readOne } = oneFile(t);
  const copy = join(folder, "projects", "parade");
  // Le clone que le runtime a posé : le fichier ne prend qu'un dossier qui existe.
  const runtime = oneRuntime(() => (mkdirSync(copy, { recursive: true }), { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: true }));
  const steps: Array<[string, Progres]> = [];
  const bases: string[] = [];
  const open = openOfAStation({ ...runtime, lireLaBase: async (it) => (bases.push(it), "v2"), configuration: tracking.configuration, ajouter: tracking.ajouter, progres: (repository, step) => steps.push([repository, step]) });
  assert.deepEqual(await open("parade", "benomite/parade"), { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: true });
  assert.deepEqual(
    runtime.demandes.map(({ repository, project, folder }) => ({ repository, project, folder })),
    [{ repository: "benomite/parade", project: "parade", folder: undefined }],
  );
  assert.deepEqual(steps, [["benomite/parade", { stage: "looking", sentence: "Looking for a local copy of benomite/parade." }]]);
  assert.deepEqual(bases, [copy]);
  assert.deepEqual(readOne().projets, [{ nom: "parade", dossier: copy, depot: "benomite/parade", base: "v2" }]);
  assert.deepEqual(
    readConfiguration(tracking.configuration().chemin, folder).projets.map(({ nom: name, dossier: or }) => [name, or]),
    [["parade", copy]],
  );
});

test("un dépôt choisi dans « Add a project » (#3181) : sa branche d'intégration est celle que GitHub a donnée, l'origine de la copie n'est pas relue", async (t) => {
  const { dossier: folder, suivi: tracking, lu: readOne } = oneFile(t);
  const copy = join(folder, "projects", "parade");
  const runtime = oneRuntime(() => (mkdirSync(copy, { recursive: true }), { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: false }));
  const open = openOfAStation({ ...runtime, lireLaBase: async () => assert.fail("la branche vient de GitHub"), configuration: tracking.configuration, ajouter: tracking.ajouter, progres: () => {} });
  assert.deepEqual(await open("parade", "benomite/parade", " trunk "), { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: false });
  assert.deepEqual(readOne().projets, [{ nom: "parade", dossier: copy, depot: "benomite/parade", base: "trunk" }]);
});

test("une branche donnée vide ou qui n'est pas un texte ne décide pas : c'est celle de l'origine de la copie", async (t) => {
  const { dossier: folder, suivi: tracking, lu: readOne } = oneFile(t);
  const copy = join(folder, "projects", "parade");
  const runtime = oneRuntime(() => (mkdirSync(copy, { recursive: true }), { state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: true }));
  const open = openOfAStation({ ...runtime, lireLaBase: async () => "v2", configuration: tracking.configuration, ajouter: tracking.ajouter, progres: () => {} });
  assert.equal((await open("parade", "benomite/parade", "  ")).state, "open");
  assert.deepEqual(readOne().projets, [{ nom: "parade", dossier: copy, depot: "benomite/parade", base: "v2" }]);
});

test("un projet que le fichier a déjà : sa copie est reprise par son dossier, et rien n'est réécrit", async (t) => {
  const { dossier: folder, suivi: tracking, lu: readOne } = oneFile(t, { projets: [{ nom: "parade", dossier: join("/", "chef", "parade"), depot: "benomite/parade" }] });
  const before = readOne();
  const runtime = oneRuntime((request) => ({ state: "open", project: "parade", repository: "benomite/parade", folder: request.folder ?? "", cloned: false }));
  const open = openOfAStation({ ...runtime, lireLaBase: async () => assert.fail("rien à relire"), configuration: tracking.configuration, ajouter: tracking.ajouter, progres: () => {} });
  const opened = await open("parade", "benomite/parade");
  assert.equal(opened.state, "open");
  assert.equal(runtime.demandes[0]?.folder, join("/", "chef", "parade"));
  assert.deepEqual(readOne(), before);
  assert.ok(folder !== "");
});

test("le clone qui échoue : l'état du runtime passe tel quel, et le fichier n'est pas touché", async (t) => {
  const { suivi: tracking, lu: readOne } = oneFile(t, { projets: [] });
  const failure: CopieLocale = { state: "failed", project: "parade", repository: "benomite/parade", cause: "git-missing", reason: "Git is not installed on this computer, so benomite/parade cannot be cloned: install it, then open the project again.", link: "https://git-scm.com/downloads" };
  const open = openOfAStation({ ...oneRuntime(() => failure), lireLaBase: async () => "main", configuration: tracking.configuration, ajouter: tracking.ajouter, progres: () => {} });
  assert.deepEqual(await open("parade", "benomite/parade"), failure);
  assert.deepEqual(readOne().projets, []);
});

test("une copie faite que le fichier refuse : la phrase le dit, et le refus du fichier est au détail", async (t) => {
  const { dossier: folder, suivi: tracking } = oneFile(t, { projets: [{ nom: "parade", dossier: join("/", "ailleurs", "parade") }] });
  const copy = join(folder, "projects", "parade");
  const open = openOfAStation({
    ...oneRuntime(() => ({ state: "open", project: "parade", repository: "benomite/parade", folder: copy, cloned: true })),
    lireLaBase: async () => undefined,
    configuration: tracking.configuration,
    ajouter: tracking.ajouter,
    progres: () => {},
  });
  const opened = await open("parade", "benomite/parade");
  assert.equal(opened.state, "failed");
  assert.equal(opened.state === "failed" && opened.cause, "not-added");
  assert.equal(opened.state === "failed" && opened.reason, `benomite/parade is in ${copy}, but the app could not add parade to its projects file.`);
  assert.match((opened.state === "failed" && opened.detail) || "", /two projects are named “parade”/);
});

test("un clone à la fois ; sans dépôt, rien ne part", async (t) => {
  const { suivi: tracking } = oneFile(t, { projets: [] });
  let finish: (copy: CopieLocale) => void = () => {};
  const runtime = oneRuntime(() => new Promise<CopieLocale>((resolve) => (finish = resolve)));
  const open = openOfAStation({ ...runtime, lireLaBase: async () => "main", configuration: tracking.configuration, ajouter: tracking.ajouter, progres: () => {} });
  const first = open("parade", "benomite/parade");
  assert.deepEqual(await open("brigade", "benomite/brigade"), { state: "failed", project: "brigade", repository: "benomite/brigade", cause: "busy", reason: "parade is being opened: wait until it is, then open brigade." });
  finish({ state: "failed", project: "parade", repository: "benomite/parade", cause: "network", reason: "GitHub cannot be reached." });
  assert.equal((await first).state, "failed");
  assert.equal((await open("cantine", null)).state, "failed");
  assert.equal(runtime.demandes.length, 1);
  // Fini, un autre s'ouvre.
  const next = open("brigade", "benomite/brigade");
  finish({ state: "failed", project: "brigade", repository: "benomite/brigade", cause: "network", reason: "GitHub cannot be reached." });
  assert.equal((await next).state, "failed");
  assert.equal(runtime.demandes.length, 2);
});
