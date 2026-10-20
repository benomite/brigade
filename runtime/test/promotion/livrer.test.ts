import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { EntreeRetenue } from "../../src/apprentissage/evenements.ts";
import { CARNET_PATH, parseCarnet, writeCarnet } from "../../src/carnet/carnet.ts";
import type { PR } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { LivraisonHorsRail } from "../../src/pass.ts";
import { passDuTicket } from "../../src/projections/pass.ts";
import { brancherCarnet, estUneLivraisonDuCarnet, livreurDuCarnet } from "../../src/promotion/livrer.ts";
import { consigneDeRelecture } from "../../src/reviewer.ts";
import type { CauseReveil } from "../../src/runtime.ts";
import { lireSeuils } from "../../src/seuils/seuils.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const P = "boutique";
const BASE = "v2";
const SEUILS = lireSeuils({});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

type PROuverte = { branche: string; base: string; titre: string; corps: string; number: number; url: string };

// Une cuisine réduite à ce que la livraison du carnet touche : un vrai journal,
// un faux dépôt — un vrai git en répertoire temporaire, dont la branche `v2`
// est l'origine —, un faux client de PR, et une fausse pass qui prend les
// livraisons hors du rail comme la vraie : par `pass.entered`.
function cuisine(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const origine = join(racine, "origine");
  mkdirSync(origine);
  git(origine, "init", "--quiet", "-b", BASE);
  git(origine, "config", "user.name", "chef");
  git(origine, "config", "user.email", "chef@localhost");
  git(origine, "config", "commit.gpgsign", "false");
  writeFileSync(join(origine, "README.md"), "# boutique\n");
  git(origine, "add", "README.md");
  git(origine, "commit", "--quiet", "-m", "départ");

  let jour = "2026-10-01";
  mkdirSync(join(racine, "etat"));
  const journal = ouvrirJournal(join(racine, "etat"), { maintenant: () => new Date(`${jour}T12:00:00.000Z`) });
  t.after(() => journal.fermer());

  const poussees: string[] = [];
  const preparees: string[] = [];
  const depot = {
    async preparer(run: string) {
      preparees.push(run);
      const worktree = join(racine, "worktrees", run);
      const branche = `cook/${run}`;
      git(origine, "worktree", "add", "--quiet", "-b", branche, worktree, BASE);
      return { worktree, branche };
    },
    retirer(worktree: string, branche?: string) {
      git(origine, "worktree", "remove", "--force", worktree);
      if (branche !== undefined) git(origine, "branch", "--quiet", "-D", branche);
    },
    async ranger(worktree: string) {
      git(origine, "worktree", "remove", "--force", worktree);
      return null;
    },
    pousser(branche: string) {
      poussees.push(branche);
    },
  };

  const prs: PROuverte[] = [];
  const github = {
    async ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }) {
      const number = 900 + prs.length;
      const url = `https://github.com/benomite/boutique/pull/${number}`;
      prs.push({ ...pr, number, url });
      return url;
    },
    async prDeBranche(branche: string): Promise<PR | null> {
      const pr = prs.findLast((p) => p.branche === branche);
      return pr ? { number: pr.number, url: pr.url, base: pr.base, sha: git(origine, "rev-parse", branche), state: "open", merged: false, enRetard: false, mergeePar: null } : null;
    },
  };

  const enPass: LivraisonHorsRail[] = [];
  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const runtime = {
    projet: P,
    journal,
    surReveil(ecouter: (cause: CauseReveil) => void) {
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter(_signal?: string) {},
    reveillerPass() {},
    prendreHorsRail(livraison: LivraisonHorsRail) {
      enPass.push(livraison);
      journal.ajouter({ project: P, ticket: livraison.numero, type: "pass.entered", author: "pass", payload: { run: livraison.run, branch: livraison.branche, pr: livraison.pr, number: livraison.numero } });
    },
  };
  // Le carnet que le clone porte à la base — ici, la base elle-même.
  const carnetALaBase = () => (git(origine, "ls-tree", "--name-only", BASE, "--", CARNET_PATH) === "" ? null : `${git(origine, "show", `${BASE}:${CARNET_PATH}`)}\n`);
  const options = { depot, github, base: BASE, seuils: SEUILS, carnetALaBase, maintenant: () => new Date(`${jour}T12:00:00.000Z`), avertir: () => {} };
  // Un livreur neuf : celui d'un runtime qui vient de démarrer.
  const livreur = () => livreurDuCarnet(runtime, options);

  let ticket = 100;
  // Un ticket servi, et sa rétro.
  const servir = (...kept: EntreeRetenue[]) =>
    journal.ajouter({ project: P, ticket: ++ticket, type: "retro.recorded", author: "pass", payload: { run: null, text: null, kept, dropped: [] } });
  // Ce que la pass écrit d'une PR hors du rail mergée — et la base qui la porte.
  const fusionner = (pr: PROuverte) => {
    git(origine, "merge", "--quiet", "--no-ff", "--no-edit", pr.branche);
    journal.ajouter({ project: P, ticket: pr.number, type: "merge.done", author: "pass", payload: { pr: pr.url, sha: null, by: "pass", reconciled: false } });
    return git(origine, "rev-parse", "HEAD");
  };
  const carnetDe = (ref: string) => parseCarnet(git(origine, "show", `${ref}:${CARNET_PATH}`) + "\n");
  const fichiersDe = (pr: PROuverte) => git(origine, "diff", "--name-only", `${BASE}...${pr.branche}`).split("\n").filter(Boolean);
  const derniere = () => {
    const pr = prs.at(-1);
    assert.ok(pr, "une PR est ouverte");
    return pr;
  };
  return {
    origine,
    journal,
    runtime,
    options,
    livreur,
    servir,
    fusionner,
    carnetDe,
    fichiersDe,
    derniere,
    prs,
    poussees,
    preparees,
    enPass,
    reveiller: () => ecouteurs.forEach((e) => e("log")),
    auJour: (j: string) => void (jour = j),
  };
}

const propose = (text: string): EntreeRetenue => ({ kind: "propose", text });
const reconfirme = (id: string): EntreeRetenue => ({ kind: "reconfirm", id });
const TEXTE = "Lancer les tests du runtime avant de commiter.";

// L1 proposée puis reconfirmée par trois tickets différents.
const troisRetros = (c: ReturnType<typeof cuisine>) => {
  c.servir(propose(TEXTE));
  c.servir(reconfirme("L1"));
  c.servir(reconfirme("L1"));
};

test("une promotion fait une PR, une seule, qui ne touche que le carnet et nomme les rétros qui ont proposé la leçon", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  const livreur = c.livreur();

  assert.equal(await livreur.passer(), "livree");
  assert.equal(c.prs.length, 1);
  const pr = c.derniere();
  assert.deepEqual(c.fichiersDe(pr), [CARNET_PATH], "le diff ne touche que le carnet");
  assert.equal(pr.base, BASE);
  assert.equal(pr.titre, "Carnet des leçons — promue L1");
  // Le corps nomme chaque rétro qui la porte, avec son ticket.
  for (const [ref, ticket, genre] of [["retro-1", 101, "proposée"], ["retro-2", 102, "reconfirmée"], ["retro-3", 103, "reconfirmée"]] as const) {
    assert.match(pr.corps, new RegExp(`\`${ref}\` — ticket #${ticket}, qui l'a ${genre}`));
  }
  assert.match(pr.corps, new RegExp(TEXTE));
  assert.deepEqual(c.carnetDe(pr.branche).lessons, [{ id: "L1", text: TEXTE, state: "promoted", entered: "2026-10-01", retros: ["retro-1", "retro-2", "retro-3"], origin: { kind: "retro" } }]);
  assert.deepEqual(c.poussees, [pr.branche]);

  // Le changement s'écrit au journal avec sa PR.
  const [livre] = c.journal.duType("carnet.delivered", 10);
  assert.equal(livre?.payload.number, pr.number);
  assert.deepEqual(livre?.payload.decisions, [{ kind: "promote", lesson: "L1", retros: ["retro-1", "retro-2", "retro-3"] }]);

  // Tant qu'elle est en pass, aucune autre ne part — même d'un runtime qui redémarre.
  c.servir(reconfirme("L1"));
  assert.equal(await livreur.passer(), "en-pass");
  assert.equal(await c.livreur().passer(), "en-pass");
  assert.equal(c.prs.length, 1);
});

test("la PR entre en pass par l'entrée des livraisons hors du rail, du même geste que son ouverture : aucun geste du chef n'est attendu", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  // Branché comme au démarrage : un premier passage, puis un par réveil.
  const branche = brancherCarnet(c.runtime, c.options);
  t.after(() => branche.arreter("test"));
  await jusqua(() => c.enPass.length === 1);

  const pr = c.derniere();
  const [livraison] = c.enPass;
  assert.equal(livraison?.pr, pr.url);
  assert.equal(livraison?.numero, pr.number);
  assert.equal(livraison?.branche, pr.branche);
  assert.ok(livraison && estUneLivraisonDuCarnet(livraison.run), "la pass reconnaît la livraison du carnet à son run");
  // La pass la tient : livrée, hors du rail, en attente de son jugement.
  const tenue = passDuTicket(c.journal.base, pr.number);
  assert.equal(tenue?.horsRail, true);
  assert.equal(tenue?.phase, "delivered");
  // Rien n'a été demandé au chef, ni écrit par lui.
  const types = c.journal.tout().map((e) => e.type);
  assert.deepEqual(types.filter((type) => type.startsWith("carnet.")), ["carnet.started", "carnet.delivered"]);
  assert.deepEqual(c.journal.tout().filter((e) => e.author === "chef"), []);
  assert.ok(types.indexOf("pass.entered") > types.indexOf("carnet.started"));

  // La relecture qu'elle reçoit est celle d'un carnet, pas celle d'une passe de fermeture.
  const consigne = consigneDeRelecture({
    depot: "benomite/boutique",
    base: BASE,
    ticket: { number: pr.number, title: pr.titre, body: pr.corps },
    horsRail: true,
    carnet: true,
    commentaires: [],
    compteRendu: null,
    diff: { fichiers: [CARNET_PATH], texte: "+## L1" },
  });
  assert.match(consigne, /un changement du carnet des leçons du projet/);
  assert.match(consigne, /Un fichier changé autre que le carnet/);
  assert.doesNotMatch(consigne, /closer/);
});

test("sans décision, aucune PR n'est ouverte, rien n'est poussé, et la branche préparée disparaît", async (t) => {
  const c = cuisine(t);
  c.servir(propose(TEXTE));
  c.servir(reconfirme("L1"));
  const livreur = c.livreur();

  assert.equal(await livreur.passer(), "rien");
  assert.equal(await livreur.passer(), "inchange", "rien de neuf : le jugement n'est pas refait");
  assert.deepEqual(c.prs, []);
  assert.deepEqual(c.poussees, []);
  assert.deepEqual(c.enPass, []);
  assert.deepEqual(c.preparees, [], "jugé sur le carnet du clone, aucune branche n'est préparée");
  assert.equal(git(c.origine, "branch", "--list", "cook/carnet-*"), "");
  assert.deepEqual(c.journal.tout().filter((e) => e.type.startsWith("carnet.")), []);
});

test("une leçon promue que rien ne reconfirme redescend, puis disparaît : la PR inscrit sa sortie au carnet, datée et motivée, sans l'effacer", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  const livreur = c.livreur();
  assert.equal(await livreur.passer(), "livree");
  c.fusionner(c.derniere());

  // Vingt tickets servis sans la reconfirmer : elle redevient provisoire.
  for (let i = 0; i < SEUILS.expirationPromue; i++) c.servir();
  c.auJour("2026-11-02");
  assert.equal(await livreur.passer(), "livree");
  const retrogradee = c.derniere();
  assert.equal(retrogradee.titre, "Carnet des leçons — rétrogradée L1");
  assert.deepEqual(c.fichiersDe(retrogradee), [CARNET_PATH]);
  assert.deepEqual(c.carnetDe(retrogradee.branche).lessons, [], "provisoire, elle quitte le carnet pour le journal");
  assert.match(retrogradee.corps, /`retro-3` — ticket #103/);
  c.fusionner(retrogradee);

  // Vingt de plus : elle disparaît, et le carnet garde sa sortie.
  for (let i = 0; i < SEUILS.expirationProvisoire; i++) c.servir();
  c.auJour("2026-12-01");
  assert.equal(await livreur.passer(), "livree");
  const expiree = c.derniere();
  assert.equal(expiree.titre, "Carnet des leçons — expirée L1");
  assert.deepEqual(c.fichiersDe(expiree), [CARNET_PATH]);
  assert.deepEqual(c.carnetDe(expiree.branche).lessons, [
    { id: "L1", text: TEXTE, state: "expired", entered: "2026-10-01", retros: ["retro-1", "retro-2", "retro-3"], origin: { kind: "retro" }, exit: { date: "2026-12-01", reason: "expiry" } },
  ]);
  assert.match(git(c.origine, "show", `${expiree.branche}:${CARNET_PATH}`), /- état: expired\n[^]*- sortie: 2026-12-01\n- raison: expiry$/);
  assert.match(expiree.corps, /sa sortie reste au carnet/);
  assert.equal(c.prs.length, 3);
});

test("retirée par une PR qui la marque `retired`, la leçon n'est pas repromue par la même histoire ; trois rétros nouvelles en font une nouvelle PR de promotion", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  assert.equal(await c.livreur().passer(), "livree");
  const promotion = c.derniere();
  c.fusionner(promotion);

  // Le chef retire la leçon : sa PR, mergée, la passe à `retired`.
  const carnet = c.carnetDe(BASE);
  const retire = { lessons: carnet.lessons.map((l) => ({ ...l, state: "retired" as const, exit: { date: "2026-10-05", reason: "manual" as const } })) };
  writeFileSync(join(c.origine, CARNET_PATH), writeCarnet(retire));
  git(c.origine, "commit", "--quiet", "-am", "Retirer L1 du carnet");
  c.auJour("2026-10-05");

  // La même histoire, rejugée par un runtime neuf : aucune promotion.
  assert.equal(await c.livreur().passer(), "rien");
  assert.equal(c.prs.length, 1);

  // Deux rétros nouvelles ne suffisent pas, même avec les anciennes.
  c.auJour("2026-10-06");
  const livreur = c.livreur();
  c.servir(reconfirme("L1"));
  c.servir(reconfirme("L1"));
  assert.equal(await livreur.passer(), "rien");

  c.servir(reconfirme("L1"));
  assert.equal(await livreur.passer(), "livree");
  const repromue = c.derniere();
  assert.notEqual(repromue.number, promotion.number);
  assert.equal(repromue.titre, "Carnet des leçons — promue L1");
  assert.deepEqual(c.fichiersDe(repromue), [CARNET_PATH]);
  // Les rétros des tickets 104 à 106, et elles seules : celles d'avant le retrait ne la portent pas.
  assert.deepEqual([...repromue.corps.matchAll(/— ticket #(\d+)/g)].map(([, n]) => Number(n)), [104, 105, 106]);
  const [l1] = c.carnetDe(repromue.branche).lessons;
  assert.equal(l1?.id, "L1", "elle garde son id");
  assert.equal(l1?.state, "promoted");
});

test("retirée par le revert de sa PR de promotion, la leçon est inscrite `retired`, id gardé ; elle n'est repromue que par trois rétros nouvelles", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  const livreur = c.livreur();
  assert.equal(await livreur.passer(), "livree");
  const fusion = c.fusionner(c.derniere());

  // Le chef reverte la PR de promotion : le carnet de la base ne la porte plus.
  git(c.origine, "revert", "--no-edit", "-m", "1", fusion);
  assert.equal(existsSync(join(c.origine, CARNET_PATH)), false);
  c.auJour("2026-10-05");

  // Au ticket servi suivant, le runtime constate le retrait — il ne la repromeut pas.
  c.servir();
  assert.equal(await livreur.passer(), "livree");
  const retrait = c.derniere();
  assert.equal(retrait.titre, "Carnet des leçons — retirée L1");
  assert.deepEqual(c.journal.duType("carnet.delivered", 1)[0]?.payload.decisions.map((d) => d.kind), ["retire"]);
  assert.deepEqual(c.fichiersDe(retrait), [CARNET_PATH]);
  assert.deepEqual(c.carnetDe(retrait.branche).lessons, [
    { id: "L1", text: TEXTE, state: "retired", entered: "2026-10-01", retros: ["retro-1", "retro-2", "retro-3"], origin: { kind: "retro" }, exit: { date: "2026-10-05", reason: "manual" } },
  ]);
  assert.match(retrait.corps, new RegExp(`Promue par ${c.prs[0]?.url}`));
  c.fusionner(retrait);

  // La même histoire ne la repromeut pas ; trois rétros nouvelles, si.
  assert.equal(await c.livreur().passer(), "rien");
  c.auJour("2026-10-06");
  c.servir(reconfirme("L1"));
  c.servir(reconfirme("L1"));
  c.servir(reconfirme("L1"));
  assert.equal(await livreur.passer(), "livree");
  const repromue = c.derniere();
  assert.equal(repromue.titre, "Carnet des leçons — promue L1");
  assert.equal(c.carnetDe(repromue.branche).lessons[0]?.state, "promoted");
  assert.equal(c.prs.length, 3);
});

test("une livraison partie dans une vie du runtime qui s'est arrêtée reprend la PR que GitHub porte pour sa branche, ou se dit non livrée", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  const payload = { run: "carnet-mort0001", branch: "cook/carnet-mort0001", decisions: [{ kind: "promote" as const, lesson: "L1", retros: ["retro-1", "retro-2", "retro-3"] }], lessons: [] };
  c.journal.ajouter({ project: P, ticket: null, type: "carnet.started", author: "runtime", payload });
  git(c.origine, "branch", payload.branch, BASE);
  await c.options.github.ouvrirPR({ branche: payload.branch, base: BASE, titre: "Carnet des leçons — promue L1", corps: "" });

  assert.equal(await c.livreur().passer(), "livree");
  assert.equal(c.prs.length, 1, "aucune seconde PR");
  assert.deepEqual(c.enPass.map((l) => l.run), [payload.run]);

  const orpheline = { ...payload, run: "carnet-mort0002", branch: "cook/carnet-mort0002" };
  const d = cuisine(t);
  d.journal.ajouter({ project: P, ticket: null, type: "carnet.started", author: "runtime", payload: orpheline });
  assert.equal(await d.livreur().passer(), "non-livree");
  assert.match(d.journal.duType("carnet.undelivered", 1)[0]?.payload.reason ?? "", /avant d'ouvrir sa PR/);
  assert.deepEqual(d.enPass, []);
});

test("un clone en retard sur la base ne fait rien livrer : le jugement est refait sur la base rapatriée, et la branche préparée disparaît", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  assert.equal(await c.livreur().passer(), "livree");
  c.fusionner(c.derniere());

  // Le clone n'a pas encore rapatrié le merge : son carnet est vide, la
  // leçon semble retirée par un revert. Sur la base rapatriée, elle est là.
  c.servir();
  const enRetard = livreurDuCarnet(c.runtime, { ...c.options, carnetALaBase: () => null });
  assert.equal(await enRetard.passer(), "rien");
  assert.equal(c.prs.length, 1);
  assert.equal(c.preparees.length, 2, "une branche préparée pour rejuger sur la base");
  assert.equal(git(c.origine, "branch", "--list", "cook/carnet-*").split("\n").length, 1, "seule celle de la PR livrée reste");
});

test("un carnet de la base illisible n'est pas réécrit : rien ne part, et la raison est dite", async (t) => {
  const c = cuisine(t);
  troisRetros(c);
  mkdirSync(join(c.origine, ".claude/brigade"), { recursive: true });
  writeFileSync(join(c.origine, CARNET_PATH), "# Carnet des leçons\n\n## L1\n- état: peut-être\n");
  git(c.origine, "add", CARNET_PATH);
  git(c.origine, "commit", "--quiet", "-m", "un carnet écrit à la main");

  assert.equal(await c.livreur().passer(), "non-livree");
  assert.deepEqual(c.prs, []);
  assert.match(c.journal.duType("carnet.undelivered", 1)[0]?.payload.reason ?? "", /carnet de la base illisible[^]*peut-être/);
  // Le clone qui ne lit pas encore la base n'est pas un échec : rien n'est préparé, le réveil suivant rejuge.
  const d = cuisine(t);
  troisRetros(d);
  const aveugle = livreurDuCarnet(d.runtime, { ...d.options, carnetALaBase: () => { throw new Error("git ls-tree : pas de origin/v2"); } });
  assert.equal(await aveugle.passer(), "rien");
  assert.deepEqual(d.preparees, []);
});
