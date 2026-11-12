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
import { pourLaBarre } from "../src/barre.ts";
import { carteDuChefDeTodo } from "../src/carte-todo.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";
import { carteDuCommentaire, type CarteDuChef } from "../src/tableau/todo-github.ts";
import type { Terminal } from "../src/terminaux.ts";
import { INCONNUE, jouerLaRevue, revueDuCorps, SANS_NOTE, SORTE_SENSIBLE } from "../src/vue/carte-sensible/carte-sensible-github.ts";
import { estSensible, LABEL_SENSIBLE } from "../src/vue/carte-sensible/label.ts";
import { CHAMP, CONFIRMATION_MS, MARQUE, MERGE, MERGER, RENVOYE, RENVOYER } from "../src/vue/carte-sensible/carte-sensible.js";
import { avecLeRail, lireLeRailSurGithub } from "../src/vue/rail/github.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const DEPOT = "chef/parade";
const SHA = "5b1d0e7c9a2f4e6081a3b5c7d9e1f20314253647";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

// La carte que le runtime pose pour la livraison verte de #30 (PR #41) : l'issue #62 et son commentaire de carte.
async function poseeParLeRuntime(): Promise<{ corps: string; commentaire: string; titre: string }> {
  const ecrits: { titre: string; corps: string; commentaires: string[] } = { titre: "", corps: "", commentaires: [] };
  const github: GitHubDeLaRetenue = {
    creerIssue: async ({ titre, corps }) => ((ecrits.titre = titre), (ecrits.corps = corps), 62),
    commenter: async (numero, corps) => void (numero === 62 && ecrits.commentaires.push(corps)),
    delabelliser: async () => {},
    fermerIssue: async () => {},
    commentaires: async () => [],
  };
  await tenirPourLeChef(SENSIBLE, github, { depot: DEPOT, station: "box", ticket: { number: 30, title: "Delete a user's data on request", labels: ["fire", "sensitive"] }, pr: { number: 41, sha: SHA } });
  return { titre: ecrits.titre, corps: ecrits.corps, commentaire: ecrits.commentaires[0] ?? assert.fail("pas de commentaire de carte") };
}
// La carte du chef telle que l'app la lit de GitHub (tableau/attente-du-chef.ts).
async function carteLue(): Promise<CarteDuChef> {
  const { corps, commentaire } = await poseeParLeRuntime();
  const marquee = carteDuCommentaire(commentaire) ?? assert.fail("le commentaire de carte ne se lit pas");
  const sensible = revueDuCorps(DEPOT, corps) ?? assert.fail("le corps ne dit pas sa PR");
  return { ...marquee, sensible };
}

describe("ce que l'app lit de GitHub", () => {
  test("le label et la sorte de la carte sont ceux que le runtime écrit", () => {
    assert.equal(LABEL_SENSIBLE, LABEL_SENSITIVE);
    assert.equal(SORTE_SENSIBLE, SORTE_DE_CARTE);
    assert.equal(estSensible(["fire", "sensitive"]), true);
    assert.equal(estSensible(["fire", "sensitive-data"]), false);
  });

  test("la carte posée par le runtime se lit : sa PR, son adresse, son ticket — et sa question garde « #30 »", async () => {
    const { titre, corps } = await poseeParLeRuntime();
    assert.equal(titre, "review before merge");
    assert.deepEqual(revueDuCorps(DEPOT, corps), { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${DEPOT}/pull/41` });
    const todo = carteDuChefDeTodo(await carteLue()) ?? assert.fail("pas de carte de TODO");
    assert.equal(todo.question, SENSIBLE.question(30, 41));
    assert.match(todo.question ?? "", /^#30 is sensitive/);
    assert.deepEqual(todo.revue, { pr: 41, ticket: 30 });
    assert.deepEqual(todo.choix, [], "ni choix ni réponse libre : ses deux réponses sont sur la carte");
  });

  test("un corps sans le marqueur ne dit aucune PR : la carte le dit, et ne se tranche pas d'ici", async () => {
    assert.equal(revueDuCorps(DEPOT, "**#30 is sensitive**\n\nPull request: https://github.com/chef/parade/pull/41"), null);
    assert.equal(revueDuCorps(DEPOT, "<!-- brigade:validation-design pr=41 ticket=30 sha=5b1d0e7 -->"), null);
    const { sensible: _, ...sansPR } = await carteLue();
    assert.deepEqual(carteDuChefDeTodo(sansPR)?.revue, { illisible: "its issue does not say which pull request it holds: review it on GitHub" });
  });

  test("le rail lu de GitHub marque le ticket au label `sensitive`, et lui seul", async () => {
    const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
    const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
    const appeler = async (chemin: string): Promise<ReponseGitHub> => {
      if (chemin.includes("/issues?")) return ok([issue(30, ["fire", "sensitive"]), issue(31, ["fire"])]);
      if (chemin.includes("/pulls?")) return ok([]);
      return ok([]);
    };
    const rail = await lireLeRailSurGithub({ depot: DEPOT, appeler, maintenant: () => new Date(A) });
    assert.deepEqual(rail.tickets.map(({ ticket, sensible }) => [ticket, sensible]), [[30, true], [31, undefined]]);
    const faits = avecLeRail({ lu: true, depot: DEPOT, luLe: A, cuisine: { rubriques: [] }, faits: { rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] }, rail).faits.rail as { ticket: number; sensible?: true }[];
    assert.deepEqual(faits.map(({ ticket, sensible }) => [ticket, sensible]), [[30, true], [31, undefined]]);
  });
});

// ── La vue ──

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// #30 au label `sensitive` et #31 sans, tous deux en pass ; la carte #62 « review before merge » de #30 dans TODO.
const faits = (chef: CarteDuChef): Faits =>
  ({
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 2, auTravail: 0, aLaPass: 2, attend: 1, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 30, etat: "en pass", titre: "Delete a user's data on request", url: `https://github.com/${DEPOT}/issues/30`, sensible: true },
      { ticket: 31, etat: "en pass", titre: "Show the journal", url: `https://github.com/${DEPOT}/issues/31` },
    ],
    cooks: [],
    attend: [{ ticket: 62, titre: "review before merge", url: `https://github.com/${DEPOT}/issues/62`, chef }],
  }) as unknown as Faits;
const dessinable = (chef: CarteDuChef): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(chef)) }] });

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const chef = await carteLue();
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...reponses } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const lire = () => {
    const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
    vue.dire("surFaits", { ...dessinable(chef), demande: demandes.at(-1)?.args[0] as number });
  };
  lire();
  await repos();
  return Object.assign(vue, { lire });
}

const laCarte = (vue: Jouee) => (carteDuTicket(vue, 62) ?? assert.fail("pas de carte #62")).dessous("section").find(({ className }) => className.includes("carte-sensible"));
const bouton = (ou: Faux, libelle: string) => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const taper = (ou: Faux, texte: string) => {
  const champ = ou.dessous("textarea")[0] ?? assert.fail("pas de champ");
  champ.value = texte;
  champ.declencher("input");
};
const marques = (carte: Faux | undefined) => (carte ?? assert.fail("pas de carte")).dessous("span").filter(({ className }) => className.includes("etiquette-sensible"));

describe("la marque « sensitive » sur la carte du ticket", () => {
  test("la carte d'un ticket au label `sensitive` la porte, en mots et au survol ; celle d'un ticket sans le label non", async () => {
    const vue = await ouvrir();
    const [marque, ...autres] = marques(carteDuTicket(vue, 30));
    assert.equal(autres.length, 0);
    assert.equal(marque?.textContent, MARQUE);
    assert.match(marque?.title ?? "", /labelled sensitive/);
    assert.deepEqual(marques(carteDuTicket(vue, 31)), []);
    assert.deepEqual(marques(carteDuTicket(vue, 62)), [], "la carte « review before merge » n'est pas le ticket : elle ne porte pas la marque");
  });
});

describe("la carte « review before merge »", () => {
  test("la question, le lien de la PR qui l'ouvre d'un clic, et exactement deux réponses — « Merge » recommandé, « Send back » éteint sans note", async () => {
    const vue = await ouvrir();
    const carte = laCarte(vue) ?? assert.fail("pas de carte « review before merge »");
    assert.ok(carte.dessous("p").some(({ textContent }) => textContent === SENSIBLE.question(30, 41)));
    bouton(carte, "Pull request #41").click();
    assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 62]);
    const libelles = carte.dessous("button").map(({ textContent }) => textContent);
    // Hors le lien, « ask the second » de toute carte de TODO et le « ? » du prix de chaque réponse : deux réponses.
    assert.deepEqual(libelles.filter((libelle) => !["Pull request #41", "ask the second", "?"].includes(libelle)), [MERGER, RENVOYER], "deux réponses, pas une de plus");
    assert.equal(bouton(carte, MERGER).className, "recommande");
    assert.equal(carte.dessous("textarea")[0]?.placeholder, CHAMP);
    assert.equal(bouton(carte, RENVOYER).disabled, true);
    taper(carte, "   \n ");
    assert.equal(bouton(carte, RENVOYER).disabled, true, "des blancs ne sont pas une note");
    taper(carte, "Keep the audit log.");
    assert.equal(bouton(carte, RENVOYER).disabled, false);
  });

  test("le lien ouvre l'adresse de la PR que la carte retient (faits.ts, `pr`)", async () => {
    const tenus = tenirFaits(() => new Map());
    tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(await carteLue())) }] });
    assert.equal(tenus.pr("parade", 62), `https://github.com/${DEPOT}/pull/41`);
  });

  test("« Send back » sans note n'envoie rien", async () => {
    const vue = await ouvrir();
    bouton(laCarte(vue) ?? assert.fail("pas de carte"), RENVOYER).click();
    await repos();
    assert.ok(!vue.appels.some(({ geste }) => geste === "gesteSensible"));
  });

  test("« Merge » part par le pont ; fait, la carte dit « merged ✓ » puis quitte TODO, et les faits sont relus", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await ouvrir({ gesteSensible: () => ({ fait: "chef/parade#41 merged, card #62 closed — ticket #30 is served" }) });
    const avant = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    bouton(laCarte(vue) ?? assert.fail("pas de carte"), MERGER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "merger" }]);
    assert.equal(bouton(laCarte(vue) ?? assert.fail("partie sans un mot"), MERGE).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(carteDuTicket(vue, 62), undefined, "plus dans TODO");
    assert.ok(vue.appels.filter(({ geste }) => geste === "relireBox").length > avant, "les faits sont relus");
    (vue as Jouee & { lire: () => void }).lire();
    await repos();
    assert.equal(carteDuTicket(vue, 62), undefined, "la lecture qui la porte encore ne la ramène pas");
  });

  test("« Send back » part avec la note ; fait, la carte dit « sent back ✓ » puis quitte TODO", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await ouvrir({ gesteSensible: () => ({ fait: "chef/parade#41 sent back" }) });
    const carte = laCarte(vue) ?? assert.fail("pas de carte");
    taper(carte, "Keep the audit log.");
    bouton(carte, RENVOYER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "renvoyer", note: "Keep the audit log." }]);
    assert.equal(bouton(laCarte(vue) ?? assert.fail("partie sans un mot"), RENVOYE).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(carteDuTicket(vue, 62), undefined);
  });

  test("refusée, la carte reste, dit pourquoi en une ligne et garde la note et ses deux réponses", async () => {
    const vue = await ouvrir({ gesteSensible: () => ({ refus: "nothing was done: the head of PR #41 moved since card #62", detail: "brigade : the head of PR #41 moved" }) });
    taper(laCarte(vue) ?? assert.fail("pas de carte"), "Keep the audit log.");
    bouton(laCarte(vue) ?? assert.fail("pas de carte"), RENVOYER).click();
    await repos();
    const carte = laCarte(vue) ?? assert.fail("la carte est partie");
    assert.ok(carte.dessous("p").some(({ textContent }) => textContent.includes("the head of PR #41 moved since card #62")));
    assert.equal(carte.dessous("textarea")[0]?.value, "Keep the audit log.");
    assert.equal(bouton(carte, MERGER).disabled, false);
    assert.equal(bouton(carte, RENVOYER).disabled, false);
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
  const revue = { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${DEPOT}/pull/41` };
  const commandeQui = (faire: (appel: { args: string[]; dire: (l: string) => void; redire: (l: string) => void }) => Promise<void>, joues: string[][] = []) => async () => ({
    principal: async (appel: { args: string[]; env: Record<string, string | undefined>; dire: (l: string) => void; redire: (l: string) => void }) => (joues.push(appel.args), faire(appel)),
    estUneSortie: (erreur: unknown): erreur is { code: number } => erreur instanceof Sortie,
  });

  test("« Merge » joue `merge <owner>/<repo>#<PR>`, « Send back » `send-back … --note <note>` ; ce que la commande dit est rendu", async () => {
    const joues: string[][] = [];
    const commande = commandeQui(async ({ args, dire }) => dire(`${args[0]} done`), joues);
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue, geste: { geste: "merger" }, env: {}, commande }), { fait: "merge done" });
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue, geste: { geste: "renvoyer", note: "  Keep the audit log.\r\nThanks.  " }, env: {}, commande }), { fait: "send-back done" });
    assert.deepEqual(joues, [
      ["merge", "chef/parade#41"],
      ["send-back", "chef/parade#41", "--note", "Keep the audit log.\nThanks."],
    ]);
  });

  test("une note vide, ou une carte que la lecture ne porte plus, ne lancent pas la commande", async () => {
    const commande = async () => assert.fail("la commande n'est pas lancée");
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue, geste: { geste: "renvoyer", note: " \n " }, env: {}, commande }), { refus: SANS_NOTE, detail: "" });
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue: undefined, geste: { geste: "merger" }, env: {}, commande }), { refus: INCONNUE, detail: "" });
  });

  test("la commande qui refuse dit pourquoi ; celle qui ne tourne pas le dit, son erreur au survol", async () => {
    const refuse = commandeQui(async ({ redire }) => {
      redire("brigade : PR #41 is not held by a review before merge card");
      throw new Sortie(1);
    });
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue, geste: { geste: "merger" }, env: {}, commande: refuse }), { refus: "nothing was done: PR #41 is not held by a review before merge card", detail: "brigade : PR #41 is not held by a review before merge card" });
    const absente = async () => {
      throw new Error("Cannot find module sensible/commande.ts");
    };
    assert.deepEqual(await jouerLaRevue({ depot: DEPOT, revue, geste: { geste: "merger" }, env: {}, commande: absente }), { refus: "nothing was done: the kitchen's command could not run", detail: "Cannot find module sensible/commande.ts" });
  });
});
