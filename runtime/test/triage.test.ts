// Le triage devant TODO : chaque carte qui allait y entrer passe d'abord par
// l'agent de triage, qui la tranche — l'action est faite, et une phrase le dit
// sur l'issue — ou la laisse entrer, comme avant. Il ne merge jamais.
// D'abord l'atelier seul, l'agent doublé par une réponse que le test dicte ;
// puis sur une cuisine complète, le faux `claude` en agent de triage.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { brancherLeTriage, cartesEnTodo, cartesRetenues, entrerDansTodo } from "../src/carte-todo.ts";
import type { Fait } from "../src/evenements.ts";
import type { Check } from "../src/events/pass.ts";
import { REDECOUPE } from "../src/events/rail.ts";
import { sansAttente } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { MARQUEUR_MANAGER } from "../src/juger.ts";
import { managerAllume } from "../src/projections/manager.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { DEFINITION, lireTriage, unePhrase } from "../src/triage/consigne.ts";
import { ATTENTE_CI_MS, ouvrirTriage, RELANCE_DU_TRIAGE } from "../src/triage/triage.ts";
import { CALIBRE, chef, cuisine, fauxGitHub, issue, montre } from "./aides/cuisine.ts";
import { DEPOT, jusqua, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const CARTE = { type: "product", enonce: "Choisir entre l'export CSV et l'export JSON." };
const FICHE = "<!-- brigade:fiche -->\n- attend : #29, #27\n- zone : src";

// Ce que l'agent répond, pour chaque action.
const REPONSES = {
  relancer: { action: "relancer", phrase: "Sent #30 back to the cook: `export.test.ts:12` fails because the CSV header is missing.", diagnostic: "export.test.ts:12 échoue : l'en-tête CSV manque.", motif: "Lu dans la CI." },
  redecouper: { action: "redecouper", phrase: "Re-split #30 into smaller tickets, since it is too big for one PR.", motif: "Trois livrables." },
  dependance: { action: "dependance", phrase: "Removed the dependency on #29, which was served by the split of #28.", dependance: 29, motif: "Livrée." },
  attendre: { action: "attendre", phrase: "Waiting for the CI of #30, which is still running.", motif: "La CI tourne." },
  retirer: { action: "retirer", phrase: "Removed #30 from the rail: it was done in #27.", motif: "Doublon." },
  todo: { action: "todo", motif: "Un choix de produit." },
};

// Une réponse que le test lâche quand il veut : l'agent décide tant qu'elle
// ne l'est pas.
function enSuspens() {
  let lacher: (reponse: unknown) => void = () => {};
  const promesse = new Promise<unknown>((resoudre) => (lacher = resoudre));
  return { promesse, lacher };
}

function atelier(t: TestContext, reponses: Array<unknown | Promise<unknown>>) {
  const repertoire = repertoireTemporaire(t);
  const heure = montre();
  const journal = ouvrirJournal(repertoire, { maintenant: heure.maintenant });
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(30), issue(27));
  gh.decrire(30, { body: "Exporter les rapports.\n\n## Critères\n\n- un export" });
  t.after(brancherLeTriage(journal.base, () => true));
  const consignes: string[] = [];
  const decoupes: number[] = [];
  const retenus: number[] = [];
  const avertissements: string[] = [];
  const triage = ouvrirTriage({
    journal,
    projet: PROJET,
    rail,
    github: gh.github,
    depotGitHub: DEPOT,
    async demander(sujet, consigne, lire) {
      consignes.push(consigne);
      const reponse = await reponses[consignes.length - 1];
      return { run: `${sujet.prefixe}-${sujet.numero}-${consignes.length}`, ...lire(reponse === undefined ? null : JSON.stringify(reponse)) };
    },
    peutJuger: () => true,
    async redecouper(ticket) {
      decoupes.push(ticket.number);
      return { retenir: () => void retenus.push(ticket.number) };
    },
    maintenant: heure.maintenant,
    arrete: () => false,
    avertir: (texte) => void avertissements.push(texte),
  });
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  // Le ticket 30 sur le rail, avec sa fiche.
  const arriver = (fiche: { waitsFor: number[]; zone: string[]; problems: string[] } | null = null) =>
    noter(30, { type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: `https://github.com/${DEPOT}/issues/30`, model: "sonnet", effort: "low", card: fiche } }, "github");
  // Livré, puis arrêté : sa PR, son commit, ce que la pass en a dit.
  const livrer = () => {
    arriver();
    rail.prendre(STATION);
    noter(30, { type: "cook.launched", payload: { run: "cook-30", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-30.jsonl", station: STATION, branch: "cook/30-x", worktree: "worktrees/30-x" } }, `station:${STATION}`);
    rail.envoyerEnPass(30, STATION);
    noter(30, { type: "pass.started", payload: { run: "cook-30", pr: `https://github.com/${DEPOT}/pull/101`, number: 101, sha: "abc123" } }, "pass");
  };
  const poser = (auteur = "pass") => entrerDansTodo(journal, PROJET, 30, CARTE, auteur);
  const dits = () => gh.commentaires.filter(([numero]) => numero === 30).map(([, corps]) => corps);
  return { journal, rail, gh, heure, triage, consignes, decoupes, retenus, avertissements, noter, arriver, livrer, poser, dits };
}

// La phrase posée sur l'issue : le seul commentaire, et une seule phrase.
function unSeulCommentaire(c: ReturnType<typeof atelier>, phrase: string) {
  assert.equal(c.dits().length, 1);
  const [dit = ""] = c.dits();
  assert.ok(dit.startsWith(`${MARQUEUR_MANAGER}\n`));
  const texte = dit.slice(MARQUEUR_MANAGER.length + 1);
  assert.equal(texte, phrase);
  assert.ok(unePhrase(texte));
}

describe("la porte de TODO, devant le triage", () => {
  test("une carte qui allait entrer en TODO va d'abord à l'agent de triage, et n'est pas dans TODO tant qu'il décide", async (t) => {
    const suspens = enSuspens();
    const c = atelier(t, [suspens.promesse]);
    c.livrer();
    c.noter(30, { type: "pass.judged", payload: { run: "cook-30", pr: null, number: 101, sha: "abc123", verdict: "red", gates: { outcome: "green" }, ci: { outcome: "red", checks: [] }, review: { outcome: "green" }, findings: ["la CI est rouge : tests"], judgeModified: false, noDiff: false } } as unknown as Fait, "pass");
    c.gh.repondre(30, "Le chef préfère le CSV, mais rien n'est décidé.");
    c.gh.diffs.set(101, "diff --git a/src/export.ts b/src/export.ts\n+export const csv = true;");
    const rouge: Check = { name: "tests", outcome: "red", conclusion: "failure", url: `https://github.com/${DEPOT}/actions/runs/1/job/2` };
    c.gh.ci.checks = [rouge];
    c.gh.journauxDeCI.set("tests", "not ok 12 - export.test.ts: header missing");

    assert.equal(c.poser().admise, true);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(cartesRetenues(c.journal.base).map(({ ticket, auteur }) => [ticket, auteur]), [[30, "pass"]]);

    const traite = c.triage.traiter();
    await jusqua(() => c.consignes.length === 1);
    // L'agent décide : rien n'est encore dans TODO.
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    // Il lit l'issue, la PR, les reviews et les journaux de la CI.
    const [consigne = ""] = c.consignes;
    for (const lu of ["Exporter les rapports.", "Le chef préfère le CSV", CARTE.enonce, "PR https://github.com/benomite/brigade/pull/101", "la CI est rouge : tests", "+export const csv = true;", "tests : red (failure)", "not ok 12 - export.test.ts: header missing"]) {
      assert.ok(consigne.includes(lu), `la consigne ne donne pas « ${lu} »`);
    }

    suspens.lacher(REPONSES.todo);
    await traite;
    assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket, enonce }) => [ticket, enonce]), [[30, CARTE.enonce]]);
  });

  test("sans triage branché, la carte entre dans TODO comme avant", (t) => {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    t.after(() => journal.fermer());
    assert.equal(entrerDansTodo(journal, PROJET, 30, CARTE, "manager").admise, true);
    assert.deepEqual(cartesEnTodo(journal.base).map(({ ticket }) => ticket), [30]);
    assert.deepEqual(cartesRetenues(journal.base), []);
  });

  test("une carte refusée à la porte n'est pas retenue : elle n'entre nulle part", (t) => {
    const c = atelier(t, []);
    assert.equal(entrerDansTodo(c.journal, PROJET, 30, { type: "chore", enonce: "x" }, "pass").admise, false);
    assert.deepEqual(cartesRetenues(c.journal.base), []);
  });
});

describe("l'agent tranche : l'action est faite, et une seule phrase le dit sur l'issue", () => {
  test("relancer avec un diagnostic précis : la livraison repart chez un cook, qui lit le diagnostic", async (t) => {
    const c = atelier(t, [REPONSES.relancer]);
    c.livrer();
    c.rail.quatreVingtSix(30, { motif: "manager:escalated" });
    c.poser("manager");
    await c.triage.traiter();

    assert.equal(ticketDuRail(c.journal.base, 30)?.state, "waiting");
    assert.equal(c.journal.duTicket(30).findLast((e) => e.type === "ticket.released")?.payload.reason, RELANCE_DU_TRIAGE);
    assert.deepEqual(passDuTicket(c.journal.base, 30)?.findings, [REPONSES.relancer.diagnostic]);
    assert.equal(passDuTicket(c.journal.base, 30)?.phase, "returned");
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(cartesRetenues(c.journal.base), []);
    unSeulCommentaire(c, REPONSES.relancer.phrase);
  });

  test("redécouper : le découpage du manager est retenu, et le ticket est 86 `split`", async (t) => {
    const c = atelier(t, [REPONSES.redecouper]);
    c.livrer();
    c.rail.quatreVingtSix(30, { motif: "manager:escalated" });
    c.poser("manager");
    await c.triage.traiter();

    assert.deepEqual([c.decoupes, c.retenus], [[30], [30]]);
    assert.deepEqual([ticketDuRail(c.journal.base, 30)?.state, ticketDuRail(c.journal.base, 30)?.reason], ["86", REDECOUPE]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    unSeulCommentaire(c, REPONSES.redecouper.phrase);
  });

  test("corriger une dépendance livrée : la ligne `attend` de la fiche ne la porte plus", async (t) => {
    const c = atelier(t, [REPONSES.dependance]);
    c.arriver({ waitsFor: [29, 27], zone: ["src"], problems: [] });
    c.gh.repondre(30, FICHE);
    c.poser("manager");
    await c.triage.traiter();

    const fiches = (await c.gh.github.commentaires(30)).filter(({ body }) => body.startsWith("<!-- brigade:fiche -->"));
    assert.deepEqual(fiches.map(({ body }) => body), ["<!-- brigade:fiche -->\n- attend : #27\n- zone : src"]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    unSeulCommentaire(c, REPONSES.dependance.phrase);
  });

  test("attendre une CI lente : la carte reste hors de TODO, puis se retrie passé le délai", async (t) => {
    const c = atelier(t, [REPONSES.attendre, REPONSES.todo]);
    c.livrer();
    c.gh.ci.checks = [{ name: "tests", outcome: "pending", conclusion: "in_progress", url: null }];
    c.poser();
    await c.triage.traiter();

    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.equal(cartesRetenues(c.journal.base)[0]?.until, new Date(c.heure.maintenant().getTime() + ATTENTE_CI_MS).toISOString());
    unSeulCommentaire(c, REPONSES.attendre.phrase);
    // Avant le délai, rien ne se retrie.
    await c.triage.traiter();
    assert.equal(c.consignes.length, 1);
    c.heure.avancer(ATTENTE_CI_MS);
    await c.triage.traiter();
    assert.equal(c.consignes.length, 2);
    assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket }) => ticket), [30]);
    assert.equal(c.dits().length, 1);
  });

  test("retirer le ticket du rail : son label `fire` s'en va, et il quitte le rail", async (t) => {
    const c = atelier(t, [REPONSES.retirer]);
    c.arriver();
    c.poser("manager");
    await c.triage.traiter();

    assert.deepEqual(c.gh.delabellisations, [[30, "fire"]]);
    assert.equal(ticketDuRail(c.journal.base, 30), null);
    assert.equal(c.journal.duTicket(30).findLast((e) => e.type === "ticket.left")?.payload.reason, "unfired");
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    unSeulCommentaire(c, REPONSES.retirer.phrase);
  });

  test("une carte que le ticket avait déjà dans TODO en sort, quand le triage tranche la suivante", async (t) => {
    const c = atelier(t, [REPONSES.retirer]);
    c.arriver();
    c.noter(30, { type: "todo.entered", payload: { kind: "gesture", statement: "Retirer `fire`.", capture: null } }, "manager");
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
    c.poser("pass");
    await c.triage.traiter();
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });
});

describe("le triage ne merge jamais", () => {
  test("un agent qui demande le merge d'une livraison rouge n'est pas suivi : rien n'est mergé, la carte entre dans TODO", async (t) => {
    const c = atelier(t, [{ action: "merger", phrase: "Merged the PR of #30.", motif: "Elle me semble bonne." }]);
    c.livrer();
    c.gh.ci.checks = [{ name: "tests", outcome: "red", conclusion: "failure", url: null }];
    c.poser();
    await c.triage.traiter();

    assert.deepEqual(c.gh.merges, []);
    assert.deepEqual(c.dits(), []);
    assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket }) => ticket), [30]);
    assert.match(String(c.journal.duTicket(30).findLast((e) => e.type === "todo.triaged")?.payload.reason), /unreadable answer: action inconnue : "merger"/);
  });

  test("aucun chemin du triage ne mène au merge : son code n'appelle jamais `merger`", () => {
    const dossier = join(import.meta.dirname, "../src/triage");
    for (const fichier of readdirSync(dossier).filter((nom) => nom.endsWith(".ts"))) {
      assert.doesNotMatch(readFileSync(join(dossier, fichier), "utf8"), /\bmerger\s*\(|\.merger\b|mergerLaLivraison/, fichier);
    }
  });
});

describe("l'agent ne tranche pas : la carte entre dans TODO comme avant", () => {
  test("il répond `todo` : la carte entre telle qu'elle a été posée, au nom de celui qui l'a posée", async (t) => {
    const c = atelier(t, [REPONSES.todo]);
    c.arriver();
    entrerDansTodo(c.journal, PROJET, 30, { type: "design", enonce: "Valider l'écran d'export.", capture: "docs/captures/export.png" }, "manager");
    await c.triage.traiter();

    assert.deepEqual(
      cartesEnTodo(c.journal.base).map(({ ticket, type, enonce, capture }) => ({ ticket, type, enonce, capture })),
      [{ ticket: 30, type: "design", enonce: "Valider l'écran d'export.", capture: "docs/captures/export.png" }],
    );
    assert.equal(c.journal.duTicket(30).findLast((e) => e.type === "todo.entered")?.author, "manager");
    assert.deepEqual(c.dits(), []);
  });

  test("une réponse illisible, ou une action qui ne peut pas se faire, laisse la carte entrer dans TODO", async (t) => {
    const c = atelier(t, ["pas du JSON", { ...REPONSES.dependance, dependance: 99 }, { ...REPONSES.relancer, phrase: "Sent it back. Then waited." }]);
    c.arriver({ waitsFor: [29], zone: [], problems: [] });
    c.gh.repondre(30, "<!-- brigade:fiche -->\n- attend : #29");
    for (let essai = 0; essai < 3; essai++) {
      c.poser();
      await c.triage.traiter();
      assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket }) => ticket), [30], `essai ${essai + 1}`);
    }
    assert.deepEqual(c.dits(), []);
    assert.deepEqual(
      c.journal.duTicket(30).filter((e) => e.type === "todo.triaged").map((e) => e.payload.action),
      ["through", "through", "through"],
    );
  });

  test("l'agent qui ne répond pas — quota, panne — laisse la carte entrer dans TODO", async (t) => {
    const c = atelier(t, []);
    c.poser();
    await c.triage.traiter();
    assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket }) => ticket), [30]);
  });
});

describe("ce que l'agent lit et ce qu'il répond", () => {
  test("la définition que le runtime donne à l'agent est celle d'`agents/triage.md`", () => {
    assert.equal(readFileSync(DEFINITION, "utf8"), readFileSync(join(import.meta.dirname, "../../agents/triage.md"), "utf8"));
  });

  test("la réponse : une des cinq actions, ou `todo` — rien d'autre ne se lit", () => {
    assert.deepEqual(lireTriage(JSON.stringify(REPONSES.todo)), { valeur: { action: "through", motif: "Un choix de produit." } });
    assert.deepEqual(lireTriage(JSON.stringify(REPONSES.retirer)), { valeur: { action: "remove", phrase: REPONSES.retirer.phrase, motif: "Doublon." } });
    for (const illisible of [null, "", "rien", JSON.stringify({ action: "merger" }), JSON.stringify({ action: "retirer" }), JSON.stringify({ ...REPONSES.relancer, diagnostic: null }), JSON.stringify({ ...REPONSES.dependance, dependance: "x" })]) {
      assert.ok("illisible" in lireTriage(illisible), String(illisible));
    }
    assert.deepEqual(lireTriage(JSON.stringify({ ...REPONSES.dependance, dependance: "#29" })), { valeur: { action: "dependency", phrase: REPONSES.dependance.phrase, dependance: 29, motif: "Livrée." } });
  });

  test("une phrase est une seule phrase, sur une ligne", () => {
    assert.ok(unePhrase("Removed the dependency on #1160, which was served by the split of #1159."));
    assert.ok(unePhrase("Sent #12 back: `foo.ts:12` fails."));
    assert.ok(!unePhrase("Sent it back. Then waited."));
    assert.ok(!unePhrase("Sent it back\nto the cook."));
  });

  test("la fiche sans une dépendance : le reste tel quel, « rien » quand plus personne n'est attendu", () => {
    assert.equal(sansAttente(FICHE, 29), "<!-- brigade:fiche -->\n- attend : #27\n- zone : src");
    assert.equal(sansAttente("<!-- brigade:fiche -->\n- **attend :** #29\n- zone : src", 29), "<!-- brigade:fiche -->\n- **attend :** rien\n- zone : src");
    assert.equal(sansAttente(FICHE, 31), null);
    assert.equal(sansAttente("<!-- brigade:fiche -->\n```\n- attend : #29\n```", 29), null);
  });
});

describe("sur une cuisine complète", { concurrency: 4 }, () => {
  test("manager allumé : la carte attend l'agent de triage hors de TODO, puis y entre quand il la laisse passer", async (t) => {
    const c = cuisine(t, { manager: { triage: "triage-au-feu" }, issues: [issue(30, CALIBRE)] });
    chef(c.repertoire, "manager.enabled");
    await jusqua(() => managerAllume(c.journal.base));
    // Le manager allumé retient : la carte attend son triage.
    entrerDansTodo(c.journal, PROJET, 30, CARTE, "pass");
    assert.deepEqual(cartesRetenues(c.journal.base).map(({ ticket }) => ticket), [30]);
    await jusqua(() => c.lancements().some((lance) => lance.env.FAUX_CLAUDE === "triage-au-feu"));
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    c.conclure();
    await jusqua(() => cartesEnTodo(c.journal.base).length === 1);
    assert.equal(cartesEnTodo(c.journal.base)[0]?.enonce, CARTE.enonce);
  });

  test("manager éteint : la carte entre dans TODO sans triage, comme avant", async (t) => {
    const c = cuisine(t, { manager: { triage: "triage-au-feu" }, issues: [issue(30, CALIBRE)] });
    entrerDansTodo(c.journal, PROJET, 30, CARTE, "pass");
    assert.deepEqual(cartesEnTodo(c.journal.base).map(({ ticket }) => ticket), [30]);
    assert.ok(!c.lancements().some((lance) => lance.env.FAUX_CLAUDE === "triage-au-feu"));
  });
});
