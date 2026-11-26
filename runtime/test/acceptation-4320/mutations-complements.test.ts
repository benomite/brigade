// #4320 : cas qui distinguent les lignes du correctif de leurs mutants (fetch de la base en échec, branche du clone, réécriture du bloc).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer, type OptionsDuDepot } from "../../src/brigade-github.ts";
import { DEBUT, FIN, lignesDuBloc, reecrireBloc } from "../../src/projets/bloc.ts";
import { CHEMIN_DE_LA_FICHE, ecrireFiche, ficheParDefaut } from "../../src/fiche-projet/index.ts";
import { brancheDuProjet } from "../../src/reglages-projet/en-vigueur.ts";
import { baseDuClone } from "../../src/projets-station/selection.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";
import { git } from "../outils.ts";

type Preparer = OptionsDuDepot["depot"]["preparer"];

const station = (t: { after(f: () => void): void }, faux: FauxGitHub, preparer: Preparer, connait: boolean, maintenant?: () => Date) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-4320-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const depot: OptionsDuDepot["depot"] = {
    connait: () => connait,
    preparer,
    reprendre: async (run) => { throw new Error(`resume ${run}: boom`); },
    retirer: () => {},
    ranger: async () => null,
    pousser: () => {},
    commits: () => 1,
    changes: () => ["a.ts"],
    diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
  };
  const s = stationDuDepot({ nom: "A", places: 1, base: "main", depotGitHub: "faux/depot", github: fauxClient(faux, "A"), depot, prise: priseDeLaStation,
    claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {}, ...(maintenant === undefined ? {} : { maintenant }) });
  if ("refus" in s) throw new Error("inaccessible");
  return s;
};

const echecs = (faux: FauxGitHub, issue: number) => (faux.commentaires.get(issue) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec")).length;

test("a failed fetch of the base is the station's, not the ticket's: no try is counted and the ticket is given back", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(31);
  const s = station(t, faux, async () => { throw new Error("git fetch origin main : no route"); }, false);
  await s.tour();
  await s.calme();
  assert.equal(echecs(faux, 31), 0);
  assert.equal(faux.prisesDe("A"), 1);
  assert.equal(faux.ticket(31).labels.has("taken"), false);
  await tourPresse(t);
  await reprisePropre(t);
});

test("a station stopped by a failed base fetch takes the project again after its pause, not only at restart", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(51);
  let instant = Date.parse("2026-01-01T00:00:00Z");
  let preparations = 0;
  const s = station(t, faux, async () => { preparations += 1; throw new Error("git fetch origin main : no route"); }, false, () => new Date(instant));
  for (let i = 0; i < 3; i += 1) { await s.tour(); await s.calme(); }
  assert.equal(preparations, 1, "stopped at the first failure");
  instant += 11 * 60_000;
  await s.tour();
  await s.calme();
  assert.equal(preparations, 2, "the pause is over: the project is tried again");
});

test("reecrireBloc: a project repeated with other spacing and a repeated held-back comment are each written once", () => {
  const texte = `${DEBUT}\n# held-back a/x\n# held-back a/x\na x main\n${FIN}\n`;
  assert.equal(reecrireBloc(texte, ["a x main", "a   x  main", "b y main"]), `${DEBUT}\n# held-back a/x\na x main\nb y main\n${FIN}\n`);
  assert.deepEqual(lignesDuBloc(`${DEBUT}\nb y main\n b  y main\n${FIN}\n`), ["b y main"]);
});

test("reecrireBloc: writing the same project again and again leaves the file as the first write left it", () => {
  let texte = `${DEBUT}\n# held-back a/x\n${FIN}\n`;
  for (let i = 0; i < 4; i++) texte = reecrireBloc(texte, [...lignesDuBloc(texte), "a x main"]);
  assert.equal(texte, `${DEBUT}\n# held-back a/x\na x main\n${FIN}\n`);
  assert.equal(texte.split("\n").filter((l) => l === "# held-back a/x").length, 1);
});

test("reecrireBloc: a project line written by hand twice outside the block is kept once, the chef's comments stay", () => {
  const texte = `# mine\nb y main\nb   y main\n${DEBUT}\n${FIN}\n`;
  assert.equal(reecrireBloc(texte, ["a x main"]), `# mine\nb y main\n${DEBUT}\na x main\n${FIN}\n`);
});

test("brancheDuProjet: a sheet that only the default branch of the repository carries is read there, and the clone's branch decides nothing else", (t) => {
  baseDuCloneCas(t);
  const { amont, clone, rapatrier } = projetSurGit(t, { parDefaut: "main" });
  ecrireFiche(amont, { ...ficheParDefaut("main"), served: { branch: "release-9" } });
  git(amont, "add", ".");
  git(amont, "commit", "-q", "-m", "fiche");
  rapatrier();
  assert.equal(existsSync(join(clone, CHEMIN_DE_LA_FICHE)), false, "the clone's tree does not hold the sheet");
  assert.deepEqual(brancheDuProjet(clone, "v2"), { branche: "release-9", provenance: "fiche-projet.json", problemes: [] });
});

test("reecrireBloc: a block that already repeats a `# held-back` line five times is written back with it once", () => {
  const ligne = "# held-back: brigade";
  const texte = `${DEBUT}\n${ligne}\n${ligne}\n${ligne}\n${ligne}\n${ligne}\na x main\n${FIN}\n`;
  const une = reecrireBloc(texte, ["a x main", "a x main"]);
  assert.equal(une.split("\n").filter((l) => l === ligne).length, 1);
  assert.equal(une.split("\n").filter((l) => l === "a x main").length, 1);
  assert.equal(reecrireBloc(une, ["a x main"]), une);
});

const tourPresse = async (t: { after(f: () => void): void }) => {
  const faux = new FauxGitHub();
  faux.feu(41);
  const s = station(t, faux, async () => { throw new Error("git fetch origin main : no route"); }, false);
  let presses = 0;
  s.presser = () => { presses += 1; };
  await s.tour();
  await s.calme();
  assert.equal(presses, 1);
  for (const [issue, texte] of [[42, "disk full while preparing main"], [43, "git fetch origin other : no route"]] as const) {
    const f = new FauxGitHub();
    f.feu(issue);
    const autre = station(t, f, async () => { throw new Error(texte); }, false);
    await autre.tour();
    await autre.calme();
    assert.equal(echecs(f, issue), 1, texte);
  }
};

const reprisePropre = async (t: { after(f: () => void): void }) => {
  const faux = new FauxGitHub();
  faux.feu(44);
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-4320-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = () => { throw new Error("no cook"); };
  const depot: OptionsDuDepot["depot"] = {
    connait: () => true,
    preparer: async () => { throw new Error("not called"); },
    reprendre: async () => { throw new Error("git fetch origin main : no route"); },
    retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "",
  };
  const s = stationDuDepot({ nom: "A", places: 1, base: "main", depotGitHub: "faux/depot", github: fauxClient(faux, "A"), depot, prise: priseDeLaStation,
    claude: "claude", env: {}, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in s) throw new Error("inaccessible");
  await s.tour();
  await s.calme();
  assert.equal(echecs(faux, 44), 1);
};

const baseDuCloneCas = (t: Parameters<typeof projetSurGit>[0]) => {
  const { clone: declare } = projetSurGit(t, { parDefaut: "main", autres: ["v2"], reglages: { integrationBranch: "v2" } });
  assert.equal(baseDuClone(declare), null);
  const { clone: sans } = projetSurGit(t, { parDefaut: "trunk" });
  assert.equal(baseDuClone(sans), "trunk");
};
