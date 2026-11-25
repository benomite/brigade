// #4237 : chaque étape de la cuisine lit ses faits dans la fiche du projet — le
// cook son travail, la pass ses gates et ses règles, le servi sa branche, l'avis
// du chef ses risques et ses humains —, et un nouveau projet reçoit la fiche des
// défauts. Chaque cas passe par le code que la cuisine appelle.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { consigne } from "../../src/claude.ts";
import { runRepoSetup } from "../../src/depot-prepare/preparation.ts";
import { CHEMIN_DE_LA_FICHE, chargerFiche, ecrireFiche, faitsDuDossier, ficheParDefaut } from "../../src/fiche-projet/index.ts";
import { gatesQuiNeJugentPas } from "../../src/fondation/fondation.ts";
import { aDesGates, jouerGates } from "../../src/gates.ts";
import type { ClientGitHub } from "../../src/proteger-branche.ts";
import { brancheDuProjet } from "../../src/reglages-projet/en-vigueur.ts";
import { consigneDeRelecture } from "../../src/reviewer.ts";
import { retenirLeSensible } from "../../src/sensible/sensible.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, depotRepris, fauxClient } from "../faux-github.ts";
import { BASE, DEPOT, ENV_ENFANT, depotGit, git, repertoireTemporaire } from "../outils.ts";

const fiche = (changer: (f: Record<string, unknown>) => void = () => {}) => {
  const f: Record<string, unknown> = ficheParDefaut("main");
  changer(f);
  return f;
};

test("the cook: its instructions carry the work, the stages and the tools of the sheet", (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  ecrireFiche(dossier, fiche((f) => ((f.work = "an episode"), (f.tools = ["the Labo Pop engine"]))));
  const texte = consigne({ ticket: 4, titre: "An episode", depot: DEPOT, base: "main", fiche: faitsDuDossier(dossier, "main").cook });
  assert.match(texte, /La fiche du projet \(`\.brigade\/fiche-projet\.json`\) dit ton travail : an episode\. Ses étapes : code\. Ses outils : the Labo Pop engine\./);
  assert.doesNotMatch(consigne({ ticket: 4, titre: "An episode", depot: DEPOT, base: "main" }), /La fiche du projet/);
});

test("the pass: the review is given the house rules of the sheet, and a broken one blocks", () => {
  const mission = { depot: DEPOT, base: "main", ticket: { number: 4, title: "t", body: "" }, commentaires: [], compteRendu: null, diff: { fichiers: ["a.ts"], texte: "+a" } };
  const texte = consigneDeRelecture({ ...mission, regles: ["no broken link", "one receipt per entry"] });
  assert.match(texte, /## Les règles de la maison\n\n.*`regle-de-la-maison`.*\n\n- no broken link\n- one receipt per entry\n/);
  assert.match(texte, /  - `regle-de-la-maison` — /);
  assert.doesNotMatch(consigneDeRelecture({ ...mission, regles: [] }), /## Les règles de la maison/);
  assert.doesNotMatch(consigneDeRelecture(mission), /## Les règles de la maison/);
});

function script(dossier: string, nom: string, corps: string) {
  writeFileSync(join(dossier, nom), `#!/usr/bin/env bash\n${corps}\n`);
  chmodSync(join(dossier, nom), 0o755);
}

test("the pass: the gates are the scripts the sheet names, stage after stage, the first red one stops the others", async (t: TestContext) => {
  const worktree = repertoireTemporaire(t);
  script(worktree, "ok.sh", 'echo "ok on $1"');
  script(worktree, "ko.sh", "echo 'FAIL  no broken link'; exit 3");
  script(worktree, "jamais.sh", "echo 'FAIL  never played'; exit 4");
  const jouer = () => jouerGates({ worktree, ticket: 4, env: ENV_ENFANT, delaiMs: 60_000 });

  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "script", gates: ["ok.sh"] }])));
  assert.equal(aDesGates(worktree), true);
  const vertes = await jouer();
  assert.equal(vertes.outcome, "green");
  assert.match(vertes.tail, new RegExp(`ok on ${worktree}`));

  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "script", gates: ["ok.sh"] }, { name: "render", gates: ["ko.sh", "jamais.sh"] }])));
  const rouges = await jouer();
  assert.equal(rouges.outcome, "red");
  assert.equal(rouges.code, 3);
  assert.deepEqual(rouges.failures, ["FAIL  no broken link"]);

  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "script", gates: ["ok.sh", "absent.sh"] }])));
  assert.equal(aDesGates(worktree), false, "a script the sheet names is missing");
});

test("the pass: a sheet the loader refuses makes the gates red, naming the item, and nothing is played", async (t: TestContext) => {
  const worktree = repertoireTemporaire(t);
  script(worktree, "temoin.sh", `touch "${join(worktree, "joue")}"`);
  mkdirSync(join(worktree, ".brigade"));
  writeFileSync(join(worktree, CHEMIN_DE_LA_FICHE), JSON.stringify(fiche((f) => ((f.stages = [{ name: "code", gates: ["temoin.sh"] }]), delete f.rules))));
  assert.equal(aDesGates(worktree), true, "the pass reaches the gates, which say the refusal");
  const gates = await jouerGates({ worktree, ticket: 4, env: ENV_ENFANT, delaiMs: 60_000 });
  assert.equal(gates.outcome, "red");
  assert.match(gates.failures[0] ?? "", /^FAIL {2}\.brigade\/fiche-projet\.json: the item `rules` \(House rules\) is missing$/);
  assert.throws(() => readFileSync(join(worktree, "joue")));
});

test("served: the integration branch is the one the sheet serves, at the base or in the clone's tree", (t: TestContext) => {
  const arbre = repertoireTemporaire(t);
  writeFileSync(join(arbre, "CLAUDE.md"), "- **Branche d'intégration** : `trunk`\n");
  ecrireFiche(arbre, fiche((f) => (f.served = { branch: "release-2" })));
  assert.deepEqual(brancheDuProjet(arbre, null), { branche: "release-2", provenance: "fiche-projet.json", problemes: [] });

  writeFileSync(join(arbre, CHEMIN_DE_LA_FICHE), JSON.stringify(fiche((f) => (f.served = "release-2"))));
  const refusee = brancheDuProjet(arbre, null);
  assert.equal(refusee.branche, "trunk", "a refused sheet decides nothing");
  assert.match(refusee.problemes.join("\n"), /fiche-projet\.json not read on the clone's working tree — .*the item `served` \(Served\) must be an object/);

  const { clone } = depotGit(t);
  ecrireFiche(clone, fiche((f) => (f.served = { branch: "release-3" })));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "fiche");
  git(clone, "push", "-q", "origin", `HEAD:${BASE}`);
  git(clone, "fetch", "-q", "origin");
  rmSync(join(clone, ".brigade"), { recursive: true });
  assert.deepEqual(brancheDuProjet(clone, BASE), { branche: "release-3", provenance: "fiche-projet.json", problemes: [] });
  const illisible = brancheDuProjet(clone, "absente");
  assert.equal(illisible.problemes.length, 1, "a branch git cannot read is said once, by the settings' read");
  assert.doesNotMatch(illisible.problemes[0] ?? "", /fiche-projet/);
});

test("the chef's opinion: the card of a sensitive ticket names the risks and the humans of the sheet", async () => {
  const faux = new FauxGitHub();
  faux.feu(41, ["sensitive"]);
  const livraison = { depot: "faux/depot", station: "A", ticket: { number: 41, title: "Pay", labels: ["sensitive"] }, pr: { number: 1041, sha: "a".repeat(40) }, chef: null };
  const motif = await retenirLeSensible(faux.pour("A"), livraison, () => ({ risks: ["a payment"], humans: ["the chef", "the treasurer"] }));
  assert.ok(motif !== null);
  const corps = (faux.commentaires.get(41) ?? []).map(({ body }) => body).join("\n");
  assert.match(corps, /\*\*Risks that require the chef's opinion \(project sheet\):\*\* a payment/);
  assert.match(corps, /\*\*Humans in the kitchen \(project sheet\):\*\* the chef; the treasurer/);

  const sans = new FauxGitHub();
  sans.feu(41, ["sensitive"]);
  await retenirLeSensible(sans.pour("A"), livraison, () => null);
  assert.doesNotMatch((sans.commentaires.get(41) ?? []).map(({ body }) => body).join("\n"), /project sheet/);
});

test("a new project: the repository setup writes the default sheet, served on its integration branch, and keeps one it already has", async (t: TestContext) => {
  const client: ClientGitHub = async (requete) => (requete.chemin.includes("/contents/") ? { statut: 404, corps: { message: "Not Found" }, scopes: null } : { statut: requete.methode === "GET" ? 200 : 201, corps: requete.methode === "GET" ? [] : {}, scopes: null });
  const neuf = repertoireTemporaire(t);
  await runRepoSetup({ dir: neuf, github: DEPOT, branch: "trunk" }, client);
  assert.deepEqual(chargerFiche(neuf).served, { branch: "trunk" });
  assert.equal(chargerFiche(neuf).stages.length, 1);
  const sansBranche = repertoireTemporaire(t);
  await runRepoSetup({ dir: sansBranche, github: DEPOT }, client);
  assert.deepEqual(chargerFiche(sansBranche).served, { branch: "main" });
  ecrireFiche(neuf, fiche((f) => (f.work = "an episode")));
  await runRepoSetup({ dir: neuf, github: DEPOT, branch: "trunk" }, client);
  assert.equal(chargerFiche(neuf).work, "an episode");
});

// Une station dont le worktree du cook porte `contenu` comme fiche : neuf, ou
// une branche reprise. Rend les consignes des cooks lancés, les retraits de
// worktree et ce que la station a dit.
async function cuisiner(t: TestContext, contenu: string, reprise: boolean) {
  const repertoire = mkdtempSync(join(tmpdir(), "fiche-projet-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const avecFiche = (worktree: string) => {
    mkdirSync(join(worktree, ".brigade"), { recursive: true });
    writeFileSync(join(worktree, CHEMIN_DE_LA_FICHE), contenu);
    return worktree;
  };
  const base = reprise ? depotRepris(repertoire, "c".repeat(40)) : { ...depotNeuf(repertoire), connait: () => false };
  const retraits: Array<string | undefined> = [];
  const depot = {
    ...base,
    preparer: async (run: string) => {
      const prepare = await base.preparer(run);
      avecFiche(prepare.worktree);
      return prepare;
    },
    reprendre: async (run: string, branche: string) => avecFiche(await base.reprendre(run, branche)),
    retirer: (_worktree: string, branche?: string) => void retraits.push(branche),
  };
  const faux = new FauxGitHub();
  faux.feu(77);
  const consignes: string[] = [];
  const lancer: Lancer = ({ entree, flux }) => {
    consignes.push(entree ?? "");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done." })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 3, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertis: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, flux: repertoire, lancer, avertir: (texte) => void avertis.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const dits = [...avertis, ...(faux.commentaires.get(77) ?? []).map(({ body }) => body)].join("\n");
  return { consignes, retraits, dits };
}

test("the cook, through the station: it starts with the work its sheet says", async (t) => {
  const { consignes } = await cuisiner(t, JSON.stringify(fiche((f) => (f.work = "an entry, a reconciliation"))), false);
  assert.equal(consignes.length, 1);
  assert.match(consignes[0] ?? "", /dit ton travail : an entry, a reconciliation\./);
});

test("the cook, through the station: a refused sheet starts no cook, says why, and drops the new branch but keeps a resumed one", async (t) => {
  const refusee = JSON.stringify(fiche((f) => delete f.work));
  const neuf = await cuisiner(t, refusee, false);
  assert.equal(neuf.consignes.length, 0);
  assert.match(neuf.dits, /the project sheet is refused, no cook starts: .*the item `work` \(The cook's work\) is missing/);
  assert.deepEqual(neuf.retraits, ["cook/77-github"]);
  const repris = await cuisiner(t, refusee, true);
  assert.equal(repris.consignes.length, 0);
  assert.deepEqual(repris.retraits, [undefined]);
});

test("the pass: the gates of the sheet share one time budget with the setup that runs before them", async (t: TestContext) => {
  const worktree = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  script(worktree, ".claude/brigade/worktree-setup.sh", "sleep 0.6");
  script(worktree, "lent.sh", "sleep 0.9");
  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: ["lent.sh"] }])));
  const gates = await jouerGates({ worktree, ticket: 4, env: ENV_ENFANT, delaiMs: 1_200 });
  assert.equal(gates.outcome, "timeout", "0.6 s of setup leave 0.6 s to gates that take 0.9 s");
});

test("the pass: whether the gates run anything is read in the scripts the sheet names", async (t: TestContext) => {
  const worktree = repertoireTemporaire(t);
  const fondation = { labels: ["foundation"] };
  const lire = async () => assert.fail("GitHub is not read for the foundation ticket itself");
  script(worktree, "vide.sh", "exit 0");
  script(worktree, "vide-aussi.sh", "true");
  script(worktree, "tests.sh", "npm test");
  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: ["vide.sh", "tests.sh"] }])));
  assert.equal(await gatesQuiNeJugentPas(worktree, fondation, lire), null, "one of the sheet's gates runs a command");
  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: ["vide.sh"] }, { name: "render", gates: ["vide-aussi.sh"] }])));
  assert.match((await gatesQuiNeJugentPas(worktree, fondation, lire)) ?? "", /the gates run no test command: `vide\.sh`, `vide-aussi\.sh` run nothing,/);
  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: ["vide.sh"] }])));
  assert.match((await gatesQuiNeJugentPas(worktree, fondation, lire)) ?? "", /`vide\.sh` runs nothing,/);
  ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: ["absent.sh"] }])));
  assert.match((await gatesQuiNeJugentPas(worktree, fondation, lire)) ?? "", /^the `absent\.sh` of the delivery could not be read/);
  writeFileSync(join(worktree, CHEMIN_DE_LA_FICHE), "[]");
  assert.match((await gatesQuiNeJugentPas(worktree, fondation, lire)) ?? "", /^the project sheet of the delivery is refused, so nothing says which gates judge it: /);
});
