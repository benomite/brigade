// Le ticket sensible dans l'app (ticket 3224, épique 3214). La carte « review before merge » est celle que le runtime pose
// (runtime/src/sensible/, ticket 3223) : son issue et son commentaire de carte sont écrits ici par le runtime même
// (`tenirPourLeChef`), puis lus par l'app comme elle lit GitHub. On vérifie :
//   - la marque « sensitive » sur la carte du rail d'un ticket au label `sensitive`, et sur elle seule — du label lu sur
//     GitHub jusqu'à la carte posée par la vue ;
//   - la carte « review before merge » : sa question, le lien de sa PR qui l'ouvre d'un clic, et exactement deux réponses,
//     « Merge » et « Send back » — éteint tant que la note est vide ; chaque réponse part par le pont, faite la carte quitte
//     TODO, refusée elle reste et dit pourquoi ;
//   - ce que le process principal en fait : la commande `sensitive` du runtime, ses arguments, et une note vide qui ne part pas.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SENSIBLE, LABEL_SENSITIVE, SORTE_DE_CARTE } from "../../runtime/src/sensible/sensible.ts";
import { tenirPourLeChef, type GitHubDeLaRetenue } from "../../runtime/src/validation-design/validation-design.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { cardDuChefDeTodo } from "../src/card-todo.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, holdFacts, type Dessinable, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import type { AnswerGitHub } from "../src/tableau/client.ts";
import { cardDuComment, type CardDuChef } from "../src/tableau/todo-github.ts";
import type { Terminal } from "../src/terminaux.ts";
import { INCONNUE, jouerLaRevue, revueDuCorps, SANS_NOTE, SORTE_SENSITIVE } from "../src/vue/card-sensitive/card-sensitive-github.ts";
import { estSensitive, SENSITIVE_LABEL } from "../src/vue/card-sensitive/label.ts";
import { CHAMP, CONFIRMATION_MS, MARQUE, MERGE, MERGER, RENVOYE, RENVOYER } from "../src/vue/card-sensitive/card-sensitive.js";
import { avecLeRail, lireLeRailSurGithub } from "../src/vue/rail/github.ts";
import { cardDuTicket, type Faux, type Jouee, jouerLaVue, type Answers, repos } from "./aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const REPOSITORY = "chef/parade";
const SHA = "5b1d0e7c9a2f4e6081a3b5c7d9e1f20314253647";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

// La carte que le runtime pose pour la livraison verte de #30 (PR #41) : sur le ticket même (ticket 3615), son commentaire de
// carte, dont le marqueur dit la PR — aucune issue à part.
async function poseeParLeRuntime(): Promise<{ commentaire: string; labels: string[] }> {
  const ecrits: { commentaires: string[]; labels: string[] } = { commentaires: [], labels: [] };
  const github: GitHubDeLaRetenue = {
    commenter: async (numero, corps) => void (numero === 30 && ecrits.commentaires.push(corps)),
    labelliser: async (numero, labels) => void (numero === 30 && ecrits.labels.push(...labels)),
    delabelliser: async () => {},
    fermerIssue: async () => {},
    commentaires: async () => [],
  };
  await tenirPourLeChef(SENSIBLE, github, { depot: REPOSITORY, station: "box", ticket: { number: 30, title: "Delete a user's data on request", labels: ["fire", "sensitive"] }, pr: { number: 41, sha: SHA } });
  return { labels: ecrits.labels, commentaire: ecrits.commentaires[0] ?? assert.fail("pas de commentaire de carte") };
}
// La carte du chef telle que l'app la lit de GitHub (tableau/wait-du-chef.ts).
async function cardLue(): Promise<CardDuChef> {
  const { commentaire: corps, commentaire: comment } = await poseeParLeRuntime();
  const marquee = cardDuComment(comment) ?? assert.fail("le commentaire de carte ne se lit pas");
  const sensitive = revueDuCorps(REPOSITORY, corps) ?? assert.fail("le corps ne dit pas sa PR");
  return { ...marquee, sensible: sensitive };
}

describe("ce que l'app lit de GitHub", () => {
  test("le label et la sorte de la carte sont ceux que le runtime écrit", () => {
    assert.equal(SENSITIVE_LABEL, LABEL_SENSITIVE);
    assert.equal(SORTE_SENSITIVE, SORTE_DE_CARTE);
    assert.equal(estSensitive(["fire", "sensitive"]), true);
    assert.equal(estSensitive(["fire", "sensitive-data"]), false);
  });

  test("la carte posée par le runtime se lit : sa PR, son adresse, son ticket — et sa question garde « #30 »", async () => {
    const { labels, commentaire: corps } = await poseeParLeRuntime();
    assert.deepEqual(labels, ["chef-todo"]);
    assert.deepEqual(revueDuCorps(REPOSITORY, corps), { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${REPOSITORY}/pull/41` });
    const todo = cardDuChefDeTodo(await cardLue()) ?? assert.fail("pas de carte de TODO");
    assert.equal(todo.question, SENSIBLE.question(30, 41));
    assert.match(todo.question ?? "", /^#30 is sensitive/);
    assert.deepEqual(todo.revue, { pr: 41, ticket: 30 });
    assert.deepEqual(todo.choix, [], "ni choix ni réponse libre : ses deux réponses sont sur la carte");
  });

  test("un corps sans le marqueur ne dit aucune PR : la carte le dit, et ne se tranche pas d'ici", async () => {
    assert.equal(revueDuCorps(REPOSITORY, "**#30 is sensitive**\n\nPull request: https://github.com/chef/parade/pull/41"), null);
    assert.equal(revueDuCorps(REPOSITORY, "<!-- brigade:validation-design pr=41 ticket=30 sha=5b1d0e7 -->"), null);
    const { sensible: _, ...sansPR } = await cardLue();
    assert.deepEqual(cardDuChefDeTodo(sansPR)?.revue, { illisible: "its issue does not say which pull request it holds: review it on GitHub" });
    // Le marqueur d'une carte de TODO qui ne dit pas sa PR, ou celui d'une autre sorte, n'en dit aucune non plus.
    assert.equal(revueDuCorps(REPOSITORY, "<!-- brigade:todo kind=review-before-merge -->\n**#30 is sensitive**"), null);
    assert.equal(revueDuCorps(REPOSITORY, "<!-- brigade:todo kind=design-validation pr=41 ticket=30 sha=5b1d0e7 -->"), null);
  });

  test("le rail lu de GitHub marque le ticket au label `sensitive`, et lui seul", async () => {
    const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
    const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
    const appeler = async (chemin: string): Promise<AnswerGitHub> => {
      if (chemin.includes("/issues?")) return ok([issue(30, ["fire", "sensitive"]), issue(31, ["fire"])]);
      if (chemin.includes("/pulls?")) return ok([]);
      return ok([]);
    };
    const rail = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(A) });
    assert.deepEqual(rail.tickets.map(({ ticket, sensible: sensitive }) => [ticket, sensitive]), [[30, true], [31, undefined]]);
    const facts = avecLeRail({ lu: true, depot: REPOSITORY, luLe: A, cuisine: { rubriques: [] }, faits: { rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] }, rail).faits.rail as { ticket: number; sensible?: true }[];
    assert.deepEqual(facts.map(({ ticket, sensible: sensitive }) => [ticket, sensitive]), [[30, true], [31, undefined]]);
  });
});

// ── La vue ──

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// #30 au label `sensitive` et #31 sans, tous deux en pass ; la carte #62 « review before merge » de #30 dans TODO.
const facts = (chef: CardDuChef): Facts =>
  ({
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 2, auTravail: 0, aLaPass: 2, attend: 1, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 30, etat: "en pass", titre: "Delete a user's data on request", url: `https://github.com/${REPOSITORY}/issues/30`, sensible: true },
      { ticket: 31, etat: "en pass", titre: "Show the journal", url: `https://github.com/${REPOSITORY}/issues/31` },
    ],
    cooks: [],
    attend: [{ ticket: 62, titre: "review before merge", url: `https://github.com/${REPOSITORY}/issues/62`, chef }],
  }) as unknown as Facts;
const dessinable = (chef: CardDuChef): Dessinable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(chef)) }] });

async function ouvrir(answers: Answers = {}): Promise<Jouee> {
  const chef = await cardLue();
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const lire = () => {
    const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
    vue.dire("surFaits", { ...dessinable(chef), demande: demandes.at(-1)?.args[0] as number });
  };
  lire();
  await repos();
  return Object.assign(vue, { lire });
}

const laCard = (vue: Jouee) => (cardDuTicket(vue, 62) ?? assert.fail("pas de carte #62")).dessous("section").find(({ className }) => className.includes("carte-sensible"));
const button = (ou: Faux, libelle: string) => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const taper = (ou: Faux, texte: string) => {
  const champ = ou.dessous("textarea")[0] ?? assert.fail("pas de champ");
  champ.value = texte;
  champ.declencher("input");
};
const marques = (card: Faux | undefined) => (card ?? assert.fail("pas de carte")).dessous("span").filter(({ className }) => className.includes("etiquette-sensible"));

describe("la marque « sensitive » sur la carte du ticket", () => {
  test("la carte d'un ticket au label `sensitive` la porte, en mots et au survol ; celle d'un ticket sans le label non", async () => {
    const vue = await ouvrir();
    // Le ticket livré et sa revue sont une seule carte, dans Pass (#3519) : elle porte la marque du ticket.
    assert.equal(cardDuTicket(vue, 30), undefined, "le ticket livré n'a pas de seconde carte à côté de sa revue");
    const [marque, ...autres] = marques(cardDuTicket(vue, 62));
    assert.equal(autres.length, 0);
    assert.equal(marque?.textContent, MARQUE);
    assert.match(marque?.title ?? "", /labelled sensitive/);
    assert.deepEqual(marques(cardDuTicket(vue, 31)), []);
  });
});

describe("la carte « review before merge »", () => {
  test("la question, le lien de la PR qui l'ouvre d'un clic, et exactement deux réponses — « Merge » recommandé, « Send back » éteint sans note", async () => {
    const vue = await ouvrir();
    const card = laCard(vue) ?? assert.fail("pas de carte « review before merge »");
    assert.ok(card.dessous("p").some(({ textContent }) => textContent === SENSIBLE.question(30, 41)));
    button(card, "PR of #30").click();
    assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 62]);
    const libelles = card.dessous("button").map(({ textContent }) => textContent);
    // Hors le lien, « ask the second » de toute carte de TODO et le « ? » du prix de chaque réponse : deux réponses.
    assert.deepEqual(libelles.filter((libelle) => !["PR of #30", "ask the second", "?"].includes(libelle)), [MERGER, RENVOYER], "deux réponses, pas une de plus");
    assert.equal(button(card, MERGER).className, "recommande");
    assert.equal(card.dessous("textarea")[0]?.placeholder, CHAMP);
    assert.equal(button(card, RENVOYER).disabled, true);
    taper(card, "   \n ");
    assert.equal(button(card, RENVOYER).disabled, true, "des blancs ne sont pas une note");
    taper(card, "Keep the audit log.");
    assert.equal(button(card, RENVOYER).disabled, false);
  });

  test("le lien ouvre l'adresse de la PR que la carte retient (facts.ts, `pr`)", async () => {
    const tenus = holdFacts(() => new Map());
    tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(await cardLue())) }] });
    assert.equal(tenus.pr("parade", 62), `https://github.com/${REPOSITORY}/pull/41`);
  });

  test("« Send back » sans note n'envoie rien", async () => {
    const vue = await ouvrir();
    button(laCard(vue) ?? assert.fail("pas de carte"), RENVOYER).click();
    await repos();
    assert.ok(!vue.appels.some(({ geste: action }) => action === "gesteSensible"));
  });

  test("« Merge » part par le pont ; fait, la carte dit « merged ✓ » puis quitte TODO, et les faits sont relus", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await ouvrir({ gesteSensible: () => ({ fait: "chef/parade#41 merged, card #62 closed — ticket #30 is served" }) });
    const avant = vue.appels.filter(({ geste: action }) => action === "relireBox").length;
    button(laCard(vue) ?? assert.fail("pas de carte"), MERGER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "merger" }]);
    assert.equal(button(laCard(vue) ?? assert.fail("partie sans un mot"), MERGE).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(cardDuTicket(vue, 62), undefined, "plus dans TODO");
    assert.ok(vue.appels.filter(({ geste: action }) => action === "relireBox").length > avant, "les faits sont relus");
    (vue as Jouee & { lire: () => void }).lire();
    await repos();
    assert.equal(cardDuTicket(vue, 62), undefined, "la lecture qui la porte encore ne la ramène pas");
  });

  test("« Send back » part avec la note ; fait, la carte dit « sent back ✓ » puis quitte TODO", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await ouvrir({ gesteSensible: () => ({ fait: "chef/parade#41 sent back" }) });
    const card = laCard(vue) ?? assert.fail("pas de carte");
    taper(card, "Keep the audit log.");
    button(card, RENVOYER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "renvoyer", note: "Keep the audit log." }]);
    assert.equal(button(laCard(vue) ?? assert.fail("partie sans un mot"), RENVOYE).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(cardDuTicket(vue, 62), undefined);
  });

  test("refusée, la carte reste, dit pourquoi en une ligne et garde la note et ses deux réponses", async () => {
    const vue = await ouvrir({ gesteSensible: () => ({ refus: "nothing was done: the head of PR #41 moved since card #62", detail: "brigade : the head of PR #41 moved" }) });
    taper(laCard(vue) ?? assert.fail("pas de carte"), "Keep the audit log.");
    button(laCard(vue) ?? assert.fail("pas de carte"), RENVOYER).click();
    await repos();
    const card = laCard(vue) ?? assert.fail("la carte est partie");
    assert.ok(card.dessous("p").some(({ textContent }) => textContent.includes("the head of PR #41 moved since card #62")));
    assert.equal(card.dessous("textarea")[0]?.value, "Keep the audit log.");
    assert.equal(button(card, MERGER).disabled, false);
    assert.equal(button(card, RENVOYER).disabled, false);
  });
});

// ── Le process principal : la commande `sensitive` du runtime ──

describe("les deux réponses jouées par la commande du runtime", () => {
  class Sortie extends Error {
    code: number;
    constructor(code: number) {
      super(`exit ${code}`);
      this.code = code;
    }
  }
  const revue = { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${REPOSITORY}/pull/41` };
  const commandQui = (faire: (call: { args: string[]; dire: (l: string) => void; redire: (l: string) => void }) => Promise<void>, joues: string[][] = []) => async () => ({
    principal: async (call: { args: string[]; env: Record<string, string | undefined>; dire: (l: string) => void; redire: (l: string) => void }) => (joues.push(call.args), faire(call)),
    estUneSortie: (error: unknown): error is { code: number } => error instanceof Sortie,
  });

  test("« Merge » joue `merge <owner>/<repo>#<PR>`, « Send back » `send-back … --note <note>` ; ce que la commande dit est rendu", async () => {
    const joues: string[][] = [];
    const command = commandQui(async ({ args, dire: tell }) => tell(`${args[0]} done`), joues);
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue, geste: { geste: "merger" }, env: {}, commande: command }), { fait: "merge done" });
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue, geste: { geste: "renvoyer", note: "  Keep the audit log.\r\nThanks.  " }, env: {}, commande: command }), { fait: "send-back done" });
    assert.deepEqual(joues, [
      ["merge", "chef/parade#41"],
      ["send-back", "chef/parade#41", "--note", "Keep the audit log.\nThanks."],
    ]);
  });

  test("une note vide, ou une carte que la lecture ne porte plus, ne lancent pas la commande", async () => {
    const command = async () => assert.fail("la commande n'est pas lancée");
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue, geste: { geste: "renvoyer", note: " \n " }, env: {}, commande: command }), { refus: SANS_NOTE, detail: "" });
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue: undefined, geste: { geste: "merger" }, env: {}, commande: command }), { refus: INCONNUE, detail: "" });
  });

  test("la commande qui refuse dit pourquoi ; celle qui ne tourne pas le dit, son erreur au survol", async () => {
    const refuse = commandQui(async ({ redire }) => {
      redire("brigade : PR #41 is not held by a review before merge card");
      throw new Sortie(1);
    });
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue, geste: { geste: "merger" }, env: {}, commande: refuse }), { refus: "nothing was done: the PR of #30 is not held by a review before merge card", detail: "brigade : PR #41 is not held by a review before merge card" });
    const absente = async () => {
      throw new Error("Cannot find module sensible/commande.ts");
    };
    assert.deepEqual(await jouerLaRevue({ depot: REPOSITORY, revue, geste: { geste: "merger" }, env: {}, commande: absente }), { refus: "nothing was done: the kitchen's command could not run", detail: "Cannot find module sensible/commande.ts" });
  });
});

// Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR #41 de #30 se lirait comme un ticket. La carte dit sa
// PR par son ticket, dans sa question, son lien et le prix de « Merge » ; le lien ouvre toujours la PR.
describe("la carte « review before merge » dit sa PR par son ticket (ticket 3716)", () => {
  test("dans TODO : « PR of #30 », jamais « #41 » — texte et survols ; son lien ouvre la PR de la carte", async () => {
    const vue = await ouvrir();
    const card = laCard(vue) ?? assert.fail("pas de carte « review before merge »");
    const survols = [...card.descendants()].flatMap(({ title, ariaLabel }) => [title, ariaLabel ?? ""]);
    assert.doesNotMatch([card.textContent, ...survols].join("\n"), /#41\b/);
    assert.match(card.textContent, /review the delivery of #30 \(PR 41\) before it is merged/);
    assert.ok(survols.some((survol) => survol.startsWith("The PR of #30 is merged into the integration branch")), survols.join(" | "));
    button(card, "PR of #30").click();
    assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 62]);
  });
});
