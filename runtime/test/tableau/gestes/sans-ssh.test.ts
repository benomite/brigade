// Ce que l'app faisait par ssh sur la box, joué depuis le tableau de la
// cuisine (#1843) : le plafond de cooks d'une station, l'arrêt et la reprise de
// la cuisine, un commentaire sur l'issue d'une carte, la demande au second — et
// la file du projet, que le second lit à son ouverture. Chaque fois, le chef
// poste un commentaire sous le tableau, et ce qu'il a fait se lit sur GitHub
// seul : la réponse sous son geste, le corps du tableau réécrit, l'issue
// commentée, la réponse du second sous le geste. Le runtime est un vrai, son
// tick fait passer la box ; GitHub est un faux client, et le second du projet
// une doublure de `claude -p` dans le dossier où il tourne.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../src/evenements.ts";
import { demanderAuSecond } from "../../../src/issue-ticket.ts";
import { demarrer } from "../../../src/runtime.ts";
import { lireLaConversation } from "../../../src/second/conversation.ts";
import { photoDuProjet } from "../../../src/status.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "../../../src/tableau/gestes/client.ts";
import { gestesDuTableau } from "../../../src/tableau/gestes/gestes.ts";
import { lireLeGeste } from "../../../src/tableau/gestes/grammaire.ts";
import { secondDuProjet, type SecondDuTableau } from "../../../src/tableau/gestes/second.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import { ecrireLeBloc, laFileDuSecond, lireLeTableau, REPONSE_DU_SECOND_AU_BLOC, type Tableau } from "../../../src/tableau/rendu/bloc.ts";
import { fauxGitHub, issue } from "../../aides/cuisine.ts";
import { aArreter, DEPOT, ENV_ENFANT, jusqua, repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const TABLEAU = 1;
const CHEF = "acme";
const MINUTE = 60_000;

// La box d'un projet, son tableau publié et les gestes qu'elle y lit, branchés
// comme main.ts les branche. `gh` : le GitHub des actions ; `compte` : celui
// du `gh` de la box, le compte du chef. `second` : le second du projet, quand
// la box le tient.
async function box(t: TestContext, { second = null }: { second?: SecondDuTableau | null } = {}) {
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
  const gestes = gestesDuTableau({ client: sousLeTableau, journal: runtime.journal, projet: PROJET, github: gh.github, githubDuChef: compte.github, repertoireEtat: repertoire, second, avertir: (ligne) => avertis.push(ligne) });
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
    const avant = reponses.length;
    const commentaire = ajouter(texte);
    tick();
    await jusqua(() => bloc().gestes?.some((geste) => geste.commentaire === commentaire.id) === true);
    // La réponse de la box à ce geste — celle du second, s'il en est, vient après.
    const reponse = reponses[avant] ?? "";
    assert.doesNotMatch(reponse, /\n/, "une ligne");
    return { commentaire, reponse, tableau: bloc() };
  };
  return { repertoire, noter, gh, compte, avertis, bloc, tick, poster, reponses, corps: () => corps };
}

// La doublure de `claude -p` du second : son lancement et ce qu'elle a lu sur
// son entrée notés, le message rangé avec sa réponse dans la dernière session
// du dossier — comme Claude Code les range —, et la réponse écrite sur sa
// sortie. `FAUX_SECOND_ECHEC` : elle échoue, comme `claude` sans quota.
const FAUX_CLAUDE = String.raw`
const fs = require("node:fs");
const path = require("node:path");
let texte = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (texte += morceau));
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAUX_SECOND_TEMOIN, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), texte }) + "\n");
  if (process.env.FAUX_SECOND_ECHEC) {
    process.stderr.write("Error: " + process.env.FAUX_SECOND_ECHEC + "\n");
    process.exit(1);
  }
  const dossier = path.join(process.env.CLAUDE_CONFIG_DIR, "projects", process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
  const [session] = fs.readdirSync(dossier).filter((nom) => nom.endsWith(".jsonl"));
  const ranger = (entree) => fs.appendFileSync(path.join(dossier, session), JSON.stringify({ sessionId: session.slice(0, -6), isSidechain: false, timestamp: new Date().toISOString(), ...entree }) + "\n");
  ranger({ type: "user", message: { role: "user", content: texte } });
  ranger({ type: "assistant", message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "Heard: " + texte }] } });
  process.stdout.write("Heard: " + texte + "\n");
});
`;
const SESSION = "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e";

// Le second du projet, tenu par la box : son dossier, où le desktop a déjà une
// session, et le `claude` que le PATH donne — la doublure. Sous Windows, son
// lanceur `.cmd` et le Git Bash que Claude Code exige.
function secondTenu(t: TestContext, env: Record<string, string> = {}) {
  const racine = repertoireTemporaire(t);
  const outils = join(racine, "outils");
  const dossier = join(racine, "brigade");
  const claude = join(racine, "claude");
  mkdirSync(outils);
  mkdirSync(dossier);
  const temoin = join(racine, "lancements.jsonl");
  writeFileSync(temoin, "");
  const script = join(racine, "faux-claude.cjs");
  writeFileSync(script, FAUX_CLAUDE);
  const sien: Record<string, string> = { ...ENV_ENFANT, PATH: outils, HOME: racine, CLAUDE_CONFIG_DIR: claude, FAUX_SECOND_TEMOIN: temoin, BRIGADE_SECOND_DIR: dossier, ...env };
  if (process.platform === "win32") {
    writeFileSync(join(outils, "claude.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
    for (const outil of ["gh", "git", "ssh"]) writeFileSync(join(outils, `${outil}.cmd`), "@echo off\r\n");
    sien.CLAUDE_CODE_GIT_BASH_PATH = join(outils, "bash.exe");
    writeFileSync(sien.CLAUDE_CODE_GIT_BASH_PATH, "");
  } else {
    writeFileSync(join(outils, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    for (const outil of ["gh", "git", "ssh"]) writeFileSync(join(outils, outil), "#!/bin/sh\n");
    for (const outil of ["claude", "gh", "git", "ssh"]) chmodSync(join(outils, outil), 0o755);
  }
  const transcripts = join(claude, "projects", realpathSync(dossier).replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(transcripts, { recursive: true });
  const desktop = [
    { type: "user", timestamp: "2026-10-23T08:01:00.000Z", message: { role: "user", content: "What blocks #15?" } },
    { type: "assistant", timestamp: "2026-10-23T08:01:10.000Z", message: { id: "msg_b", role: "assistant", content: [{ type: "text", text: "Nothing: it waits for a cook." }] } },
  ];
  writeFileSync(join(transcripts, `${SESSION}.jsonl`), desktop.map((entree) => `${JSON.stringify({ sessionId: SESSION, isSidechain: false, ...entree })}\n`).join(""));
  const second = secondDuProjet(sien);
  assert.ok(second !== null, "la box tient le second : sa ligne nomme son dossier");
  return {
    second,
    dossier,
    conversation: () => lireLaConversation({ claude, dossier }),
    lancements: () =>
      readFileSync(temoin, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((ligne) => JSON.parse(ligne) as { args: string[]; cwd: string; texte: string }),
  };
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
    // Cette box ne tient pas le second : la demande n'est que publiée, l'app l'y écrit.
    assert.equal(geste?.second, undefined);
  });

  test("`/brigade ask #30 …` sur la box qui tient le second du projet : la demande entre dans sa conversation, et sa réponse est postée sous le geste et portée par le tableau", async (t) => {
    const leSecond = secondTenu(t);
    const b = await box(t, { second: leSecond.second });
    const attendue = await demanderAuSecond(fauxGitHub(issue(30)).github, 30, "the export is slow");
    assert.ok(attendue.done);
    const { commentaire, reponse, tableau } = await b.poster("/brigade ask #30 the export is slow");
    assert.ok(reponse.startsWith(`**Done** — [ask #30](${commentaire.url}): the request for the second is “`), reponse);
    assert.match(reponse, /— cost: one turn of the project's second, in its own conversation/);
    assert.ok(["attendu", "repondu"].includes(tableau.gestes?.at(-1)?.second?.etat ?? ""), JSON.stringify(tableau.gestes?.at(-1)));

    // Le second l'a reçue, dans la conversation que le desktop et le téléphone lisent.
    await jusqua(() => b.reponses.length === 2);
    assert.deepEqual(leSecond.lancements(), [{ args: ["--continue", "-p"], cwd: realpathSync(leSecond.dossier), texte: attendue.request }]);
    const conversation = leSecond.conversation().messages.slice(-2).map(({ from, text }) => `${from}: ${text}`);
    assert.deepEqual(conversation, [`chef: ${attendue.request}`, `second: Heard: ${attendue.request}`]);

    // Sa réponse, sous le geste ; puis, au tick suivant, dans le bloc du tableau.
    assert.equal(b.reponses[1], `**The second's answer** — [ask #30](${commentaire.url}):\n\nHeard: ${attendue.request}`);
    b.tick();
    await jusqua(() => b.bloc().gestes?.at(-1)?.second?.etat === "repondu");
    assert.deepEqual(b.bloc().gestes?.at(-1)?.second, { etat: "repondu", reponse: `Heard: ${attendue.request}`, coupee: false });
    assert.deepEqual([b.gh.commentaires, b.compte.commentaires], [[], []], "rien n'est posté sur l'issue");
  });

  test("un second qui échoue le dit sous le geste et sur le tableau", async (t) => {
    const enEchec = secondTenu(t, { FAUX_SECOND_ECHEC: "Credit balance is too low" });
    const b = await box(t, { second: enEchec.second });
    const { commentaire } = await b.poster("/brigade ask #30");
    await jusqua(() => b.reponses.length === 2);
    assert.equal(b.reponses[1], `**The second did not answer** — [ask #30](${commentaire.url}): the second failed — Credit balance is too low`);
    b.tick();
    await jusqua(() => b.bloc().gestes?.at(-1)?.second?.etat === "echec");
    assert.deepEqual(b.bloc().gestes?.at(-1)?.second, { etat: "echec", raison: "the second failed — Credit balance is too low" });
  });

  test("une longue réponse du second est entière sous le geste, coupée dans le bloc", async (t) => {
    const long = "x".repeat(REPONSE_DU_SECOND_AU_BLOC + 10);
    const bavard: SecondDuTableau = { demander: async () => ({ repondu: true, texte: long }) };
    const c = await box(t, { second: bavard });
    await c.poster("/brigade ask #30");
    await jusqua(() => c.reponses.length === 2);
    assert.ok(c.reponses[1]?.endsWith(`:\n\n${long}`));
    c.tick();
    await jusqua(() => c.bloc().gestes?.at(-1)?.second?.etat === "repondu");
    assert.deepEqual(c.bloc().gestes?.at(-1)?.second, { etat: "repondu", reponse: `${long.slice(0, REPONSE_DU_SECOND_AU_BLOC)}…`, coupee: true });
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

test("sans `BRIGADE_SECOND_DIR`, la box ne tient pas le second du projet", () => {
  assert.equal(secondDuProjet({}), null);
  assert.equal(secondDuProjet({ BRIGADE_SECOND_DIR: "" }), null);
});

test("la grammaire lit `comment` et `ask` : le texte et le contexte vont jusqu'au bout du commentaire", () => {
  assert.deepEqual(lireLeGeste("/brigade comment #12 first line\nsecond line"), { verbe: "comment", ticket: 12, texte: "first line\nsecond line" });
  assert.deepEqual(lireLeGeste("/brigade comment 12"), { incompris: "comment needs the comment to post after the ticket number" });
  assert.deepEqual(lireLeGeste("/brigade ask #12"), { verbe: "ask", ticket: 12, contexte: null });
  assert.deepEqual(lireLeGeste("/brigade ask #12 why is it slow?\nsince Monday"), { verbe: "ask", ticket: 12, contexte: "why is it slow?\nsince Monday" });
  assert.deepEqual(lireLeGeste("/brigade ask"), { incompris: "ask needs the ticket number" });
});
