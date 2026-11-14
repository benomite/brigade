// Un ticket sensible, retenu pour le chef avant son merge (#3223) : la pass du
// chemin GitHub seul (`stationGitHub`, `stationDuDepot`) sur le faux GitHub,
// et les deux réponses de la carte (`npm run sensitive`), jouées par leur
// `principal`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { ticketJoint } from "../../src/bac-a-sable/hors-github.ts";
import { brancheDuTicket, stationDuDepot, stationGitHub, type GitHubDuTour, type StationGitHub } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { carteEnCours, CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { MARQUE_DE_RENVOI } from "../../src/qualite-github.ts";
import { principal } from "../../src/sensible/commande.ts";
import { LABEL_SENSITIVE, SENSIBLE, TITRE_DE_CARTE } from "../../src/sensible/sensible.ts";
import { carteDuCorpsDe, TITRE_DE_CARTE as TITRE_DU_DESIGN } from "../../src/validation-design/validation-design.ts";
import { CALIBRE, FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";

const TICKET = 41;
const PR = 1041;
const URL_DE_LA_PR = `https://github.com/faux/depot/pull/${PR}`;
const CODE = ["runtime/src/x.ts"];

// Un ticket en pass, sa PR approuvée et verte : le verdict de la pass est bon.
function enPass(labels: string[], fichiers: string[] = CODE) {
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...labels, LABEL_IN_PASS]);
  const sha = faux.sha();
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers });
  faux.poster(PR, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  return faux;
}

// La station A, ses relectures attendues à chaque tour ; ses cartes gardent
// leur titre, que le faux oublie. Le cook d'un renvoi pousse une tête neuve.
function station(faux: FauxGitHub, { avertis = [], pannes = {}, designs = false }: { avertis?: string[]; pannes?: Partial<GitHubDuTour>; designs?: boolean } = {}) {
  const titres = new Map<number, string>();
  const bas = { ...faux.pour("A"), ...pannes };
  const github = {
    ...bas,
    creerIssue: async (issue: { titre: string; corps: string; labels: string[] }) => {
      const numero = await bas.creerIssue(issue);
      titres.set(numero, issue.titre);
      return numero;
    },
  };
  const s: StationGitHub = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    depotServi: "faux/depot",
    designsValidesParUnHumain: () => designs,
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: "A", issue: ticket.number });
      const ouverte = faux.prs.findLast((p) => p.issue === ticket.number && p.state === "open");
      if (ouverte !== undefined) ouverte.sha = faux.sha();
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
  return { s, titres };
}

async function tours(s: StationGitHub, n: number, jusqua: () => boolean = () => false) {
  for (let i = 0; i < n && !jusqua(); i += 1) {
    await s.tour();
    await s.calme();
  }
}

const cartes = (faux: FauxGitHub) => [...faux.tickets.values()].filter((t) => t.number !== TICKET);
const ouvertes = (faux: FauxGitHub) => cartes(faux).filter((t) => t.state === "open" && t.labels.has(CHEF_TODO));
const renvois = (faux: FauxGitHub) => (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));

// Le GitHub des réponses du chef, sur le faux : ses issues ouvertes avec leur corps.
function reponses(faux: FauxGitHub) {
  const client = fauxClient(faux, "chef");
  const ouvertesLues: GitHub["ouvertes"] = async () => ({
    inchange: false,
    issues: [...faux.tickets.values()].filter((t) => t.state === "open").map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
    confirmer: () => {},
  });
  return { ...client, ouvertes: ouvertesLues, fermer: () => {} };
}

async function sensitive(faux: FauxGitHub, ...args: string[]) {
  const lignes: string[] = [];
  try {
    await principal({ args, env: {}, dire: (ligne) => lignes.push(ligne), redire: (ligne) => lignes.push(ligne) }, () => reponses(faux));
    return { code: 0, lignes };
  } catch (fin) {
    if (!(fin instanceof Sortie)) throw fin;
    return { code: fin.code, lignes };
  }
}

// Un ticket `sensitive` au verdict bon, retenu, sa carte posée.
async function retenu() {
  const faux = enPass([...CALIBRE, LABEL_SENSITIVE]);
  const avertis: string[] = [];
  const { s, titres } = station(faux, { avertis });
  await tours(s, 3);
  return { faux, s, titres, avertis, sha: faux.pr(PR).sha };
}

test("a `sensitive` ticket whose pass verdict is good is not merged: exactly one TODO card “review before merge” carries the pull request URL", async () => {
  const { faux, titres, avertis, sha } = await retenu();
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(faux.pr(PR).merged, false);
  const [carte, ...autres] = cartes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  assert.ok(carte.labels.has(CHEF_TODO));
  assert.equal(titres.get(carte.number), "review before merge");
  assert.equal(TITRE_DE_CARTE, "review before merge");
  assert.ok(carte.corps.includes(`Pull request: ${URL_DE_LA_PR}`), carte.corps);
  assert.deepEqual(carteDuCorpsDe(SENSIBLE, carte.corps), { pr: PR, ticket: TICKET, sha });
  // Le TODO du chef la lit comme une carte : sa sorte, sa question et le lien.
  const lue = carteEnCours([...carte.labels], faux.commentaires.get(carte.number) ?? []);
  assert.equal(lue?.sorte, "review-before-merge");
  assert.match(lue?.texte ?? "", /^#41 is sensitive: review PR #1041 before it is merged\./);
  assert.ok(lue?.texte.includes(URL_DE_LA_PR), lue?.texte);
  // Le ticket reste en pass, et dit sa carte ; aucun refus de GitHub n'est dit, rien n'est renvoyé.
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_IN_PASS));
  assert.ok((faux.commentaires.get(TICKET) ?? []).some((c) => c.body.includes(`held for the chef's review before merge, card #${carte.number}`)));
  assert.deepEqual(avertis, []);
  assert.deepEqual(renvois(faux), []);
});

test("a ticket without the label `sensitive` is merged by the pass, with no TODO card, as before", async () => {
  const faux = enPass(CALIBRE);
  const { s } = station(faux);
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(cartes(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), false);
});

test("a sensitive ticket never gets two review cards, however many times the pass runs on it — on the same station or on a new one", async () => {
  const { faux, s, sha } = await retenu();
  await tours(s, 3);
  const { s: autre } = station(faux);
  await tours(autre, 3);
  assert.equal(faux.pr(PR).sha, sha);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(cartes(faux).length, 1);
  assert.equal(ouvertes(faux).length, 1);
});

test("answering `merge` on the card merges the pull request and closes the card; the ticket is then served", async () => {
  const { faux, s } = await retenu();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  const fin = await sensitive(faux, "merge", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.match(fin.lignes.join("\n"), new RegExp(`faux/depot#${PR} merged, card #${carte.number} closed — ticket #${TICKET} is served`));
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(faux.ticket(carte.number).state, "closed");
  assert.equal(faux.ticket(carte.number).labels.has(CHEF_TODO), false);
  assert.ok((faux.commentaires.get(carte.number) ?? []).some((c) => c.body === `Merged on the chef's answer: PR #${PR} is merged.`));
  await tours(s, 2);
  assert.equal(faux.ticket(TICKET).state, "closed");
  assert.equal(cartes(faux).length, 1);
  // Plus de carte : une seconde réponse est refusée.
  const encore = await sensitive(faux, "merge", `faux/depot#${PR}`);
  assert.equal(encore.code, 1);
  assert.match(encore.lignes.join("\n"), /no open “review before merge” card holds PR #1041/);
});

test("answering `send back` with a note returns the ticket to cooking, the note reaches the cook, the card closes; the next delivery comes back as a new card", async () => {
  const { faux, s, sha } = await retenu();
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  const note = "Keep the old flag readable for one more release.";
  const fin = await sensitive(faux, "send-back", `faux/depot#${PR}`, "--note", note);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  const [renvoi, ...autres] = renvois(faux);
  assert.deepEqual(autres, []);
  assert.ok(renvoi?.body.startsWith(`<!-- brigade:renvoi n=1 sha=${sha} -->\n`), renvoi?.body ?? "no send-back");
  assert.ok(renvoi?.body.includes(`\n\n${note}\n\n`), renvoi?.body ?? "no send-back");
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.equal(faux.ticket(premiere.number).state, "closed");
  assert.equal(faux.ticket(premiere.number).labels.has(CHEF_TODO), false);
  assert.equal(faux.mergee(TICKET), undefined);
  // Le ticket tel que la station le remet au cook porte la note.
  const commentaires = await fauxClient(faux).commentaires(TICKET);
  assert.ok(ticketJoint({ number: TICKET, title: "sensitive", body: "", commentaires }).includes(note));

  // Un cook reprend le ticket, livre une tête neuve, et la pass la retient en carte neuve.
  await tours(s, 12, () => ouvertes(faux).length > 0);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [TICKET]);
  assert.notEqual(faux.pr(PR).sha, sha);
  const [seconde, ...plus] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.deepEqual(plus, []);
  assert.notEqual(seconde.number, premiere.number);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("send back with an empty note is refused and changes nothing; so is an answer on a PR no card holds", async () => {
  const { faux } = await retenu();
  for (const vide of ["", "   "]) {
    const fin = await sensitive(faux, "send-back", `faux/depot#${PR}`, "--note", vide);
    assert.equal(fin.code, 1, JSON.stringify(vide));
    assert.match(fin.lignes.join("\n"), /the note says what to change: it cannot be empty/);
  }
  const sansNote = await sensitive(faux, "send-back", `faux/depot#${PR}`);
  assert.equal(sansNote.code, 2);
  const ailleurs = await sensitive(faux, "merge", "faux/depot#77");
  assert.equal(ailleurs.code, 1);
  assert.deepEqual(renvois(faux), []);
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_IN_PASS));
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("merge after the branch was updated from its base merges nothing at once: the answer is kept on the ticket, the card leaves TODO, and the pass merges the new head once green, without a new card", async () => {
  const { faux, s } = await retenu();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  faux.pr(PR).sha = faux.sha();
  faux.ciEnCours.add(PR);
  const fin = await sensitive(faux, "merge", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.deepEqual(fin.lignes, [`faux/depot#${PR}: your answer is kept, card #${carte.number} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green`]);
  assert.equal(faux.pr(PR).merged, false);
  assert.deepEqual(ouvertes(faux), []);
  assert.ok((faux.commentaires.get(TICKET) ?? []).some((c) => c.body.startsWith(`<!-- brigade:sensitive-review-validee carte=${carte.number} pr=${PR} `) && c.body.includes("Merge accepted by the chef on card")));
  faux.ciEnCours.delete(PR);
  await tours(s, 4, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(cartes(faux).length, 1);
});

test("merge on a PR that conflicts with the base: the answer is recorded, the card leaves TODO, and the kitchen updates the PR on the base, then merges it (#3426)", async () => {
  const { faux, s } = await retenu();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  faux.pr(PR).enConflit = true;
  const fin = await sensitive(faux, "merge", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.deepEqual(fin.lignes, [`faux/depot#${PR}: your answer is recorded, card #${carte.number} closed — PR #${PR} conflicts with the base: the kitchen first updates it on the base, then merges it`]);
  assert.equal(faux.pr(PR).merged, false);
  assert.deepEqual(ouvertes(faux), []);
  assert.ok((faux.commentaires.get(TICKET) ?? []).some((c) => c.body.startsWith(`<!-- brigade:sensitive-review-validee carte=${carte.number} pr=${PR} `) && c.body.includes("If a cook has to resolve the conflict, a new card asks the chef again.")));
  await tours(s, 6, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(cartes(faux).length, 1);
});

test("a card GitHub refuses to create: nothing is merged, the station says why, and the next turn posts the card", async () => {
  const faux = enPass([...CALIBRE, LABEL_SENSITIVE]);
  const avertis: string[] = [];
  const { s: enPanne } = station(faux, { avertis, pannes: { creerIssue: async () => { throw new Error("HTTP 502"); } } });
  await tours(enPanne, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(cartes(faux), []);
  assert.match(avertis.join("\n"), /pass de #41 sur A — HTTP 502/);
  const { s } = station(faux);
  await tours(s, 2);
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("a sensitive design delivery, on a project where a human validates designs, waits on its one design card, never a second card", async () => {
  const ecran = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];
  const faux = enPass([...CALIBRE, LABEL_SENSITIVE], ecran);
  const { s, titres } = station(faux, { designs: true });
  await tours(s, 4);
  assert.equal(faux.mergee(TICKET), undefined);
  const [carte, ...autres] = cartes(faux);
  assert.deepEqual(autres, []);
  assert.equal(titres.get(carte?.number ?? 0), TITRE_DU_DESIGN);
});

// La station du dépôt, celle que la cuisine ouvre.
async function parLeDepot(t: TestContext, labels: string[]) {
  const repertoire = mkdtempSync(join(tmpdir(), "sensible-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = enPass(labels);
  const avertis: string[] = [];
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue },
    depot: { connait: () => false, preparer: async () => assert.fail("nothing is cooked"), reprendre: async () => assert.fail("nothing is cooked"), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" },
    flux: repertoire,
    lancer: () => assert.fail("the PR is already approved: no review"),
    avertir: (texte) => avertis.push(texte),
    projet: () => ({ integrationBranch: "main" }),
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let i = 0; i < 3; i += 1) {
    await station.tour();
    await station.calme();
    await station.relu();
  }
  return { faux, avertis };
}

test("the station the kitchen opens holds a sensitive ticket on its card, and merges one without the label", async (t) => {
  const tenu = await parLeDepot(t, [...CALIBRE, LABEL_SENSITIVE]);
  assert.equal(tenu.faux.mergee(TICKET), undefined, tenu.avertis.join("\n"));
  assert.equal(ouvertes(tenu.faux).length, 1);
  assert.ok(ouvertes(tenu.faux)[0]?.corps.includes(`Pull request: ${URL_DE_LA_PR}`));
  const merge = await parLeDepot(t, CALIBRE);
  assert.equal(merge.faux.mergee(TICKET)?.number, PR, merge.avertis.join("\n"));
  assert.deepEqual(cartes(merge.faux), []);
});
