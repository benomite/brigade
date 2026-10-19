// Une question du manager répondue quitte ce qui t'attend (#503) : postée depuis la fiche, ou lue
// répondue sur l'issue, la carte passe de TODO à WAITING — elle attend le manager —, sans attendre
// qu'il l'ait lue ; elle revient dans TODO s'il pose une autre question, et n'est plus nulle part
// quand la file ne la nomme plus. Ni réseau, ni GitHub : les lectures sont écrites par chaque test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../src/awaiting.ts";
import { rail, holdFacts, type Facts } from "../src/facts.ts";
import type { Lue, Question } from "../src/question.ts";
import { PAR_TOI, RELIRE_MS, tenirRepondues } from "../src/repondues.ts";

const ISSUE = "https://github.com/benomite/brigade/issues/30";
const QUESTION = `${ISSUE}#issuecomment-2`;
const A = "2026-10-15T10:00:00.000Z";
const question = (champs: Partial<Question> = {}): Lue => ({ a: A, question: { url: QUESTION, auteur: "brigade-manager", a: "2026-10-15T08:00:00Z", texte: "(a) oui (b) non ?", resume: "(a) oui (b) non ?", choix: [], depuis: [], ...champs } });
const reponse = { auteur: "benomite", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3`, corps: "b" };
const repondue = (champs: Partial<Question> = {}) => question({ depuis: [reponse], repondue: reponse, ...champs });

describe("ce qui est su des questions répondues", () => {
  test("lue répondue sur l'issue : retenue, avec qui y a répondu et quand ; lue sans réponse, une autre question ou plus de question : lâchée", () => {
    const tenues = tenirRepondues(() => 0);
    assert.equal(tenues.lue("parade", 30, repondue()), true);
    assert.deepEqual(tenues.de("parade"), new Map([[30, { question: QUESTION, par: "benomite", a: "2026-10-15T09:00:00Z" }]]));
    // La même lecture ne change rien au rail.
    assert.equal(tenues.lue("parade", 30, repondue()), false);
    // Le manager a posé une autre question : la carte t'attend de nouveau.
    assert.equal(tenues.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` })), true);
    assert.equal(tenues.de("parade").size, 0);
    tenues.lue("parade", 30, repondue());
    assert.equal(tenues.lue("parade", 30, { a: A, aucune: true }), true);
    assert.equal(tenues.de("parade").size, 0);
    // Un autre projet n'en sait rien.
    tenues.lue("parade", 30, repondue());
    assert.equal(tenues.de("autre").size, 0);
  });

  test("une issue qui n'a pas pu être lue ne change rien : ce n'est ni répondu, ni pas répondu", () => {
    const tenues = tenirRepondues(() => 0);
    tenues.lue("parade", 30, repondue());
    assert.equal(tenues.lue("parade", 30, { a: A, sans: "$ gh issue view … → exit code 4" }), false);
    assert.equal(tenues.de("parade").size, 1);
  });

  test("postée depuis la fiche : retenue aussitôt, à ton nom — et une relecture qui ne la montre pas encore ne la lâche pas, sauf sur une autre question", () => {
    const tenues = tenirRepondues(() => Date.parse("2026-10-15T10:05:00Z"));
    assert.equal(tenues.postee("parade", 30, QUESTION), true);
    assert.deepEqual(tenues.de("parade").get(30), { question: QUESTION, par: PAR_TOI, a: "2026-10-15T10:05:00.000Z" });
    // GitHub ne montre pas encore le commentaire : elle reste.
    assert.equal(tenues.lue("parade", 30, question()), false);
    assert.equal(tenues.de("parade").size, 1);
    // Il le montre : c'est le compte qui l'a signée qui est dit.
    assert.equal(tenues.lue("parade", 30, repondue()), true);
    assert.equal(tenues.de("parade").get(30)?.par, "benomite");
    // Une réponse lue sur l'issue, puis plus rien dessous : elle a été retirée, la carte t'attend.
    assert.equal(tenues.lue("parade", 30, question()), true);
    tenues.postee("parade", 30, QUESTION);
    assert.equal(tenues.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` })), true);
    assert.equal(tenues.de("parade").size, 0);
  });

  test("ce que la file ne nomme plus est lâché ; ce qu'elle nomme est relu au plus toutes les deux minutes ; sans file lue, rien n'est lâché", () => {
    let maintenant = 0;
    const tenues = tenirRepondues(() => maintenant);
    tenues.lue("parade", 30, repondue());
    tenues.lue("parade", 31, repondue());
    assert.deepEqual(tenues.garder("parade", new Set([30, 31])), []);
    maintenant = RELIRE_MS;
    assert.deepEqual(tenues.garder("parade", new Set([30, 31])), [30, 31]);
    // Relues à l'instant : pas deux fois.
    assert.deepEqual(tenues.garder("parade", new Set([30, 31])), []);
    assert.deepEqual(tenues.garder("parade", undefined), []);
    assert.equal(tenues.de("parade").size, 2);
    assert.deepEqual(tenues.garder("parade", new Set([31])), []);
    assert.deepEqual([...tenues.de("parade").keys()], [31]);
    assert.deepEqual(tenues.garder("inconnu", new Set()), []);
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
    { ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", decision: { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/benomite/brigade/pull/31" } },
    { ticket: 50, titre: "Le moteur de rendu", url: "https://github.com/benomite/brigade/issues/50", decision: { quoi: "ecartee", motif: "blocked-on-human", cause: null, pr: null } },
  ],
  livres: [],
};
const BLOC = {
  bloc: [
    "awaiting   3 decisions await the chef",
    "  #30  since 2 h  manager's question before splitting the epic — to answer: on the issue, the manager reads it again and splits it; or close the issue",
    "  #12  since 4 min  green delivery, not merged for lack of the `merge` grant",
    "  #50  since 1 h  held back, it carries `blocked-on-human` — to lift: remove the label, the manager judges it; or close the issue",
    "end awaiting",
    "",
  ].join("\n"),
  a: "2026-10-15T10:04:20.000Z",
};
const colonne = (dessine: ReturnType<typeof rail>, nom: string) => dessine.colonnes.find((candidate) => candidate.nom === nom) ?? assert.fail(`pas de colonne ${nom}`);
const REPONDUES = new Map([[30, { question: QUESTION, par: "you", a: "2026-10-15T10:05:00.000Z" }]]);

describe("le rail d'une question répondue", () => {
  test("sans réponse, la question du manager est dans TODO, et sa carte dit qu'elle porte une question — comme celle que la question retient ; pas la livraison", () => {
    const todo = colonne(rail(FACTS, BLOC), "TODO");
    assert.deepEqual(todo.cartes.map(({ ticket, question: carries }) => [ticket, carries]), [[30, true], [12, undefined], [50, true]]);
  });

  test("répondue, elle quitte TODO pour WAITING — elle attend le manager — et y dit qui a répondu, quand, et ce qui viendra", () => {
    const dessine = rail(FACTS, BLOC, undefined, REPONDUES);
    const todo = colonne(dessine, "TODO");
    const waiting = colonne(dessine, "WAITING");
    assert.deepEqual([todo.compte, todo.cartes.map(({ ticket }) => ticket)], ["2", [12, 50]]);
    assert.deepEqual([waiting.compte, waiting.cartes.map(({ ticket }) => ticket)], ["1", [30]]);
    const carte = waiting.cartes[0];
    assert.equal(carte?.ligne, "answered by you · the manager's turn");
    assert.equal(carte?.attendu, false);
    assert.deepEqual(carte?.attend, []);
    assert.deepEqual(carte?.repondue, { par: "you", a: "2026-10-15T10:05:00.000Z" });
    assert.deepEqual(carte?.dit.map(({ libelle }) => libelle), ["answered by", "answered at", "next"]);
    assert.equal(carte?.gestes, undefined);
    assert.equal(carte?.ouvrable, true);
  });

  test("répondre ne lève pas une retenue, ni ne merge une livraison : ces cartes restent dans TODO, même dites répondues", () => {
    const toutes = new Map([...REPONDUES, [12, REPONDUES.get(30)!], [50, REPONDUES.get(30)!]]);
    assert.deepEqual(colonne(rail(FACTS, BLOC, undefined, toutes), "TODO").cartes.map(({ ticket }) => ticket), [12, 50]);
  });

  test("une seule carte par ticket : répondue, elle n'est rangée nulle part ailleurs que dans WAITING, même si le rail la porte", () => {
    const surLeRail = { ...FACTS, rail: [...FACTS.rail, { ticket: 30, etat: "en attente", titre: "L'épique", url: ISSUE, activite: null }] };
    const dessine = rail(surLeRail, BLOC, undefined, REPONDUES);
    assert.equal([...dessine.colonnes.flatMap(({ cartes }) => cartes), ...dessine.hors].filter(({ ticket }) => ticket === 30).length, 1);
  });

  test("d'un runtime d'avant `decision`, la question avant découpage se lit sur sa ligne du bloc, dans ses deux langues", () => {
    const sansDecision = { ...FACTS, attend: FACTS.attend?.map(({ decision: _decision, ...reste }) => reste) };
    assert.deepEqual(colonne(rail(sansDecision, BLOC, undefined, REPONDUES), "WAITING").cartes.map(({ ticket }) => ticket), [30]);
    const enFrancais = { ...BLOC, bloc: "attend     1 décision\n  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue\nfin attend\n" };
    assert.deepEqual(colonne(rail(sansDecision, enFrancais, undefined, REPONDUES), "WAITING").cartes.map(({ ticket }) => ticket), [30]);
  });
});

describe("le process principal redessine le rail d'une question répondue, sans attendre une lecture", () => {
  const recevoir = (tenus: ReturnType<typeof holdFacts>) => {
    tenus.recevoir({ projet: "parade", demande: 3, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    return tenus.attendre(mettreAPart({ projet: "parade", demande: 3, a: A, sorties: [{ commande: "status", texte: BLOC.bloc }] }));
  };
  const enWaiting = (recue: ReturnType<ReturnType<typeof holdFacts>["redessiner"]>) =>
    recue !== undefined && "tableau" in recue ? colonne(recue.tableau.rail, "WAITING").cartes.map(({ ticket }) => ticket) : assert.fail("rien de dessiné");

  test("posée, la réponse range la carte dans WAITING au redessin ; lâchée, elle revient dans TODO", () => {
    const repondues = tenirRepondues(() => 0);
    const tenus = holdFacts((projet) => repondues.de(projet));
    assert.equal(tenus.redessiner("parade"), undefined);
    recevoir(tenus);
    assert.deepEqual(enWaiting(tenus.redessiner("parade")), []);
    repondues.postee("parade", 30, QUESTION);
    const redessine = tenus.redessiner("parade");
    assert.deepEqual(enWaiting(redessine), [30]);
    // Sous la demande de la dernière lecture : la vue la prend.
    assert.equal(redessine?.demande, 3);
    repondues.lue("parade", 30, question({ url: `${ISSUE}#issuecomment-7` }));
    assert.deepEqual(enWaiting(tenus.redessiner("parade")), []);
  });

  test("les tickets que la file nomme : ceux du bloc et ceux de `faits` — rien de connu tant que ni l'un ni l'autre n'est lu", () => {
    const tenus = holdFacts();
    assert.equal(tenus.nommes("parade"), undefined);
    recevoir(tenus);
    assert.deepEqual(tenus.nommes("parade"), new Set([30, 12, 50]));
  });
});
