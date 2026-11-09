// mirrorlab#674 sans geste du chef (#3059) : sur la station du Mac, `node_modules`
// restait incomplet (`ai`, `next`, `std-env` manquaient) parce que le bac à sable
// refusait l'installation, et la question du cook partait au chef. Deux stations
// d'un même projet, sur le faux GitHub partagé, passent par `stationDuDepot` :
// - le bac à sable du Mac ouvre l'installation (#3054) : son cook termine avec un
//   `node_modules` complet et livre sa PR ;
// - l'installation y échoue encore : le cook le dit, le ticket va à l'autre
//   station (#3057) et aucune carte TODO n'existe pour le chef.
// Le bac à sable n'existe pas ici : le faux cook n'écrit que ce que les règles
// que `configurer` construit pour son worktree ouvrent en écriture, comme pnpm.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { test, type TestContext } from "node:test";
import { configurer } from "../src/bac-a-sable/configuration.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../src/github-etat/etats.ts";
import { CHEF_TODO } from "../src/github-seul/carte-todo/carte-todo.ts";
import { MARQUE_D_INCAPACITE } from "../src/routage-station/routage-station.ts";
import { droitsDInstallation } from "../src/sandbox/installation.ts";
import { MARQUE_DE_LA_CONSULTATION } from "../src/blocage-au-manager.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "./faux-github.ts";

const N = 674;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const MANQUANTES = ["ai", "next", "std-env"];
const PRESENTES = ["react", "zod"];
const MAC = "macbook-air-de-benoit/claude";
const BOX = "box/claude";
const PROJET = [MAC, BOX];

const dependances = (worktree: string) => [...PRESENTES, ...MANQUANTES].every((nom) => existsSync(join(worktree, "node_modules", nom, "package.json")));

// Une station du projet. Son worktree a `node_modules` incomplet (`complet` :
// tout y est déjà, comme sur box/claude). Son cook relance l'installation : elle
// écrit dans `node_modules` et dans le magasin du compte, et seulement là où les
// règles du bac à sable l'ouvrent. `droits` : ces règles (`installation` : celles
// de `configurer` ; `sans` : sans les caches des paquets, comme avant #3054).
function station(t: TestContext, faux: FauxGitHub, nom: string, complet: boolean, droits: "installation" | "sans") {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "scenario-674-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const worktree = join(racine, "wt");
  const home = join(racine, "home");
  mkdirSync(home);
  const installer = (noms: readonly string[]) => noms.forEach((dep) => {
    mkdirSync(join(worktree, "node_modules", dep), { recursive: true });
    writeFileSync(join(worktree, "node_modules", dep, "package.json"), JSON.stringify({ name: dep }));
  });
  installer(complet ? [...PRESENTES, ...MANQUANTES] : PRESENTES);
  // Les règles du bac à sable sont des chemins POSIX (celles de macOS) : on les
  // construit et on les interroge sur des chemins virtuels, quel que soit l'OS.
  const homeVirtuel = "/Users/cook";
  const worktreeVirtuel = "/work/wt";
  const reglees = configurer({ worktree: worktreeVirtuel, caches: [], hotes: [], home: homeVirtuel }).reglages.sandbox.filesystem.allowWrite;
  const interdits = droitsDInstallation(homeVirtuel);
  const ouvertes = droits === "sans" ? reglees.filter((racineOuverte) => !interdits.includes(racineOuverte)) : reglees;
  const ouvert = (lieu: string) => ouvertes.some((o) => lieu === o || lieu.startsWith(`${o}/`));
  // Le cook rejoue `pnpm install` : le magasin d'abord, puis chaque paquet manquant.
  const reinstaller = (): string | null => {
    if (dependances(worktree)) return null;
    const magasin = posix.join(homeVirtuel, "Library", "pnpm", "store", "v10");
    if (!ouvert(magasin)) return "ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR Operation not permitted";
    for (const dep of MANQUANTES) if (!ouvert(posix.join(worktreeVirtuel, "node_modules", dep))) return "Operation not permitted";
    installer(MANQUANTES);
    return null;
  };
  const repertoire = mkdtempSync(join(racine, "flux-"));
  let cooks = 0;
  const consultations: string[][] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    if (consulte) consultations.push(args);
    else cooks += 1;
    const echec = consulte ? null : reinstaller();
    const message = consulte
      ? JSON.stringify({ issue: "geste", geste: "install ai, next and std-env" })
      : echec !== null
        ? `I stopped.\n<livrable>\n<bloque>The gates cannot run on this station: the dependencies ${MANQUANTES.join(", ")} are missing from node_modules and the install fails (${echec}).</bloque>\n</livrable>`
        : "Done.\n<livrable>\nDelivered.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const depot = depotNeuf(repertoire);
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom,
    github: fauxClient(faux, nom),
    depot: { ...depot, commits: () => 1, changes: () => ["src/a.ts"], diff: () => "diff --git a/src/a.ts b/src/a.ts\n+x\n" },
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: () => {},
    sauter: () => {},
    stationsDuProjet: () => PROJET,
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  return {
    tour: async () => {
      await ouverte.tour();
      await ouverte.calme();
    },
    cooks: () => cooks,
    consultations,
    worktree,
  };
}

const commentaires = (faux: FauxGitHub) => (faux.commentaires.get(N) ?? []).map((c) => c.body);
const sansCarte = (faux: FauxGitHub) => {
  assert.equal(faux.ticket(N).labels.has(A_LA_MAIN), false, "not blocked-on-human");
  assert.equal(faux.ticket(N).labels.has(CHEF_TODO), false, "no chef TODO card");
  assert.ok(commentaires(faux).every((corps) => !corps.startsWith("**Gesture for the chef") && !corps.startsWith("**Question for the chef")), "no card for the chef");
};

test("mirrorlab#674: the Mac station's sandbox allows the install — the cook ends with a complete node_modules and delivers its PR, no gesture", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab's measurements.");
  const mac = station(t, faux, MAC, false, "installation");
  assert.equal(dependances(mac.worktree), false, "before the cook: ai, next and std-env are missing");
  await mac.tour();
  assert.equal(mac.cooks(), 1);
  assert.equal(dependances(mac.worktree), true, "node_modules is complete");
  assert.ok(faux.prs.some((pr) => pr.issue === N && pr.state === "open"), "the PR is delivered");
  assert.equal(faux.ticket(N).labels.has(LABEL_IN_PASS), true);
  assert.equal(mac.consultations.length, 0);
  assert.ok(!commentaires(faux).some((corps) => corps.startsWith(MARQUE_D_INCAPACITE)), "the Mac station is not marked unable");
  sansCarte(faux);
});

test("mirrorlab#674: the install still fails on the Mac station — box/claude serves the ticket and no TODO card exists for the chef", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab's measurements.");
  const mac = station(t, faux, MAC, false, "sans");
  const box = station(t, faux, BOX, true, "installation");
  await mac.tour();
  assert.equal(mac.cooks(), 1);
  assert.equal(dependances(mac.worktree), false, "the install failed on the Mac station");
  assert.match(commentaires(faux).find((corps) => corps.startsWith(MARQUE_D_INCAPACITE)) ?? "", new RegExp(`^<!-- brigade:station-incapable station=${MAC} -->`));
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "given back to the rail");
  assert.equal(mac.consultations.length, 0, "the manager is not consulted");
  sansCarte(faux);
  await box.tour();
  assert.equal(box.cooks(), 1, "served by the other station");
  assert.equal(mac.cooks(), 1, "never cooked again on the Mac station");
  assert.ok(faux.prs.some((pr) => pr.issue === N && pr.state === "open"), "box/claude delivers the PR");
  assert.equal(faux.ticket(N).labels.has(LABEL_IN_PASS), true);
  sansCarte(faux);
});
