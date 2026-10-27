// La file de ce qui attend le chef : ce que `status` en dit, et ce qui en
// retire chaque entrée — tout vient du journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { direAttente, direAttenteEn, FIN_DU_SETUP_MAX, type Attente } from "../src/attend.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { retenue } from "../src/rail.ts";
import { JOUR_HORLOGE, jourDecale, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;

// Ce que dit le bloc quand la file est vide : il reste là, et le dit.
const RIEN = ["awaiting   nothing awaits the chef"];

// Le bloc `awaiting` d'une sortie, sans sa ligne de fin. Son bord tient toujours :
// une seule ligne commence par `awaiting`, une seule vaut `end awaiting`, et une
// ligne vide le sépare du rail.
function blocAttend(lignes: string[]): string[] {
  const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
  const fin = lignes.indexOf("end awaiting");
  assert.equal(lignes.filter((ligne) => ligne.startsWith("awaiting")).length, 1);
  assert.equal(lignes.filter((ligne) => ligne === "end awaiting").length, 1);
  assert.ok(debut < fin);
  assert.deepEqual(lignes.slice(fin + 1, fin + 2), [""]);
  assert.match(lignes[fin + 2] ?? "", /^rail /);
  return lignes.slice(debut, fin);
}

// Une cuisine dont le test tient l'horloge : chaque fait s'écrit à l'heure dite.
function cuisine(t: TestContext) {
  let instant = `${JOUR_HORLOGE}T10:00:00.000Z`;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, waitsFor: number[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  // Le ticket jusqu'à la pass : pris, cuisiné, livré avec sa PR.
  const livrer = (ticket: number) => {
    arriver(ticket);
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Écrits sous leur nom d'avant le regroupement des motifs : la file se lit
  // aussi d'un journal d'alors. Ce que la pass écrit aujourd'hui est éprouvé
  // dans `pass.test.ts`.
  const retenir = (ticket: number, reason: string) => noter({ type: "pass.held", payload: { reason } } as never, ticket, "pass");
  const remonter = (ticket: number, reason: "returns-exhausted" | "no-gates" | "manager-escalated" | "manager-split" | "secrets-unavailable", motif = `pass:${reason}`) => {
    noter({ type: "pass.escalated", payload: { reason } } as never, ticket, "pass");
    noter({ type: "ticket.86", payload: { reason: motif, until: null } }, ticket);
  };
  return {
    journal,
    noter,
    arriver,
    livrer,
    retenir,
    remonter,
    a: (heure: string) => {
      instant = heure;
    },
    // Le bloc `awaiting` de l'état lu à cette heure : sa ligne de tête, puis ses entrées.
    // Il est pris par son bord seul — de la ligne `awaiting` à la ligne `end awaiting`,
    // qui n'est pas rendue —, sans rien lire de ce qu'il porte.
    bloc: (maintenant: string) => blocAttend(decrireEtat(lireEtat(journal, new Date(maintenant)), new Date(maintenant))),
  };
}

test("une livraison arrêtée parce que le grant s'était éteint le dit, avec l'instant — pas « faute de grant »", (t) => {
  const { a, livrer, noter, bloc } = cuisine(t);
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  livrer(17);
  noter({ type: "pass.held", payload: { reason: "no-grant", expired: `${JOUR_HORLOGE}T08:30:00.000Z` } }, 17, "pass");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 1 h 00",
    `  #17  for 1 h 00  green delivery, not merged: the \`merge\` grant lapsed on its own on ${JOUR_HORLOGE}T08:30:00.000Z — merge by hand: ${pr(17)} — or enable the grant, for the next ones: \`brigade <projet> grant enable merge\`  Ticket 17`,
    "  without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open",
  ]);
});

test("`status` dit sans qu'on le demande qu'un grant est actif et jusqu'à quand ; à moins d'une heure ou au dernier usage, il le marque ; éteint seul, il le dit ; absent ou révoqué, il se tait", (t) => {
  const { a, noter, journal } = cuisine(t);
  const grant = (heure: string) => {
    const maintenant = new Date(`${JOUR_HORLOGE}T${heure}.000Z`);
    return decrireEtat(lireEtat(journal, maintenant), maintenant).filter((ligne) => ligne.startsWith("grant"));
  };
  const chef = (fait: Fait) => noter(fait, null, "chef");
  a(`${JOUR_HORLOGE}T10:00:00.000Z`);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait);
  assert.deepEqual(grant("10:00:00"), []);

  chef({ type: "grant.activated", payload: { action: "merge" } });
  assert.deepEqual(grant("12:00:00"), ["grant      merge ACTIVE, no deadline, since 2 h 00 ago — a green pass is merged without you"]);
  chef({ type: "grant.revoked", payload: { action: "merge" } });
  assert.deepEqual(grant("12:00:00"), []);

  chef({ type: "grant.activated", payload: { action: "merge", until: `${JOUR_HORLOGE}T14:00:00.000Z`, uses: 5 } });
  assert.deepEqual(grant("11:00:00"), [`grant      merge ACTIVE 3 h 00 left (until 8 Oct 14:00 UTC) · 5 uses left — a green pass is merged without you`]);
  assert.deepEqual(grant("13:20:00"), [`grant      merge ACTIVE, EXPIRING SOON: 40 min left (until 8 Oct 14:00 UTC) · 5 uses left — a green pass is merged without you`]);
  // L'heure passée, il est éteint pour qui lit — que le runtime l'ait écrit ou non.
  const eteint = ["grant      merge LAPSED 30 min ago — its deadline has passed: the pass stops at the open PR, nothing is merged without you any more"];
  assert.deepEqual(grant("14:30:00"), eteint);
  noter({ type: "grant.expired", payload: { action: "merge", cause: "until", since: `${JOUR_HORLOGE}T14:00:00.000Z` } }, null, "pass");
  assert.deepEqual(grant("14:30:00"), eteint);

  chef({ type: "grant.activated", payload: { action: "merge", uses: 1 } });
  assert.deepEqual(grant("15:00:00"), ["grant      merge ACTIVE, EXPIRING SOON: 1 use left — a green pass is merged without you"]);
});

test("rien n'attend le chef : le bloc le dit, même avec un rail qui travaille", (t) => {
  const { arriver, livrer, noter, bloc } = cuisine(t);
  arriver(14);
  arriver(16, [14]); // Attend un ticket qui sera servi : il partira seul.
  livrer(15); // En jugement : la pass n'a rien demandé.
  noter({ type: "ticket.86", payload: { reason: "quota", until: `${JOUR_HORLOGE}T15:00:00.000Z` } }, 14); // Reviendra seul.

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), RIEN);
});

test("le chef lit en une commande ce qui l'attend, depuis quand, et le geste attendu — le plus ancien d'abord", (t) => {
  const { a, arriver, livrer, retenir, remonter, noter, bloc } = cuisine(t);
  a(`${jourDecale(-3)}T10:00:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T08:00:00.000Z`);
  livrer(18);
  remonter(18, "secrets-unavailable");
  arriver(21);
  arriver(19, [21]);
  a(`${JOUR_HORLOGE}T09:50:00.000Z`);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 21, "github");
  // Juste avant l'état : la plus récente, donc la dernière.
  a(`${JOUR_HORLOGE}T09:58:00.000Z`);
  livrer(20);
  retenir(20, "judge-modified");
  livrer(22);
  retenir(22, "declaration-modified: .claude/brigade/reseau");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "awaiting   4 decisions await the chef — the oldest for 3 d",
    `  #17  for 3 d  green delivery, not merged for lack of a \`merge\` grant — merge by hand: ${pr(17)} — or enable the grant, for the next ones: \`brigade <projet> grant enable merge\`  Ticket 17`,
    `  #18  for 2 h 00  escalated by the pass, which could not judge it (unjudged: secrets-unavailable) — to lift: what its issue says, then remove and set \`fire\` again; or merge ${pr(18)} by hand, or remove \`fire\` — \`brigade <projet> pass 18\`  Ticket 18`,
    `  #20  for 2 min  green delivery that touches its judges — review and merge by hand: ${pr(20)}  Ticket 20`,
    `  #22  for 2 min  green delivery that touches what the project opens up (.claude/brigade/reseau) — review and merge by hand: ${pr(22)}  Ticket 22`,
    // Le chiffre sur lequel accorder le grant : seule #17 est arrêtée faute de grant.
    "  without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open",
  ]);
});

test("une seule décision se dit au singulier, et le bloc se lit en tête, avant le rail", (t) => {
  const { livrer, retenir, journal } = cuisine(t);
  livrer(17);
  retenir(17, "merge-refused: Required status check is expected");

  const maintenant = new Date(`${JOUR_HORLOGE}T10:04:00.000Z`);
  const lignes = decrireEtat(lireEtat(journal, maintenant), maintenant);
  const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
  assert.deepEqual(lignes.slice(debut, debut + 4), [
    "awaiting   1 decision awaits the chef — for 4 min",
    `  #17  for 4 min  green delivery, merge refused by GitHub (Required status check is expected) — merge by hand, once what it refuses is lifted: ${pr(17)}  Ticket 17`,
    "end awaiting",
    "",
  ]);
  assert.ok(debut < lignes.findIndex((ligne) => ligne.startsWith("rail")));
});

test("une remontée technique n'attend pas le chef — du manager sans carte ou de la pass, avec ou sans PR — : sa ligne du rail dit que la cuisine la reprend ; un ticket redécoupé n'attend personne", (t) => {
  const { livrer, remonter, noter, arriver, bloc, journal } = cuisine(t);
  livrer(17);
  remonter(17, "manager-escalated", "manager:escalated");
  // Sans PR : un ticket remonté avant d'avoir livré un diff.
  arriver(18);
  noter({ type: "cook.launched", payload: { run: "18-aa", limits: LIMITES, stream: "runs/18-aa.jsonl", branch: "cook/18-aa", worktree: "worktrees/18-aa" } }, 18);
  noter({ type: "cook.exited", payload: { run: "18-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 18);
  remonter(18, "returns-exhausted");
  // Redécoupé : ses sous-tickets portent le travail.
  livrer(19);
  remonter(19, "manager-split", "manager:split");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), RIEN);
  // Sur le rail, chacune dit ce que fait la cuisine — jamais un geste du chef.
  const maintenant = new Date(`${JOUR_HORLOGE}T10:00:00.000Z`);
  const lignes = decrireEtat(lireEtat(journal, maintenant), maintenant);
  assert.match(lignes.find((ligne) => ligne.startsWith("  #17  ")) ?? "", /the kitchen takes it up \(manager-escalated\), not the chef/);
  assert.match(lignes.find((ligne) => ligne.startsWith("  #18  ")) ?? "", /the kitchen takes it up \(returns-exhausted\), not the chef/);
});

// Ce que `faits` dit, pour un programme, de chaque décision qui attend le chef : sa sorte, son
// motif et ce qui le précise, la PR de la livraison — de quoi dire l'attendu dans ses mots, et
// poser ses gestes, sans relire la ligne du bloc.
test("`faits` donne la décision attendue de chaque ticket : sa sorte, son motif, ce qui le précise, sa PR", (t) => {
  const { livrer, retenir, remonter, noter, arriver, journal } = cuisine(t);
  livrer(17);
  retenir(17, "no-grant");
  livrer(18);
  remonter(18, "secrets-unavailable");
  arriver(19);
  noter({ type: "ticket.86", payload: { reason: "refused", until: null } }, 19);
  arriver(21);
  arriver(20, [21]);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 21, "github");

  const maintenant = new Date(`${JOUR_HORLOGE}T10:00:00.000Z`);
  const decisions = Object.fromEntries(faits(lireEtat(journal, maintenant), maintenant).attend.map(({ ticket, decision }) => [ticket, decision]));
  assert.deepEqual(decisions, {
    17: { quoi: "merge", motif: "no-grant", cause: null, pr: pr(17) },
    18: { quoi: "remontee", motif: "unjudged", cause: "secrets-unavailable", pr: pr(18) },
  });
  // Mis de côté par sa station, ou attendant un ticket fermé sans service : rien n'attend le chef (#1834).
});

test("une livraison verte quitte la file dès que la décision est prise : mergée à la main sur GitHub, ticket sorti du rail, ou cook reparti", (t) => {
  const { livrer, retenir, noter, bloc } = cuisine(t);
  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]).filter((tete) => tete?.startsWith("#"));
  for (const ticket of [17, 18, 19]) {
    livrer(ticket);
    retenir(ticket, "no-grant");
  }
  assert.deepEqual(attendus(), ["#17", "#18", "#19"]);

  // Le chef merge sur GitHub : la pass le constate.
  noter({ type: "merge.done", payload: { pr: pr(17), sha: "sha-17", by: "outside", reconciled: false, unverified: true } }, 17, "pass");
  assert.deepEqual(attendus(), ["#18", "#19"]);
  // Et le bilan des arrêts faute de grant le compte : il a mergé ce que la pass aurait mergé.
  assert.equal(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).at(-1), "  without a grant, 3 green deliveries stopped: 1 merged by hand, 0 closed without merge — no disagreement —, 2 still open");

  // Le chef ferme l'issue.
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 18, "github");
  assert.deepEqual(attendus(), ["#19"]);

  // Un cook repart sur le ticket, sur une livraison neuve.
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 19);
  noter({ type: "cook.launched", payload: { run: "19-bb", limits: LIMITES, stream: "runs/19-bb.jsonl", branch: "cook/19-bb", worktree: "worktrees/19-bb" } }, 19);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), RIEN);
});

test("une PR fermée sans merge ne reste pas « à merger » : la ligne dit ce qui s'est passé et le geste qui reste, puis sort avec lui", (t) => {
  const { a, livrer, retenir, remonter, noter, bloc } = cuisine(t);
  const fermer = (ticket: number) => noter({ type: "pass.pr-closed", payload: { pr: pr(ticket) } }, ticket, "pass");
  for (const ticket of [17, 18, 19, 20]) livrer(ticket);
  retenir(17, "no-grant");
  remonter(18, "returns-exhausted");
  // Redécoupé : fermer sa PR est la suite attendue, et n'attend personne.
  remonter(19, "manager-split", "manager:split");
  retenir(20, "no-grant");
  a(`${JOUR_HORLOGE}T10:03:00.000Z`);
  for (const ticket of [17, 18, 19]) fermer(ticket);

  // Constatée, la fermeture date la ligne : c'est d'elle que l'attente se compte.
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), [
    "awaiting   3 decisions await the chef — the oldest for 5 min",
    `  #20  for 5 min  green delivery, not merged for lack of a \`merge\` grant — merge by hand: ${pr(20)} — or enable the grant, for the next ones: \`brigade <projet> grant enable merge\`  Ticket 20`,
    `  #17  for 2 min  PR closed without merge: ${pr(17)} — to decide: remove \`fire\`, or close the issue — \`brigade <projet> pass 17\`  Ticket 17`,
    `  #18  for 2 min  PR closed without merge: ${pr(18)} — to decide: remove \`fire\`, or close the issue — \`brigade <projet> pass 18\`  Ticket 18`,
    // #17 était arrêtée faute de grant, et sa PR est fermée : le désaccord se compte.
    "  without a grant, 2 green deliveries stopped: 0 merged by hand, 1 closed without merge — 1 disagreement —, 1 still open",
  ]);

  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]).filter((tete) => tete?.startsWith("#"));
  // Le chef retire `fire` ; ou rend le ticket au rail, pour un cook neuf.
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 17, "github");
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 18);
  assert.deepEqual(attendus(), ["#20"]);
});

test("un ticket remonté dont la pass a ouvert la PR elle-même : le geste nomme la PR", (t) => {
  const { arriver, remonter, noter, bloc } = cuisine(t);
  arriver(17);
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, 17);
  noter({ type: "cook.reported", payload: { run: "17-aa", ending: "done", reason: null, summary: null, branch: "cook/17-aa", pr: null } }, 17, `station:${STATION}`);
  noter({ type: "pass.pr-opened", payload: { pr: pr(17), number: 17, reconciled: false } }, 17, "pass");
  remonter(17, "secrets-unavailable");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 0 s",
    `  #17  for 0 s  escalated by the pass, which could not judge it (unjudged: secrets-unavailable) — to lift: what its issue says, then remove and set \`fire\` again; or merge ${pr(17)} by hand, or remove \`fire\` — \`brigade <projet> pass 17\`  Ticket 17`,
  ]);
});

test("un ticket remonté, dans un journal d'avant #1820, pour le même test rouge deux fois n'attend pas le chef : la cuisine le reprend, et sa ligne du rail nomme le test", (t) => {
  const { livrer, noter, bloc, journal } = cuisine(t);
  livrer(17);
  noter({ type: "pass.escalated", payload: { reason: "unjudged", cause: "unstable-test: runtime/test/lectures-sous-condition.test.ts" } }, 17, "pass");
  noter({ type: "ticket.86", payload: { reason: "pass:unjudged", until: null } }, 17);

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), RIEN);
  const maintenant = new Date(`${JOUR_HORLOGE}T10:00:00.000Z`);
  const ligne = decrireEtat(lireEtat(journal, maintenant), maintenant).find((ligne) => ligne.startsWith("  #17  "));
  assert.match(ligne ?? "", /the kitchen takes it up \(unstable-test: runtime\/test\/lectures-sous-condition\.test\.ts\), not the chef/);
});

test("un retrait de fire que la cuisine n'a pas compté se dit sur la ligne de la remontée, avec le geste", (t) => {
  const { arriver, remonter, noter, bloc } = cuisine(t);
  arriver(17);
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, 17);
  noter({ type: "cook.reported", payload: { run: "17-aa", ending: "done", reason: null, summary: null, branch: "cook/17-aa", pr: null } }, 17, `station:${STATION}`);
  noter({ type: "pass.pr-opened", payload: { pr: pr(17), number: 17, reconciled: false } }, 17, "pass");
  remonter(17, "secrets-unavailable");
  noter({ type: "ticket.fire-unseen", payload: { removedAt: "2026-10-21T09:00:00Z" } }, 17, "github");

  const ligne = bloc(`${JOUR_HORLOGE}T10:00:00.000Z`)[1] ?? "";
  assert.match(ligne, /the removal of `fire` on 2026-10-21T09:00:00Z came before the hold and was not seen: remove it and set it again now/);
});

test("une remontée quitte la file quand le chef merge, sort le ticket du rail, ou le rend au rail", (t) => {
  const { livrer, remonter, noter, bloc } = cuisine(t);
  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]).filter((tete) => tete?.startsWith("#"));
  for (const ticket of [17, 18, 19]) {
    livrer(ticket);
    remonter(ticket, "secrets-unavailable");
  }
  assert.deepEqual(attendus(), ["#17", "#18", "#19"]);

  noter({ type: "merge.done", payload: { pr: pr(17), sha: "sha-17", by: "outside", reconciled: false, unverified: true } }, 17, "pass");
  assert.deepEqual(attendus(), ["#18", "#19"]);

  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 18, "github");
  assert.deepEqual(attendus(), ["#19"]);

  // Rendu au rail : il n'est plus 86, un cook le reprendra.
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 19);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), RIEN);
});

test("un ticket dont la dépendance quitte le rail n'entre jamais dans la file : il l'attend sur le rail, qu'elle revienne ou sorte de sa fiche (#1834)", (t) => {
  const { a, arriver, noter, bloc } = cuisine(t);
  arriver(14);
  arriver(15);
  arriver(16, [14]);
  arriver(17, [15]);
  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 14, "github");
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 15, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), RIEN);

  // Le chef relance #14, et retire #15 de la fiche de #17.
  a(`${JOUR_HORLOGE}T10:40:00.000Z`);
  arriver(14);
  noter({ type: "ticket.changed", payload: { title: "Ticket 17", priority: null, card: { waitsFor: [], zone: [], problems: [] } } }, 17, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), RIEN);
});

const prevu = (title: string) => ({ title, context: "", criteria: ["Un critère."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });

test("un ticket redécoupé, sorti du rail, livre ceux qui l'attendent quand tous ses morceaux sont servis — et d'ici là ils attendent sans carte", (t) => {
  const { journal, a, arriver, noter, bloc } = cuisine(t);
  arriver(1159);
  arriver(1161, [1159]);
  noter({ type: "manager.split", payload: { run: "d", fingerprint: "e", reason: "Deux livrables.", order: "Dans l'ordre.", tickets: [prevu("A"), prevu("B")] } }, 1159, "manager");
  noter({ type: "manager.split-created", payload: { epic: 1159, index: 1, reconciled: false } }, 1167, "manager");
  noter({ type: "manager.split-created", payload: { epic: 1159, index: 2, reconciled: false } }, 1168, "manager");
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 1159, "github");
  noter({ type: "ticket.served", payload: {} }, 1167);
  a(`${JOUR_HORLOGE}T11:00:00.000Z`);

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), RIEN);
  const attend = () => lireRail(journal.base).find((ticket) => ticket.ticket === 1161);
  assert.deepEqual(attend()?.awaits, [{ ticket: 1159, left: null }]);

  noter({ type: "ticket.served", payload: {} }, 1168);
  assert.deepEqual(attend()?.awaits, []);
  assert.equal(retenue(attend() as never), null);
});

test("la file ne garde rien : relue d'un journal rouvert en lecture seule, elle dit la même chose", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecrit = ouvrirJournal(repertoire, { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  const noter = (fait: Fait, ticket: number, author = "runtime") => ecrit.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "ticket.arrived", payload: { title: "Ticket 17", priority: null, createdAt: "2026-10-01T00:00:17Z", url: "https://exemple.test/17" } }, 17, "github");
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, 17);
  noter({ type: "pass.started", payload: { run: "17-aa", pr: pr(17), number: 17, sha: "sha-17" } }, 17, "pass");
  noter({ type: "pass.held", payload: { reason: "no-grant" } }, 17, "pass");
  const avant = ecrit.dernierSeq();
  ecrit.fermer();

  const relu = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => relu.fermer());
  const maintenant = new Date(`${JOUR_HORLOGE}T10:07:00.000Z`);
  const lignes = decrireEtat(lireEtat(relu, maintenant), maintenant);

  assert.ok(lignes.includes("awaiting   1 decision awaits the chef — for 7 min"));
  assert.equal(relu.dernierSeq(), avant);
});

test("un ticket que sa station a déclaré 86 sans heure de retour n'attend pas le chef : il reste sur le rail, et repart seul une fois corrigé (#1834)", (t) => {
  const { a, arriver, noter, bloc } = cuisine(t);
  const quatreVingtSix = (ticket: number, reason: string) => noter({ type: "ticket.86", payload: { reason, until: null } }, ticket, `station:${STATION}`);
  for (const ticket of [14, 15, 16]) arriver(ticket);
  a(`${JOUR_HORLOGE}T10:10:00.000Z`);
  quatreVingtSix(14, "no-calibration");
  a(`${JOUR_HORLOGE}T10:20:00.000Z`);
  quatreVingtSix(15, "unreadable-card");
  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  quatreVingtSix(16, "refused");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), RIEN);

  // Calibré et fiche corrigée sur GitHub : la station les rend au rail. Le refusé perd son `fire`.
  noter({ type: "ticket.released", payload: { reason: "calibrated", station: null } }, 14);
  noter({ type: "ticket.released", payload: { reason: "card-readable", station: null } }, 15);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 16, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), RIEN);
});

test("ce que le manager attend du chef est dans la file, avec le geste attendu, trié avec le reste par ancienneté", (t) => {
  const { a, livrer, retenir, noter, bloc } = cuisine(t);
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  // Ni une question au chef, ni une décision à prendre : ceux-là n'attendent personne.
  noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "untrusted-author", fired: false } }, 2, "manager");
  a(`${JOUR_HORLOGE}T09:10:00.000Z`);
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  a(`${JOUR_HORLOGE}T09:20:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T09:30:00.000Z`);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  a(`${JOUR_HORLOGE}T09:40:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "decision", fired: false } }, 33, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 34, "manager");
  noter({ type: "manager.split-failed", payload: { run: "decoupe-35", fingerprint: "e35", reason: "aucun objet JSON" } }, 35, "manager");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "awaiting   7 decisions await the chef — the oldest for 1 h 00",
    "  #30  for 1 h 00  set aside by the manager, it carries `question` — to decide: answer it then remove the label, the manager judges it; or close the issue",
    "  #31  for 50 min  manager's judgment unreadable — to redo: edit the issue, the manager judges it again; or set `fire`, `model:` and `effort:` by hand; or close the issue",
    `  #17  for 40 min  green delivery, not merged for lack of a \`merge\` grant — merge by hand: ${pr(17)} — or enable the grant, for the next ones: \`brigade <projet> grant enable merge\`  Ticket 17`,
    "  #32  for 30 min  manager's question before splitting the epic — to answer: on the issue, the manager reads it again and splits it; or close the issue",
    "  #33  for 20 min  set aside by the manager, it carries `decision` — to decide: decide then remove the label, the manager judges it; or close the issue",
    "  #34  for 20 min  held back, it carries `blocked-on-human` — to lift: remove the label, the manager judges it; or close the issue",
    "  #35  for 20 min  manager's split unreadable — to redo: edit the epic, the manager splits it again; or close the issue",
    "  without a grant, 1 green delivery stopped: 0 merged by hand, 0 closed without merge — no disagreement —, 1 still open",
  ]);
});

const JUGEE = { run: "juge-a", fingerprint: "e2", verdict: "refused", kind: "incomplete", reason: "Sans critère.", missing: "Un critère.", model: null, effort: null, calibration: null } as const;

test("rejugée ou redécoupée, l'issue que le manager attendait sort de la file", (t) => {
  const { noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.split("  ")[1]);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  assert.deepEqual(file(), ["#30", "#31", "#32"]);

  // Le label retiré, l'issue modifiée : le manager les rejuge.
  noter({ type: "manager.judged", payload: JUGEE }, 30, "manager");
  noter({ type: "manager.judged", payload: JUGEE }, 31, "manager");
  assert.deepEqual(file(), ["#32"]);

  // Le chef a répondu : l'épique est découpée.
  noter({ type: "manager.split", payload: { run: "decoupe-32b", fingerprint: "e32b", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [] } }, 32, "manager");
  assert.deepEqual(file(), []);
});

test("fermée, l'issue que le manager attendait sort de la file ; rouverte, elle y revient avec son ancienneté", (t) => {
  const { a, noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T11:00:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  assert.equal(file().length, 4);

  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  for (const numero of [30, 31, 32]) noter({ type: "manager.closed", payload: {} }, numero, "manager");
  assert.deepEqual(file(), RIEN);

  noter({ type: "manager.reopened", payload: {} }, 31, "manager");
  assert.deepEqual(file(), [
    "awaiting   1 decision awaits the chef — for 1 h 00",
    "  #31  for 1 h 00  manager's judgment unreadable — to redo: edit the issue, the manager judges it again; or set `fire`, `model:` and `effort:` by hand; or close the issue",
  ]);
});

test("une issue écartée que le chef a lancée lui-même est sur le rail : c'est le rail qui dit ce qui la retient, et rien n'attend le chef", (t) => {
  const { arriver, noter, bloc } = cuisine(t);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: true } }, 14, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "decision", fired: true } }, 15, "manager");
  arriver(14);
  arriver(15);
  noter({ type: "ticket.86", payload: { reason: "no-calibration", until: null } }, 14, `station:${STATION}`);

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), RIEN);
});

test("une épique retenue par le chef après la question du manager n'attend qu'une fois, pour sa retenue", (t) => {
  const { noter, bloc } = cuisine(t);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 32, "manager");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 5 min",
    "  #32  for 5 min  held back, it carries `blocked-on-human` — to lift: remove the label, the manager judges it; or close the issue",
  ]);
});

test("une épique à question qui cesse d'être une épique à découper sort de la file : la décision suivante sur l'issue prime", (t) => {
  const { noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.split("  ")[1]);
  const epique = { ...JUGEE, kind: "epic" } as const;
  // Reconnue épique par le jugement, puis question ou découpage illisible : elle attend.
  for (const numero of [32, 33, 34, 35, 36]) noter({ type: "manager.judged", payload: epique }, numero, "manager");
  for (const numero of [32, 33, 34]) noter({ type: "manager.split-asked", payload: { run: `decoupe-${numero}`, fingerprint: "e1", question: "Quel périmètre ?" } }, numero, "manager");
  for (const numero of [35, 36]) noter({ type: "manager.split-failed", payload: { run: `decoupe-${numero}`, fingerprint: "e1", reason: "aucun objet JSON" } }, numero, "manager");
  assert.deepEqual(file(), ["#32", "#33", "#34", "#35", "#36"]);

  // Le chef la découpe à la main : la liste est dans son corps.
  noter({ type: "manager.set-aside", payload: { reason: "already-split", fired: false } }, 32, "manager");
  // Label `epic` retiré, issue réécrite : rejugée, ce n'est plus une épique.
  noter({ type: "manager.judged", payload: JUGEE }, 33, "manager");
  noter({ type: "manager.judged", payload: { ...JUGEE, verdict: "fire", kind: "ticket", missing: null, model: "sonnet", effort: "low", calibration: "Mécanique." } }, 35, "manager");
  // Rejugée épique sans que le découpage ait à être refait : la question tient.
  noter({ type: "manager.judged", payload: epique }, 34, "manager");
  assert.deepEqual(file(), ["#34", "#36"]);

  // Rejugée, et le jugement ne se lit pas : c'est lui qui attend désormais.
  noter({ type: "manager.failed", payload: { run: "juge-36", fingerprint: "e3", reason: "réponse sans verdict" } }, 36, "manager");
  assert.match(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).at(-1) ?? "", /#36 .* manager's judgment unreadable/);
});

test("la connexion Max absente attend le chef : l'en-tête de l'état et le bloc `awaiting` la disent, depuis quand, avec le geste — et elle en sort seule à la reprise", (t) => {
  const { a, noter, arriver, journal, bloc } = cuisine(t);
  const entete = (maintenant: string) => decrireEtat(lireEtat(journal, new Date(maintenant)), new Date(maintenant)).filter((ligne) => ligne.startsWith("connection"));
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  arriver(14);
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:01:00.000Z`), []);

  a(`${JOUR_HORLOGE}T10:05:00.000Z`);
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "not-logged-in", run: null } }, null, `station:${STATION}`);

  // Le geste, en anglais : l'en-tête et le bloc `awaiting` l'écrivent de même.
  const gesteEn = "`claude /login` under the service account — the kitchen starts again on its own within the minute, without “resume”";
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:25:00.000Z`), [
    `connection Max MISSING for 20 min on ${STATION} (not-logged-in) — no ticket is taken any more: ${gesteEn}`,
  ]);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:25:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 20 min",
    `  ${STATION}  for 20 min  Max connection missing (not-logged-in) — to restore: ${gesteEn}`,
  ]);

  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:31:00.000Z`), []);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:31:00.000Z`), RIEN);
});

test("une connexion Max expirée en cours de route se dit expirée, et se range avec les autres décisions par ancienneté", (t) => {
  const { a, noter, livrer, retenir, bloc } = cuisine(t);
  a(`${JOUR_HORLOGE}T08:00:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "17-aa" } }, 17, `station:${STATION}`);

  const lignes = bloc(`${JOUR_HORLOGE}T10:00:00.000Z`);
  assert.equal(lignes[0], "awaiting   2 decisions await the chef — the oldest for 2 h 00");
  assert.match(lignes[1] ?? "", /^  #17  for 2 h 00  /);
  assert.match(lignes[2] ?? "", new RegExp(`^  ${STATION}  for 1 h 00  Max connection expired \\(authentication_failed\\) — to restore`));
});

test("quand rien n'attend, le bloc reste là et le dit : deux lignes, sans le bilan des arrêts faute de grant", (t) => {
  const { a, livrer, retenir, noter, journal } = cuisine(t);
  const lire = (heure: string) => decrireEtat(lireEtat(journal, new Date(heure)), new Date(heure));
  // Un journal où rien n'a jamais attendu.
  const calme = lire(`${JOUR_HORLOGE}T10:00:00.000Z`);
  const debut = calme.indexOf("awaiting   nothing awaits the chef");
  assert.deepEqual(calme.slice(debut - 1, debut + 4), ["", "awaiting   nothing awaits the chef", "end awaiting", "", "rail       empty"]);

  // Une livraison arrêtée faute de grant, puis mergée à la main : la file se vide, le bilan reste à `run pass`.
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  noter({ type: "merge.done", payload: { pr: pr(17), sha: "sha-17", by: "outside", reconciled: false, unverified: true } }, 17, "pass");
  assert.deepEqual(blocAttend(lire(`${JOUR_HORLOGE}T10:00:00.000Z`)), RIEN);
});

// Une base rouge, ses gates telles que la pass les écrit, et son ticket de
// réparation : ce que la pass note quand le rouge tient après son rejeu.
function baseRouge(noter: ReturnType<typeof cuisine>["noter"]) {
  const gates = (...failures: string[]) => ({ outcome: "red" as const, code: 1, failures: failures.map((echec) => `FAIL  ${echec}`), tail: "" });
  const controler = (sha: string, ...failures: string[]) =>
    noter({ type: "base.checked", payload: { sha, outcome: failures.length === 0 ? "green" : "red", gates: failures.length === 0 ? { outcome: "green", code: 0, failures: [], tail: "" } : gates(...failures), tickets: [] } }, null, "pass");
  const ouvrirLaReparation = (ticket: number, sha: string, ...failures: string[]) => {
    noter({ type: "base.repair-opening", payload: { sha } }, null, "pass");
    noter({ type: "base.repair-opened", payload: { sha, failures, reconciled: false } }, ticket, "pass");
    noter({ type: "ticket.arrived", payload: { title: `Réparer la base \`v2\``, priority: 0, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}` } }, ticket, "github");
  };
  return { controler, ouvrirLaReparation };
}

const REPARER = "to repair: fix the base by hand, or restart #501: set `fire` on it again, its issue reopened if needed; the pass replays it as soon as it moves, and the kitchen starts again on its own once green; a red that is not down to the code is replayed: `brigade <projet> base replay`";

test("une base rouge n'attend pas le chef tant qu'elle se répare seule : ni pendant le rejeu, ni pendant que son ticket de réparation travaille", (t) => {
  const { a, noter, bloc } = cuisine(t);
  const { controler, ouvrirLaReparation } = baseRouge(noter);
  controler("base-1", "tests du projet en échec");
  noter({ type: "base.recheck-requested", payload: {} }, null, "pass");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:30:00.000Z`), RIEN);

  a(`${JOUR_HORLOGE}T10:05:00.000Z`);
  controler("base-1", "tests du projet en échec");
  ouvrirLaReparation(501, "base-1", "tests du projet en échec");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), RIEN);

  // Prise, cuisinée, à la pass, mergée : tant que la base n'est pas recontrôlée rouge, rien n'attend.
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, 501, `station:${STATION}`);
  noter({ type: "ticket.passing", payload: { station: STATION } }, 501, `station:${STATION}`);
  noter({ type: "merge.done", payload: { pr: pr(501), sha: "abc", by: "pass", reconciled: false } }, 501, "pass");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), RIEN);
});

test("une base rouge dont la réparation a échoué attend le chef : depuis son passage au rouge, ce qui y échoue, et le geste — puis elle sort de la file au retour au vert", (t) => {
  const { a, noter, arriver, journal, bloc } = cuisine(t);
  const { controler, ouvrirLaReparation } = baseRouge(noter);
  controler("base-1", "tests du projet en échec");
  noter({ type: "base.recheck-requested", payload: {} }, null, "pass");
  a(`${JOUR_HORLOGE}T10:05:00.000Z`);
  controler("base-1", "tests du projet en échec");
  ouvrirLaReparation(501, "base-1", "tests du projet en échec");
  arriver(18);

  // Le chef retire `fire` : la réparation quitte le rail sans être servie.
  a(`${JOUR_HORLOGE}T11:00:00.000Z`);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 501, "github");
  const ligne = `  base  for 3 h 00  BASE RED on base-1, failing: tests du projet en échec — its repair #501 left the rail without being served — ${REPARER}`;
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), ["awaiting   1 decision awaits the chef — for 3 h 00", ligne]);
  // Elle compte pour une décision, sans être à aucun ticket.
  const etat = lireEtat(journal, new Date(`${JOUR_HORLOGE}T13:00:00.000Z`));
  assert.deepEqual(etat.attend.map(({ ticket, quoi }) => [ticket, quoi]), [[null, "base"]]);

  // La base bouge, rouge encore, sur autre chose : la ligne dit ce qui y échoue à présent, et garde le passage au rouge.
  a(`${JOUR_HORLOGE}T12:00:00.000Z`);
  controler("base-2", "tests de l'app en échec", "contrôle de types de l'app en échec");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 3 h 00",
    `  base  for 3 h 00  BASE RED on base-2, failing: tests de l'app en échec; contrôle de types de l'app en échec — its repair #501 left the rail without being served — ${REPARER}`,
  ]);

  // Verte : la ligne a quitté la file, sans geste du chef.
  a(`${JOUR_HORLOGE}T12:30:00.000Z`);
  controler("base-3");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), RIEN);
  assert.equal(journal.tout().some((e) => e.author === "chef"), false);
});

test("une réparation remontée au chef se relance ; mergée sans remettre la base au vert, elle le dit — et l'échec d'une réparation ne vaut pas pour un rouge neuf", (t) => {
  const { a, noter, bloc } = cuisine(t);
  const { controler, ouvrirLaReparation } = baseRouge(noter);
  controler("base-1", "tests du projet en échec");
  controler("base-1", "tests du projet en échec");
  ouvrirLaReparation(501, "base-1", "tests du projet en échec");

  // 86 sans heure de retour : remontée.
  a(`${JOUR_HORLOGE}T11:00:00.000Z`);
  noter({ type: "ticket.86", payload: { reason: "refused", until: null } }, 501, `station:${STATION}`);
  const base = bloc(`${JOUR_HORLOGE}T12:00:00.000Z`).find((ligne) => ligne.startsWith("  base  "));
  assert.equal(
    base,
    "  base  for 2 h 00  BASE RED on base-1, failing: tests du projet en échec — its repair #501 was escalated without being served — to repair: fix the base by hand, or restart #501: remove and set `fire` again; the pass replays it as soon as it moves, and the kitchen starts again on its own once green; a red that is not down to the code is replayed: `brigade <projet> base replay`",
  );

  // Relancée par le chef — `fire` retiré puis reposé : elle travaille de nouveau, la base n'attend plus.
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 501, "github");
  noter({ type: "ticket.arrived", payload: { title: "Réparer la base `v2`", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/501" } }, 501, "github");
  assert.equal(bloc(`${JOUR_HORLOGE}T12:00:00.000Z`).some((ligne) => ligne.startsWith("  base  ")), false);

  // Mergée, puis la base recontrôlée reste rouge : elle n'a pas réparé.
  noter({ type: "merge.done", payload: { pr: pr(501), sha: "abc", by: "pass", reconciled: false } }, 501, "pass");
  controler("base-2", "tests du projet en échec");
  assert.match(bloc(`${JOUR_HORLOGE}T12:00:00.000Z`).find((ligne) => ligne.startsWith("  base  ")) ?? "", /— its repair #501 merged, did not bring it back to green — to repair: fix the base by hand; the pass/);

  // Verte, puis rouge de nouveau : un rouge neuf, que la pass rejoue et répare seule — rien n'attend.
  controler("base-3");
  a(`${JOUR_HORLOGE}T12:30:00.000Z`);
  controler("base-4", "tests du projet en échec");
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T13:00:00.000Z`), RIEN);
});

// Le setup du projet bloqué (#643), tel que la station l'écrit : deux échecs à
// l'identique, le second bloque. `tickets` : ceux qui attendent, 86 sur leur setup.
function setupBloque(noter: ReturnType<typeof cuisine>["noter"], { hosts, tickets }: { hosts: string[]; tickets: number[] }) {
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  for (const ticket of tickets) {
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` } }, ticket, "github");
    noter({ type: "ticket.86", payload: { reason: "setup-failed", until: `${JOUR_HORLOGE}T10:10:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "setup.failed", payload: { station: STATION, why: "code de sortie 1", hosts } }, ticket, `station:${STATION}`);
  }
  const [dernier] = tickets.slice(-1);
  noter({ type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts, base: "ba5e0001ffff" } }, dernier ?? null, `station:${STATION}`);
}

test("un projet bloqué sur son setup attend le chef, une seule fois quel que soit le nombre de tickets : l'hôte que la porte refuse, et le geste — `status` le dit en tête, et `faits` le compte", (t) => {
  const { noter, journal, bloc } = cuisine(t);
  setupBloque(noter, { hosts: ["cdn.sheetjs.com:443", "registry.npmjs.org:443"], tickets: [14, 15, 16] });
  const maintenant = `${JOUR_HORLOGE}T10:20:00.000Z`;

  assert.deepEqual(bloc(maintenant), [
    "awaiting   1 decision awaits the chef — for 20 min",
    "  setup  for 20 min  setup impossible: the door refuses `cdn.sheetjs.com`, `registry.npmjs.org` (`.claude/brigade/worktree-setup.sh`, code de sortie 1, twice identically) — to declare in the project's `.claude/brigade/reseau`, one line per host, then merge into the integration branch; setups start again on their own as soon as the integration branch moves; until then, none is launched, for any ticket",
  ]);
  const etat = lireEtat(journal, new Date(maintenant));
  assert.deepEqual(etat.attend.map(({ ticket, quoi }) => [ticket, quoi]), [[null, "setup"]]);

  // En tête de `status`, ce qui ne part plus ; dans ce que l'app lit, une cuisine retenue et une décision qui attend.
  const tete = decrireEtat(etat, new Date(maintenant)).filter((ligne) => ligne.startsWith("setup"));
  assert.deepEqual(tete, ["setup      BLOCKED for 20 min on ba5e000 — no setup is launched from here, for any ticket, as long as the integration branch does not move: the cause and the action are in the `awaiting` block"]);
  const forme = faits(etat, new Date(maintenant));
  assert.equal(forme.etat, "retenue");
  assert.equal(forme.compteurs.attend, 1);
  // Elle n'est à aucun ticket : la liste des tickets qui attendent n'en dit rien.
  assert.deepEqual(forme.attend, []);
});

test("sans hôte refusé, c'est le setup lui-même qui est à corriger : la ligne dit le motif, et l'issue où lire ce qu'il a dit", (t) => {
  const { noter, bloc } = cuisine(t);
  setupBloque(noter, { hosts: [], tickets: [14, 15] });
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), [
    "awaiting   1 decision awaits the chef — for 1 h 00",
    "  setup  for 1 h 00  setup impossible: `.claude/brigade/worktree-setup.sh` fails twice identically (code de sortie 1) — what it said is on #15 — to fix: the project's setup, then merge into the integration branch; setups start again on their own as soon as the integration branch moves; until then, none is launched, for any ticket",
  ]);
});

test("débloqué — la branche d'intégration a bougé —, le setup quitte la file, la tête de `status` et l'état de l'app, sans geste du chef ; rebloqué, il y revient", (t) => {
  const { a, noter, journal, bloc } = cuisine(t);
  setupBloque(noter, { hosts: ["cdn.sheetjs.com:443"], tickets: [14, 15] });
  assert.equal(bloc(`${JOUR_HORLOGE}T10:30:00.000Z`).filter((ligne) => ligne.startsWith("  setup  ")).length, 1);

  a(`${JOUR_HORLOGE}T10:40:00.000Z`);
  noter({ type: "setup.unblocked", payload: { station: STATION, base: "ba5e0002ffff" } }, null, `station:${STATION}`);
  const maintenant = `${JOUR_HORLOGE}T10:45:00.000Z`;
  assert.deepEqual(bloc(maintenant), RIEN);
  const etat = lireEtat(journal, new Date(maintenant));
  assert.equal(decrireEtat(etat, new Date(maintenant)).some((ligne) => ligne.startsWith("setup")), false);
  assert.equal(faits(etat, new Date(maintenant)).etat, "ouverte");
  assert.equal(faits(etat, new Date(maintenant)).compteurs.attend, 0);
  assert.equal(journal.tout().some((e) => e.author === "chef"), false);

  // Le même échec sur la nouvelle base rebloque : l'alerte revient, comptée du nouveau blocage.
  a(`${JOUR_HORLOGE}T10:50:00.000Z`);
  noter({ type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts: ["cdn.sheetjs.com:443"], base: "ba5e0002ffff" } }, 14, `station:${STATION}`);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`).slice(0, 1), ["awaiting   1 decision awaits the chef — for 10 min"]);
});

test("une station distante prépare son setup sur son poste : le projet bloqué attend le chef, mais sa cuisine n'est pas retenue", (t) => {
  const { noter, journal } = cuisine(t);
  setupBloque(noter, { hosts: [], tickets: [14, 15] });
  noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["opus"], maxCooks: 1, remote: true } });
  const maintenant = new Date(`${JOUR_HORLOGE}T10:30:00.000Z`);
  const etat = lireEtat(journal, maintenant);
  assert.equal(faits(etat, maintenant).etat, "ouverte");
  assert.deepEqual(etat.attend.map(({ quoi }) => quoi), ["setup"]);
});

test("la ligne d'un setup bloqué porte la fin de ce qu'il a imprimé, bornée, et rien d'autre quand il n'a rien dit", () => {
  const setup = (output: string): Attente => ({ ticket: null, title: null, since: "2026-10-08T10:00:00.000Z", quoi: "setup", setup: { why: "code de sortie 1", hosts: [], base: "base-0", ticket: 15, station: "box/claude", output } });
  const longue = `DEBUT-PERDU ${"x".repeat(FIN_DU_SETUP_MAX * 3)}\navant-derniere\nFIN-GARDEE`;
  for (const dire of [direAttente, direAttenteEn]) {
    const ligne = dire(setup(longue));
    assert.match(ligne, /code de sortie 1 : …x+ ⏎ avant-derniere ⏎ FIN-GARDEE\)/);
    assert.doesNotMatch(ligne, /DEBUT-PERDU/);
    const dite = /code de sortie 1 : (.*)\)/.exec(ligne)?.[1] ?? "";
    assert.equal(dite.length, FIN_DU_SETUP_MAX + 1);
    assert.match(dire(setup("")), /\(code de sortie 1\)/);
  }
});
