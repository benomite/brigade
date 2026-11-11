// Une livraison design validée par un humain (#3184) : la pass du chemin
// GitHub seul (`stationGitHub`, `stationDuDepot`) sur le faux GitHub, et les
// deux gestes que l'app appelle (`npm run design`), joués par leur `principal`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { brancheDuTicket, priseDeLaStation, stationDuDepot, stationGitHub, type GitHubDuTour, type StationGitHub } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { carteEnCours, CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { MARQUE_DE_RENVOI } from "../../src/qualite-github.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier } from "../../src/reglages-projet/reglages.ts";
import { principal } from "../../src/validation-design/commande.ts";
import { carteDuCorps, designsValidesParUnHumain, estUneLivraisonDesign, TITRE_DE_CARTE } from "../../src/validation-design/validation-design.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

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

// La station A, sous ce réglage, ses relectures attendues à chaque tour ; ses
// cartes gardent leur titre, que le faux oublie. Le cook d'un renvoi pousse une
// tête neuve.
function station(faux: FauxGitHub, valide: boolean, avertis: string[] = [], pannes: Partial<GitHubDuTour> = {}) {
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
    designsValidesParUnHumain: () => valide,
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

// Le GitHub des gestes du chef, sur le faux : ses issues ouvertes avec leur corps.
function gestes(faux: FauxGitHub) {
  const client = fauxClient(faux, "chef");
  const ouvertesLues: GitHub["ouvertes"] = async () => ({
    inchange: false,
    issues: [...faux.tickets.values()].filter((t) => t.state === "open").map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
    confirmer: () => {},
  });
  return { ...client, ouvertes: ouvertesLues, fermer: () => {} };
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
  const { s, titres } = station(faux, true, avertis);
  await tours(s, 3);
  return { faux, s, titres, avertis, sha: faux.pr(PR).sha };
}

test("setting on: a green design delivery with its captures is not merged; a chef-todo card “Validate its screen” asks the question, embeds the before and after captures as images and links the PR", async () => {
  const { faux, titres, avertis, sha } = await retenue();
  assert.equal(faux.mergee(TICKET), undefined);
  const [carte, ...autres] = ouvertes(faux);
  assert.ok(carte !== undefined);
  assert.deepEqual(autres, []);
  assert.equal(titres.get(carte.number), TITRE_DE_CARTE);
  assert.equal(TITRE_DE_CARTE, "Validate its screen");
  assert.deepEqual(carteDuCorps(carte.corps), { pr: PR, ticket: TICKET });
  assert.match(carte.corps, /Does the screen of #40 look right\?/);
  assert.ok(carte.corps.includes(`Pull request: https://github.com/faux/depot/pull/${PR}`), carte.corps);
  assert.ok(carte.corps.includes(`![rail — avant](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-avant.png?raw=true)`), carte.corps);
  assert.ok(carte.corps.includes(`![rail — après](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-apres.png?raw=true)`), carte.corps);
  // Le TODO du chef la lit comme une carte : sa sorte et sa question.
  const lue = carteEnCours([...carte.labels], faux.commentaires.get(carte.number) ?? []);
  assert.equal(lue?.sorte, "design-validation");
  assert.match(lue?.texte ?? "", /^Does the screen of #40 look right\?/);
  // Le ticket reste en pass, et dit sa carte ; aucun refus de GitHub n'est dit.
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_IN_PASS));
  assert.ok((faux.commentaires.get(TICKET) ?? []).some((c) => c.body.includes(`card #${carte.number}`)));
  assert.deepEqual(avertis, []);
  assert.deepEqual(renvois(faux), []);
});

test("a held delivery gets one card only, however many turns pass, even when its head moves without a new delivery", async () => {
  const { faux, s } = await retenue();
  await tours(s, 3);
  // La base a bougé : GitHub a mis la branche à jour, la tête change, la CI repasse au vert.
  const avant = faux.pr(PR).sha;
  faux.pr(PR).sha = faux.sha();
  await tours(s, 4);
  assert.notEqual(faux.pr(PR).sha, avant);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.equal(cartes(faux).length, 1);
  assert.equal(ouvertes(faux).length, 1);
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
  await tours(s, 12, () => ouvertes(faux).some((carte) => carte.number !== premiere.number));
  assert.equal(faux.ticket(premiere.number).state, "closed");
  assert.equal(faux.ticket(premiere.number).labels.has(CHEF_TODO), false);
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
});

test("validate with the card's PR number merges the delivery and closes the card", async () => {
  const { faux, s } = await retenue();
  const [carte] = ouvertes(faux);
  assert.ok(carte !== undefined);
  const fin = await design(faux, "validate", `faux/depot#${PR}`);
  assert.equal(fin.code, 0, fin.lignes.join("\n"));
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.equal(faux.ticket(carte.number).state, "closed");
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
  assert.equal(faux.ticket(premiere.number).state, "closed");
  assert.equal(faux.ticket(premiere.number).labels.has(CHEF_TODO), false);

  // Un cook reprend le ticket, livre une tête neuve, et la pass la retient en carte neuve.
  await tours(s, 12, () => ouvertes(faux).length > 0);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [TICKET]);
  const nouvelle = faux.pr(PR).sha;
  assert.notEqual(nouvelle, sha);
  const [seconde, ...plus] = ouvertes(faux);
  assert.ok(seconde !== undefined);
  assert.deepEqual(plus, []);
  assert.notEqual(seconde.number, premiere.number);
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

test("files of the PR that cannot be read, or a card GitHub refuses to create: nothing is merged, the station says why, and the next turn tries again", async () => {
  const faux = enPass(ECRAN);
  const avertis: string[] = [];
  let panne = true;
  const bas = faux.pour("A");
  const { s } = station(faux, true, avertis, {
    prsOuvertes: async () => (panne ? [] : bas.prsOuvertes()),
    creerIssue: async (issue) => {
      if (panne) throw new Error("HTTP 502");
      return bas.creerIssue(issue);
    },
  });
  await tours(s, 2);
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(cartes(faux), []);
  assert.match(avertis.join("\n"), /pass de #40 sur A — the files of PR #1040 could not be read: whether it is a design delivery, which a human validates on this project, is not known — not merged on this turn/);
  // Les fichiers relus, la création de la carte échoue à son tour : dite, rien de mergé.
  panne = false;
  const lire = bas.prsOuvertes;
  const { s: seconde } = station(faux, true, avertis, { prsOuvertes: lire, creerIssue: async () => { throw new Error("HTTP 502"); } });
  await tours(seconde, 1);
  assert.match(avertis.at(-1) ?? "", /pass de #40 sur A — HTTP 502/);
  assert.equal(faux.mergee(TICKET), undefined);
  // GitHub répond : la carte se pose au tour suivant.
  await tours(s, 2);
  assert.equal(ouvertes(faux).length, 1);
  assert.equal(faux.mergee(TICKET), undefined);
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
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue },
    depot: { connait: () => false, preparer: async () => assert.fail("nothing is cooked"), reprendre: async () => assert.fail("nothing is cooked"), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer: () => assert.fail("the PR is already approved: no review"),
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
