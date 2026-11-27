// Une question du manager répondue quitte ce qui t'attend (#503) : postée depuis la fiche, ou lue
// répondue sur l'issue, la carte passe de TODO à WAITING — elle attend le manager —, sans attendre
// qu'il l'ait lue ; elle revient dans TODO s'il pose une autre question, et n'est plus nulle part
// quand la file ne la nomme plus. Ni réseau, ni GitHub : les lectures sont écrites par chaque test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAPart } from "../src/awaiting.ts";
import { rail, holdFacts, type Facts } from "../src/facts.ts";
import type { Read, Question } from "../src/question.ts";
import { PAR_YOU, REREAD_MS, holdAnswered } from "../src/answered.ts";

const ISSUE = "https://github.com/benomite/brigade/issues/30";
const QUESTION = `${ISSUE}#issuecomment-2`;
const A = "2026-10-15T10:00:00.000Z";
const question = (fields: Partial<Question> = {}): Read => ({ a: A, question: { url: QUESTION, auteur: "brigade-manager", a: "2026-10-15T08:00:00Z", texte: "(a) oui (b) non ?", resume: "(a) oui (b) non ?", choix: [], depuis: [], ...fields } });
const answer = { auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b" };
const answeredOne = (fields: Partial<Question> = {}) => question({ depuis: [answer], repondue: answer, ...fields });

describe("ce qui est su des questions répondues", () => {
  test("lue répondue sur l'issue : retenue, avec qui y a répondu et quand ; lue sans réponse, une autre question ou plus de question : lâchée", () => {
    const heldEntries = holdAnswered(() => 0);
    assert.equal(heldEntries.lue("parade", 30, answeredOne()), true);
    assert.deepEqual(heldEntries.de("parade"), new Map([[30, { question: QUESTION, par: "benomite", a: "2026-10-15T09:00:00Z" }]]));
    // La même lecture ne change rien au rail.
    assert.equal(heldEntries.lue("parade", 30, answeredOne()), false);
    // Le manager a posé une autre question : la carte t'attend de nouveau.
    assert.equal(heldEntries.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` })), true);
    assert.equal(heldEntries.de("parade").size, 0);
    heldEntries.lue("parade", 30, answeredOne());
    assert.equal(heldEntries.lue("parade", 30, { a: A, aucune: true }), true);
    assert.equal(heldEntries.de("parade").size, 0);
    // Un autre projet n'en sait rien.
    heldEntries.lue("parade", 30, answeredOne());
    assert.equal(heldEntries.de("autre").size, 0);
  });

  test("une issue qui n'a pas pu être lue ne change rien : ce n'est ni répondu, ni pas répondu", () => {
    const heldEntries = holdAnswered(() => 0);
    heldEntries.lue("parade", 30, answeredOne());
    assert.equal(heldEntries.lue("parade", 30, { a: A, sans: "$ gh issue view … → exit code 4" }), false);
    assert.equal(heldEntries.de("parade").size, 1);
  });

  test("postée depuis la fiche : retenue aussitôt, à ton nom — et une relecture qui ne la montre pas encore ne la lâche pas, sauf sur une autre question", () => {
    const heldEntries = holdAnswered(() => Date.parse("2026-10-15T10:05:00Z"));
    assert.equal(heldEntries.postee("parade", 30, QUESTION), true);
    assert.deepEqual(heldEntries.de("parade").get(30), { question: QUESTION, par: PAR_YOU, a: "2026-10-15T10:05:00.000Z" });
    // GitHub ne montre pas encore le commentaire : elle reste.
    assert.equal(heldEntries.lue("parade", 30, question()), false);
    assert.equal(heldEntries.de("parade").size, 1);
    // Il le montre : c'est le compte qui l'a signée qui est dit.
    assert.equal(heldEntries.lue("parade", 30, answeredOne()), true);
    assert.equal(heldEntries.de("parade").get(30)?.par, "benomite");
    // Une réponse lue sur l'issue, puis plus rien dessous : elle a été retirée, la carte t'attend.
    assert.equal(heldEntries.lue("parade", 30, question()), true);
    heldEntries.postee("parade", 30, QUESTION);
    assert.equal(heldEntries.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` })), true);
    assert.equal(heldEntries.de("parade").size, 0);
  });

  test("ce que la file ne nomme plus est lâché ; ce qu'elle nomme est relu au plus toutes les deux minutes ; sans file lue, rien n'est lâché", () => {
    let now = 0;
    const heldEntries = holdAnswered(() => now);
    heldEntries.lue("parade", 30, answeredOne());
    heldEntries.lue("parade", 31, answeredOne());
    assert.deepEqual(heldEntries.garder("parade", new Set([30, 31])), []);
    now = REREAD_MS;
    assert.deepEqual(heldEntries.garder("parade", new Set([30, 31])), [30, 31]);
    // Relues à l'instant : pas deux fois.
    assert.deepEqual(heldEntries.garder("parade", new Set([30, 31])), []);
    assert.deepEqual(heldEntries.garder("parade", undefined), []);
    assert.equal(heldEntries.de("parade").size, 2);
    assert.deepEqual(heldEntries.garder("parade", new Set([31])), []);
    assert.deepEqual([...heldEntries.de("parade").keys()], [31]);
    assert.deepEqual(heldEntries.garder("inconnu", new Set()), []);
  });
});

// Le rail d'un projet dont l'épique #30 attend une réponse à la question du manager, le #12 une
// livraison à merger, et le #50 est retenu par `blocked-on-human` après une question.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-15T10:04:11.000Z",
  dernierTick: "2026-10-15T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 3, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 12, etat: "en pass", titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", activite: null }],
  attend: [
    { ticket: 30, titre: "", url: ISSUE, decision: { quoi: "question", motif: null, cause: null, pr: null } },
    { ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", decision: { quoi: "merge", motif: "review-required", cause: null, pr: "https://github.com/benomite/brigade/pull/31" } },
    { ticket: 50, titre: "Le moteur de rendu", url: "https://github.com/benomite/brigade/issues/50", decision: { quoi: "ecartee", motif: "blocked-on-human", cause: null, pr: null } },
  ],
  livres: [],
};
const BLOCK = {
  bloc: [
    "awaiting   3 decisions await the chef",
    "  #30  since 2 h  manager's question before splitting the epic — to answer: on the issue, the manager reads it again and splits it; or close the issue",
    "  #12  since 4 min  green delivery, not merged: review it first",
    "  #50  since 1 h  parked for you by the manager, with its question (`chef-todo`) — to decide: answer its card, the manager judges it again; or close the issue",
    "end awaiting",
    "",
  ].join("\n"),
  a: "2026-10-15T10:04:20.000Z",
};
const column = (draws: ReturnType<typeof rail>, name: string) => draws.colonnes.find((candidate) => candidate.nom === name) ?? assert.fail(`pas de colonne ${name}`);
const ANSWERED = new Map([[30, { question: QUESTION, par: "you", a: "2026-10-15T10:05:00.000Z" }]]);

describe("le rail d'une question répondue", () => {
  test("sans réponse, la question du manager est dans TODO, et sa carte dit qu'elle porte une question — comme celle que la question retient ; pas la livraison", () => {
    const todo = column(rail(FACTS, BLOCK), "Awaiting you");
    assert.deepEqual(todo.cartes.map(({ ticket, question: carries }) => [ticket, carries]), [[30, true], [12, undefined], [50, true]]);
  });

  // Ticket 4260 : la ligne du bloc d'une issue que le manager parque pour le chef avec sa question nomme `chef-todo` ; sa carte
  // dit la question, comme celle d'une épique avant son découpage. Une autre ligne, non.
  test("une issue que le manager a parquée pour le chef (`chef-todo`, sa ligne du bloc) : sa carte dit qu'elle porte une question", () => {
    const todo = column(rail(FACTS, BLOCK), "Awaiting you");
    assert.equal(todo.cartes.find(({ ticket }) => ticket === 50)?.question, true);
    assert.equal(todo.cartes.find(({ ticket }) => ticket === 12)?.question, undefined);
  });

  test("répondue, elle quitte TODO pour WAITING — elle attend le manager — et y dit qui a répondu, quand, et ce qui viendra", () => {
    const draws = rail(FACTS, BLOCK, undefined, ANSWERED);
    const todo = column(draws, "Awaiting you");
    const waiting = column(draws, "Waiting");
    assert.deepEqual([todo.compte, todo.cartes.map(({ ticket }) => ticket)], ["2", [12, 50]]);
    assert.deepEqual([waiting.compte, waiting.cartes.map(({ ticket }) => ticket)], ["1", [30]]);
    const card = waiting.cartes[0];
    assert.equal(card?.ligne, "answered by you · the manager's turn");
    assert.equal(card?.attendu, false);
    assert.deepEqual(card?.attend, []);
    assert.deepEqual(card?.repondue, { par: "you", a: "2026-10-15T10:05:00.000Z" });
    assert.deepEqual(card?.dit.map(({ libelle: wording }) => wording), ["answered by", "answered at", "next"]);
    assert.equal(card?.gestes, undefined);
    assert.equal(card?.ouvrable, true);
  });

  test("répondre ne lève pas une retenue, ni ne merge une livraison : ces cartes restent dans TODO, même dites répondues", () => {
    const allEntries = new Map([...ANSWERED, [12, ANSWERED.get(30)!], [50, ANSWERED.get(30)!]]);
    assert.deepEqual(column(rail(FACTS, BLOCK, undefined, allEntries), "Awaiting you").cartes.map(({ ticket }) => ticket), [12, 50]);
  });

  test("une seule carte par ticket : répondue, elle n'est rangée nulle part ailleurs que dans WAITING, même si le rail la porte", () => {
    const onTheRail = { ...FACTS, rail: [...FACTS.rail, { ticket: 30, etat: "en attente", titre: "L'épique", url: ISSUE, activite: null }] };
    const draws = rail(onTheRail, BLOCK, undefined, ANSWERED);
    assert.equal([...draws.colonnes.flatMap(({ cartes: cards }) => cards), ...draws.hors].filter(({ ticket }) => ticket === 30).length, 1);
  });

  test("d'un runtime d'avant `decision`, la question avant découpage se lit sur sa ligne du bloc, dans ses deux langues", () => {
    const withoutDecision = { ...FACTS, attend: FACTS.attend?.map(({ decision: _decision, ...remains }) => remains) };
    assert.deepEqual(column(rail(withoutDecision, BLOCK, undefined, ANSWERED), "Waiting").cartes.map(({ ticket }) => ticket), [30]);
    const enFrench = { ...BLOCK, bloc: "attend     1 décision\n  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue\nfin attend\n" };
    assert.deepEqual(column(rail(withoutDecision, enFrench, undefined, ANSWERED), "Waiting").cartes.map(({ ticket }) => ticket), [30]);
  });
});

describe("le process principal redessine le rail d'une question répondue, sans attendre une lecture", () => {
  const receive = (heldOnes: ReturnType<typeof holdFacts>) => {
    heldOnes.recevoir({ projet: "parade", demande: 3, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    return heldOnes.attendre(putAPart({ projet: "parade", demande: 3, a: A, sorties: [{ commande: "status", texte: BLOCK.bloc }] }));
  };
  const enWaiting = (receivedOne: ReturnType<ReturnType<typeof holdFacts>["redessiner"]>) =>
    receivedOne !== undefined && "tableau" in receivedOne ? column(receivedOne.tableau.rail, "Waiting").cartes.map(({ ticket }) => ticket) : assert.fail("rien de dessiné");

  test("posée, la réponse range la carte dans WAITING au redessin ; lâchée, elle revient dans TODO", () => {
    const answeredEntries = holdAnswered(() => 0);
    const heldOnes = holdFacts((project) => answeredEntries.de(project));
    assert.equal(heldOnes.redessiner("parade"), undefined);
    receive(heldOnes);
    assert.deepEqual(enWaiting(heldOnes.redessiner("parade")), []);
    answeredEntries.postee("parade", 30, QUESTION);
    const redraws = heldOnes.redessiner("parade");
    assert.deepEqual(enWaiting(redraws), [30]);
    // Sous la demande de la dernière lecture : la vue la prend.
    assert.equal(redraws?.demande, 3);
    answeredEntries.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` }));
    assert.deepEqual(enWaiting(heldOnes.redessiner("parade")), []);
  });

  test("les tickets que la file nomme : ceux du bloc et ceux de `faits` — rien de connu tant que ni l'un ni l'autre n'est lu", () => {
    const heldOnes = holdFacts();
    assert.equal(heldOnes.nommes("parade"), undefined);
    receive(heldOnes);
    assert.deepEqual(heldOnes.nommes("parade"), new Set([30, 12, 50]));
  });
});
