// Ce que l'app faisait par ssh sur la box, joué depuis le tableau de la
// cuisine (#1843) : le plafond de cooks d'une station, l'arrêt et la reprise de
// la cuisine, un commentaire sur l'issue d'une carte, la demande au second — et
// la file du projet, que le second lit à son ouverture. Chaque fois, le chef
// poste un commentaire sous le tableau, et ce qu'il a fait se lit sur GitHub
// seul : la réponse sous son geste, le corps du tableau réécrit, l'issue
// commentée. Le runtime est un vrai, son tick fait passer la box ; GitHub est
// un faux client.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../src/evenements.ts";
import { demanderAuSecond } from "../../../src/issue-ticket.ts";
import { demarrer } from "../../../src/runtime.ts";
import { photoDuProjet } from "../../../src/status.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "../../../src/tableau/gestes/client.ts";
import { gestesDuTableau } from "../../../src/tableau/gestes/gestes.ts";
import { lireLeGeste } from "../../../src/tableau/gestes/grammaire.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import { ecrireLeBloc, laFileDuSecond, lireLeTableau, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { fauxGitHub, issue } from "../../aides/cuisine.ts";
import { aArreter, DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const TABLEAU = 1;
const CHEF = "acme";
const MINUTE = 60_000;

// La box d'un projet, son tableau publié et les gestes qu'elle y lit, branchés
// comme main.ts les branche. `gh` : le GitHub des actions ; `compte` : celui
// du `gh` de la box, le compte du chef.
async function box(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: PROJET, maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const noter = (fait: Fait, author: string, ticket: number | null = null) => runtime.journal.ajouter({ project: PROJET, ticket, author, ...fait });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } }, `station:${STATION}`);

  // L'issue du tableau : son corps, réécrit par la box ; ses commentaires.
  let corps = "";
  const vue = (): IssueDuTableau => ({ numero: TABLEAU, ouverte: true, titre: "Kitchen board", corps, labels: ["kitchen-board", "hors-cuisine"] });
  const client: ClientDuTableau = {
    auLabel: async () => (corps === "" ? [] : [vue()]),
    issue: async () => (corps === "" ? null : vue()),
    async creer({ corps: premier }) {
      corps = premier;
      return TABLEAU;
    },
    async ecrireCorps(_numero, nouveau) {
      corps = nouveau;
    },
    rouvrir: async () => {},
    epingler: async () => false,
  };
  const commentaires: CommentaireDuTableau[] = [];
  const reponses: string[] = [];
  let id = 7000;
  const ajouter = (texte: string) => {
    id += 1;
    const commentaire = { id, auteur: CHEF, corps: texte, le: new Date(instant).toISOString(), url: `https://github.com/${DEPOT}/issues/${TABLEAU}#issuecomment-${id}` };
    commentaires.push(commentaire);
    return commentaire;
  };
  const sousLeTableau: ClientDesGestes = {
    async commentaires(_numero, depuis) {
      return commentaires.filter((commentaire) => depuis === null || commentaire.le >= depuis).map((commentaire) => ({ ...commentaire }));
    },
    async repondre(_numero, texte) {
      reponses.push(texte);
      ajouter(texte);
    },
    compteDuChef: async () => CHEF,
  };
  const gh = fauxGitHub(issue(30));
  const compte = fauxGitHub(issue(30));
  const avertis: string[] = [];
  const gestes = gestesDuTableau({ client: sousLeTableau, journal: runtime.journal, projet: PROJET, github: gh.github, githubDuChef: compte.github, repertoireEtat: repertoire, avertir: (ligne) => avertis.push(ligne) });
  brancherLeTableau(runtime, { client, depot: DEPOT, maintenant, dire: () => {}, avertir: (ligne) => avertis.push(ligne), gestes });
  await jusqua(() => corps !== "");

  const bloc = (): Tableau => {
    const lu = lireLeTableau(corps);
    assert.ok(lu.lu, "le corps du tableau porte son bloc");
    return lu.tableau;
  };
  // Le prochain tick de la box : une minute plus tard.
  const tick = () => {
    instant += MINUTE;
    t.mock.timers.tick(MINUTE);
  };
  // Le chef poste `texte` sous le tableau ; au tick suivant, la box le joue,
  // répond sous lui et réécrit le corps. Rend sa réponse et le bloc réécrit.
  const poster = async (texte: string) => {
    const commentaire = ajouter(texte);
    tick();
    await jusqua(() => bloc().gestes?.some((geste) => geste.commentaire === commentaire.id) === true);
    const reponse = reponses.at(-1) ?? "";
    assert.doesNotMatch(reponse, /\n/, "une ligne");
    return { commentaire, reponse, tableau: bloc() };
  };
  return { repertoire, noter, gh, compte, avertis, bloc, tick, poster, corps: () => corps };
}

const laStation = (tableau: Tableau) => {
  const stations = (tableau.faits?.stations ?? []) as Array<{ station: string; plafond: number | null; cuisson: string }>;
  const station = stations.find(({ station: nom }) => nom === STATION);
  assert.ok(station !== undefined, `${STATION} est sur le tableau`);
  const cuisine = tableau.cuisine.stations.find(({ station: nom }) => nom === STATION);
  return { ...station, plafondDeLaCuisine: cuisine?.plafond };
};

describe("ce que l'app faisait par ssh se joue depuis le tableau de la cuisine", () => {
  test("`/brigade cooks 3` change le nombre de cooks de la station : le tableau publié le dit au tick suivant", async (t) => {
    const b = await box(t);
    assert.equal(laStation(b.bloc()).plafond, 2);
    const { commentaire, reponse, tableau } = await b.poster("/brigade cooks 3");
    assert.ok(reponse.startsWith(`**Done** — [cooks 3](${commentaire.url}): `), reponse);
    const station = laStation(tableau);
    assert.equal(station.plafond, 3);
    assert.equal(station.plafondDeLaCuisine, 3);
    assert.deepEqual(b.avertis, []);
  });

  test("`/brigade station stop` arrête la cuisine du projet sur la station, `/brigade station start` la relance — et `stop`, `resume` toute la cuisine", async (t) => {
    const b = await box(t);
    assert.equal(laStation(b.bloc()).cuisson, "cooking");
    const arretee = await b.poster(`/brigade station stop ${STATION}`);
    assert.ok(arretee.reponse.startsWith(`**Done** — [station stop ${STATION}](`), arretee.reponse);
    assert.equal(laStation(arretee.tableau).cuisson, "stopped");
    const relancee = await b.poster(`/brigade station start ${STATION}`);
    assert.ok(relancee.reponse.startsWith(`**Done** — [station start ${STATION}](`), relancee.reponse);
    assert.equal(laStation(relancee.tableau).cuisson, "cooking");

    const stop = await b.poster("/brigade stop");
    assert.ok(stop.reponse.startsWith("**Done** — [stop]("), stop.reponse);
    assert.notEqual(stop.tableau.cuisine.arreteeLe, null);
    assert.equal(laStation(stop.tableau).cuisson, "stopped");
    const reprise = await b.poster("/brigade resume");
    assert.ok(reprise.reponse.startsWith("**Done** — [resume]("), reprise.reponse);
    assert.equal(reprise.tableau.cuisine.arreteeLe, null);
    assert.equal(laStation(reprise.tableau).cuisson, "cooking");
  });

  test("`/brigade comment #30 …` poste le commentaire sur l'issue #30, mot pour mot, sous le compte de la box — celui du chef —, et la box répond d'une ligne", async (t) => {
    const b = await box(t);
    const { commentaire, reponse, tableau } = await b.poster("/brigade comment #30 The CSV export misses the header row.\n\nSee the attached file.");
    assert.deepEqual(b.compte.commentaires, [[30, "The CSV export misses the header row.\n\nSee the attached file."]]);
    assert.deepEqual(b.gh.commentaires, [], "rien sous l'identité des actions");
    assert.ok(reponse.startsWith(`**Done** — [comment #30](${commentaire.url}) — cost: a comment is posted on issue #30`), reponse);
    assert.deepEqual(
      tableau.gestes?.map(({ geste, ticket, etat }) => ({ geste, ticket, etat })),
      [{ geste: "comment", ticket: 30, etat: "pris" }],
    );
  });

  test("un commentaire sur une issue qui n'existe pas n'est pas posté, et la box dit pourquoi ; sans texte, il n'est pas compris", async (t) => {
    const b = await box(t);
    const absente = await b.poster("/brigade comment #99 Hello");
    assert.match(absente.reponse, /^\*\*Not done\*\* — \[comment #99\]\(.*\): #99 has no GitHub issue/);
    const vide = await b.poster("/brigade comment #30");
    assert.match(vide.reponse, /^\*\*Not understood\*\* — .*comment needs the comment to post after the ticket number/);
    assert.deepEqual(b.compte.commentaires, []);
    assert.deepEqual(b.gh.commentaires, []);
  });

  test("`/brigade ask #30 …` compose la demande au second et la publie là où l'app la lit : le bloc du tableau et la réponse sous le geste", async (t) => {
    const b = await box(t);
    const attendue = await demanderAuSecond(fauxGitHub(issue(30)).github, 30, "the export is slow\non big files");
    assert.ok(attendue.done);
    const { commentaire, reponse, tableau } = await b.poster("/brigade ask #30 the export is slow\non big files");
    const [geste] = tableau.gestes ?? [];
    assert.deepEqual(
      { commentaire: geste?.commentaire, geste: geste?.geste, ticket: geste?.ticket, etat: geste?.etat, demande: geste?.demande },
      { commentaire: commentaire.id, geste: "ask", ticket: 30, etat: "pris", demande: attendue.request },
    );
    assert.match(attendue.request, /^Je te demande à propos de l'issue #30 \(« Ticket 30 »\)\. Voici le contexte que je viens d'écrire : « the export is slow on big files »\./);
    assert.ok(reponse.startsWith(`**Done** — [ask #30](${commentaire.url}): the request for the second is “Je te demande à propos de l'issue #30`), reponse);
    // Rien n'est posté sur l'issue : c'est l'app qui écrit la demande dans le second.
    assert.deepEqual([b.gh.commentaires, b.compte.commentaires], [[], []]);

    const sansContexte = await b.poster("/brigade ask #30");
    assert.match(sansContexte.tableau.gestes?.at(-1)?.demande ?? "", /Je n'ai pas de contexte à ajouter\./);
    const absente = await b.poster("/brigade ask #99");
    assert.equal(absente.tableau.gestes?.at(-1)?.etat, "refuse");
    assert.equal(absente.tableau.gestes?.at(-1)?.demande, undefined);
  });

  test("la file du projet est publiée dans le tableau : le second la lit sans ssh, le bloc `awaiting` de `status` mot pour mot", async (t) => {
    const b = await box(t);
    const vide = laFileDuSecond(b.corps());
    assert.ok(vide.lue, "la file se lit du corps publié");
    assert.match(vide.texte, /^awaiting {3}nothing awaits the chef\n(?:.*\n)*end awaiting\n/);

    b.noter({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } }, "runtime");
    b.tick();
    await jusqua(() => b.bloc().file.length === 1);
    const lue = laFileDuSecond(b.corps());
    assert.ok(lue.lue);
    // Ce que `status` écrit sur la box à la même heure, de sa tête à sa fin.
    const status = photoDuProjet({ BRIGADE_STATE_DIR: b.repertoire }, { maintenant: new Date(lue.lu) });
    const tete = status.findIndex((ligne) => ligne.startsWith("awaiting "));
    const awaiting = status.slice(tete, status.indexOf("end awaiting", tete) + 1);
    assert.match(awaiting[0] ?? "", /^awaiting {3}1 decision awaits the chef/);
    assert.ok(awaiting.some((ligne) => ligne.startsWith("  breaker  ")), awaiting.join("\n"));
    assert.ok(lue.texte.startsWith(`${awaiting.join("\n")}\n\n`), lue.texte);
    // Puis l'état de la cuisine que le tableau porte, dans la forme de `status`.
    assert.match(lue.texte, /\nswitch {5}/);
    assert.match(lue.texte, /\ncooks {6}/);
  });

  test("un tableau écrit par une box d'avant la file publiée le dit, au lieu d'une file vide", () => {
    const { fileDeStatus: _file, ...avant } = { projet: PROJET, lu: "2026-10-08T10:00:00.000Z", file: [], bilans: [], cuisine: { rubriques: [] }, fileDeStatus: [] } as unknown as Tableau;
    const lue = laFileDuSecond(ecrireLeBloc(avant, new Date("2026-10-08T10:00:00.000Z")));
    assert.deepEqual(lue, { lue: false, raison: "the board was written by a box that does not publish the project's queue yet: update the box" });
    assert.equal(laFileDuSecond("no block here").lue, false);
  });
});

test("la grammaire lit `comment` et `ask` : le texte et le contexte vont jusqu'au bout du commentaire", () => {
  assert.deepEqual(lireLeGeste("/brigade comment #12 first line\nsecond line"), { verbe: "comment", ticket: 12, texte: "first line\nsecond line" });
  assert.deepEqual(lireLeGeste("/brigade comment 12"), { incompris: "comment needs the comment to post after the ticket number" });
  assert.deepEqual(lireLeGeste("/brigade ask #12"), { verbe: "ask", ticket: 12, contexte: null });
  assert.deepEqual(lireLeGeste("/brigade ask #12 why is it slow?\nsince Monday"), { verbe: "ask", ticket: 12, contexte: "why is it slow?\nsince Monday" });
  assert.deepEqual(lireLeGeste("/brigade ask"), { incompris: "ask needs the ticket number" });
});
