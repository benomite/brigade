// #3938 : la question d'un cook sur une station sans manager. Elle est postée sur
// l'issue pour le manager d'une autre station du projet, qui y répond ; sans
// manager dans tout le projet, le ticket est rendu au rail. Jamais un échec, ni
// une mise de côté. Deux stations d'un même projet sur un faux GitHub partagé,
// comme BOBL-tech/mirrorlab#842 : le Mac sans manager, la box qui en fait
// tourner un — GitHub le montre par sa prise du travail du manager sur une autre issue.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_DE_LA_CONSULTATION, MARQUE_DE_REPONSE } from "../../src/blocage-au-manager.ts";
import { ATTENTE_MS, ECHECS_MAX, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { suiteDuConflitBloque } from "../../src/conflit-main/conflit-main.ts";
import { MARQUE_DU_CONFLIT_MAIN } from "../../src/conflit-main/renvoi.ts";
import { attenteDeLIssue } from "../../src/attente-github/attente-github.ts";
import { LABEL_PARKED, LABEL_TAKEN, LABELS_D_AVANT_PARKED } from "../../src/github-etat/etats.ts";
import { corpsDePriseDuManager } from "../../src/github-etat/prise-du-manager.ts";
import { HORS_CUISINE, type GitHub } from "../../src/github.ts";
import { corpsDeLaQuestion, corpsDeLaReprise, questionEnSuspens } from "../../src/manager/question-sans-manager.ts";
import { corpsDeLIncapacite } from "../../src/routage-station/routage-station.ts";
import { MARQUE_D_ATTENTE, MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

// Les marques que la station écrit sur l'issue.
const MARQUE_DE_LA_QUESTION = "<!-- brigade:question-au-manager";
const MARQUE_DE_LA_REPRISE = "<!-- brigade:question-reprise";
const N = 842;
const CALIBRE = ["fire", "model:opus", "effort:medium", "prio:0"];
const MAC = "macbook-air-de-benoit/claude";
const BOX = "parade-box/claude";
const QUESTION = "Which fixture do I use for the mirror test?";
const REPONSE = "use test/fixtures/mirror.json, it is the one the CI loads";
const TECHNIQUE = JSON.stringify({ issue: "technique", reponse: REPONSE, decision: "the mirror fixture is test/fixtures/mirror.json", question_en: QUESTION });
const VIEUX_MOTIF = "no manager to consult";
const PANNE = "The test runner crashed";
const DEBUT = Date.parse("2026-11-19T10:00:00Z");

// `cook(n, consigne)` : le message du n-ième cook de la station, qui reçoit sa consigne.
type Options = { manager: boolean; cook: (n: number, consigne: string) => string; horloge?: { a: number }; github?: (client: GitHub) => GitHub };

function station(t: TestContext, faux: FauxGitHub, nom: string, { manager, cook, horloge, github }: Options) {
  const repertoire = mkdtempSync(join(tmpdir(), "question-sans-manager-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const consignes: string[] = [];
  const consultations: string[] = [];
  const lancer: Lancer = ({ args, flux, entree }) => {
    const consigne = [...args, entree ?? ""].join("\n");
    const consulte = (entree ?? "").startsWith(MARQUE_DE_LA_CONSULTATION);
    if (consulte) consultations.push(consigne);
    else consignes.push(consigne);
    const message = consulte ? TECHNIQUE : cook(consignes.length, consigne);
    // Un cook en panne : son run finit en erreur.
    const panne = message.startsWith(PANNE);
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: panne, result: message })}\n`);
    return { fin: Promise.resolve({ code: panne ? 1 : 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const sauts = new Map<number, string>();
  const client = fauxClient(faux, nom);
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom,
    github: github === undefined ? client : github(client),
    depot: depotNeuf(repertoire),
    ...(manager ? { manager: () => ({ model: "opus", effort: "high" }) } : {}),
    ...(horloge === undefined ? {} : { maintenant: () => new Date(horloge.a) }),
    flux: repertoire,
    lancer,
    avertir: () => {},
    sauter: (ticket, ligne) => void sauts.set(ticket, ligne),
    stationsDuProjet: () => [nom],
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
    return sauts.get(N) ?? null;
  };
  return { tour, cooks: () => consignes.length, consignes, consultations };
}

const bloque = (question = QUESTION) => `I stopped.\n<livrable>\n<bloque>${question}</bloque>\n</livrable>`;
const commentaires = (faux: FauxGitHub) => (faux.commentaires.get(N) ?? []).map((c) => c.body);
const du = (faux: FauxGitHub, marque: string) => commentaires(faux).filter((corps) => corps.startsWith(marque));

// La box fait tourner un manager : sa prise du travail du manager se lit sur #3000, une autre issue du projet.
function projetAvecLaBox(faux: FauxGitHub) {
  faux.feu(3000, ["model:opus"]);
  faux.poster(3000, BOX, corpsDePriseDuManager(BOX, "abc123", "0f0f0f0f"));
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
}

test("on a station with no manager, the cook's question is posted on the issue, and the answer of the manager on another station reaches the cook", async (t) => {
  const faux = new FauxGitHub();
  projetAvecLaBox(faux);
  // Chaque cook du Mac s'arrête sur une question : la première, puis une autre.
  const mac = station(t, faux, MAC, { manager: false, cook: (n) => bloque(n === 1 ? QUESTION : "Where do the mirror logs go?") });
  const box = station(t, faux, BOX, { manager: true, cook: () => bloque("Another question of the box's cook.") });

  await mac.tour();
  assert.equal(mac.cooks(), 1);
  const [posee] = du(faux, MARQUE_DE_LA_QUESTION);
  assert.ok(posee !== undefined, commentaires(faux).join("\n---\n"));
  assert.match(posee, new RegExp(`^${MARQUE_DE_LA_QUESTION} station=macbook-air-de-benoit/claude -->`));
  assert.ok(posee.includes(`> ${QUESTION}`), posee);
  assert.match(posee, /A manager of the project runs on `parade-box\/claude`/);
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false, "the ticket is given back");
  assert.equal(du(faux, MARQUE_D_ATTENTE).length, 0, "it does not wait: the box can take it at once");

  // Le Mac ne reprend pas le ticket tant que sa question attend le manager de la box.
  assert.match((await mac.tour()) ?? "", /its cook's question awaits the manager on parade-box\/claude: this station has none/);
  assert.equal(mac.cooks(), 1);

  // La box le prend, passe la question à son manager avant tout cook : sa réponse s'écrit sur l'issue.
  await box.tour();
  assert.deepEqual(box.consultations.length, 1);
  assert.ok(box.consultations[0]?.includes(`<question>\n${QUESTION}\n</question>`), box.consultations[0] ?? "");
  assert.equal(box.cooks(), 0, "the manager answers before any cook of the box");
  assert.equal(du(faux, MARQUE_DE_LA_REPRISE).length, 1);
  const [reponse] = du(faux, MARQUE_DE_REPONSE);
  assert.ok(reponse?.includes(REPONSE), commentaires(faux).join("\n---\n"));

  // La question n'attend plus : le Mac reprend le ticket, et son cook lit la réponse.
  await mac.tour();
  assert.equal(mac.cooks(), 2);
  assert.ok(mac.consignes[1]?.includes(REPONSE), mac.consignes[1] ?? "");
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 0);
  assert.equal(commentaires(faux).some((corps) => corps.includes(VIEUX_MOTIF)), false);
});

test("when no station of the project runs a manager, the ticket is given back to the rail after the cook's question, and waits before a cook takes it again", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
  const horloge = { a: DEBUT };
  const mac = station(t, faux, MAC, { manager: false, cook: () => bloque(), horloge });
  await mac.tour();
  const [posee] = du(faux, MARQUE_DE_LA_QUESTION);
  assert.match(posee ?? "", /No other station of the project that can take this ticket runs a manager: the ticket is given back to the rail\./);
  assert.ok(posee?.includes(`> ${QUESTION}`), posee ?? "");
  const ticket = faux.ticket(N);
  assert.equal(ticket.labels.has("fire"), true, "on the rail");
  assert.equal(ticket.labels.has(LABEL_TAKEN), false);
  assert.equal([LABEL_PARKED, HORS_CUISINE, ...LABELS_D_AVANT_PARKED].some((label) => ticket.labels.has(label)), false);
  const [attente] = du(faux, MARQUE_D_ATTENTE);
  assert.match(attente ?? "", /^<!-- brigade:attente until=\d+ -->\nStation `macbook-air-de-benoit\/claude`: the ticket is given back to the rail/);
  assert.equal(Number(/until=(\d+)/.exec(attente ?? "")?.[1]), DEBUT + ATTENTE_MS);
  await mac.tour();
  assert.equal(mac.cooks(), 1, "it waits before a cook takes it again");
});

test("a ticket given back because no station runs a manager is never set aside, even after 3 or more such runs", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
  const horloge = { a: DEBUT };
  const mac = station(t, faux, MAC, { manager: false, cook: () => bloque(), horloge });
  for (let run = 1; run <= ECHECS_MAX + 2; run += 1) {
    await mac.tour();
    assert.equal(mac.cooks(), run, `run ${run}`);
    horloge.a += ATTENTE_MS + 60_000;
  }
  const ticket = faux.ticket(N);
  assert.equal(LABELS_D_AVANT_PARKED.some((label) => ticket.labels.has(label)), false);
  assert.equal(ticket.labels.has(LABEL_PARKED), false);
  assert.equal(ticket.labels.has(HORS_CUISINE), false);
  assert.equal(ticket.labels.has("fire"), true);
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 0);
  assert.equal(du(faux, MARQUE_DE_LA_QUESTION).length, ECHECS_MAX + 2);
});

test("the failed-cook counter of the ticket stays unchanged after a run that ended because the station has no manager", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
  // Une vraie panne déjà comptée, et deux arrêts d'avant où le manager n'a pas répondu.
  faux.poster(N, MAC, `${MARQUE_D_ECHEC} n=1 -->\nStation \`${MAC}\`: the cook stopped without a delivery — the tests crashed`);
  for (let n = 0; n < 2; n += 1) faux.poster(N, MAC, `${MARQUE_D_ATTENTE} until=1 manager -->\nStation \`${MAC}\`: the manager could not answer`);
  const mac = station(t, faux, MAC, { manager: false, cook: () => bloque() });
  await mac.tour();
  assert.equal(mac.cooks(), 1);
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 1, commentaires(faux).join("\n---\n"));
  assert.equal(du(faux, MARQUE_DE_LA_QUESTION).length, 1);
});

test("a real cook failure on a station with no manager still counts, and still parks the ticket at the existing limit — never for a missing manager", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
  // Chaque cook s'arrête sans livraison, sur une panne différente.
  const mac = station(t, faux, MAC, { manager: false, cook: (n) => `${PANNE} (${n}).` });
  for (let run = 1; run <= ECHECS_MAX; run += 1) {
    assert.equal(faux.ticket(N).labels.has(LABEL_PARKED), false, `not parked before run ${run}`);
    await mac.tour();
    assert.equal(du(faux, MARQUE_D_ECHEC).length, run, commentaires(faux).join("\n---\n"));
  }
  // Parqué par ses échecs (#4129) : `parked`, et sa marque dit qu'il attend le superviseur, pour ses échecs.
  assert.equal(faux.ticket(N).labels.has(LABEL_PARKED), true);
  // Plus jamais l'ancien `set-aside:failures`, ni aucun label d'avant `parked`.
  assert.equal(LABELS_D_AVANT_PARKED.some((label) => faux.ticket(N).labels.has(label)), false);
  const attente = attenteDeLIssue((faux.commentaires.get(N) ?? []).map((c) => ({ body: c.body, association: c.association })));
  assert.equal(attente?.who, "the supervisor");
  assert.equal(attente?.failures, true);
  const derniere = du(faux, MARQUE_D_ECHEC).at(-1) ?? "";
  assert.match(derniere, /Parked \(`parked`\) by its failure count/);
  assert.match(derniere, /No manager runs on this station to rework it\./);
  assert.equal(commentaires(faux).some((corps) => corps.includes(VIEUX_MOTIF)), false);
});

test("a station that runs a manager but cannot run the ticket's gates never takes it: the question does not wait for it, the ticket is given back to the rail", async (t) => {
  const faux = new FauxGitHub();
  projetAvecLaBox(faux);
  faux.poster(N, BOX, corpsDeLIncapacite({ station: BOX, vers: [MAC], question: "The gates cannot run here: docker is missing on this machine." }));
  const horloge = { a: DEBUT };
  const mac = station(t, faux, MAC, { manager: false, cook: () => bloque(), horloge });
  await mac.tour();
  assert.match(du(faux, MARQUE_DE_LA_QUESTION)[0] ?? "", /No other station of the project that can take this ticket runs a manager/);
  assert.equal(du(faux, MARQUE_D_ATTENTE).length, 1, commentaires(faux).join("\n---\n"));
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false);
  // Après l'attente, le Mac le reprend : la question n'attend pas la box, qui ne le prendrait jamais.
  horloge.a += ATTENTE_MS + 60_000;
  assert.equal(await mac.tour(), null);
  assert.equal(mac.cooks(), 2);
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 0);
});

test("the issue's comments cannot be read when the question is posted: no station is ruled out, the question waits for the manager on another station", async (t) => {
  const faux = new FauxGitHub();
  projetAvecLaBox(faux);
  // La lecture des commentaires du ticket échoue une fois, juste après le cook.
  const panne = { a: false };
  const mac = station(t, faux, MAC, {
    manager: false,
    cook: () => {
      panne.a = true;
      return bloque();
    },
    github: (client) => ({
      ...client,
      commentaires: async (numero: number) => {
        if (numero === N && panne.a) {
          panne.a = false;
          throw new Error("HTTP 502");
        }
        return client.commentaires(numero);
      },
    }),
  });
  await mac.tour();
  assert.match(du(faux, MARQUE_DE_LA_QUESTION)[0] ?? "", /A manager of the project runs on `parade-box\/claude`/, commentaires(faux).join("\n---\n"));
  assert.equal(du(faux, MARQUE_D_ATTENTE).length, 0);
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 0);
});

test("the stations of the project cannot be read on GitHub: the question is posted, the ticket is given back to the rail, and the issue says why", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nMirror the lab.");
  const mac = station(t, faux, MAC, {
    manager: false,
    cook: () => bloque(),
    github: (client) => ({ ...client, issuesDepuis: async () => Promise.reject(new Error("HTTP 502")) }),
  });
  await mac.tour();
  assert.match(du(faux, MARQUE_DE_LA_QUESTION)[0] ?? "", /The stations of the project that run a manager could not be read on GitHub: the ticket is given back to the rail\./);
  assert.equal(du(faux, MARQUE_D_ATTENTE).length, 1);
  assert.equal(faux.ticket(N).labels.has(LABEL_TAKEN), false);
  assert.equal(du(faux, MARQUE_D_ECHEC).length, 0);
});

test("a question awaits a manager until a station gives it to its own; only the repository's comments count", () => {
  const de = (body: string, association = "OWNER") => ({ body, association });
  const question = corpsDeLaQuestion({ station: MAC, question: `${QUESTION}\nSecond line.`, managers: [BOX] });
  assert.deepEqual(questionEnSuspens([de(question)]), { station: MAC, question: `${QUESTION}\nSecond line.` });
  assert.equal(questionEnSuspens([de(question), de(corpsDeLaReprise({ station: BOX, de: MAC }))]), null);
  assert.equal(questionEnSuspens([de(question, "NONE")]), null, "anyone can comment a public issue");
  assert.equal(questionEnSuspens([de(question), de(corpsDeLaReprise({ station: BOX, de: MAC }), "NONE")])?.station, MAC);
});

test("on the conflict path, a station with no manager sends the question back to its own cook, and its failure reason never says it has no manager to consult", async () => {
  const faux = new FauxGitHub();
  faux.feu(18);
  for (let n = 0; n < ECHECS_MAX; n += 1) faux.poster(18, "box", `${MARQUE_DU_CONFLIT_MAIN} origin/main:  -->`);
  const suite = await suiteDuConflitBloque(faux.pour("box"), { station: "box", ticket: 18, base: "main", branche: "cook/18-github", fichiers: ["src/a.ts"], question: "Which of the two versions of src/a.ts is right?" });
  assert.ok("echec" in suite, JSON.stringify(suite));
  assert.match(suite.echec, /its question goes back to its own cook with the conflict/);
  assert.doesNotMatch(suite.echec, new RegExp(VIEUX_MOTIF));
});
