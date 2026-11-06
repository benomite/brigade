// Une mise à jour qui attend ne vide plus la station (#2586) : elle prend ses
// tickets jusqu'à ses places, se relance au premier moment sans cook en vol ou,
// à défaut, à l'échéance donnée — le travail de ses cooks en vol sauvé sur leur
// branche avant, et repris par le cook suivant.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer, type StationGitHub } from "../../../src/brigade-github.ts";
import { ouvrirDepot } from "../../../src/depot.ts";
import { LABEL_IN_PASS } from "../../../src/github-etat/etats.ts";
import { SUJET_DE_SAUVEGARDE } from "../../../src/mise-a-jour/attente/attente.ts";
import { lireEnVol, tenirLaVidange, viderLaStation, VIDANGE } from "../../../src/mise-a-jour/vidange.ts";
import { retenirLaPrise } from "../../../src/station-update/mettre-a-jour.ts";
import { FauxGitHub, fauxClient } from "../../faux-github.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../../outils.ts";

const demander = (dossier: string, version: string, echeanceMs: number) =>
  writeFileSync(join(dossier, VIDANGE), JSON.stringify({ version, echeance: new Date(echeanceMs).toISOString(), jusqua: new Date(echeanceMs + 60_000).toISOString() }));
const conclut = (flux: string) => writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
const fini = { code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null };
const options = { claude: "claude", env: ENV_GIT, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1, reviewer: { model: "sonnet", effort: "medium" } } as const;

test("with an update waiting and free places, the station still takes a new ticket — it no longer stops taking tickets (#2586)", async (t) => {
  const racine = repertoireTemporaire(t);
  const dossier = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(13);
  const dites: string[] = [];
  const lances: string[] = [];
  let enCuisine = (): number[] => [];
  // Un cook d'un autre projet de la station est en vol : la relance attend.
  const vidange = tenirLaVidange({ racine, dossier, enVol: () => [3, ...enCuisine()], version: "1.0.0", pid: 42, intervalleMs: 5, dire: (ligne) => dites.push(ligne) });
  t.after(() => vidange.arreter());
  demander(dossier, "1.1.0", Date.now() + 60_000);
  await jusqua(() => lireEnVol(racine)?.vidange === "1.1.0");
  const station = stationDuDepot({
    ...options,
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(racine, run), branche: "cook/13-github" }),
      reprendre: async () => assert.fail("a new ticket is prepared, not resumed"),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
    },
    // La prise de la station, retenue comme sa cuisine la retient (`station/cuisine.ts`).
    prise: (github, nom) => retenirLaPrise(priseDeLaStation(github, nom), () => vidange.retenue()),
    flux: racine,
    lancer: ({ flux }) => {
      lances.push("#13");
      conclut(flux);
      return { fin: Promise.resolve(fini) };
    },
    avertir: () => {},
  });
  if ("refus" in station) assert.fail(station.refus);
  const ouverte: StationGitHub = station;
  enCuisine = () => ouverte.enCuisine();
  assert.equal(vidange.retenue(), false);
  await ouverte.tour();
  await ouverte.calme();
  assert.deepEqual(lances, ["#13"]);
  assert.ok(dites.some((ligne) => ligne.includes("sa mise à jour vers 1.1.0 attend : elle prend encore ses tickets")), dites.join("\n"));
  assert.ok(!dites.some((ligne) => ligne.includes("ne prend plus de ticket")), dites.join("\n"));
});

test("with no cook in flight at some moment, the restart happens at that moment, before the deadline, and nothing is saved (#2586)", async (t) => {
  const racine = repertoireTemporaire(t);
  const dossier = repertoireTemporaire(t);
  const cooks = [5];
  const sauvegardes: number[] = [];
  const vidange = tenirLaVidange({ racine, dossier, enVol: () => cooks, sauver: async () => (sauvegardes.push(...cooks), cooks), version: "1.0.0", pid: 42, intervalleMs: 5 });
  t.after(() => vidange.arreter());
  const echeance = new Date(Date.now() + 60_000);
  const dites: string[] = [];
  let relancee = false;
  const relance = viderLaStation({ racine, dossier, visee: "1.1.0", pid: () => 42, dire: (ligne) => dites.push(ligne), echeance, pasMs: 5 }).then(() => void (relancee = true));
  await jusqua(() => dites.some((ligne) => ligne.includes("attend un moment sans cook en vol de la station (#5)")));
  // La station attend en prenant ses tickets : rien ne la retient.
  assert.equal(vidange.retenue(), false);
  assert.equal(relancee, false);
  cooks.splice(0);
  await relance;
  assert.ok(Date.now() < echeance.getTime());
  assert.deepEqual(sauvegardes, []);
  assert.ok(dites.some((ligne) => ligne.includes("la station n'a plus de cook en vol : 1.1.0 s'installe")), dites.join("\n"));
});

test("with cooks still in flight at the deadline, the restart happens at the deadline, after the work of each cook has been saved (#2586)", async (t) => {
  const racine = repertoireTemporaire(t);
  const dossier = repertoireTemporaire(t);
  const cooks = [5, 7];
  const ordre: string[] = [];
  const vidange = tenirLaVidange({
    racine,
    dossier,
    enVol: () => cooks,
    sauver: async () => {
      // Pendant la sauvegarde, la station ne prend plus de ticket.
      ordre.push(`sauve ${cooks.join(",")}${vidange.retenue() ? " retenue" : ""}`);
      return [...cooks];
    },
    version: "1.0.0",
    pid: 42,
    intervalleMs: 5,
  });
  t.after(() => vidange.arreter());
  const echeance = new Date(Date.now() + 100);
  const dites: string[] = [];
  await viderLaStation({ racine, dossier, visee: "1.1.0", pid: () => 42, dire: (ligne) => dites.push(ligne), echeance, accuseMs: 1500, pasMs: 5 });
  ordre.push("relance");
  assert.ok(Date.now() >= echeance.getTime());
  assert.deepEqual(ordre, ["sauve 5,7 retenue", "relance"]);
  assert.ok(dites.some((ligne) => ligne.includes("sauvés sur leur branche (#5, #7) : 1.1.0 s'installe")), dites.join("\n"));
});

test("after a restart at the deadline, the ticket whose cook was interrupted is taken by a new cook that starts from the saved branch (#2586)", async (t) => {
  const { origine, clone } = depotGit(t);
  const racine = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(14);
  const ouvrir = (lancer: Lancer, dits: string[]) => {
    const station = stationDuDepot({ ...options, nom: "box", places: 1, base: BASE, depotGitHub: "faux/depot", github: fauxClient(faux), depot: ouvrirDepot({ clone, base: BASE, worktrees: join(racine, "worktrees"), env: ENV_GIT }), prise: priseDeLaStation, flux: racine, lancer, avertir: (ligne) => dits.push(ligne) });
    if ("refus" in station) assert.fail(station.refus);
    return station as StationGitHub;
  };

  // Le premier cook écrit sans commiter, et ne finit pas avant l'échéance.
  let couper: (() => void) | undefined;
  const avant: string[] = [];
  const premiere = ouvrir(({ cwd }) => {
    writeFileSync(join(cwd, "a-moitie.txt"), "work in progress\n");
    return { fin: new Promise((rendre) => (couper = () => rendre({ ...fini, code: null, signal: "SIGTERM" }))) };
  }, avant);
  await premiere.tour();
  await jusqua(() => couper !== undefined);
  assert.deepEqual(await premiere.sauver?.(), [14]);
  // L'origine porte le travail sauvé.
  assert.equal(git(origine, "log", "-1", "--format=%s", "cook/14-github"), SUJET_DE_SAUVEGARDE);
  // La relance : la station s'arrête, son cook meurt avec elle.
  premiere.arreter?.();
  couper?.();
  await premiere.calme();
  assert.ok(avant.some((ligne) => ligne.includes("the cook's work is saved on `cook/14-github`")), avant.join("\n"));

  // La station relancée reprend le ticket depuis la branche sauvée, avec un cook.
  const apres: string[] = [];
  const vus: { fichier: boolean; consigne: boolean }[] = [];
  const seconde = ouvrir(({ cwd, args, flux }) => {
    vus.push({ fichier: existsSync(join(cwd, "a-moitie.txt")), consigne: args.join(" ").includes("Work saved before a restart") });
    commiter(cwd, "fini.txt");
    conclut(flux);
    return { fin: Promise.resolve(fini) };
  }, apres);
  await seconde.tour();
  await seconde.calme();
  assert.deepEqual(vus, [{ fichier: true, consigne: true }]);
  assert.ok(!apres.some((ligne) => ligne.includes("without a cook")), apres.join("\n"));
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.deepEqual(git(origine, "log", "--format=%s", `${BASE}..cook/14-github`).split("\n"), ["ajoute fini.txt", SUJET_DE_SAUVEGARDE]);
});
