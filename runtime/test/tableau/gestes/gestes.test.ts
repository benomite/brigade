// Les gestes du chef postés en commentaires sous le tableau de la cuisine :
// écrits par le compte du chef, ils se jouent par l'action de leur geste local
// — merge, renvoi, mise de côté, réponse à une carte — et la box répond sous
// chacun en une ligne ; écrits par un autre, rien ne se joue et rien ne se
// répond. Un commentaire ne se joue qu'une fois, et un geste incompris reçoit
// la grammaire. GitHub est ici un faux client, le journal un vrai.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { entrerDansTodo, cartesEnTodo, type Proposition } from "../../../src/carte-todo.ts";
import type { Fait } from "../../../src/evenements.ts";
import { RENVOI_DU_CHEF } from "../../../src/geste-ticket.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { passDuTicket } from "../../../src/projections/pass.ts";
import { sortDuTicket, ticketDuRail } from "../../../src/projections/rail.ts";
import { ouvrirRail } from "../../../src/rail.ts";
import { demarrer } from "../../../src/runtime.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "../../../src/tableau/gestes/client.ts";
import { GESTES_AU_TABLEAU, gestesDuTableau } from "../../../src/tableau/gestes/gestes.ts";
import { GRAMMAIRE, lireLeGeste } from "../../../src/tableau/gestes/grammaire.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import { lireLeTableau } from "../../../src/tableau/rendu/bloc.ts";
import { fauxGitHub, issue, montre } from "../../aides/cuisine.ts";
import { aArreter, DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const BRANCHE = "cook/30-x";
const TABLEAU = 1;
const CHEF = "benomite";
const CARTE: Proposition = { type: "product", enonce: "Export CSV ou export JSON ?", choix: [{ texte: "L'export CSV." }, { texte: "L'export JSON." }] };

// Le tableau vu de GitHub : ses commentaires, les réponses de la box — postées
// sous le compte du chef, comme sur une box sans App —, et les `depuis` lus.
function fauxTableau() {
  const commentaires: CommentaireDuTableau[] = [];
  const reponses: string[] = [];
  const lectures: Array<string | null> = [];
  const pannes = { reponse: false };
  const comptes = { demandes: 0 };
  let id = 5000;
  const ajouter = (corps: string, auteur: string) => {
    id += 1;
    const commentaire = { id, auteur, corps, le: `2026-10-08T10:${String(id - 5000).padStart(2, "0")}:00Z`, url: `https://github.com/${DEPOT}/issues/${TABLEAU}#issuecomment-${id}` };
    commentaires.push(commentaire);
    return commentaire;
  };
  const client: ClientDesGestes = {
    async commentaires(numero, depuis) {
      assert.equal(numero, TABLEAU);
      lectures.push(depuis);
      return commentaires.filter((commentaire) => depuis === null || commentaire.le >= depuis).map((commentaire) => ({ ...commentaire }));
    },
    async repondre(numero, corps) {
      assert.equal(numero, TABLEAU);
      if (pannes.reponse) throw new Error(`gh api repos/${DEPOT}/issues/${TABLEAU}/comments : HTTP 502`);
      reponses.push(corps);
      ajouter(corps, CHEF);
    },
    async compteDuChef() {
      comptes.demandes += 1;
      return CHEF;
    },
  };
  return { client, commentaires, reponses, lectures, pannes, comptes, poster: (corps: string, auteur = CHEF) => ajouter(corps, auteur) };
}

function atelier(t: TestContext) {
  const heure = montre();
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const gh = fauxGitHub(issue(30));
  const tableau = fauxTableau();
  const avertis: string[] = [];
  const gestes = gestesDuTableau({ client: tableau.client, journal, projet: PROJET, github: gh.github, avertir: (ligne) => avertis.push(ligne) });
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = () =>
    noter(30, { type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: `https://github.com/${DEPOT}/issues/30`, card: null } }, "github");
  const livrer = async () => {
    arriver();
    rail.prendre(STATION);
    noter(30, { type: "cook.launched", payload: { run: "cook-30", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-30.jsonl", station: STATION, branch: BRANCHE, worktree: "worktrees/30-x" } }, `station:${STATION}`);
    rail.envoyerEnPass(30, STATION);
    const pr = await gh.github.ouvrirPR({ branche: BRANCHE, base: "v2", titre: "#30", corps: "" });
    noter(30, { type: "pass.started", payload: { run: "cook-30", pr, number: 101, sha: "abc123" } }, "pass");
  };
  // Verte, retenue faute de grant : elle attend que le chef la merge.
  const attendreLeMerge = async () => {
    await livrer();
    noter(30, { type: "pass.held", payload: { reason: "no-grant" } }, "pass");
  };
  const faits = () => journal.tout().filter((fait) => fait.type === "board.gesture");
  return { journal, gh, tableau, gestes, avertis, arriver, attendreLeMerge, faits };
}

describe("un geste du chef posté sous le tableau", () => {
  test("`merge`, écrit par le compte du chef, merge la livraison à la lecture suivante, et la box répond d'une ligne", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    const geste = a.tableau.poster("/brigade merge #30");

    assert.equal(await a.gestes.traiter(TABLEAU), true);

    assert.deepEqual(a.gh.merges, [[101, `tete-de-${BRANCHE}`]]);
    assert.equal(a.tableau.reponses.length, 1);
    const [reponse = ""] = a.tableau.reponses;
    assert.doesNotMatch(reponse, /\n/, "une ligne");
    assert.ok(reponse.startsWith(`**Done** — [merge #30](${geste.url}) — cost: `), reponse);
    assert.match(reponse, /is merged into v2/);
    // Au journal, une fois, sous la clé de son commentaire ; le bloc le dit pris.
    const [fait, ...autres] = a.faits();
    assert.deepEqual(autres, []);
    assert.equal(fait?.ticket, 30);
    assert.equal(fait?.author, "chef");
    assert.deepEqual(fait?.payload, { comment: geste.id, board: TABLEAU, url: geste.url, author: CHEF, writtenAt: geste.le, gesture: "merge", done: true, reply: reponse });
    assert.deepEqual(
      a.gestes.lus().map(({ commentaire, geste: verbe, ticket, etat, reponse: dite }) => ({ commentaire, verbe, ticket, etat, dite })),
      [{ commentaire: geste.id, verbe: "merge", ticket: 30, etat: "pris", dite: reponse }],
    );
  });

  test("le même geste écrit par un autre compte ne déclenche rien, et n'a aucune réponse", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    a.tableau.poster("/brigade merge #30", "passant");
    a.tableau.poster("/brigade mergeons tout", "passant");

    assert.equal(await a.gestes.traiter(TABLEAU), false);
    assert.equal(await a.gestes.traiter(TABLEAU), false);

    assert.deepEqual(a.gh.merges, []);
    assert.deepEqual(a.tableau.reponses, []);
    assert.deepEqual(a.faits(), []);
    assert.deepEqual(a.avertis, []);
  });

  test("`send-back` renvoie la livraison à un cook, avec la raison du chef, comme `rail send-back`", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    a.tableau.poster("/brigade send-back #30 the export misses the header row");

    await a.gestes.traiter(TABLEAU);

    assert.equal(ticketDuRail(a.journal.base, 30)?.state, "waiting");
    assert.equal(a.journal.duTicket(30).findLast((fait) => fait.type === "ticket.released")?.payload.reason, RENVOI_DU_CHEF);
    assert.deepEqual(passDuTicket(a.journal.base, 30)?.findings, ["Le chef a renvoyé cette livraison : the export misses the header row"]);
    assert.deepEqual(a.gh.merges, []);
    assert.match(a.tableau.reponses[0] ?? "", /^\*\*Done\*\* — \[send-back #30\]\(.*\) — cost: a cook is launched again on cook\/30-x/);
  });

  test("`set-aside` sort le ticket du rail — son `fire` retiré —, comme `rail remove`", async (t) => {
    const a = atelier(t);
    a.arriver();
    a.tableau.poster("/brigade set-aside 30");

    await a.gestes.traiter(TABLEAU);

    assert.deepEqual(a.gh.delabellisations, [[30, "fire"]]);
    assert.equal(sortDuTicket(a.journal.base, 30)?.reason, "unfired");
    assert.match(a.tableau.reponses[0] ?? "", /^\*\*Done\*\* — \[set-aside #30\]\(.*\) — cost: the ticket leaves the rail/);
  });

  test("`answer` répond à la carte en texte libre — sur plusieurs lignes —, et `choose` par un choix, comme `rail answer` et `rail choose`", async (t) => {
    const a = atelier(t);
    a.arriver();
    entrerDansTodo(a.journal, PROJET, 30, CARTE, "manager");
    a.tableau.poster("/brigade answer #30 Neither:\nan Excel export, on top of the CSV.");

    await a.gestes.traiter(TABLEAU);

    assert.deepEqual(cartesEnTodo(a.journal.base), []);
    assert.deepEqual(a.journal.duTicket(30).findLast((fait) => fait.type === "todo.answered")?.payload, { choice: null, answer: "Neither:\nan Excel export, on top of the CSV.", then: "resume" });
    assert.match(a.gh.commentaires.find(([ticket]) => ticket === 30)?.[1] ?? "", /in their own words:[\s\S]*Neither:\nan Excel export/);
    assert.match(a.tableau.reponses[0] ?? "", /^\*\*Done\*\* — \[answer #30\]/);

    entrerDansTodo(a.journal, PROJET, 30, CARTE, "manager");
    a.tableau.poster("/brigade choose #30 2");
    await a.gestes.traiter(TABLEAU);
    assert.deepEqual(a.journal.duTicket(30).findLast((fait) => fait.type === "todo.answered")?.payload, { choice: 2, answer: "L'export JSON.", then: "resume" });
    assert.match(a.tableau.reponses[1] ?? "", /^\*\*Done\*\* — \[choose #30\]/);
  });

  test("un geste que l'action refuse est lu, non joué, et la box dit pourquoi en une ligne", async (t) => {
    const a = atelier(t);
    a.arriver();
    a.tableau.poster("/brigade merge #30");

    assert.equal(await a.gestes.traiter(TABLEAU), true);

    assert.deepEqual(a.gh.merges, []);
    assert.equal(a.tableau.reponses.length, 1);
    assert.match(a.tableau.reponses[0] ?? "", /^\*\*Not done\*\* — \[merge #30\]\(.*\): #30 has no delivery waiting for you to merge it$/);
    assert.deepEqual(a.gestes.lus().map(({ etat }) => etat), ["refuse"]);
  });

  test("lu deux fois, un commentaire ne se joue qu'une fois — même relu par un runtime redémarré", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    a.tableau.poster("/brigade merge #30");

    assert.equal(await a.gestes.traiter(TABLEAU), true);
    assert.equal(await a.gestes.traiter(TABLEAU), false);
    // Un autre process, sur le même journal, avec un curseur qui ne vit que là.
    const redemarre = gestesDuTableau({ client: a.tableau.client, journal: a.journal, projet: PROJET, github: a.gh.github });
    assert.equal(await redemarre.traiter(TABLEAU), false);

    assert.equal(a.gh.merges.length, 1);
    assert.equal(a.tableau.reponses.length, 1);
    assert.equal(a.faits().length, 1);
    // Le curseur : après le geste, seuls les commentaires écrits depuis lui se lisent.
    assert.deepEqual(a.tableau.lectures.slice(1), [a.faits()[0]?.payload.writtenAt, a.faits()[0]?.payload.writtenAt]);
  });

  test("un geste inconnu ou mal formé reçoit une ligne qui nomme la grammaire, et rien ne se joue", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    a.tableau.poster("/brigade mergee #30");
    a.tableau.poster("/brigade merge");
    a.tableau.poster("/brigade merge #30 now please");

    await a.gestes.traiter(TABLEAU);

    assert.deepEqual(a.gh.merges, []);
    assert.equal(a.tableau.reponses.length, 3);
    const [inconnu, sansTicket, deTrop] = a.tableau.reponses;
    assert.match(inconnu ?? "", /^\*\*Not understood\*\* — \[your gesture\]\(.*\): unknown gesture “mergee”\. Accepted, on the first line: /);
    assert.match(sansTicket ?? "", /: merge needs the ticket number\./);
    assert.match(deTrop ?? "", /: merge takes nothing after the ticket number\./);
    for (const reponse of a.tableau.reponses) {
      assert.doesNotMatch(reponse, /\n/);
      for (const forme of GRAMMAIRE) assert.ok(reponse.includes(`\`${forme}\``), forme);
    }
    assert.deepEqual(a.gestes.lus().map(({ geste, ticket, etat }) => ({ geste, ticket, etat })), Array(3).fill({ geste: null, ticket: null, etat: "refuse" }));
  });

  test("ce qui n'est pas un geste — une conversation, les réponses de la box — n'est ni lu ni répondu, et le compte du chef ne se demande pas", async (t) => {
    const a = atelier(t);
    a.tableau.poster("Thanks, the board reads well on the phone.");
    a.tableau.poster("Please /brigade merge #30");

    assert.equal(await a.gestes.traiter(TABLEAU), false);

    assert.deepEqual(a.tableau.reponses, []);
    assert.equal(a.tableau.comptes.demandes, 0);
  });

  test("une réponse que GitHub refuse se reposte au passage suivant, sans rejouer le geste", async (t) => {
    const a = atelier(t);
    await a.attendreLeMerge();
    a.tableau.poster("/brigade merge #30");
    a.tableau.pannes.reponse = true;

    assert.equal(await a.gestes.traiter(TABLEAU), true);
    assert.equal(await a.gestes.traiter(TABLEAU), false);
    assert.deepEqual(a.tableau.reponses, []);
    assert.equal(a.avertis.length, 1, "dit une fois");
    assert.match(a.avertis[0] ?? "", /non postée, reprise au passage suivant — .*HTTP 502/);

    a.tableau.pannes.reponse = false;
    await a.gestes.traiter(TABLEAU);
    await a.gestes.traiter(TABLEAU);
    assert.equal(a.tableau.reponses.length, 1);
    assert.match(a.tableau.reponses[0] ?? "", /^\*\*Done\*\* — \[merge #30\]/);
    assert.equal(a.gh.merges.length, 1);
  });

  test("le bloc ne porte que les derniers gestes", async (t) => {
    const a = atelier(t);
    for (let rang = 0; rang < GESTES_AU_TABLEAU + 2; rang++) a.tableau.poster(`/brigade set-aside #${900 + rang}`);
    await a.gestes.traiter(TABLEAU);
    const lus = a.gestes.lus();
    assert.equal(lus.length, GESTES_AU_TABLEAU);
    assert.deepEqual([lus[0]?.ticket, lus.at(-1)?.ticket], [902, 900 + GESTES_AU_TABLEAU + 1]);
  });
});

describe("la grammaire", () => {
  test("chaque geste se lit de la première ligne ; le `#` est facultatif ; la raison et la réponse vont jusqu'au bout", () => {
    assert.deepEqual(lireLeGeste("/brigade merge #123"), { verbe: "merge", ticket: 123 });
    assert.deepEqual(lireLeGeste("  /brigade   set-aside 7  \nbecause it is done elsewhere"), { verbe: "set-aside", ticket: 7 });
    assert.deepEqual(lireLeGeste("/brigade send-back #8"), { verbe: "send-back", ticket: 8, raison: null });
    assert.deepEqual(lireLeGeste("/brigade send-back #8 the tests  are red\r\non Windows"), { verbe: "send-back", ticket: 8, raison: "the tests  are red\non Windows" });
    assert.deepEqual(lireLeGeste("/brigade answer #9 CSV"), { verbe: "answer", ticket: 9, reponse: "CSV" });
    assert.deepEqual(lireLeGeste("/brigade choose #9 2"), { verbe: "choose", ticket: 9, choix: 2 });
  });

  test("ce qui ne commence pas par `/brigade` n'est pas un geste ; ce qui commence par lui sans s'y conformer est incompris", () => {
    for (const corps of ["merge #12", "", "Please /brigade merge #12", "/brigademerge #12", "> /brigade merge #12"]) assert.equal(lireLeGeste(corps), null, corps);
    assert.deepEqual(lireLeGeste("/brigade"), { incompris: "the gesture is missing after `/brigade`" });
    assert.deepEqual(lireLeGeste("/brigade Merge #12"), { incompris: "unknown gesture “Merge”" });
    assert.deepEqual(lireLeGeste("/brigade merge #0"), { incompris: "merge needs the ticket number, not “#0”" });
    assert.deepEqual(lireLeGeste("/brigade answer #12"), { incompris: "answer needs the answer after the ticket number" });
    assert.deepEqual(lireLeGeste("/brigade choose #12 first"), { incompris: "choose needs one choice number, from 1, after the ticket number" });
    assert.deepEqual(lireLeGeste("/brigade choose #12 1 2"), { incompris: "choose needs one choice number, from 1, after the ticket number" });
  });
});

describe("branchés au tableau publié", () => {
  test("au tick, les gestes se lisent sous le tableau trouvé, et le bloc machine dit aussitôt l'état de chacun", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    let instant = Date.parse("2026-10-08T10:00:00.000Z");
    const maintenant = () => new Date(instant);
    const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant });
    aArreter(t, () => runtime.arreter("SIGTERM"));
    // Le tableau, tel que la publication le voit : une issue, son corps.
    let corps = "";
    const ecrits: string[] = [];
    const issue = (): IssueDuTableau => ({ numero: TABLEAU, ouverte: true, titre: "Kitchen board", corps, labels: ["kitchen-board", "hors-cuisine"] });
    const client: ClientDuTableau = {
      auLabel: async () => (corps === "" ? [] : [issue()]),
      issue: async () => (corps === "" ? null : issue()),
      async creer({ corps: premier }) {
        corps = premier;
        ecrits.push("creer");
        return TABLEAU;
      },
      async ecrireCorps(_numero, nouveau) {
        corps = nouveau;
        ecrits.push("ecrire");
      },
      rouvrir: async () => {},
      epingler: async () => false,
    };
    const tableau = fauxTableau();
    const gestes = gestesDuTableau({ client: tableau.client, journal: runtime.journal, projet: PROJET, github: fauxGitHub().github });
    brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, dire: () => {}, avertir: () => {}, gestes });
    await jusqua(() => tableau.lectures.length === 1);
    const avant = lireLeTableau(corps);
    assert.ok(avant.lu);
    assert.deepEqual(avant.tableau.gestes, []);

    const geste = tableau.poster("/brigade set-aside #77");
    instant += 60_000;
    t.mock.timers.tick(60_000);
    await jusqua(() => tableau.reponses.length === 1 && ecrits.length === 2);
    const apres = lireLeTableau(corps);
    assert.ok(apres.lu);
    assert.deepEqual(
      apres.tableau.gestes?.map(({ commentaire, url, le, geste: verbe, ticket, etat, reponse }) => ({ commentaire, url, le, verbe, ticket, etat, reponse })),
      [{ commentaire: geste.id, url: geste.url, le: geste.le, verbe: "set-aside", ticket: 77, etat: "refuse", reponse: tableau.reponses[0] }],
    );
    assert.match(tableau.reponses[0] ?? "", /^\*\*Not done\*\* — \[set-aside #77\]\(.*\): #77 is not on the rail$/);
  });
});
