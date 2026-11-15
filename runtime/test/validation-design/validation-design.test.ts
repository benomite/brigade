// Une livraison design validée par un humain (#3184) : la pass du chemin
// GitHub seul (`stationGitHub`, `stationDuDepot`) sur le faux GitHub, et les
// deux gestes que l'app appelle (`npm run design`), joués par leur `principal`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { brancheDuTicket, stationDuDepot, stationGitHub, type GitHubDuTour, type StationGitHub } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { carteEnCours, CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { MARQUE_DE_RENVOI } from "../../src/qualite-github.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier } from "../../src/reglages-projet/reglages.ts";
import { principal } from "../../src/validation-design/commande.ts";
import { corpsDeCeQuiEstFait, SANS_RESUME } from "../../src/validation-design/brief.ts";
import { designsValidesParUnHumain, estUneLivraisonDesign, SORTE_DE_CARTE, TITRE_DE_CARTE } from "../../src/validation-design/validation-design.ts";
import { demandeDuCorps } from "../../src/validation-sur-ticket/validation-sur-ticket.ts";
import { ecrirePng, lirePng, type Image } from "../../src/validation-design/png.ts";
import type { ChoixDeDesign } from "../../src/validation-design/choix-de-design.ts";
import { CALIBRE, FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { copie, ecrire, page, pixel, poser, remplacer } from "./pages.ts";

type JugeDuChoix = (corps: string) => Promise<ChoixDeDesign>;

const TICKET = 40;
const PR = 1040;
const ECRAN = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];

// Un ticket en pass, sa PR approuvée et verte, qui change `fichiers`.
function enPass(fichiers: string[], labels: string[] = CALIBRE) {
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...labels, LABEL_IN_PASS]);
  const sha = faux.sha();
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers });
  faux.poster(PR, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  return faux;
}

// La station A, sous ce réglage, ses relectures attendues à chaque tour ; les
// issues qu'elle crée sont notées par leur titre. Le cook d'un renvoi pousse
// une tête neuve, hors de conflit avec la base.
function station(faux: FauxGitHub, valide: boolean, avertis: string[] = [], pannes: Partial<GitHubDuTour> = {}, juge: JugeDuChoix | null = async () => ({ choix: "the layout of the rail" })) {
  const creees: string[] = [];
  const bas = { ...faux.pour("A"), ouvertes: gestes(faux).ouvertes, prDeBranche: fauxClient(faux, "A").prDeBranche, ...pannes };
  const github = {
    ...bas,
    creerIssue: async (issue: { titre: string; corps: string; labels: string[] }) => {
      creees.push(issue.titre);
      return bas.creerIssue(issue);
    },
  };
  const s: StationGitHub = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    depotServi: "faux/depot",
    designsValidesParUnHumain: () => valide,
    ...(juge === null ? {} : { jugerLeChoixDeDesign: async (ticket: { number: number; title: string; body: string }) => juge(ticket.body) }),
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: "A", issue: ticket.number });
      const ouverte = faux.prs.findLast((p) => p.issue === ticket.number && p.state === "open");
      // Le cook d'un renvoi pour conflit remet la branche sur sa base.
      if (ouverte !== undefined) Object.assign(ouverte, { sha: faux.sha(), enConflit: false });
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
  return { s, creees };
}

async function tours(s: StationGitHub, n: number, jusqua: () => boolean = () => false) {
  for (let i = 0; i < n && !jusqua(); i += 1) {
    await s.tour();
    await s.calme();
  }
}

// La validation se demande sur le ticket même (#3615) : chaque demande posée
// est une carte, et la carte ouverte est la dernière, tant que le ticket est
// ouvert et porte `chef-todo`. Aucune issue à part.
const carteDuCorps = (corps: string) => demandeDuCorps(SORTE_DE_CARTE, corps);
const issuesAPart = (faux: FauxGitHub) => [...faux.tickets.values()].filter((t) => t.number !== TICKET);
const cartes = (faux: FauxGitHub) =>
  (faux.commentaires.get(TICKET) ?? []).filter((c) => carteDuCorps(c.body) !== null).map((c) => ({ number: TICKET, corps: c.body, labels: faux.ticket(TICKET).labels }));
const ouvertes = (faux: FauxGitHub) => {
  const ticket = faux.ticket(TICKET);
  return ticket.state === "open" && ticket.labels.has(CHEF_TODO) ? cartes(faux).slice(-1) : [];
};
const renvois = (faux: FauxGitHub) => (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));

// Le GitHub des gestes du chef, sur le faux : ses issues ouvertes avec leur corps.
function gestes(faux: FauxGitHub) {
  const client = fauxClient(faux, "chef");
  const ouvertesLues: GitHub["ouvertes"] = async () => ({
    inchange: false,
    issues: [...faux.tickets.values()].filter((t) => t.state === "open").map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
    confirmer: () => {},
  });
  return { ...client, creerIssue: faux.pour("chef").creerIssue, ouvertes: ouvertesLues, fermer: () => {} };
}

async function design(faux: FauxGitHub, ...args: string[]) {
  const lignes: string[] = [];
  try {
    await principal({ args, env: {}, dire: (ligne) => lignes.push(ligne), redire: (ligne) => lignes.push(ligne) }, () => gestes(faux));
    return { code: 0, lignes };
  } catch (fin) {
    if (!(fin instanceof Sortie)) throw fin;
    return { code: fin.code, lignes };
  }
}

// Le réglage on, une livraison design verte avec ses captures retenue, sa carte posée.
async function retenue() {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  const { s, creees } = station(faux, true, avertis);
  await tours(s, 3);
  return { faux, s, creees, avertis, sha: faux.pr(PR).sha };
}

test("setting on: a green design delivery with its captures is not merged; the ticket itself becomes a chef-todo card that asks the question, embeds the before and after captures as images and links the PR — no issue apart (#3615)", async () => {
  const { faux, creees, avertis, sha } = await retenue();
  assert.equal(faux.mergee(TICKET), undefined);
  const [carte, ...autres] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  assert.equal(carte.number, TICKET);
  assert.deepEqual(creees, [], "no issue is created");
  assert.deepEqual(issuesAPart(faux), []);
  assert.equal(TITRE_DE_CARTE, "Validate its screen");
  assert.deepEqual(carteDuCorps(carte.corps), { pr: PR, ticket: TICKET, sha });
  assert.match(carte.corps, /Does the screen of #40 look right\?/);
  assert.ok(carte.corps.includes(`Pull request: https://github.com/faux/depot/pull/${PR}`), carte.corps);
  assert.ok(carte.corps.includes(`![rail — avant](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-avant.png?raw=true)`), carte.corps);
  assert.ok(carte.corps.includes(`![rail — après](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-apres.png?raw=true)`), carte.corps);
  // Le TODO du chef la lit comme une carte : sa sorte et sa question.
  const lue = carteEnCours([...carte.labels], faux.commentaires.get(carte.number) ?? []);
  assert.equal(lue?.sorte, "design-validation");
  assert.match(lue?.texte ?? "", /^\*\*Does the screen of #40 look right\?/);
  // Le ticket reste en pass ; sa PR porte la même demande ; aucun refus de GitHub n'est dit.
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_IN_PASS));
  assert.deepEqual((faux.commentaires.get(PR) ?? []).filter((c) => carteDuCorps(c.body) !== null).map((c) => c.body), [carte.corps]);
  assert.deepEqual(avertis, []);
  assert.deepEqual(renvois(faux), []);
});

test("a delivery held for the chef's validation takes no place of the pass: with four other deliveries in pass, the station still claims the next ticket (PASS_MAX, #3446)", async () => {
  const faux = enPass(ECRAN);
  // Quatre autres livraisons en pass, approuvées, dont la CI tourne encore : la pass y travaille.
  for (let n = 41; n <= 44; n += 1) {
    faux.feu(n, [...CALIBRE, LABEL_IN_PASS]);
    const sha = faux.sha();
    faux.prs.push({ number: 1000 + n, issue: n, branche: brancheDuTicket(n), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [`runtime/src/f${n}.ts`] });
    faux.poster(1000 + n, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
    faux.ciEnCours.add(1000 + n);
  }
  faux.feu(50);
  const { s } = station(faux, true);
  await tours(s, 3, () => faux.cuissons.some((c) => c.issue === 50));
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.ok([TICKET, 41, 42, 43, 44].every((n) => faux.ticket(n).labels.has(LABEL_IN_PASS)));
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 50 }]);
});

test("a delivery held for the chef's validation holds no zone: a ticket that names its screen's file is claimed while the card waits, as it waits for no pass place (#3677)", async () => {
  const faux = enPass(ECRAN);
  faux.feu(50);
  faux.ticket(50).corps = "## Context\n\nwhatever\n\n## Zone\n\n- `app/src/vue/rail.js`\n";
  const { s } = station(faux, true);
  await tours(s, 3, () => faux.cuissons.some((c) => c.issue === 50));
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_IN_PASS));
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 50 }]);
});

test("the card opens with a brief: what was asked, from the ticket's title and body, and what was done, the cook's points the station posted on the PR (#3330)", async () => {
  const faux = enPass(ECRAN);
  faux.ticket(TICKET).corps = "## Context\n\nThe chef cannot tell what changed between the captures.\n\n## Acceptance criteria\n\n- a long list";
  faux.poster(PR, "A", corpsDeCeQuiEstFait(["the TODO column takes the full width", "cards show their question on one line"]));
  const { s } = station(faux, true);
  await tours(s, 3);
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  const brief = "### What was asked\n\nticket 40 — The chef cannot tell what changed between the captures.\n\n### What was done\n\n- the TODO column takes the full width\n- cards show their question on one line\n\n### Captures";
  assert.ok(carte.corps.includes(brief), carte.corps);
  assert.doesNotMatch(carte.corps, /a long list/);
});

test("a PR with no summary from its cook gets a card whose brief says none is available, and still says what was asked", async () => {
  const { faux } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.ok(carte.corps.includes(`### What was asked\n\nticket 40 — the ticket's body\n\n### What was done\n\n_${SANS_RESUME}_`), carte.corps);
});

test("the ticket's issue that GitHub does not give when the card is posted: no card, nothing merged, the station says why, and the next turn posts it", async () => {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  const bas = faux.pour("A");
  let panne = true;
  const { s } = station(faux, true, avertis, {
    issue: async (numero) => {
      if (panne && numero === TICKET) throw new Error("gh api : HTTP 502");
      return bas.issue!(numero);
    },
  });
  await tours(s, 3);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.ok(avertis.some((ligne) => ligne.includes("HTTP 502")), avertis.join("\n"));
  panne = false;
  await tours(s, 3, () => ouvertes(faux).length > 0);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(ouvertes(faux).length, 1);
});

test("a held delivery gets one card only, however many turns pass on the same head", async () => {
  const { faux, s, sha } = await retenue();
  await tours(s, 3);
  assert.equal(faux.pr(PR).sha, sha);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(cartes(faux).length, 1);
  assert.equal(ouvertes(faux).length, 1);
});

// La branche mise à jour depuis sa base : une tête neuve, sans renvoi, approuvée et verte.
function miseAJour(faux: FauxGitHub) {
  const neuve = faux.sha();
  faux.pr(PR).sha = neuve;
  return neuve;
}
const validees = (faux: FauxGitHub) => (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith("<!-- brigade:validation-design-validee "));

test("a held delivery whose branch is updated from its base keeps its one card: no second card for the same screen, and validating it merges the new head", async () => {
  const { faux, s, sha } = await retenue();
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  const neuve = miseAJour(faux);
  await tours(s, 4);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(cartes(faux).map((carte) => carte.number), [premiere.number], "no new card");
  assert.equal(faux.ticket(premiere.number).state, "open");
  assert.deepEqual(carteDuCorps(premiere.corps), { pr: PR, ticket: TICKET, sha });
  // Valider la carte : la validation est gardée, la pass merge la tête neuve, verte.
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 4, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(faux.pr(PR).sha, neuve);
  assert.equal(cartes(faux).length, 1);
});

test("validate after the branch was updated from its base: nothing merged at once, the validation is recorded on the ticket and the card leaves TODO; the pass merges the new head once it judges it green, without a new card", async () => {
  const { faux, s, sha } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  const neuve = miseAJour(faux);
  faux.ciEnCours.add(PR);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.deepEqual(fin.lignes, [`faux/depot#${PR} validated: your validation is kept, card #${carte.number} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green`]);
  assert.equal(faux.pr(PR).merged, false);
  // La carte n'attend plus rien : elle quitte TODO, le ticket reste ouvert.
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.ticket(TICKET).state, "open");
  // Le ticket dit la validation gardée et le merge en attente, et ce qui suit.
  const [gardee, ...autres] = validees(faux);
  assert.deepEqual(autres, []);
  assert.ok(gardee?.body.startsWith(`<!-- brigade:validation-design-validee carte=${carte.number} pr=${PR} sha=${sha} -->\nValidated by the chef on card #${carte.number} — merge pending. The branch of PR #1040 was updated since the card (\`${sha.slice(0, 7)}\` → \`${neuve.slice(0, 7)}\`)`), gardee?.body ?? "no validation on the ticket");
  // La CI encore en cours : rien de mergé, aucune carte neuve.
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(cartes(faux).length, 1);
  // Verte : la pass merge, sans redemander le chef — même après une seconde mise à jour.
  miseAJour(faux);
  faux.ciEnCours.delete(PR);
  await tours(s, 4, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(cartes(faux).length, 1);
  assert.deepEqual(renvois(faux), []);
});

test("a sensitive design delivery validated after its branch was updated from its base: the pass merges it on the kept validation, no “review before merge” card after the “Validate its screen” one", async () => {
  const faux = enPass(ECRAN, [...CALIBRE, "sensitive"]);
  const { s } = station(faux, true);
  await tours(s, 3);
  const [carte, ...autres] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  const sensibles = () => (faux.commentaires.get(TICKET) ?? []).filter((c) => demandeDuCorps("review-before-merge", c.body) !== null);
  // La branche mise à jour, la pass la tient sur sa tête neuve, sans carte neuve.
  miseAJour(faux);
  await tours(s, 3);
  assert.equal(cartes(faux).length, 1);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  // Sur la même tête, retenue au tour d'avant : la réponse du chef la fait retenter, et merger.
  await tours(s, 4, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(cartes(faux).length, 1, "one card for one screen");
  assert.deepEqual(sensibles(), [], "no “review before merge” card");
  assert.deepEqual(issuesAPart(faux), []);
  assert.deepEqual(ouvertes(faux), []);
});

test("the ticket's comments unreadable while a held delivery waits for the chef's answer: nothing is merged, the station says why, and the next turn merges once the answer is read", async () => {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  let panne = false;
  const bas = faux.pour("A");
  const { s } = station(faux, true, avertis, {
    commentaires: async (numero) => {
      if (panne && numero === TICKET) throw new Error("HTTP 502");
      return bas.commentaires(numero);
    },
  });
  await tours(s, 3);
  miseAJour(faux);
  await tours(s, 3);
  assert.equal(ouvertes(faux).length, 1);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  panne = true;
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.match(avertis.join("\n"), /pass de #40 sur A — HTTP 502/);
  panne = false;
  await tours(s, 4, () => faux.mergee(TICKET) !== undefined);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(cartes(faux).length, 1);
});

test("a validation kept after an update is not kept once a cook changes the delivery: the pass sends it back (red CI), the cook delivers, and a new card asks the chef again", async () => {
  const { faux, s } = await retenue();
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  miseAJour(faux);
  faux.ciRouge.add(PR);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.equal(validees(faux).length, 1);
  await tours(s, 4, () => renvois(faux).length > 0);
  assert.equal(renvois(faux).length, 1);
  faux.ciRouge.delete(PR);
  await tours(s, 12, () => ouvertes(faux).length > 0);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [TICKET]);
  const [seconde, ...autres] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.deepEqual(autres, []);
  assert.notEqual(seconde.corps, premiere.corps);
  assert.equal(cartes(faux).length, 2);
  assert.deepEqual(carteDuCorps(seconde.corps), { pr: PR, ticket: TICKET, sha: faux.pr(PR).sha });
  assert.equal(faux.mergee(TICKET), undefined);
});

test("validate after a send-back of the pass merges nothing, even on the card's head, and closes the card", async () => {
  const { faux, sha } = await retenue();
  // La pass a renvoyé la livraison depuis la carte (une CI rougie, relancée) : le cook n'a pas encore poussé.
  faux.poster(TICKET, "A", `${MARQUE_DE_RENVOI} n=1 sha=${sha} -->\nStation \`A\`: sent back to a cook (1/2) — red CI.`);
  assert.equal(faux.pr(PR).sha, sha);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 1);
  assert.match(fin.lignes.join("\n"), /the delivery of PR #1040 went back to a cook since card #\d+: nothing merged, card #\d+ closed/);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(faux.pr(PR).merged, false);
  assert.deepEqual(ouvertes(faux), []);
});

test("a card a send-back of the pass overtook — its CI red after an update — is closed when the next delivery is held on a new card", async () => {
  const { faux, s } = await retenue();
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  // La base bouge, la branche se met à jour, et sa CI rougit : la pass la renvoie à un cook.
  faux.ciRouge.add(PR);
  faux.pr(PR).sha = faux.sha();
  await tours(s, 4, () => renvois(faux).length > 0);
  assert.equal(renvois(faux).length, 1);
  faux.ciRouge.delete(PR);
  await tours(s, 12, () => ouvertes(faux).some((carte) => carte.corps !== premiere.corps));
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(cartes(faux).length, 2);
  assert.deepEqual(carteDuCorps(ouvertes(faux)[0]?.corps ?? ""), { pr: PR, ticket: TICKET, sha: faux.pr(PR).sha });
  assert.equal(faux.mergee(TICKET), undefined);
});

test("a send-back of the pass closes the card it overtakes at once: the card leaves TODO, the chef has nothing to answer on it", async () => {
  const { faux, s } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  faux.ciRouge.add(PR);
  miseAJour(faux);
  await tours(s, 4, () => renvois(faux).length > 0);
  assert.equal(renvois(faux).length, 1);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), false);
  assert.equal(faux.ticket(TICKET).state, "open");
});

test("a card GitHub does not close after a send-back: the send-back is made, the station says so, and the next card closes it", async () => {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  let panne = false;
  const bas = faux.pour("A");
  const { s } = station(faux, true, avertis, {
    delabelliser: async (numero, label) => {
      if (panne && label === CHEF_TODO) throw new Error("HTTP 502");
      return bas.delabelliser(numero, label);
    },
  });
  await tours(s, 3);
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  panne = true;
  faux.ciRouge.add(PR);
  miseAJour(faux);
  await tours(s, 4, () => renvois(faux).length > 0);
  assert.equal(renvois(faux).length, 1);
  assert.match(avertis.join("\n"), /#40 sur A — its “Validate its screen” card could not be closed after the send-back, the next card closes it: HTTP 502/);
  assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), true, "the card could not be lifted");
  panne = false;
  faux.ciRouge.delete(PR);
  await tours(s, 12, () => ouvertes(faux).some((carte) => carte.corps !== premiere.corps));
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(cartes(faux).length, 2);
});

test("validate with the card's PR number merges the delivery and closes the card", async () => {
  const { faux, s } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.ticket(carte.number).labels.has(CHEF_TODO), false);
  await tours(s, 2);
  assert.equal(faux.ticket(TICKET).state, "closed");
  // Plus de carte : valider une seconde fois est refusé, sans rien merger.
  const encore = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(encore.code, 1);
  assert.match(encore.lignes.join("\n"), /no open “Validate its screen” card holds PR #1040/);
});

test("validate refused by GitHub keeps the card open and says why", async () => {
  const { faux } = await retenue();
  faux.pr(PR).enRetard = true;
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 1);
  assert.match(fin.lignes.join("\n"), /GitHub refused to merge PR #1040 — HTTP 405 — Head branch is out of date; card #\d+ stays open/);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(ouvertes(faux).length, 1);
});

// ── La PR en conflit avec sa base au moment de valider (#3426) ──

// La carte posée, la PR tombée en conflit avec sa base pendant qu'elle attendait
// le chef ; `deContenu` : la station ne sait pas la mettre à jour seule.
async function enConflit(deContenu = false) {
  const tenue = await retenue();
  Object.assign(tenue.faux.pr(PR), { enConflit: true, conflitDeContenu: deContenu });
  const [carte] = ouvertes(tenue.faux);
  assert.ok(carte !== undefined);
  return { ...tenue, carte };
}

test("validate a card whose PR conflicts with the base: no “nothing was done”, the validation is recorded on the ticket, the card leaves TODO, and the chef is told the kitchen first updates the PR on the base, then merges it", async () => {
  const { faux, carte, sha } = await enConflit();
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.deepEqual(fin.lignes, [`faux/depot#${PR} validated: your validation is recorded, card #${carte.number} closed — PR #${PR} conflicts with the base: the kitchen first updates it on the base, then merges it`]);
  assert.equal(faux.pr(PR).merged, false);
  // La carte n'est plus dans TODO : le ticket, sans `chef-todo`, reste ouvert.
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.ticket(carte.number).state, "open");
  assert.equal(faux.ticket(carte.number).labels.has(CHEF_TODO), false);
  // La validation est écrite sur le ticket, sur la tête que la carte montrait, et dit ce qui suit.
  const [gardee, ...autres] = validees(faux);
  assert.deepEqual(autres, []);
  assert.equal(
    gardee?.body,
    `<!-- brigade:validation-design-validee carte=${carte.number} pr=${PR} sha=${sha} -->\nValidated by the chef on card #${carte.number} — merge pending. PR #${PR} conflicts with the base: the kitchen first updates it on the base, then merges it once its checks are green, without a new card. If the update changes the screen, or cannot be done without changing it, a new card asks the chef again, with the new captures.`,
  );
});

test("a PR GitHub refuses to merge because it fell into conflict after it was read: the validation is recorded all the same", async () => {
  const { faux, carte } = await enConflit();
  faux.pr(PR).enConflit = false;
  const client = gestes(faux);
  const lignes: string[] = [];
  const merger: GitHub["merger"] = async () => {
    faux.pr(PR).enConflit = true;
    return { fait: false, motif: "HTTP 405 — Pull Request is not mergeable" };
  };
  await principal({ args: ["validate", `faux/depot#${PR}`], env: {}, dire: (ligne) => lignes.push(ligne), redire: (ligne) => lignes.push(ligne) }, () => ({ ...client, merger }));
  assert.deepEqual(lignes, [`faux/depot#${PR} validated: your validation is recorded, card #${carte.number} closed — PR #${PR} conflicts with the base: the kitchen first updates it on the base, then merges it`]);
  assert.equal(validees(faux).length, 1);
  assert.deepEqual(ouvertes(faux), []);
});

test("validated in conflict, the station updates the PR on the base without changing its screen: once its checks are green it is merged with no further action of the chef, the ticket is served, and no card comes back to TODO", async () => {
  const { faux, s, sha } = await enConflit();
  faux.ciEnCours.add(PR);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 4, () => faux.pr(PR).sha !== sha);
  assert.notEqual(faux.pr(PR).sha, sha, "the station updated the PR on the base");
  assert.equal(faux.pr(PR).enConflit, false);
  // Ses checks tournent encore : rien de mergé.
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  faux.ciEnCours.delete(PR);
  await tours(s, 4, () => faux.ticket(TICKET).state === "closed");
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(faux.ticket(TICKET).state, "closed");
  assert.equal(cartes(faux).length, 1);
  assert.deepEqual(ouvertes(faux), []);
  assert.deepEqual(renvois(faux), []);
});

test("validated in conflict, a conflict the station cannot resolve goes to a cook, who resolves it without changing the screen: the recorded validation holds, the PR is merged and the ticket served, no new card", async () => {
  const { faux, s } = await enConflit(true);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 16, () => faux.ticket(TICKET).state === "closed");
  const [renvoi, ...autres] = renvois(faux);
  assert.deepEqual(autres, []);
  assert.match(renvoi?.body ?? "", /^<!-- brigade:renvoi n=1 sha=[0-9a-f]+ conflit -->/);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [TICKET]);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(faux.ticket(TICKET).state, "closed");
  assert.equal(cartes(faux).length, 1);
});

test("validated in conflict, the update on the base changes the screen: nothing is merged, a new card with the new head's captures asks the chef again and says why", async () => {
  const { faux, s, carte, sha } = await enConflit();
  faux.changesEntre = (de) => (de === sha ? ["app/src/vue/rail.js", "README.md"] : []);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 8, () => ouvertes(faux).length > 0);
  const [seconde, ...autres] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.deepEqual(autres, []);
  assert.notEqual(seconde.corps, carte.corps);
  const tete = faux.pr(PR).sha;
  assert.notEqual(tete, sha);
  assert.deepEqual(carteDuCorps(seconde.corps), { pr: PR, ticket: TICKET, sha: tete });
  const pourquoi = `The update of PR #${PR} on the base changed its screen since the chef validated it (asked on #${TICKET}): \`app/src/vue/rail.js\` changed (\`${sha.slice(0, 7)}\` → \`${tete.slice(0, 7)}\`). The chef is asked again, on the new captures.`;
  assert.ok(seconde.corps.includes(pourquoi), seconde.corps);
  assert.ok(seconde.corps.includes(`![rail — après](https://github.com/faux/depot/blob/${tete}/docs/captures/40/rail-apres.png?raw=true)`), seconde.corps);
  assert.match(carteEnCours([...seconde.labels], faux.commentaires.get(seconde.number) ?? [])?.texte ?? "", new RegExp(`The update of PR #${PR} on the base changed its screen`));
  // La validation d'avant ne tient plus : la PR attend le chef, tour après tour.
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(cartes(faux).length, 2);
});

test("validated in conflict, the conflict cannot be resolved without changing the screen: the cook's delivery comes back as a new card with its new captures, saying why", async () => {
  const { faux, s, carte, sha } = await enConflit(true);
  faux.changesEntre = (de) => (de === sha ? [`docs/captures/${TICKET}/rail-apres.png`, "app/src/vue/rail.js"] : []);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 16, () => ouvertes(faux).length > 0);
  assert.equal(renvois(faux).length, 1);
  const [seconde] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.notEqual(seconde.corps, carte.corps);
  const tete = faux.pr(PR).sha;
  assert.deepEqual(carteDuCorps(seconde.corps), { pr: PR, ticket: TICKET, sha: tete });
  assert.ok(seconde.corps.includes(`PR #${PR} could not be updated on the base without changing its screen since the chef validated it (asked on #${TICKET}): \`app/src/vue/rail.js\`, \`docs/captures/40/rail-apres.png\` changed`), seconde.corps);
  assert.ok(seconde.corps.includes(`![rail — après](https://github.com/faux/depot/blob/${tete}/docs/captures/40/rail-apres.png?raw=true)`), seconde.corps);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("validated in conflict, the comparison of the heads that GitHub does not give: nothing is merged and the station says why; a validated head GitHub no longer knows asks the chef again, saying why", async () => {
  const avertis: string[] = [];
  const faux = enPass(ECRAN);
  let panne = true;
  const bas = faux.pour("A");
  const { s } = station(faux, true, avertis, {
    fichiersEntre: async (de, a) => {
      if (panne) throw new Error("HTTP 502");
      return bas.fichiersEntre?.(de, a) ?? null;
    },
  });
  await tours(s, 3);
  faux.pr(PR).enConflit = true;
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  await tours(s, 4);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.match(avertis.join("\n"), /pass de #40 sur A — HTTP 502/);
  assert.deepEqual(ouvertes(faux), []);
  // GitHub ne connaît plus la tête validée : le chef est redemandé, et la carte dit pourquoi.
  panne = false;
  faux.changesEntre = () => null;
  await tours(s, 4, () => ouvertes(faux).length > 0);
  const [seconde] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.match(seconde.corps, /GitHub no longer knows the head the chef validated \(`[0-9a-f]{7}`\), so the kitchen cannot tell the screen is unchanged\./);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("send back with a PR number and a comment sends the delivery back to a cook with the comment as the change to make and closes the card; the next delivery comes back as a new card with new captures", async () => {
  const { faux, s, sha } = await retenue();
  const [premiere] = ouvertes(faux);
  assert.ok(premiere !== undefined);
  const fin = await design(faux, "send-back", `faux/depot#${PR}`, "--comment", "Make the take button stand out: it is lost among the cards.");
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  const [renvoi, ...autres] = renvois(faux);
  assert.deepEqual(autres, []);
  assert.ok(renvoi?.body.startsWith(`<!-- brigade:renvoi n=1 sha=${sha} -->\n`), renvoi?.body ?? "no send-back");
  assert.match(renvoi?.body ?? "", /the chef asks for changes to the screen:\n\nMake the take button stand out: it is lost among the cards\./);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(faux.ticket(premiere.number).labels.has(CHEF_TODO), false);

  // Un cook reprend le ticket, livre une tête neuve, et la pass la retient en carte neuve.
  await tours(s, 12, () => ouvertes(faux).length > 0);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [TICKET]);
  const nouvelle = faux.pr(PR).sha;
  assert.notEqual(nouvelle, sha);
  const [seconde, ...plus] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.deepEqual(plus, []);
  assert.notEqual(seconde.corps, premiere.corps);
  assert.ok(seconde.corps.includes(`https://github.com/faux/depot/blob/${nouvelle}/docs/captures/40/rail-apres.png?raw=true`), seconde.corps);
  assert.ok(!seconde.corps.includes(sha), "the new card shows the new delivery's captures");
  assert.equal(faux.mergee(TICKET), undefined);
});

test("send back without a comment, or on a PR no card holds, is refused and changes nothing", async () => {
  const { faux } = await retenue();
  const vide = await design(faux, "send-back", `faux/depot#${PR}`, "--comment", "  ");
  assert.equal(vide.code, 1);
  assert.match(vide.lignes.join("\n"), /cannot be empty/);
  const ailleurs = await design(faux, "send-back", "faux/depot#77", "--comment", "redo it");
  assert.equal(ailleurs.code, 1);
  assert.deepEqual(renvois(faux), []);
  assert.equal(ouvertes(faux).length, 1);
  const usage = await design(faux, "send-back", `faux/depot#${PR}`);
  assert.equal(usage.code, 2);
});

test("a design delivery without its captures never produces a card: the pass sends it back to its cook asking for them, no chef-todo", async () => {
  for (const fichiers of [["app/src/vue/rail.js"], ["site/index.html", `docs/captures/${TICKET}/accueil-avant.png`]]) {
    const faux = enPass(fichiers);
    const { s } = station(faux, true);
    await tours(s, 3);
    assert.equal(faux.mergee(TICKET), undefined, fichiers.join(", "));
    assert.deepEqual(cartes(faux), [], fichiers.join(", "));
    assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), false);
    const [renvoi] = renvois(faux);
    assert.match(renvoi?.body ?? "", /sent back to a cook \(1\/2\) — the design delivery does not carry its before\/after captures \(missing: [^)]+\): take each screen it changes before and after with `scripts\/capture-ecran\/`, commit them as `docs\/captures\/40\/<screen>-avant\.png`/);
    assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  }
});

test("files of the PR that cannot be read, or a validation GitHub refuses to post on the ticket: nothing is merged, the station says why, and the next turn tries again", async () => {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  let panne = true;
  const bas = faux.pour("A");
  const { s } = station(faux, true, avertis, {
    prsOuvertes: async () => (panne ? [] : bas.prsOuvertes()),
  });
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(cartes(faux), []);
  assert.match(avertis.join("\n"), /pass de #40 sur A — the files of PR #1040 could not be read: whether it is a design delivery, which a human validates on this project, is not known — not merged on this turn/);
  // Les fichiers relus, la demande sur le ticket échoue à son tour : dite, rien de mergé.
  panne = false;
  const lire = bas.prsOuvertes;
  const { s: seconde } = station(faux, true, avertis, {
    prsOuvertes: lire,
    commenter: async (numero, corps) => {
      if (carteDuCorps(corps) !== null) throw new Error("HTTP 502");
      return bas.commenter(numero, corps);
    },
  });
  await tours(seconde, 1);
  assert.match(avertis.at(-1) ?? "", /pass de #40 sur A — HTTP 502/);
  assert.equal(faux.mergee(TICKET), undefined);
  // GitHub répond : la carte se pose au tour suivant, une seule fois sur le ticket et sur la PR.
  await tours(s, 2);
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(cartes(faux).length, 1);
  assert.equal((faux.commentaires.get(PR) ?? []).filter((c) => carteDuCorps(c.body) !== null).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("a card that holds a delivery keeps it unmerged even when this station no longer reads the setting on (#3347); once the chef validates, it merges", async () => {
  const { faux } = await retenue();
  assert.equal(ouvertes(faux).length, 1);
  const { s: sansReglage } = station(faux, false);
  await tours(sansReglage, 4);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(ouvertes(faux).length, 1);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.equal(faux.mergee(TICKET)?.number, PR);
});

test("a card whose delivery the chef sent back no longer holds it when the setting is off", async () => {
  const { faux } = await retenue();
  await design(faux, "send-back", `faux/depot#${PR}`, "--comment", "Move it.");
  const { s } = station(faux, false);
  await tours(s, 4);
  assert.equal(faux.mergee(TICKET)?.number, PR);
});

test("send back on a delivery merged anyway opens a follow-up ticket with the chef's comment and closes the card, instead of failing", async () => {
  const { faux } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  faux.pr(PR).state = "closed";
  faux.pr(PR).merged = true;
  const fin = await design(faux, "send-back", `faux/depot#${PR}`, "--comment", "The take button is still lost.");
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.match(fin.lignes.join("\n"), /was already merged: your comment is the follow-up ticket #\d+/);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(renvois(faux).length, 0);
  const suivi = issuesAPart(faux).find((t) => t.number !== carte.number);
  assert.ok(suivi?.corps.includes("The take button is still lost."), suivi?.corps ?? "no follow-up ticket");
});

test("setting off: a green design delivery is merged by the pass as before, no card", async () => {
  const faux = enPass(ECRAN);
  const { s } = station(faux, false);
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(cartes(faux), []);
});

test("a delivery that is not design is merged as before, whatever the setting", async () => {
  for (const valide of [true, false]) {
    const faux = enPass(["runtime/src/x.ts", "docs/runtime/pass.md"]);
    const { s } = station(faux, valide);
    await tours(s, 3);
    assert.equal(faux.mergee(TICKET)?.number, PR, `setting ${valide}`);
    assert.deepEqual(cartes(faux), []);
  }
});

test("a design delivery is one that changes what the user sees: the app's view, the site, a mockup, captures, or a ticket for the design cook", () => {
  assert.ok(estUneLivraisonDesign(1, ["app/src/vue/rail.js"], []));
  assert.ok(estUneLivraisonDesign(1, ["site/index.html"], []));
  assert.ok(estUneLivraisonDesign(1, ["docs/maquettes/app/rail.html"], []));
  assert.ok(estUneLivraisonDesign(1, ["docs/captures/1/rail-apres.png"], []));
  assert.ok(estUneLivraisonDesign(1, ["runtime/src/x.ts"], ["cook:design"]));
  assert.ok(!estUneLivraisonDesign(1, ["runtime/src/x.ts", "app/src/tableau/todo.ts", "docs/captures/2/rail-apres.png"], ["fire"]));
});

test("the setting reads on for benomite/brigade, off for a project that does not set it, and only `true` or `false` is accepted", () => {
  const brigade = reglagesDuTexte(readFileSync(join(import.meta.dirname, "../../../.claude/brigade/projet.json"), "utf8"));
  assert.equal(designsValidesParUnHumain(brigade), true);
  assert.equal(texteDuFichier(brigade), readFileSync(join(import.meta.dirname, "../../../.claude/brigade/projet.json"), "utf8"));
  const autre = reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main" }));
  assert.equal(designsValidesParUnHumain(autre), false);
  assert.equal(designsValidesParUnHumain(null), false);
  assert.equal(designsValidesParUnHumain(reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", humanValidatesDesigns: false }))), false);
  assert.throws(() => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", humanValidatesDesigns: "yes" })), (erreur) => erreur instanceof ReglageRefuse && erreur.cle === "humanValidatesDesigns");
});

// La station du dépôt, celle que la cuisine ouvre, relit le réglage dans la configuration du projet.
async function parLeDepot(t: TestContext, projet: unknown) {
  const repertoire = mkdtempSync(join(tmpdir(), "validation-design-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue },
    depot: { connait: () => false, preparer: async () => assert.fail("nothing is cooked"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" },
    flux: repertoire,
    // La PR est déjà approuvée : le seul lancement est le jugement du choix de design (#3609).
    lancer: ({ flux }) => {
      writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "<choix-de-design>oui: the layout of the rail</choix-de-design>" })}\n`);
      return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
    },
    avertir: (texte) => avertis.push(texte),
    projet: () => projet,
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let i = 0; i < 3; i += 1) {
    await station.tour();
    await station.calme();
    await station.relu();
  }
  return { faux, avertis };
}

test("the station the kitchen opens reads the setting in the project's configuration: on, the delivery waits for its card; absent, it is merged", async (t) => {
  const tenue = await parLeDepot(t, { integrationBranch: "main", humanValidatesDesigns: true });
  assert.equal(tenue.faux.mergee(TICKET), undefined, tenue.avertis.join("\n"));
  assert.equal(ouvertes(tenue.faux).length, 1);
  const mergee = await parLeDepot(t, { integrationBranch: "main" });
  assert.equal(mergee.faux.mergee(TICKET)?.number, PR, mergee.avertis.join("\n"));
  assert.deepEqual(cartes(mergee.faux), []);
});

// ── Une carte pour une livraison déjà mergée (#3390) ──

// Le chef valide, la PR est mergée et le ticket fermé : le pass d'après ne rend rien au TODO.
test("the chef validates, the PR is merged, then the station's next pass: TODO holds no card for the ticket", async () => {
  const { faux } = await retenue();
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.equal(faux.mergee(TICKET)?.number, PR);
  const avertis: string[] = [];
  const { s } = station(faux, true, avertis);
  await tours(s, 3);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(cartes(faux).length, 1, "the answered card stays the only one");
  assert.deepEqual(avertis, []);
});

test("a pass that read the ticket and its PR open just before the merge opens no card once the merge is done", async () => {
  const { faux } = await retenue();
  const avantMerge = { ...faux.pr(PR) };
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  const ticket = faux.ticket(TICKET);
  const avertis: string[] = [];
  // La lecture du tour est celle d'avant le merge : le ticket et sa PR y sont encore ouverts.
  const perimee: Partial<GitHubDuTour> = {
    fires: async () => [{ number: TICKET, title: ticket.title, labels: [...ticket.labels], state: "open" }],
    prDuTicket: async () => ({ ...avantMerge }),
    prsOuvertes: async () => [{ number: PR, branche: brancheDuTicket(TICKET), fichiers: ECRAN }],
  };
  const { s } = station(faux, true, avertis, perimee);
  await tours(s, 3);
  assert.deepEqual(ouvertes(faux), []);
  assert.equal(cartes(faux).length, 1, "no new card was posted");
});

test("a card left open for a PR merged another way, or for a closed ticket, leaves TODO by itself", async () => {
  for (const cas of ["merged", "pr-closed", "ticket-closed"] as const) {
    const { faux } = await retenue();
    const pr = faux.pr(PR);
    if (cas === "merged") Object.assign(pr, { merged: true, state: "closed" });
    if (cas === "pr-closed") pr.state = "closed";
    assert.equal(ouvertes(faux).length, 1, cas);
    // Un ticket fermé n'est plus dans TODO, quel que soit son label.
    if (cas === "ticket-closed") faux.ticket(TICKET).state = "closed";
    const avertis: string[] = [];
    const { s } = station(faux, true, avertis);
    await tours(s, 2);
    assert.deepEqual(ouvertes(faux), [], cas);
    assert.deepEqual(avertis, [], cas);
  }
});

test("a card whose PR is still open for an open ticket stays in TODO after the sweep", async () => {
  const { faux, s } = await retenue();
  await tours(s, 2);
  assert.equal(ouvertes(faux).length, 1);
  const { s: autre } = station(faux, true);
  await tours(autre, 2);
  assert.equal(ouvertes(faux).length, 1);
});

// ── La comparaison des captures sur la carte (#3617) ──

// La page de #3602 en petit, avant et après : `apres` la change, ou non.
function captures(changer: (apres: Image) => void) {
  const avant = page(360);
  ecrire(avant, 40, 30, "Brigade — the kitchen that serves its tickets", 0x22);
  ecrire(avant, 40, 320, "Last served: 2 days ago, by station A");
  const apres = copie(avant);
  changer(apres);
  return new Map([
    [`docs/captures/${TICKET}/rail-avant.png`, ecrirePng(avant)],
    [`docs/captures/${TICKET}/rail-apres.png`, ecrirePng(apres)],
  ]);
}

// La station A sur une livraison design dont GitHub sert ces captures, et le
// corps de PR `corpsDeLaPR` ; ce qu'elle publie est gardé.
async function comparee(fichiers: Map<string, Buffer>, corpsDeLaPR: string) {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  const publies: Array<{ fichiers: Array<{ chemin: string; contenu: Uint8Array }>; message: string }> = [];
  const lus: string[] = [];
  const issue = fauxClient(faux, "A").issue;
  const { s } = station(faux, true, avertis, {
    fichierBinaire: async (chemin, ref) => {
      lus.push(`${chemin}@${ref}`);
      return fichiers.get(chemin) ?? null;
    },
    publierFichiers: async (publie, message) => {
      publies.push({ fichiers: [...publie], message });
      return "c0ffee0000000000000000000000000000000000";
    },
    issue: async (numero) => (numero === PR ? { number: PR, title: "PR", labels: [], state: "open", createdAt: "", updatedAt: "", url: "", body: corpsDeLaPR } : issue(numero)),
  });
  await tours(s, 3);
  return { faux, avertis, publies, lus, sha: faux.pr(PR).sha };
}

test("setting on, one line of small text changed: the card lists the cook's `## Changes` lines above the captures, then the after capture with the line outlined and, next to it, the line cropped and enlarged, before and after side by side", async () => {
  const fichiers = captures((apres) => remplacer(apres, 40, 320, "Last served: 3 hours ago, by station B"));
  const { faux, avertis, publies, lus, sha } = await comparee(fichiers, `Closes #${TICKET}\n\n## Changes\n\n- footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'\n`);
  assert.deepEqual(avertis, []);
  assert.deepEqual(renvois(faux), []);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(lus, [`docs/captures/${TICKET}/rail-avant.png@${sha}`, `docs/captures/${TICKET}/rail-apres.png@${sha}`]);
  const [carte, ...autres] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  const corps = carte.corps;
  // Dans cet ordre : le brief, les lignes du cook, les zones changées, puis les captures.
  const rangs = ["### What was done", "### Changes", "- footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'", "### Changed areas", "### Captures"].map((texte) => corps.indexOf(texte));
  assert.ok(rangs.every((rang, i) => rang !== -1 && (i === 0 || rang > (rangs[i - 1] ?? 0))), corps);
  // Une seule publication : la capture entourée et la zone agrandie, en PNG.
  assert.equal(publies.length, 1);
  const [publie] = publies as [(typeof publies)[number]];
  assert.deepEqual(publie.fichiers.map(({ chemin }) => chemin), [`comparison/${TICKET}/rail/changed-areas.png`, `comparison/${TICKET}/rail/area-1.png`]);
  assert.match(publie.message, new RegExp(`#${TICKET} \\(${sha.slice(0, 7)}\\)`));
  assert.ok(corps.includes(`![rail — changed areas](https://github.com/faux/depot/blob/c0ffee0000000000000000000000000000000000/comparison/${TICKET}/rail/changed-areas.png?raw=true)`), corps);
  assert.ok(corps.includes(`| ![rail — changed areas](`) && corps.includes(`) | ![rail — area 1, before and after](https://github.com/faux/depot/blob/c0ffee0000000000000000000000000000000000/comparison/${TICKET}/rail/area-1.png?raw=true)<br>Area 1 |`), corps);
  assert.match(corps, /1 changed area, outlined in red on the after capture and enlarged next to it — before on the left, after on the right\./);
  // La capture publiée est la capture après, la ligne changée entourée de rouge.
  const entouree = lirePng(publie.fichiers[0]?.contenu ?? new Uint8Array());
  const apres = lirePng(fichiers.get(`docs/captures/${TICKET}/rail-apres.png`) ?? Buffer.alloc(0));
  assert.equal(entouree.largeur, 1280);
  const rouges = (y: number) => Array.from({ length: entouree.largeur }, (_, x) => pixel(entouree, x, y)).filter((p) => p.join() === "229,29,72,255").length;
  assert.ok(rouges(320 - 6 - 1) > 50, "the outline runs above the changed line");
  assert.equal(rouges(30), 0, "nothing else is outlined");
  assert.deepEqual(pixel(entouree, 50, 322), pixel(apres, 50, 322));
  // La zone agrandie : avant à gauche, après à droite, plus grande que la ligne.
  const zone = lirePng(publie.fichiers[1]?.contenu ?? new Uint8Array());
  assert.ok(zone.hauteur >= 2 * 7 && zone.largeur > 2 * 2 * 7, `${zone.largeur}×${zone.hauteur}`);
  // Les captures du ticket restent sur la carte, que l'app lit.
  assert.ok(corps.includes(`![rail — après](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-apres.png?raw=true)`), corps);
});

test("setting on, a PR body with no `## Changes`: the card is posted all the same, with its comparison and no change lines", async () => {
  const { faux, publies } = await comparee(captures((apres) => remplacer(apres, 40, 320, "Last served: 3 hours ago")), `Closes #${TICKET}\n\nCooked by station \`A\`.`);
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.ok(!carte.corps.includes("### Changes"), carte.corps);
  assert.ok(carte.corps.includes("### Changed areas"), carte.corps);
  assert.equal(publies.length, 1);
});

test("setting on, identical captures or captures that differ only by anti-aliasing noise: no card for the chef, the delivery goes back to its cook asking for captures of the state that shows the change", async () => {
  const bruit = (apres: Image) => {
    for (let y = 0; y < apres.hauteur; y += 1) {
      for (let x = 0; x < apres.largeur; x += 1) {
        const [r = 255] = pixel(apres, x, y);
        if (r < 255) poser(apres, x, y, [Math.min(255, r + 30), Math.min(255, r + 30), Math.min(255, r + 30)]);
      }
    }
  };
  for (const changer of [() => {}, bruit]) {
    const { faux, publies, avertis } = await comparee(captures(changer), `Closes #${TICKET}\n\n## Changes\n\n- footer: 'a' -> 'b'`);
    assert.deepEqual(ouvertes(faux), []);
    assert.equal(faux.mergee(TICKET), undefined);
    assert.deepEqual(publies, []);
    assert.deepEqual(avertis, []);
    // Chaque livraison du cook — le faux en refait une à chaque tour, avec les mêmes captures — repart.
    const lesRenvois = renvois(faux);
    assert.ok(lesRenvois.length >= 1);
    for (const renvoi of lesRenvois) {
      assert.match(renvoi.body, /the captures show no change: the before and after captures of `rail` are identical, or differ only by anti-aliasing noise/);
      assert.match(renvoi.body, /Capture the state of the screen that shows the change/);
    }
  }
});

test("setting on, a capture that is not a readable PNG: the card is posted with its captures, and says that screen could not be compared", async () => {
  const fichiers = captures(() => {});
  fichiers.set(`docs/captures/${TICKET}/rail-apres.png`, Buffer.from("not a png"));
  const { faux, publies } = await comparee(fichiers, `Closes #${TICKET}`);
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.match(carte.corps, /\*\*Screen `rail`\*\* — _its captures could not be compared: `docs\/captures\/40\/rail-apres\.png` is not a readable PNG \(not a PNG file\)\._/);
  assert.ok(carte.corps.includes("### Captures"), carte.corps);
  assert.deepEqual(publies, []);
  assert.deepEqual(renvois(faux), []);
});

// ── Quand la carte s'ouvre (#3609) ──

const VUE = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];

// Une livraison design verte de ce ticket, jugée par `juge`, sur trois tours de pass.
async function jugee(titre: string, labels: string[], corps: string, juge: JugeDuChoix | null) {
  const faux = enPass(VUE, labels);
  Object.assign(faux.ticket(TICKET), { title: titre, corps });
  const avertis: string[] = [];
  const { s } = station(faux, true, avertis, {}, juge);
  await tours(s, 3);
  return { faux, avertis };
}

test("#3593 replayed: a repair of main at prio:0 opened by a station, whose diff touches a view, opens no card like #3595 and the model is never asked", async () => {
  let appels = 0;
  const { faux, avertis } = await jugee("Repair `main`, red on 08de823: windows app tests", [...CALIBRE, "prio:0"], "_Opened by a station, with no gesture from the chef._", async () => {
    appels += 1;
    return { choix: "a group title" };
  });
  assert.equal(appels, 0);
  assert.deepEqual(ouvertes(faux), []);
  assert.notEqual(faux.mergee(TICKET), undefined, avertis.join("\n"));
});

for (const [exclusion, titre, labels, corps] of [
  ["prio:0 alone", "Tidy the rail", [...CALIBRE, "prio:0"], "the ticket's body"],
  ["a station opening alone", "Tidy the rail", CALIBRE, "<!-- brigade:qualite -->\nquality alert"],
  ["a title that repairs main alone", "Repair `main`, red on 08de823", CALIBRE, "the ticket's body"],
] as const) {
  test(`technical rule, no model call: ${exclusion} opens no card`, async () => {
    let appels = 0;
    const { faux } = await jugee(titre, [...labels], corps, async () => {
      appels += 1;
      return { choix: "x" };
    });
    assert.equal(appels, 0);
    assert.deepEqual(ouvertes(faux), []);
    assert.notEqual(faux.mergee(TICKET), undefined);
  });
}

test("#3602 replayed: a wording the ticket's criteria already set — the judge says there is no choice — opens no card like #3606; the pass merges, and the judge read the ticket's criteria", async () => {
  const lus: string[] = [];
  const { faux } = await jugee("The rail says held: breaker open", CALIBRE, "## Acceptance criteria\n\n- the group says “held: breaker open”", async (corps) => {
    lus.push(corps);
    return { choix: null };
  });
  assert.equal(lus.length, 1);
  assert.match(lus[0] ?? "", /held: breaker open/);
  assert.deepEqual(ouvertes(faux), []);
  assert.notEqual(faux.mergee(TICKET), undefined);
});

for (const exclusion of ["punctuation only", "a fix restoring what was already there"]) {
  test(`judge outcome no (${exclusion}): no card, the delivery is merged`, async () => {
    const { faux } = await jugee("Fix the rail", CALIBRE, "the ticket's body", async () => ({ choix: null }));
    assert.deepEqual(ouvertes(faux), []);
    assert.notEqual(faux.mergee(TICKET), undefined);
  });
}

test("judge outcome yes (a new layout): a card opens, and its text has one line naming the design choice", async () => {
  const { faux } = await jugee("Rework the rail", CALIBRE, "the ticket's body", async () => ({ choix: "the rail becomes two columns instead of one list" }));
  const [carte, ...autres] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  assert.ok(carte.corps.split("\n").includes("**Design choice:** the rail becomes two columns instead of one list"), carte.corps);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("a judge that cannot answer, or no judge at all, decides nothing: no card, no merge, and the pass says why", async () => {
  const sansReponse = await jugee("Rework the rail", CALIBRE, "the ticket's body", async () => {
    throw new Error("the design judgment of PR #1040 is unreadable: no block");
  });
  assert.deepEqual(ouvertes(sansReponse.faux), []);
  assert.equal(sansReponse.faux.mergee(TICKET), undefined);
  assert.ok(sansReponse.avertis.some((a) => a.includes("unreadable")), sansReponse.avertis.join("\n"));
  const sansJuge = await jugee("Rework the rail", CALIBRE, "the ticket's body", null);
  assert.deepEqual(ouvertes(sansJuge.faux), []);
  assert.equal(sansJuge.faux.mergee(TICKET), undefined);
  assert.ok(sansJuge.avertis.some((a) => a.includes("no judge")), sansJuge.avertis.join("\n"));
});
