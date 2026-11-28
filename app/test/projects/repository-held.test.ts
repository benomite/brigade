// Ce qui retient la cuisine d'un projet, sur sa page (#1119, épique 1115) : l'accès au dépôt refusé
// (#1117) dit sa raison et le geste du chef en une phrase, un worktree impossible à préparer (#1118) dit
// sa raison et l'heure du prochain essai, et ni l'un ni l'autre ne laisse dire « prepares it within a
// minute ». Sans eux, la phrase rassurante reste. Quand le runtime les efface, la page relue revient à
// son message sans que l'app soit rechargée. Les suivis sont écrits dans la forme du runtime
// (`SuiviDuProjet`) et relus par `lireSuivi`, comme l'app relit le gist d'une station.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { readTracking } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { COPIED, COPY, DETAILS, OPEN_ON_GITHUB, setRepositoryHeld } from "../../src/vue/installation-project/repository-held.js";
import { Fake as Fabrique, type Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
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

const startup = (projectsOfStations: SeenOfProjects) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: HOME,
  projetsDesStations: projectsOfStations,
});

// Ce qui se voit sous `ou` : ni l'élément, ni aucun de ses parents jusqu'à `ou` n'est caché.
const visible = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const said = (or: Fake) => or.dessous("p").filter((p) => visible(or, p)).map((p) => p.textContent);

// Le projet « parade » est confié d'ici à sa box ; la page est ouverte, et la box n'a rien dit encore.
async function thePage(initial: SeenOfProjects) {
  const played = await playTheVue({
    demarrage: () => startup(initial),
    confierAUneStation: () => ({ ajoute: "parade" }),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  return { jouee: played, bloc: played.element("stations-du-projet") };
}

test("l'accès au dépôt refusé : une phrase donne la raison et le geste, sans « within a minute » ; le détail de git est au survol", async () => {
  const { jouee: played, bloc: block } = await thePage(vue({ etat: "refuse", dit: "refused", acces: ACCESS }));
  const [sentence, ...others] = said(block).filter((text) => /cannot fetch/.test(text));
  assert.deepEqual(others, [], "une seule phrase");
  assert.match(sentence ?? "", /^parade-box cannot fetch from benomite\/parade: github\.com asks for a username and no credential helper answers\. Run gh auth setup-git on parade-box, under the account that runs it\.$/);
  const code = block.dessous("code").find((candidate) => candidate.textContent === "gh auth setup-git") ?? assert.fail("la commande n'est pas posée en code");
  assert.equal(code.className, "mono");
  assert.equal(block.dessous("p").find((p) => /cannot fetch/.test(p.textContent))?.title, "git: fatal: could not read Username for 'https://github.com'");
  assert.doesNotMatch(block.textContent, /within a minute/);
  assert.equal(played.appels.some(({ geste: action }) => action === "confierAUneStation"), false);
  // Le geste se fait sur la machine de la station : l'écran offre un bouton, recommandé, qui en copie la commande.
  const buttons = block.dessous("button").filter((b) => b.textContent === COPY);
  assert.equal(buttons.length, 1, "un bouton « copy the command »");
  assert.equal(buttons[0]?.className, "recommande");
});

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

test("un worktree impossible à préparer : la raison de l'échec et l'heure du prochain essai", async () => {
  const { bloc: block } = await thePage(vue({ worktree: FAILURE }));
  const lines = said(block);
  assert.ok(lines.includes("The worktree of #433 could not be prepared: git fetch : fatal: No space left on device"), lines.join(" | "));
  assert.ok(lines.some((line) => /^Next retry at \d{1,2}:\d{2} [AP]M, in \d+ min\.$/.test(line) || line === "Its retry is due now."), lines.join(" | "));
  assert.doesNotMatch(block.textContent, /within a minute/);
});

test("un worktree impossible à préparer parce que l'accès est refusé : le geste, et l'heure du prochain essai", async () => {
  const { bloc: block } = await thePage(vue({ worktree: { ...FAILURE, raison: ACCESS.raison, acces: ACCESS } }));
  const lines = said(block);
  assert.ok(lines.some((line) => /Run gh auth setup-git on parade-box/.test(line)), lines.join(" | "));
  assert.ok(lines.some((line) => /^Next retry at /.test(line) || line === "Its retry is due now."), lines.join(" | "));
});

test("ni accès refusé ni worktree en échec : la phrase « prepares it within a minute » reste", async () => {
  const { jouee: played, bloc: block } = await thePage(vue(null));
  assert.equal(block.dessous("div").some((d) => d.className === "depot-retenu"), false);
  // La page n'a pas encore de station qui cuit ? Elle en a une, servie : le message vient du geste de confier.
  const without: SeenOfProjects = { ...vue(null), projets: [] };
  played.dire("surProjetsDesStations", without);
  await repos();
  assert.equal(block.dessous("div").some((d) => d.className === "depot-retenu" && visible(block, d)), false);
});

test("le runtime efface l'état après le geste : la page relue revient au message, sans recharger l'app", async () => {
  const { jouee: played, bloc: block } = await thePage(vue({ etat: "refuse", dit: "refused", acces: ACCESS }));
  assert.match(block.textContent, /gh auth setup-git/);
  played.dire("surProjetsDesStations", vue({ worktree: FAILURE }));
  await repos();
  assert.match(said(block).join(" | "), /The worktree of #433 could not be prepared/);
  assert.doesNotMatch(said(block).join(" | "), /gh auth setup-git/);
  played.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.doesNotMatch(said(block).join(" | "), /gh auth setup-git|could not be prepared/);
  assert.equal(block.dessous("div").some((d) => d.className === "depot-retenu" && visible(block, d)), false);
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

test("un projet refusé par la station : la page dit pourquoi et ce que le chef fait, sans le texte brut ni chemin", async () => {
  const raw = "BRIGADE_PROXY_PORT is set in /etc/brigade/en-service: refused";
  const { bloc: block } = await thePage(vue({ etat: "refuse", dit: raw, refus: REFUSAL }));
  const lines = said(block);
  assert.ok(lines.some((line) => line.startsWith(REFUSAL.message)), lines.join(" | "));
  assert.ok(lines.includes(REFUSAL.action), lines.join(" | "));
  assert.doesNotMatch(block.textContent, /en-service|\/etc\//);
  assert.doesNotMatch(block.textContent, /within a minute/);
  // Le remède retiré, aucun bouton ne prétend lever le refus d'ici (#4503).
  assert.equal(block.dessous("button").some((b) => b.textContent === REFUSAL.noRemedy), false);
});

test("sans refus, la page est inchangée ; un refus sans phrase ou sans action ne dit rien", async () => {
  const { bloc: block } = await thePage(vue(null));
  assert.equal(block.dessous("div").some((d) => d.className === "depot-retenu"), false);
  const [readOne] = readTracking(tracking({ refus: { ...REFUSAL, action: "" } }));
  assert.equal(readOne?.refus, null);
  const [slip] = readTracking(tracking({ refus: REFUSAL }));
  assert.equal(slip?.refus?.message, REFUSAL.message);
});
