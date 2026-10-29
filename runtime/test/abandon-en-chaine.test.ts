// Un ticket que la cuisine abandonne ne laisse personne l'attendre (#1902) :
// ceux qui l'attendent, de proche en proche, sortent du rail avec lui, la même
// raison sur leur carte et un commentaire qui le nomme ; remettre `fire` sur
// lui est le seul chemin du retour, et ils le suivent d'eux-mêmes.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { abandonnerEnChaine, aSortirAvec } from "../src/abandon-en-chaine.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { fauxGitHub, issue } from "./aides/cuisine.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const RAISON = "sa cause (`wrong-base`) n'est pas au cook (the station opens the PR, not the cook)";

// Un rail : #17, et ceux qui l'attendent — #18 lui-même, #19 par #18 —, #20 qui
// n'attend personne, #21 qui attend #17 mais cuit.
function rail(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  const gh = fauxGitHub(...[17, 18, 19, 20, 21].map((numero) => issue(numero)));
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, waitsFor: number[] = []) =>
    noter(
      ticket,
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } } },
      "github",
    );
  const partir = (ticket: number) => noter(ticket, { type: "ticket.left", payload: { reason: "unfired" } }, "github");
  arriver(17);
  arriver(18, [17]);
  arriver(19, [18]);
  arriver(20);
  arriver(21, [17]);
  noter(21, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } });
  noter(17, { type: "ticket.86", payload: { reason: "pass:unjudged", until: null } });
  const abandonner = () => noter(17, { type: "pass.kitchen-took-over", payload: { cause: "wrong-base", move: "drop", reason: RAISON } }, "pass");
  const jouer = () => abandonnerEnChaine(journal, gh.github, "brigade");
  const faits = (type: string) => journal.tout().filter((fait) => fait.type === type).map((fait) => [fait.ticket, fait.payload]);
  return { journal, gh, arriver, partir, abandonner, jouer, faits };
}

test("abandonné par la cuisine, un ticket emmène hors du rail ceux qui l'attendent, de proche en proche : `fire` retiré, la même raison sur leur carte, un commentaire qui le nomme", async (t) => {
  const { journal, gh, abandonner, jouer, faits } = rail(t);
  // Rien n'est abandonné : personne ne sort.
  assert.equal(aSortirAvec(journal.base).size, 0);
  assert.equal(await jouer(), 0);

  abandonner();
  // #18 l'attend, #19 attend #18 : les deux sortent avec #17. #20 n'attend personne, #21 cuit.
  assert.deepEqual([...aSortirAvec(journal.base).keys()], [18, 19]);
  // La carte de chacun dit pourquoi, avant même que la cuisine ait agi. #18 est
  // bloqué par #17 — 86 sans heure de retour —, #19 en attente.
  const statut = decrireEtat(lireEtat(journal), new Date(`${JOUR_HORLOGE}T10:00:00.000Z`)).join("\n");
  assert.match(statut, /^ {2}#18 {2}BLOCKED {2}prio:1 {2}since 0 s — the kitchen drops it with #17 \(wrong-base\), which it awaits: it leaves the rail, the reason is on its issue {2}Ticket 18$/m);
  assert.match(statut, /^ {2}#19 {2}queued {2}prio:1 {2}since 0 s — the kitchen drops it with #17 \(wrong-base\)/m);

  assert.equal(await jouer(), 2);
  assert.deepEqual(gh.delabellisations, [
    [18, "fire"],
    [19, "fire"],
  ]);
  assert.deepEqual(faits("ticket.dropped-with"), [
    [18, { root: 17, cause: "wrong-base", reason: RAISON }],
    [19, { root: 17, cause: "wrong-base", reason: RAISON }],
  ]);
  assert.deepEqual(
    gh.commentaires.map(([numero]) => numero),
    [18, 19],
  );
  for (const [, corps] of gh.commentaires) {
    assert.match(corps, /^\*\*Cuisine — ticket abandonné avec #17 \(`wrong-base`\)\.\*\*/);
    assert.match(corps, /\*\*Pourquoi\.\*\* Sa cause \(`wrong-base`\) n'est pas au cook/);
    assert.match(corps, /quand `fire` revient sur #17 : c'est le seul chemin du retour/);
  }

  // Le sondage ne les a pas encore sortis : rien ne se redit, le retrait se redemande.
  assert.equal(await jouer(), 0);
  assert.equal(gh.commentaires.length, 2);
  assert.equal(faits("ticket.dropped-with").length, 2);
});

test("`fire` remis sur la racine, ceux qui sont sortis avec elle la suivent d'eux-mêmes ; revenu seul, un ticket qui l'attend ressort", async (t) => {
  const { journal, gh, arriver, partir, abandonner, jouer, faits } = rail(t);
  abandonner();
  await jouer();
  // Le sondage les sort du rail, la racine avec eux.
  for (const ticket of [17, 18, 19]) partir(ticket);
  assert.equal(aSortirAvec(journal.base).size, 0);
  assert.equal(await jouer(), 0);
  assert.deepEqual(gh.labellisations, []);

  // Le chef remet `fire` sur #18 seul : il attend encore #17, abandonné — il ressort.
  arriver(18, [17]);
  assert.equal(await jouer(), 1);
  assert.deepEqual(gh.delabellisations.at(-1), [18, "fire"]);
  partir(18);

  // #19 est fermé entre-temps ; `fire` revient sur #17 : #18 le suit, #19 n'a rien à suivre.
  gh.poser({ ...issue(19), state: "closed" });
  arriver(17);
  assert.equal(await jouer(), 1);
  assert.deepEqual(gh.labellisations, [[18, ["fire"]]]);
  assert.deepEqual(faits("ticket.back-with"), [
    [18, { root: 17, refired: true }],
    [19, { root: 17, refired: false }],
  ]);
  assert.match(gh.commentaires.at(-1)?.[1] ?? "", /^\*\*Cuisine — #17 est revenu sur le rail : ce ticket aussi\.\*\*/);
  assert.equal(gh.commentaires.at(-1)?.[0], 18);
  // Ramenés une fois : rien ne se redit.
  assert.equal(await jouer(), 0);
  assert.equal(gh.labellisations.length, 1);
});

test("un ticket que le chef sort du rail n'en emmène aucun : seul l'abandon de la cuisine le fait", async (t) => {
  const { journal, gh, partir, jouer } = rail(t);
  partir(17);
  assert.equal(aSortirAvec(journal.base).size, 0);
  assert.equal(await jouer(), 0);
  assert.deepEqual([gh.delabellisations, gh.commentaires], [[], []]);
});

test("GitHub en panne sur un ticket : rien n'est écrit, et le sondage suivant y revient", async (t) => {
  const { gh, abandonner, jouer, faits } = rail(t);
  abandonner();
  gh.pannes.commentaire = true;
  assert.equal(await jouer(), 0);
  assert.deepEqual(faits("ticket.dropped-with"), []);
  assert.deepEqual(gh.delabellisations, []);
  gh.pannes.commentaire = false;
  assert.equal(await jouer(), 2);
  assert.equal(faits("ticket.dropped-with").length, 2);
});
