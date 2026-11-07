// La guérison jouée par le tour de la station (#2757), de bout en bout : deux
// projets sur leur faux GitHub, chacun servi par sa station, et un tour qui
// les guérit tous les deux — rien n'y est propre à un dépôt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { DEBUT, FIN } from "../../src/epique.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { DELAI_CLAIM_PERIME_MS } from "../../src/guerison/claim-perime.ts";
import { HORS_CUISINE } from "../../src/github.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const MINUTE = 60_000;
const CONFLIT = 10;
const PRIS = 11;
const PRETE = 12;
const EPIQUE = 20;

// Un projet : son faux GitHub, sa station, son horloge, ce qu'elle dit au
// journal et les labels qu'elle pose. `casser` : un geste du client qui lève.
function projet(depot: string, station: string, base: string, casser: Partial<GitHubDuTour> = {}, echoue = false) {
  const faux = new FauxGitHub();
  let instant = Date.parse("2026-11-07T10:00:00Z");
  const avertis: string[] = [];
  const poses: Array<[number, string]> = [];
  const bas = faux.pour(station);
  const github: GitHubDuTour = {
    ...bas,
    issue: fauxClient(faux, station).issue,
    labelliser: async (numero, labels) => {
      for (const label of labels) poses.push([numero, label]);
      await bas.labelliser(numero, labels);
    },
    ...casser,
  };
  const tour = stationGitHub({
    nom: station,
    places: 1,
    base,
    github,
    prise: faux.prise(github, station),
    // Le cook pousse sur la branche, sans résoudre le conflit de contenu.
    // `echoue` : il s'arrête sans livrer.
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station, issue: ticket.number });
      if (echoue) return { echec: "the conflict with the base is beyond this cook" };
      const ouverte = faux.prs.findLast((p) => p.issue === ticket.number && p.state === "open");
      if (ouverte !== undefined) ouverte.sha = faux.sha();
      return { branche: brancheDuTicket(ticket.number) };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: (texte) => avertis.push(texte),
    maintenant: () => new Date(instant),
  });
  const passer = async () => {
    await tour.tour();
    await tour.calme();
    await tour.relu();
  };
  return { depot, station, faux, avertis, poses, passer, avancer: (ms: number) => (instant += ms) };
}

type Projet = ReturnType<typeof projet>;

const commentairesDe = (p: Projet, numero: number) => (p.faux.commentaires.get(numero) ?? []).map((c) => c.body);

// Un ticket mis de côté dont la PR est en conflit avec la base.
function conflitDeCote(p: Projet) {
  p.faux.feu(CONFLIT, [...CALIBRE, HORS_CUISINE]);
  p.faux.prs.push({ number: 100 + CONFLIT, issue: CONFLIT, branche: brancheDuTicket(CONFLIT), sha: p.faux.sha(), state: "open", merged: false, enRetard: false, enConflit: true, conflitDeContenu: true, mergeePar: null, fichiers: [] });
}

// Tout ce que la guérison doit réparer, sauf le claim : il vieillit avant.
function aGuerir(p: Projet) {
  conflitDeCote(p);
  // Une PR approuvée sur sa tête, verte et mergeable, sans `in-pass` sur son ticket.
  p.faux.feu(PRETE);
  const sha = p.faux.sha();
  p.faux.prs.push({ number: 100 + PRETE, issue: PRETE, branche: brancheDuTicket(PRETE), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
  p.faux.poster(100 + PRETE, p.station, corpsDeVerdict(p.station, sha, { verdict: "approve", motif: "" }));
  // Une épique dont les deux sous-tickets sont fermés.
  p.faux.feu(EPIQUE, ["fire"], `${DEBUT}\n- #21\n- #22\n${FIN}`);
  for (const numero of [21, 22]) {
    p.faux.feu(numero);
    p.faux.ticket(numero).state = "closed";
  }
}

// Un `taken` que la station tient encore, sans cook : son cook s'est arrêté
// sans le rendre. La station le voit à un tour, puis 46 min passent.
async function claimPerime(p: Projet) {
  await p.passer();
  p.faux.feu(PRIS, [...CALIBRE, "taken"]);
  p.faux.poster(PRIS, p.station, corpsDePrise(p.station));
  await p.passer();
  assert.ok(p.faux.ticket(PRIS).labels.has("taken"), "a fresh claim is kept");
  p.avancer(DELAI_CLAIM_PERIME_MS + MINUTE);
}

function assertGueri(p: Projet) {
  const dit = `${p.depot}: ${p.avertis.join("\n")}`;
  // Le ticket en conflit est relancé : `hors-cuisine` tombe, et le commentaire dit de rebaser.
  assert.ok(commentairesDe(p, CONFLIT).some((c) => c.startsWith("<!-- brigade:relance cause=conflict n=1")), dit);
  assert.ok(p.faux.cuissons.some((c) => c.issue === CONFLIT) || !p.faux.ticket(CONFLIT).labels.has(HORS_CUISINE), dit);
  // Le claim périmé est libéré.
  assert.ok(commentairesDe(p, PRIS).some((c) => /released the claim/.test(c)), dit);
  // La PR prête reçoit `in-pass` sur son ticket.
  assert.ok(p.poses.some(([numero, label]) => numero === PRETE && label === "in-pass"), dit);
  // L'épique finie est fermée.
  assert.equal(p.faux.ticket(EPIQUE).state, "closed", dit);
  assert.ok(commentairesDe(p, EPIQUE).some((c) => /All the sub-tickets this epic lists are closed \(#21, #22\)/.test(c)), dit);
}

test("one pass of the kitchen heals two projects: a conflicting set-aside ticket relaunched, a 46-minute stale taken released, in-pass on a ready PR, a finished epic closed", async () => {
  const projets = [projet("acme/shop", "box/claude", "trunk"), projet("zeta/lab", "mac/claude", "develop")];
  for (const p of projets) await claimPerime(p);
  for (const p of projets) aGuerir(p);
  // Un seul tour de chaque station.
  await Promise.all(projets.map((p) => p.passer()));
  for (const p of projets) assertGueri(p);
  // La consigne nomme la base de chaque projet, pas une autre.
  assert.ok(commentairesDe(projets[0] as Projet, CONFLIT).some((c) => c.includes("rebase the branch on `trunk`")));
  assert.ok(commentairesDe(projets[1] as Projet, CONFLIT).some((c) => c.includes("rebase the branch on `develop`")));
});

test("after two relaunches for the same reason, no third happens and one bug ticket is filed", async () => {
  // Le cook relancé s'arrête sans livrer : la station remet le ticket de côté,
  // et sa PR est toujours en conflit.
  const p = projet("acme/shop", "box/claude", "trunk", {}, true);
  conflitDeCote(p);
  const relances = () => commentairesDe(p, CONFLIT).filter((c) => c.startsWith("<!-- brigade:relance cause=conflict")).length;
  for (let i = 0; i < 40 && p.faux.creations.length === 0; i += 1) await p.passer();
  assert.equal(relances(), 2, p.avertis.join("\n"));
  assert.equal(p.faux.creations.length, 1);
  assert.ok(p.faux.ticket(CONFLIT).labels.has(HORS_CUISINE));
  const [bug] = p.faux.creations;
  assert.match(p.faux.ticket(bug as number).corps, /relaunched it 2 times/);
  // Des tours encore : ni troisième relance, ni second bug.
  for (let i = 0; i < 3; i += 1) await p.passer();
  assert.equal(relances(), 2);
  assert.equal(p.faux.creations.length, 1);
  assert.ok(p.faux.ticket(CONFLIT).labels.has(HORS_CUISINE));
});

test("a gesture that throws does not stop the others, and its error is logged", async () => {
  // GitHub refuse de fermer une issue : la clôture de l'épique lève.
  const p = projet("zeta/lab", "mac/claude", "develop", {
    fermerIssue: async () => {
      throw new Error("HTTP 502 — closing refused");
    },
  });
  await claimPerime(p);
  aGuerir(p);
  await p.passer();
  assert.equal(p.faux.ticket(EPIQUE).state, "open");
  assert.ok(p.avertis.some((ligne) => /healing \(epique #20\) on mac\/claude — HTTP 502 — closing refused/.test(ligne)), p.avertis.join("\n"));
  // Les autres gestes ont joué.
  assert.ok(commentairesDe(p, CONFLIT).some((c) => c.startsWith("<!-- brigade:relance cause=conflict n=1")));
  assert.ok(commentairesDe(p, PRIS).some((c) => /released the claim/.test(c)));
  assert.ok(p.poses.some(([numero, label]) => numero === PRETE && label === "in-pass"));
});
