// #4237 : le chargeur, le validateur et l'écrivain de la fiche du projet, au-delà
// des tests gelés — ce qu'ils refusent, ce qu'ils gardent, et la lecture de la
// cuisine quand le dépôt n'a pas encore de fiche ou la porte à sa base.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  avisDuChefALaBase,
  chargerFiche,
  CHEMIN_DE_LA_FICHE,
  creerFiche,
  ecrireFiche,
  faitsALaBase,
  faitsDuDossier,
  ficheParDefaut,
  FicheInvalide,
  gatesDuDossier,
  SCRIPT_GATES,
  validerFiche,
} from "../../src/fiche-projet/index.ts";
import { BASE, depotGit, git, repertoireTemporaire } from "../outils.ts";

const refus = (valeur: unknown): FicheInvalide => {
  try {
    validerFiche(valeur);
  } catch (erreur) {
    assert.ok(erreur instanceof FicheInvalide, String(erreur));
    return erreur;
  }
  assert.fail("the sheet was accepted");
};
const avec = (changer: (fiche: Record<string, unknown>) => void) => {
  const fiche: Record<string, unknown> = ficheParDefaut("main");
  changer(fiche);
  return fiche;
};

test("the default sheet is valid: one stage with the gates script, served = the branch given", () => {
  const fiche = validerFiche(ficheParDefaut("trunk"));
  assert.deepEqual(fiche.stages, [{ name: "code", gates: [SCRIPT_GATES] }]);
  assert.deepEqual(fiche.served, { branch: "trunk" });
});

test("each malformed item is refused, by its name", () => {
  assert.equal(refus(avec((f) => (f.chef = "me"))).item, "chef");
  assert.equal(refus(avec((f) => (f.work = ""))).item, "work");
  assert.equal(refus(avec((f) => (f.stages = []))).item, "stages");
  assert.equal(refus(avec((f) => (f.stages = ["code"]))).item, "stages.0");
  assert.equal(refus(avec((f) => (f.stages = [{ name: "code", gates: [SCRIPT_GATES], when: "now" }]))).item, "stages.0.when");
  assert.equal(refus(avec((f) => (f.stages = [{ name: "code", gates: [] }]))).item, "stages.0.gates");
  assert.equal(refus(avec((f) => (f.stages = [{ name: "code", gates: ["../elsewhere.sh"] }]))).item, "stages.0.gates.0");
  assert.equal(refus(avec((f) => (f.stages = [{ name: "code", gates: ["/bin/true"] }]))).item, "stages.0.gates.0");
  assert.equal(refus(avec((f) => (f.stages = [{ name: "", gates: [SCRIPT_GATES] }]))).item, "stages.0.name");
  assert.equal(refus(avec((f) => (f.tools = ["git", 3]))).item, "tools.1");
  assert.equal(refus(avec((f) => (f.served = "main"))).item, "served");
  assert.equal(refus(avec((f) => (f.served = { branch: "main", url: "x" }))).item, "served.url");
  assert.equal(refus(avec((f) => (f.served = { branch: "not a branch" }))).item, "served.branch");
  assert.equal(refus(null).item, "");
  assert.match(refus(avec((f) => (f.humans = "the chef"))).message, /^\.brigade\/fiche-projet\.json: the item `humans` \(Humans in the kitchen\) must be a list of texts$/);
});

test("the loader says when there is no sheet, or when it is not JSON", (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  assert.throws(() => chargerFiche(dossier), /there is no sheet/);
  mkdirSync(join(dossier, ".brigade"));
  writeFileSync(join(dossier, CHEMIN_DE_LA_FICHE), "{ not json");
  assert.throws(() => chargerFiche(dossier), /fiche-projet\.json: not JSON/);
});

test("the writer refuses an invalid sheet and leaves the file as it was; a new project keeps the sheet it already has", (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  assert.equal(creerFiche(dossier, { branchePrincipale: "main" }), true);
  const avant = readFileSync(join(dossier, CHEMIN_DE_LA_FICHE), "utf8");
  assert.throws(() => ecrireFiche(dossier, avec((f) => delete f.risks)), /risks/);
  assert.equal(readFileSync(join(dossier, CHEMIN_DE_LA_FICHE), "utf8"), avant);
  ecrireFiche(dossier, avec((f) => (f.work = "an episode")));
  assert.equal(creerFiche(dossier, { branchePrincipale: "trunk" }), false);
  assert.equal(chargerFiche(dossier).work, "an episode");
});

test("a repository with no sheet yet reads the defaults, served on the branch the kitchen serves; an invalid sheet is never replaced by them", (t: TestContext) => {
  const dossier = repertoireTemporaire(t);
  assert.deepEqual(faitsDuDossier(dossier, "v2").servi, { branch: "v2" });
  assert.deepEqual(gatesDuDossier(dossier), [SCRIPT_GATES]);
  ecrireFiche(dossier, avec((f) => (f.stages = [{ name: "script", gates: ["a.sh"] }, { name: "render", gates: ["b.sh", "c.sh"] }])));
  assert.deepEqual(faitsDuDossier(dossier, "v2").cook.stages, ["script", "render"]);
  assert.deepEqual(gatesDuDossier(dossier), ["a.sh", "b.sh", "c.sh"]);
  writeFileSync(join(dossier, CHEMIN_DE_LA_FICHE), JSON.stringify(avec((f) => delete f.tools)));
  assert.throws(() => faitsDuDossier(dossier, "v2"), /tools/);
  assert.throws(() => gatesDuDossier(dossier), /tools/);
});

test("at the base, the kitchen reads the sheet the chef merged, not the clone's working tree", (t: TestContext) => {
  const { clone } = depotGit(t);
  assert.deepEqual(faitsALaBase({ clone, base: BASE }).servi, { branch: BASE });
  assert.equal(avisDuChefALaBase(undefined, BASE), null);
  ecrireFiche(clone, avec((f) => (f.humans = ["the treasurer"])));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "fiche");
  git(clone, "push", "-q", "origin", `HEAD:${BASE}`);
  git(clone, "fetch", "-q", "origin");
  ecrireFiche(clone, avec((f) => (f.humans = ["a cook"])));
  assert.deepEqual(avisDuChefALaBase(clone, BASE)?.humans, ["the treasurer"]);
  assert.throws(() => faitsALaBase({ clone, base: "absent" }));
  assert.ok(existsSync(join(clone, CHEMIN_DE_LA_FICHE)));
});
