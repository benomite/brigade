// Les issues que d'autres que le chef ouvrent sur le dépôt (#1954) : seules
// celles-là, sans réponse de brigade, sont listées ; chaque décision du rôle
// produit s'applique sur l'issue — doublon, acceptée, déclinée —, ou la porte
// au chef dans TODO quand elle changerait la direction du produit ; au-delà
// d'un jour sans réponse, elle est en retard. Le chef se lit dans les réglages
// du projet.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cartesEnTodo, jugerCarte } from "../../../src/carte-todo.ts";
import type { GitHub, IssueOuverte } from "../../../src/github.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { carteDeDirection, depotDuGitHub, todoDuJournal } from "../../../src/produit/externes/branchements.ts";
import {
  appliquer,
  chefDuProjet,
  DecisionRefusee,
  DELAI_DE_REPONSE_MS,
  enRetard,
  ligneDAcceptation,
  MARQUEUR,
  relever,
  sansReponse,
  type CommentaireExterne,
  type Decision,
  type DepotDesExternes,
  type IssueExterne,
} from "../../../src/produit/externes/externes.ts";
import { reglagesDuTexte, texteDuFichier, validerReglagesProjet } from "../../../src/reglages-projet/reglages.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../../outils.ts";

const MAINTENANT = Date.parse(`${JOUR_HORLOGE}T12:00:00.000Z`);
const ilYA = (heures: number) => new Date(MAINTENANT - heures * 60 * 60 * 1000).toISOString();

const issue = (number: number, author: string, champs: Partial<IssueExterne> = {}): IssueExterne => ({
  number,
  title: `Issue ${number}`,
  author,
  createdAt: ilYA(2),
  labels: [],
  url: `https://github.com/acme/outil/issues/${number}`,
  body: `What happened on ${number}.`,
  ...champs,
});

// Un dépôt en mémoire : ses issues, leurs commentaires, et chaque écriture
// notée dans l'ordre.
type Ecriture = { quoi: string; numero: number; valeur?: unknown };
function depot(issues: IssueExterne[], commentaires: Record<number, CommentaireExterne[]> = {}) {
  const ecrit: Ecriture[] = [];
  const lus: number[] = [];
  const port: DepotDesExternes = {
    ouvertes: async () => issues,
    commentaires: async (numero) => {
      lus.push(numero);
      return commentaires[numero] ?? [];
    },
    commenter: async (numero, corps) => void ecrit.push({ quoi: "commenter", numero, valeur: corps }),
    labelliser: async (numero, labels) => void ecrit.push({ quoi: "labelliser", numero, valeur: labels }),
    delabelliser: async (numero, label) => void ecrit.push({ quoi: "delabelliser", numero, valeur: label }),
    ecrireCorps: async (numero, corps) => void ecrit.push({ quoi: "ecrireCorps", numero, valeur: corps }),
    fermer: async (numero) => void ecrit.push({ quoi: "fermer", numero }),
  };
  return { port, ecrit, lus };
}

// Le dépôt d'un projet dont le chef est `ana` : ses issues, celles des autres,
// celles des robots, et des réponses déjà là.
const FIXTURE = [
  issue(10, "ana"),
  issue(11, "bob"),
  issue(12, "carla", { createdAt: ilYA(30) }),
  issue(13, "dan"),
  issue(14, "erin"),
  issue(15, "brigade-manager[bot]"),
  issue(16, "Ana"),
  issue(17, "fred", { labels: ["fire"] }),
];
const REPONSES: Record<number, CommentaireExterne[]> = {
  // Brigade a déjà répondu.
  13: [{ author: "brigade-pass[bot]", body: `Thanks for the report.\n\n${MARQUEUR}` }],
  // Le chef a répondu lui-même.
  14: [{ author: "ana", body: "We will look at it." }],
  // Quelqu'un d'autre a commenté : ce n'est pas une réponse de brigade.
  11: [{ author: "gina", body: "Same here." }],
};

const pasDeTodo = () => assert.fail("nothing goes to TODO");

test("given a fixture of issues, only those by non-chef authors without a brigade answer are listed, oldest first", async () => {
  const { port, lus } = depot(FIXTURE, REPONSES);
  const listees = await sansReponse(port, "ana");
  assert.deepEqual(
    listees.map(({ number }) => number),
    [12, 11],
  );
  // Les issues du chef (quelle que soit la casse), des robots et du rail ne
  // coûtent pas la lecture de leurs commentaires.
  assert.deepEqual(lus.sort(), [11, 12, 13, 14]);
});

test("the chef is read from the project settings: with another chef login, the other chef's issues are the ones left out", async () => {
  const texte = (chef: string) => JSON.stringify({ version: 1, integrationBranch: "main", chef });
  const { port } = depot(FIXTURE, REPONSES);
  assert.deepEqual(
    (await sansReponse(port, chefDuProjet(reglagesDuTexte(texte("ana"))))).map(({ number }) => number),
    [12, 11],
  );
  // Chez un projet dont le chef est `bob`, l'issue de bob n'attend rien, celles
  // d'ana attendent — et le commentaire d'ana sur #14 n'est plus celui du chef.
  assert.deepEqual(
    (await sansReponse(port, chefDuProjet(reglagesDuTexte(texte("bob"))))).map(({ number }) => number),
    [12, 10, 14, 16],
  );
});

test("without a chef in the project settings, nothing is guessed: the refusal says which setting to set", () => {
  assert.throws(() => chefDuProjet(reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main" }))), (erreur: Error) => erreur instanceof DecisionRefusee && /`chef`/.test(erreur.message));
  assert.throws(() => chefDuProjet(null), DecisionRefusee);
});

test("the project settings take the chef as a GitHub login, and refuse anything else", () => {
  assert.equal(validerReglagesProjet({ integrationBranch: "main", chef: "ana-maria" }).chef, "ana-maria");
  // Écrit, puis relu : le fichier le garde.
  assert.equal(reglagesDuTexte(texteDuFichier({ integrationBranch: "main", chef: "ana-maria" })).chef, "ana-maria");
  for (const faux of ["", "-ana", "ana--", "ana maria", "a".repeat(40), 7]) {
    assert.throws(() => validerReglagesProjet({ integrationBranch: "main", chef: faux }), /`chef` must be the chef's GitHub login/, String(faux));
  }
});

test("an unanswered non-chef issue older than 24 hours is reported as overdue; a younger one is not", async () => {
  const { port } = depot([issue(20, "bob", { createdAt: ilYA(25) }), issue(21, "carla", { createdAt: ilYA(23) }), issue(22, "dan", { createdAt: ilYA(48) }), issue(23, "ana", { createdAt: ilYA(72) })], {
    22: [{ author: "brigade-pass[bot]", body: `Declined.\n\n${MARQUEUR}` }],
  });
  const releve = await relever(port, "ana", MAINTENANT);
  assert.deepEqual(
    releve.aRepondre.map(({ number }) => number),
    [20, 21],
  );
  assert.deepEqual(
    releve.enRetard.map(({ number }) => number),
    [20],
  );
  // À la limite exacte d'un jour, pas encore en retard.
  assert.deepEqual(enRetard([issue(24, "bob", { createdAt: new Date(MAINTENANT - DELAI_DE_REPONSE_MS).toISOString() })], MAINTENANT), []);
});

test("'duplicate' posts a comment linking the original, then closes the issue", async () => {
  const { port, ecrit } = depot([]);
  assert.deepEqual(await appliquer(port, pasDeTodo, "ana", issue(30, "bob"), { verdict: "duplicate", original: 7 }), { numero: 30, verdict: "duplicate" });
  assert.deepEqual(
    ecrit.map(({ quoi, numero }) => [quoi, numero]),
    [
      ["commenter", 30],
      ["fermer", 30],
    ],
  );
  const corps = String(ecrit[0]?.valeur);
  // La ligne que GitHub reconnaît, en tête, et le marqueur de la réponse.
  assert.match(corps, /^Duplicate of #7\n/);
  assert.ok(corps.includes(MARQUEUR));
});

test("'accepted' sets `product`, one `prio:` label and `filed-by:product`, opens the body with the reason, and answers", async () => {
  const { port, ecrit } = depot([]);
  const acceptee = issue(31, "bob", { labels: ["prio:3", "bug"], body: "The export drops accents." });
  await appliquer(port, pasDeTodo, "ana", acceptee, { verdict: "accepted", prio: "prio:1", reason: "three users hit it this week" });
  assert.deepEqual(ecrit, [
    // Une seule priorité : l'ancienne s'en va.
    { quoi: "delabelliser", numero: 31, valeur: "prio:3" },
    { quoi: "labelliser", numero: 31, valeur: ["product", "prio:1", "filed-by:product"] },
    { quoi: "ecrireCorps", numero: 31, valeur: `${ligneDAcceptation("three users hit it this week")}\n\nThe export drops accents.` },
    { quoi: "commenter", numero: 31, valeur: `Thanks for the report. It is accepted as a product issue, labelled \`prio:1\`: three users hit it this week\n\n${MARQUEUR}` },
  ]);
  assert.match(ligneDAcceptation("three users hit it this week"), /filed-by:product.*three users hit it this week/);
});

test("'accepted' twice does not write the reason line twice", async () => {
  const { port, ecrit } = depot([]);
  const deja = issue(32, "bob", { labels: ["prio:2"], body: `${ligneDAcceptation("asked twice")}\n\nBody.` });
  await appliquer(port, pasDeTodo, "ana", deja, { verdict: "accepted", prio: "prio:2", reason: "asked twice" });
  assert.deepEqual(
    ecrit.map(({ quoi }) => quoi),
    ["labelliser", "commenter"],
  );
});

test("'declined' posts the reason and closes the issue", async () => {
  const { port, ecrit } = depot([]);
  await appliquer(port, pasDeTodo, "ana", issue(33, "bob"), { verdict: "declined", reason: "brigade does not serve GitLab" });
  assert.deepEqual(
    ecrit.map(({ quoi, numero }) => [quoi, numero]),
    [
      ["commenter", 33],
      ["fermer", 33],
    ],
  );
  assert.match(String(ecrit[0]?.valeur), /brigade does not serve GitLab/);
  assert.ok(String(ecrit[0]?.valeur).includes(MARQUEUR));
});

test("an issue that changes the product's direction is moved to TODO, and the chef is not otherwise pinged", async (t: TestContext) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(MAINTENANT) });
  aArreter(t, () => journal.fermer());
  const { port, ecrit } = depot([]);
  const sujet = issue(34, "bob");
  await appliquer(port, todoDuJournal(journal, "outil"), "ana", sujet, { verdict: "direction", reason: "It would make brigade serve GitLab as well as GitHub." });
  const [carte, ...autres] = cartesEnTodo(journal.base);
  assert.deepEqual(autres, []);
  assert.equal(carte?.ticket, 34);
  assert.equal(carte?.type, "product");
  assert.equal(carte?.resume, "It would make brigade serve GitLab as well as GitHub.");
  // Sur l'issue : la seule réponse à son auteur, qui ne nomme ni ne mentionne
  // le chef, et qui ne ferme rien.
  assert.deepEqual(
    ecrit.map(({ quoi }) => quoi),
    ["commenter"],
  );
  assert.doesNotMatch(String(ecrit[0]?.valeur), /@|ana/i);
  assert.ok(String(ecrit[0]?.valeur).includes(MARQUEUR));
  // Répondue : elle ne se liste plus, et n'est jamais en retard.
  const apres = depot([sujet], { 34: [{ author: "ana", body: String(ecrit[0]?.valeur) }] });
  assert.deepEqual(await sansReponse(apres.port, "ana"), []);
});

test("the direction card passes the TODO gate as a product card with one question", () => {
  const jugement = jugerCarte(carteDeDirection(issue(35, "bob"), "It would drop the desktop app."));
  assert.ok(jugement.admise, jugement.admise ? "" : jugement.raison);
  assert.equal(jugement.carte.type, "product");
  assert.equal(jugement.carte.question, "Should brigade take on issue #35, opened by bob?");
  assert.deepEqual(
    jugement.carte.choix.map(({ suite }) => suite),
    ["resume", "resume"],
  );
});

test("a decision that does not hold is refused before anything is written", async () => {
  const refusees: Array<[IssueExterne, Decision]> = [
    [issue(40, "bob"), { verdict: "duplicate", original: 40 }],
    [issue(41, "bob"), { verdict: "duplicate", original: 0 }],
    [issue(42, "bob"), { verdict: "accepted", prio: "prio:9" as "prio:1", reason: "why" }],
    [issue(43, "bob"), { verdict: "accepted", prio: "prio:1", reason: " " }],
    [issue(44, "bob"), { verdict: "declined", reason: "one\ntwo" }],
    [issue(45, "bob"), { verdict: "direction", reason: "" }],
    [issue(46, "ana"), { verdict: "declined", reason: "the chef's own issue" }],
    [issue(47, "bob"), { verdict: "ignored" } as unknown as Decision],
  ];
  for (const [sujet, decision] of refusees) {
    const { port, ecrit } = depot([]);
    await assert.rejects(appliquer(port, pasDeTodo, "ana", sujet, decision), DecisionRefusee, `#${sujet.number}`);
    assert.deepEqual(ecrit, [], `#${sujet.number}`);
  }
});

test("on GitHub, the open issues are polled by a reader of its own, and each author is read once", async () => {
  const ouverte = (number: number): IssueOuverte => ({ number, title: `Issue ${number}`, labels: [], state: "open", createdAt: ilYA(1), updatedAt: ilYA(1), url: `u/${number}`, body: "b", association: "NONE" });
  const sondages = [
    { inchange: false as const, issues: [ouverte(1), ouverte(2)], confirmer: () => void confirmes.push(1) },
    { inchange: true as const },
  ];
  const confirmes: number[] = [];
  const lues: number[] = [];
  const fermees: number[] = [];
  const github = {
    ouvertes: async () => sondages.shift(),
    issue: async (numero: number) => {
      lues.push(numero);
      return { ...ouverte(numero), author: numero === 1 ? "ana" : "bob" };
    },
    fermerIssue: async (numero: number) => void fermees.push(numero),
  } as unknown as GitHub;
  const port = depotDuGitHub(github);
  const premiere = await port.ouvertes();
  assert.deepEqual(
    premiere.map(({ number, author }) => [number, author]),
    [
      [1, "ana"],
      [2, "bob"],
    ],
  );
  assert.deepEqual(confirmes, [1]);
  // Rien n'a changé : la même liste, sans relire les auteurs.
  assert.deepEqual(await port.ouvertes(), premiere);
  assert.deepEqual(lues, [1, 2]);
  await port.fermer(2);
  assert.deepEqual(fermees, [2]);
});
