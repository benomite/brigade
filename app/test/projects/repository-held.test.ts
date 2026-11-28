// Ce qui retient la cuisine d'un projet, sur sa page (#1119, épique 1115) : l'accès au dépôt refusé
// (#1117) dit sa raison et le geste du chef en une phrase, un worktree impossible à préparer (#1118) dit
// sa raison et l'heure du prochain essai, et ni l'un ni l'autre ne laisse dire « prepares it within a
// minute ». Sans eux, la phrase rassurante reste. Quand le runtime les efface, la page relue revient à
// son message sans que l'app soit rechargée. Les suivis sont écrits dans la forme du runtime
// (`SuiviDuProjet`) et relus par `lireSuivi`, comme l'app relit le gist d'une station.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Project } from "../../src/config.ts";

import { readTracking } from "../../src/projects/request.ts";
import { calibrationRecommended, machineProposed, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { COPIED, COPY, DETAILS, OPEN_ON_GITHUB, setRepositoryHeld } from "../../src/vue/installation-project/repository-held.js";
import { Fake as Fabrique, type Fake } from "../helpers/false-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX] };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// What the station wrote (formerly runtime/src/projets/acces.ts `AccesBloque` and echec-du-worktree.ts `EchecDuWorktree`), word for word.
type AccessOfRuntime = { bloque: "fetch" | "push"; raison: string; geste: string };
type OfRuntime = { ticket: number; raison: string; prochainEssai: string | null; acces?: AccessOfRuntime };
const ACCESS: AccessOfRuntime = {
  bloque: "fetch",
  raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username and no credential helper answers (git: fatal: could not read Username for 'https://github.com').",
  geste: "Run `gh auth setup-git` on parade-box, under the account that runs it.",
};
const FAILURE: OfRuntime = { ticket: 433, raison: "git fetch : fatal: No space left on device", prochainEssai: "2026-10-19T12:10:00.000Z" };

const CLONE_FAILED_REFUSAL = {
  status: "refused",
  code: "clone-failed",
  message: "The station could not fetch a copy of this project's repository.",
  action: "Check that the repository exists and that the station's GitHub account can see it; the station retries by itself.",
  noRemedy: "The station retries by itself, and what blocks it is on GitHub, out of the app's reach.",
};

const tracking = (within: object) => JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...within }] });

// Ce que le process principal rend à la vue d'un suivi : la lecture de `projects.ts`, pour la seule principale.
const vue = (within: object | null): SeenOfProjects => {
  const [readOne] = readTracking(tracking(within ?? {}));
  const project: ProjectSeen = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: readOne?.etat ?? "servi", dit: "", autoriser: [] }],
    servi: null,
    acces: readOne?.acces ?? null,
    refus: readOne?.refus ?? null,
    worktree: readOne?.worktree ?? null,
  };
  return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
};


// Ce qui se voit sous `ou` : ni l'élément, ni aucun de ses parents jusqu'à `ou` n'est caché.
const visible = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const said = (or: Fake) => or.dessous("p").filter((p) => visible(or, p)).map((p) => p.textContent);



test("« copy the command » copie la commande du geste seule, et le dit", () => {
  const copied: string[] = [];
  const doc = { createElement: (balise: string) => new Fabrique(balise) };
  const pose = setRepositoryHeld(doc, { acces: ACCESS, maintenant: 0, copier: (command) => copied.push(command) }) as unknown as Fake;
  const button = pose.dessous("button")[0] ?? assert.fail("pas de bouton");
  assert.equal(button.textContent, COPY);
  button.click();
  assert.deepEqual(copied, ["gh auth setup-git"]);
  assert.equal(button.textContent, COPIED);
  // Un échec sans accès refusé n'a pas de commande à copier : pas de bouton.
  const without = setRepositoryHeld(doc, { worktree: { ...FAILURE, acces: null }, maintenant: 0, copier: () => assert.fail() }) as unknown as Fake;
  assert.equal(without.dessous("button").length, 0);
});

// Ce que le runtime écrit d'un clone en échec (runtime/src/projets/echec-du-clone.ts), mot pour mot.
const CLONE = {
  cause: "token-excludes-repository",
  raison: "The token used by parade-box does not include BOBL-tech/mirrorscreen, so GitHub answers that it does not exist and parade-box cannot clone it.",
  geste: "Add BOBL-tech/mirrorscreen to the repositories of the token used by parade-box (its resource owner must be BOBL-tech): edit the token, and select BOBL-tech/mirrorscreen under “Repository access”.",
  ou: "On GitHub, in the fine-grained tokens of the account.",
  liens: ["https://github.com/settings/personal-access-tokens"],
  compte: "parade-box",
  detail: "remote: Repository not found.\nfatal: repository 'https://github.com/BOBL-tech/mirrorscreen.git/' not found\nfailed to run git: exit status 128",
  reessaieToutesLes: 30,
};

test("un clone en échec : la cause et le compte de la station en clair, le geste et sa page GitHub, le prochain essai ; la sortie de git derrière « details » seulement", () => {
  const [readOne] = readTracking(tracking({ etat: "refuse", dit: `${CLONE.raison} ${CLONE.geste}`, clone: CLONE, refus: CLONE_FAILED_REFUSAL }));
  assert.deepEqual(readOne?.clone, CLONE);
  const openEntries: string[] = [];
  const doc = { createElement: (balise: string) => new Fabrique(balise) };
  const pose = setRepositoryHeld(doc, { clone: readOne?.clone ?? null, refus: readOne?.refus ?? null, maintenant: 0, copier: () => assert.fail(), ouvrir: (url) => openEntries.push(url) }) as unknown as Fake;
  const [reason, action, trial] = pose.dessous("p").filter((p) => p.parentElement?.balise !== "details").map((p) => p.textContent);
  assert.equal(reason, CLONE.raison);
  assert.equal(action, `${CLONE.geste} ${CLONE.ou}`);
  assert.equal(trial, "Next retry within 30 s: this turns green by itself once it is fixed.");
  // Le refus qui l'accompagne ne dit rien de plus : il ne s'affiche pas.
  assert.doesNotMatch(pose.textContent, /could not fetch a copy/);
  // Rien de brut hors du détail.
  const outsideDetail = (pose.children[0]?.children ?? []).filter((child) => child.balise !== "details").map((child) => child.textContent).join(" ");
  assert.match(outsideDetail, /parade-box/);
  assert.doesNotMatch(outsideDetail, /exit status|fatal:|clone de|en échec/);
  const details = pose.dessous("details")[0] ?? assert.fail("pas de « details »");
  assert.equal(details.dessous("summary")[0]?.textContent, DETAILS);
  assert.equal(details.dessous("pre")[0]?.textContent, CLONE.detail);
  // La page du geste s'ouvre d'un bouton.
  const button = pose.dessous("button").find((candidate) => candidate.textContent === OPEN_ON_GITHUB) ?? assert.fail("pas de bouton vers GitHub");
  button.click();
  assert.deepEqual(openEntries, ["https://github.com/settings/personal-access-tokens"]);
  // Le geste fait, la station n'en dit plus rien : le bloc s'en va.
  assert.equal(setRepositoryHeld(doc, { clone: null, refus: null, maintenant: 0, copier: () => {} }), null);
});





test("lireSuivi ne croit que ce qui a la forme : un accès sans geste, un échec sans raison ne disent rien", () => {
  const [readOne] = readTracking(tracking({ acces: { bloque: "fetch", raison: "x", geste: "" }, worktree: { ticket: 433, raison: "" } }));
  assert.equal(readOne?.acces, null);
  assert.equal(readOne?.worktree, null);
  const [slip] = readTracking(tracking({ acces: ACCESS, worktree: { ...FAILURE, acces: ACCESS } }));
  assert.deepEqual(slip?.acces, ACCESS);
  assert.deepEqual(slip?.worktree, { ...FAILURE, acces: ACCESS });
});

// What the station publishes for these refusals (formerly runtime/src/projets/refus.ts, `refus`), word for word;
// the remedy was retired, so each carries `noRemedy`.
const REFUSAL = {
  status: "refused",
  code: "proxy-port-set",
  message: "This project's settings choose a network port that the station reserves for itself.",
  action: "Remove the port setting from the app.",
  noRemedy: "The app cannot change the station's configuration for this project yet.",
};


