// La réponse du chef à une validation, donnée sur le ticket lui-même (#3616) :
// la pass du chemin GitHub seul (`stationGitHub`) sur le faux GitHub, une
// livraison design verte retenue pour le chef, sa question posée en
// commentaire du ticket, et le chef qui y répond par un commentaire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ticketJoint } from "../../src/bac-a-sable/hors-github.ts";
import { brancheDuTicket, stationGitHub, type GitHubDuTour, type StationGitHub } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { MARQUE_DE_RENVOI } from "../../src/qualite-github.ts";
import { questionDuCorps, reponseDuCorps } from "../../src/reponse-validation/marques.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const TICKET = 40;
const PR = 1040;
const ECRAN = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];

// Un ticket en pass, sa PR design approuvée et verte, avec ses captures.
function enPass() {
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, LABEL_IN_PASS]);
  const sha = faux.sha();
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ECRAN });
  faux.poster(PR, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  return faux;
}

// La station A, où un humain valide les designs ; chaque cook lancé garde la
// consigne de son ticket, telle que la station la bâtit, et pousse une tête neuve.
function station(faux: FauxGitHub, avertis: string[] = [], pannes: Partial<GitHubDuTour> = {}) {
  const consignes: string[] = [];
  const lecteur = fauxClient(faux, "A");
  const github = { ...faux.pour("A"), prDeBranche: lecteur.prDeBranche, ...pannes };
  const s: StationGitHub = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    depotServi: "faux/depot",
    designsValidesParUnHumain: () => true,
    // Le modèle voit un choix de design : la livraison attend le chef (#3609).
    jugerLeChoixDeDesign: async () => ({ choix: "the layout of the rail" }),
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: "A", issue: ticket.number });
      consignes.push(ticketJoint({ number: ticket.number, title: "the ticket", body: "", commentaires: await lecteur.commentaires(ticket.number) }));
      const ouverte = faux.prs.findLast((p) => p.issue === ticket.number && p.state === "open");
      if (ouverte !== undefined) Object.assign(ouverte, { sha: faux.sha() });
      return { branche: brancheDuTicket(ticket.number) };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    avertir: (texte) => avertis.push(texte),
  });
  const { tour } = s;
  s.tour = async () => {
    await tour();
    await s.relu();
  };
  return { s, consignes };
}

async function tours(s: StationGitHub, n: number, jusqua: () => boolean = () => false) {
  for (let i = 0; i < n && !jusqua(); i += 1) {
    await s.tour();
    await s.calme();
  }
}

const commentaires = (faux: FauxGitHub) => faux.commentaires.get(TICKET) ?? [];
const renvois = (faux: FauxGitHub) => commentaires(faux).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
const reponses = (faux: FauxGitHub) => commentaires(faux).flatMap((c) => reponseDuCorps(c.body) ?? []);

// La question de la validation, posée sur le ticket par la cuisine.
const question = (faux: FauxGitHub, sha: string) => faux.poster(TICKET, "A", `<!-- brigade:validation-question pr=${PR} sha=${sha} -->\nDoes the screen of #${TICKET} look right? Reply \`validate\` to merge PR #${PR}, or reply with what to change.`);

// Le chef répond par un commentaire sur le ticket : pas une marque de la cuisine.
const chef = (faux: FauxGitHub, texte: string) => faux.poster(TICKET, "chef", texte);

// Le réglage on, une livraison design verte retenue pour le chef.
async function retenue(avertis: string[] = [], pannes: Partial<GitHubDuTour> = {}) {
  const faux = enPass();
  const { s, consignes } = station(faux, avertis, pannes);
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET), undefined);
  return { faux, s, consignes, sha: faux.pr(PR).sha };
}

test("a validating comment of the chef on the ticket, after the question, leads to the merge of its pull request; the answer is kept on the ticket, keyed by PR and commit", async () => {
  const { faux, s, sha } = await retenue();
  question(faux, sha);
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined, "held while the chef has not answered");
  chef(faux, "> Does the screen of #40 look right?\n\nValidate.");
  await tours(s, 3, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(reponses(faux), [{ pr: PR, sha, reponse: "validated" }]);
  assert.deepEqual(renvois(faux), []);
});

test("a send-back comment of the chef on the ticket puts the ticket back to a cook, whose instructions carry the chef's comment; nothing is merged and the answer is kept", async () => {
  const { faux, s, consignes, sha } = await retenue();
  question(faux, sha);
  const cuissons = faux.cuissons.length;
  chef(faux, "Make the take button stand out: it is lost among the cards.");
  await tours(s, 1);
  const [renvoi, ...autres] = renvois(faux);
  assert.deepEqual(autres, []);
  assert.ok(renvoi?.body.startsWith(`<!-- brigade:renvoi n=1 sha=${sha} -->\n`), renvoi?.body ?? "no send-back");
  assert.match(renvoi?.body ?? "", /the chef asks for these changes:\n\nMake the take button stand out: it is lost among the cards\./);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.deepEqual(reponses(faux), [{ pr: PR, sha, reponse: "sent-back" }]);
  assert.equal(faux.mergee(TICKET), undefined);
  // Un cook reprend le ticket : sa consigne porte le commentaire du chef.
  await tours(s, 6, () => faux.cuissons.length > cuissons);
  assert.ok(faux.cuissons.length > cuissons, "no cook took the ticket up again");
  assert.match(consignes.at(-1) ?? "", /Make the take button stand out: it is lost among the cards\./);
  // Une seconde réponse du chef ne renvoie plus rien : la question a reçu la sienne.
  chef(faux, "Also the colour.");
  await tours(s, 2);
  assert.equal(renvois(faux).length, 1);
});

test("a comment of the chef on a ticket with no pending validation triggers neither merge nor send-back", async () => {
  const { faux, s, sha } = await retenue();
  // Aucune question sur le ticket : la demande que la pass y a posée (#3615)
  // ôtée, le chef commente — elle se repose ensuite, après ses commentaires.
  faux.commentaires.set(TICKET, commentaires(faux).filter((c) => questionDuCorps(c.body) === null));
  chef(faux, "Validate.");
  chef(faux, "Make it bigger.");
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(renvois(faux), []);
  assert.deepEqual(reponses(faux), []);
  // Une question pour une autre PR, ou une question qu'un renvoi a dépassée, n'attend rien non plus.
  faux.poster(TICKET, "A", `<!-- brigade:validation-question pr=${PR + 1} sha=${sha} -->\nAnother PR.`);
  faux.poster(TICKET, "A", `<!-- brigade:validation-question pr=${PR} sha=${sha} -->\nThis PR.`);
  faux.poster(TICKET, "A", `${MARQUE_DE_RENVOI} n=1 sha=${sha} -->\nStation \`A\`: sent back to a cook (1/3) — red CI`);
  faux.ticket(TICKET).labels.add(LABEL_IN_PASS);
  chef(faux, "Validate.");
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(renvois(faux).length, 1);
  assert.deepEqual(reponses(faux), []);
});

test("a comment from outside the repository's trusted people is no answer, and a chef's comment with only a quote waits for the next one", async () => {
  const { faux, s, sha } = await retenue();
  question(faux, sha);
  const liste = commentaires(faux);
  liste.push({ id: 9_999, body: "Validate.", association: "NONE", createdAt: new Date().toISOString(), station: "passer-by" });
  chef(faux, "> Does the screen of #40 look right?");
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(reponses(faux), []);
  chef(faux, "ok");
  await tours(s, 3, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
});

test("the ticket's comments that cannot be read: nothing is merged nor sent back, the station says it, and the answer is acted on at a later turn", async () => {
  let panne = false;
  const avertis: string[] = [];
  const faux = enPass();
  const bas = faux.pour("A");
  const { s } = station(faux, avertis, {
    commentaires: async (numero) => {
      if (panne && numero === TICKET) throw new Error("HTTP 502");
      return bas.commentaires(numero);
    },
  });
  await tours(s, 3);
  const sha = faux.pr(PR).sha;
  question(faux, sha);
  chef(faux, "Validate");
  panne = true;
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(renvois(faux), []);
  assert.deepEqual(reponses(faux), []);
  assert.match(avertis.join("\n"), /pass de #40 sur A — HTTP 502/);
  panne = false;
  await tours(s, 3, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(reponses(faux), [{ pr: PR, sha, reponse: "validated" }]);
});
