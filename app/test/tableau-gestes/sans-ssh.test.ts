// Le critère du ticket 1845 : sans `ssh` — aucun dans le PATH, aucun `hote` au projet —, régler le plafond, arrêter et
// relancer une station, commenter depuis une carte et demander au second aboutissent, et l'app dit ce qu'il en est ; le
// second lit la file du projet à son ouverture. Chaque geste est joué par le module que le process principal appelle
// pour lui (main.ts) ; il part sur le tableau de la cuisine, et c'est une vraie box qui le joue : le runtime, son tick
// et ses gestes du tableau branchés comme runtime/src/main.ts les branche (runtime/test/tableau/gestes/sans-ssh.test.ts).
// Entre les deux, GitHub est une doublure : les commentaires sous le tableau et son corps, que la box réécrit.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../runtime/src/evenements.ts";
import { demanderAuSecond as composerLaDemande } from "../../../runtime/src/issue-ticket.ts";
import { demarrer } from "../../../runtime/src/runtime.ts";
import type { ClientDesGestes as GestesDeLaBox, CommentaireDuTableau } from "../../../runtime/src/tableau/gestes/client.ts";
import { gestesDuTableau as gestesDeLaBox } from "../../../runtime/src/tableau/gestes/gestes.ts";
import type { SecondDuTableau } from "../../../runtime/src/tableau/gestes/second.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../../runtime/src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../runtime/src/tableau/publication/publier.ts";
import { lireLeTableau, type Tableau } from "../../../runtime/src/tableau/rendu/bloc.ts";
import { fauxGitHub, issue } from "../../../runtime/test/aides/cuisine.ts";
import { aArreter, DEPOT, jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { cuireSurLaStation } from "../../src/cuisson.ts";
import { commenter, demanderAuSecond } from "../../src/discussion.ts";
import type { StationDesFaits } from "../../src/ordinaires.ts";
import { reglerLePlafond } from "../../src/plafond.ts";
import { contexteDeLaFile, lireLaFile } from "../../src/second/file.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { gestesDuCorps, type ClientDesGestes, type DecisionDuChef } from "../../src/tableau-gestes/gestes.ts";
import { jouerAuTableau } from "../../src/tableau-gestes/rail.ts";

const PROJET = "brigade";
const STATION = "box/claude";
const NUMERO = 1;
const CHEF = "acme";
const MINUTE = 60_000;
// Le projet tel que le fichier des projets le déclare : ni `hote`, ni box.
const DECLARE = { nom: PROJET, dossier: "/projets/brigade" };

// Ni `ssh` dans le PATH, ni `hote` : le `ssh` que l'app lancerait (`BRIGADE_SSH_BIN`) note chaque appel et échoue.
function sansSsh(t: TestContext): () => boolean {
  const dossier = repertoireTemporaire(t);
  const vide = join(dossier, "rien");
  mkdirSync(vide);
  const appels = join(dossier, "appels-ssh");
  const ssh = join(dossier, process.platform === "win32" ? "ssh.cmd" : "ssh");
  writeFileSync(ssh, process.platform === "win32" ? `@echo %* >> "${appels}"\r\n@exit /b 255\r\n` : `#!/bin/sh\necho "$@" >> '${appels}'\nexit 255\n`);
  chmodSync(ssh, 0o755);
  const avant = { PATH: process.env.PATH, BRIGADE_SSH_BIN: process.env.BRIGADE_SSH_BIN };
  process.env.PATH = vide;
  process.env.BRIGADE_SSH_BIN = ssh;
  t.after(() => {
    for (const [cle, valeur] of Object.entries(avant)) valeur === undefined ? delete process.env[cle] : (process.env[cle] = valeur);
  });
  return () => existsSync(appels);
}

// La box du projet, son tableau sur GitHub, et l'app qui y poste ses gestes et les suit. `second` : le second du projet,
// quand la box le tient.
async function cuisine(t: TestContext, { second = null }: { second?: SecondDuTableau | null } = {}) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-29T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: PROJET, maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const noter = (fait: Fait, author: string) => runtime.journal.ajouter({ project: PROJET, ticket: null, author, ...fait });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } }, `station:${STATION}`);

  // GitHub : l'issue du tableau — son corps, que la box réécrit — et ses commentaires.
  let corps = "";
  const vue = (): IssueDuTableau => ({ numero: NUMERO, ouverte: true, titre: "Kitchen board", corps, labels: ["kitchen-board", "hors-cuisine"] });
  const publication: ClientDuTableau = {
    auLabel: async () => (corps === "" ? [] : [vue()]),
    issue: async () => (corps === "" ? null : vue()),
    async creer({ corps: premier }) {
      corps = premier;
      return NUMERO;
    },
    async ecrireCorps(_numero, nouveau) {
      corps = nouveau;
    },
    rouvrir: async () => {},
    epingler: async () => false,
  };
  const commentaires: CommentaireDuTableau[] = [];
  let id = 7000;
  const ajouter = (texte: string) => {
    id += 1;
    const commentaire = { id, auteur: CHEF, corps: texte, le: new Date(instant).toISOString(), url: `https://github.com/${DEPOT}/issues/${NUMERO}#issuecomment-${id}` };
    commentaires.push(commentaire);
    return commentaire;
  };
  const sousLeTableau: GestesDeLaBox = {
    commentaires: async (_numero, depuis) => commentaires.filter((commentaire) => depuis === null || commentaire.le >= depuis).map((commentaire) => ({ ...commentaire })),
    repondre: async (_numero, texte) => void ajouter(texte),
    compteDuChef: async () => CHEF,
  };
  const gh = fauxGitHub(issue(30));
  const compte = fauxGitHub(issue(30));
  const gestes = gestesDeLaBox({ client: sousLeTableau, journal: runtime.journal, projet: PROJET, github: gh.github, githubDuChef: compte.github, repertoireEtat: repertoire, second, avertir: () => {} });
  brancherLeTableau(runtime, { client: publication, depot: DEPOT, maintenant, dire: () => {}, avertir: () => {}, gestes });
  await jusqua(() => corps !== "");

  // L'app : le tableau lu par l'API de GitHub, et ses gestes postés sous lui avec le compte du chef.
  const appeler: AppelGitHub = async (chemin) => {
    assert.match(chemin, new RegExp(`^/repos/${DEPOT}/issues\\?labels=kitchen-board`), `seul le tableau est lu : ${chemin}`);
    return { status: 200, data: [{ number: NUMERO, title: "Kitchen board", body: corps, html_url: `https://github.com/${DEPOT}/issues/${NUMERO}` }] };
  };
  const postes: string[] = [];
  let dernierPoste = 0;
  const client: ClientDesGestes = {
    poster: async (_depot, _numero, texte) => {
      postes.push(texte);
      const { id: posteId, url } = ajouter(texte);
      dernierPoste = posteId;
      return { id: posteId, url };
    },
    gestesDuTableau: async () => gestesDuCorps(corps),
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler });
  assert.ok(lu.lu, "lu" in lu && !lu.lu ? lu.raison : "");
  // Attendre la box, c'est la laisser passer une minute : son tick lit le geste, le joue, et réécrit le tableau.
  const attente = {
    essais: 3,
    dormir: async () => {
      instant += MINUTE;
      t.mock.timers.tick(MINUTE);
      await jusqua(() => gestesDuCorps(corps)?.some((geste) => geste.commentaire === dernierPoste) === true);
    },
  };
  const auTableau = (decision: DecisionDuChef) => jouerAuTableau(lu, decision, client, attente);
  const bloc = (): Tableau => {
    const relu = lireLeTableau(corps);
    assert.ok(relu.lu);
    return relu.tableau;
  };
  const laStation = () => {
    const stations = (bloc().faits?.stations ?? []) as StationDesFaits[] & Array<{ plafond: number | null }>;
    return stations.find(({ station }) => station === STATION) ?? assert.fail(`${STATION} n'est pas sur le tableau`);
  };
  return { auTableau, appeler, postes, compte, gh, laStation, stations: () => (bloc().faits?.stations ?? []) as StationDesFaits[] };
}

describe("sans ssh, les gestes qui passaient par la box partent par le tableau de la cuisine, et l'app dit ce qu'il en est", () => {
  test("régler le plafond de cooks : `/brigade cooks 3`, joué par la box — l'app dit le plafond neuf, le tableau aussi", async (t) => {
    const sshAppele = sansSsh(t);
    const c = await cuisine(t);
    assert.equal(c.laStation().plafond, 2);
    const rendu = await reglerLePlafond([PROJET], "3", (_projet, decision) => c.auTableau(decision));
    assert.deepEqual(rendu, { fait: "the cap is 3" });
    assert.deepEqual(c.postes, ["/brigade cooks 3"]);
    assert.equal(c.laStation().plafond, 3);
    assert.equal(sshAppele(), false, "aucun ssh n'est lancé");
  });

  test("arrêter puis relancer une station : `/brigade station stop|start`, joué par la box — la ligne dit ce qui est fait", async (t) => {
    const sshAppele = sansSsh(t);
    const c = await cuisine(t);
    assert.equal(c.laStation().cuisson, "cooking");
    const arretee = await cuireSurLaStation(PROJET, c.stations(), STATION, "stop", c.auTableau);
    assert.ok("fait" in arretee, JSON.stringify(arretee));
    assert.equal(arretee.fait, `${STATION} stops cooking ${PROJET}: it takes no more tickets, its running cooks finish`);
    assert.equal(c.laStation().cuisson, "stopped");
    const relancee = await cuireSurLaStation(PROJET, c.stations(), STATION, "start", c.auTableau);
    assert.ok("fait" in relancee, JSON.stringify(relancee));
    assert.equal(relancee.fait, `${STATION} cooks ${PROJET} again: it takes its tickets at the runtime's next read`);
    assert.equal(c.laStation().cuisson, "cooking");
    assert.deepEqual(c.postes, [`/brigade station stop ${STATION}`, `/brigade station start ${STATION}`]);
    assert.equal(sshAppele(), false, "aucun ssh n'est lancé");
  });

  test("commenter depuis une carte : la box poste le commentaire sur l'issue, mot pour mot, sous le compte du chef — l'app dit ce qu'il coûte", async (t) => {
    const sshAppele = sansSsh(t);
    const c = await cuisine(t);
    const rendu = await commenter(c.auTableau, DECLARE, 30, "  The CSV export misses the header row.\r\n\r\nSee the attached file.  ");
    assert.ok(rendu.poste, JSON.stringify(rendu));
    assert.match(rendu.prix, /^a comment is posted on issue #30, under the box's own gh account/);
    assert.deepEqual(c.compte.commentaires, [[30, "The CSV export misses the header row.\n\nSee the attached file."]]);
    assert.deepEqual(c.gh.commentaires, []);
    const refuse = await commenter(c.auTableau, DECLARE, 99, "Hello");
    assert.deepEqual(refuse, { poste: false, refus: "nothing was posted: #99 has no GitHub issue: it does not exist, or is gone" });
    assert.equal(sshAppele(), false, "aucun ssh n'est lancé");
  });

  test("demander au second : la box compose la demande et la publie — l'app la reçoit, telle qu'elle l'écrira dans le second", async (t) => {
    const sshAppele = sansSsh(t);
    const c = await cuisine(t);
    const attendue = await composerLaDemande(fauxGitHub(issue(30)).github, 30, "the export is slow\non big files");
    assert.ok(attendue.done);
    const rendu = await demanderAuSecond(c.auTableau, DECLARE, 30, "the export is slow\r\non big files");
    assert.deepEqual(rendu, { demande: attendue.request });
    assert.deepEqual([c.gh.commentaires, c.compte.commentaires], [[], []], "rien n'est posté sur l'issue");
    const absente = await demanderAuSecond(c.auTableau, DECLARE, 99, "");
    assert.ok("refus" in absente && absente.refus.startsWith("nothing was written: #99 has no GitHub issue"), JSON.stringify(absente));
    assert.equal(sshAppele(), false, "aucun ssh n'est lancé");
  });

  test("demander au second, quand la box le tient : elle le lui envoie, et l'app dit où vient sa réponse", async (t) => {
    sansSsh(t);
    const c = await cuisine(t, { second: { demander: async () => ({ repondu: true, texte: "It is the CSV writer." }) } });
    const rendu = await demanderAuSecond(c.auTableau, DECLARE, 30, "");
    assert.ok("auSecond" in rendu, JSON.stringify(rendu));
  });

  test("à son ouverture, le second lit la file du projet sur le tableau : le bloc `awaiting` que la box publie, mot pour mot", async (t) => {
    const sshAppele = sansSsh(t);
    const c = await cuisine(t);
    const lue = await lireLaFile(c.appeler, DEPOT);
    assert.ok(lue.lue, JSON.stringify(lue));
    const contexte = contexteDeLaFile({ nom: PROJET, depot: DEPOT }, lue);
    assert.match(contexte, /\n\nawaiting {3}nothing awaits the chef\nend awaiting\n\nproject {4}brigade\n/);
    assert.doesNotMatch(contexte, /file non lue/);
    assert.equal(sshAppele(), false, "aucun ssh n'est lancé");
  });
});
