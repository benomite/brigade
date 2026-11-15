// Une validation demandée sur le ticket qu'elle valide (#3615) : la pass du
// chemin GitHub seul (`stationGitHub`) sur le faux GitHub retient une livraison
// verte pour le chef — un design, ou un ticket sensible — et la demande par un
// commentaire sur le ticket et sur sa PR, jamais par une issue à part.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour, type StationGitHub } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { carteEnCours, CHEF_TODO, type Sorte } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { LABEL_SENSITIVE } from "../../src/sensible/sensible.ts";
import { corpsDeCeQuiEstFait } from "../../src/validation-design/brief.ts";
import { demandeDuCorps, demanderSurLeTicket } from "../../src/validation-sur-ticket/validation-sur-ticket.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const TICKET = 40;
const PR = 1040;
const CHEF = "benomite";
const ECRAN = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];

// Un ticket en pass, sa PR approuvée et verte, qui change `fichiers` ; le cook
// a dit sur la PR ce qu'il a fait.
function enPass(fichiers: string[], labels: string[] = CALIBRE) {
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...labels, LABEL_IN_PASS]);
  const sha = faux.sha();
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers });
  faux.poster(PR, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  faux.poster(PR, "A", corpsDeCeQuiEstFait(["the TODO column takes the full width"]));
  return faux;
}

// La station A, qui valide les designs par un humain ; chaque création
// d'issue est notée, et refusée.
function station(faux: FauxGitHub, { avertis = [], pannes = {}, chef = async () => CHEF }: { avertis?: string[]; pannes?: Partial<GitHubDuTour>; chef?: () => Promise<string | null> } = {}) {
  const creees: string[] = [];
  const client = fauxClient(faux, "A");
  const ouvertes: GitHub["ouvertes"] = async () => ({
    inchange: false,
    issues: [...faux.tickets.values()].filter((t) => t.state === "open").map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
    confirmer: () => {},
  });
  const github = {
    ...faux.pour("A"),
    ouvertes,
    prDeBranche: client.prDeBranche,
    creerIssue: async ({ titre }: { titre: string }) => {
      creees.push(titre);
      throw new Error("no issue is created to ask a validation");
    },
    ...pannes,
  };
  const s: StationGitHub = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "A"),
    depotServi: "faux/depot",
    designsValidesParUnHumain: () => true,
    chef,
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: "A", issue: ticket.number });
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

async function tours(s: StationGitHub, n: number) {
  for (let i = 0; i < n; i += 1) {
    await s.tour();
    await s.calme();
  }
}

const demandes = (faux: FauxGitHub, sorte: Sorte, numero: number) => (faux.commentaires.get(numero) ?? []).filter((c) => demandeDuCorps(sorte, c.body) !== null);
const mentions = (faux: FauxGitHub) => [TICKET, PR].flatMap((numero) => faux.commentaires.get(numero) ?? []).reduce((n, c) => n + (c.body.match(new RegExp(`@${CHEF}\\b`, "g"))?.length ?? 0), 0);

test("a design validation creates no issue: one comment on the ticket and one on its pull request carry the question, what was asked, what was done and the before/after captures; the ticket awaits the chef in TODO, with no `decision` label and the chef mentioned once", async () => {
  const faux = enPass(ECRAN);
  const issues = faux.tickets.size;
  const avertis: string[] = [];
  const { s, creees } = station(faux, { avertis });
  await tours(s, 3);
  const sha = faux.pr(PR).sha;
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(creees, [], "no issue-creation call");
  assert.equal(faux.tickets.size, issues, "the repository's issue count is unchanged");
  const [surLeTicket, ...autres] = demandes(faux, "design-validation", TICKET);
  const [surLaPR, ...plus] = demandes(faux, "design-validation", PR);
  assert.ok(surLeTicket !== undefined && surLaPR !== undefined);
  assert.deepEqual([autres, plus], [[], []]);
  for (const { body } of [surLeTicket, surLaPR]) {
    assert.ok(body.startsWith(`<!-- brigade:todo kind=design-validation pr=${PR} ticket=${TICKET} sha=${sha} -->\n`), body);
    assert.match(body, /Does the screen of #40 look right\?/);
    assert.ok(body.includes(`Pull request: https://github.com/faux/depot/pull/${PR}`), body);
    assert.ok(body.includes("### What was asked"), body);
    assert.ok(body.includes("### What was done\n\n- the TODO column takes the full width"), body);
    assert.ok(body.includes(`![rail — avant](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-avant.png?raw=true)`), body);
    assert.ok(body.includes(`![rail — après](https://github.com/faux/depot/blob/${sha}/docs/captures/40/rail-apres.png?raw=true)`), body);
  }
  // Le ticket attend le chef : TODO le lit comme une carte de validation.
  const ticket = faux.ticket(TICKET);
  assert.ok(ticket.labels.has(CHEF_TODO));
  assert.equal(ticket.labels.has("decision"), false);
  assert.equal(carteEnCours([...ticket.labels], faux.commentaires.get(TICKET) ?? [])?.sorte, "design-validation");
  assert.deepEqual(surLeTicket.body.split("\n").slice(1, 3), [`**${"Does the screen of #40 look right? Validate it and PR #1040 is merged; send it back with what to change and a cook takes it up again."}**`, `cc @${CHEF}`]);
  // TODO montre la question seule, sans la mention.
  assert.match(carteEnCours([...ticket.labels], faux.commentaires.get(TICKET) ?? [])?.texte.split("\n")[0] ?? "", /^\*\*Does the screen of #40 look right\?.*\*\*$/);
  assert.equal(mentions(faux), 1);
  assert.deepEqual(avertis, []);
});

test("asked again for the same pull request and commit, the validation posts nothing more", async () => {
  const faux = enPass(ECRAN);
  const { s } = station(faux);
  await tours(s, 3);
  const avant = [TICKET, PR].map((numero) => (faux.commentaires.get(numero) ?? []).length);
  await tours(s, 3);
  const { s: autre } = station(faux);
  await tours(autre, 3);
  assert.deepEqual([TICKET, PR].map((numero) => (faux.commentaires.get(numero) ?? []).length), avant);
  assert.equal(demandes(faux, "design-validation", TICKET).length, 1);
  assert.equal(mentions(faux), 1);
  // La pose même, rejouée sur la même PR et la même tête : rien ne s'écrit.
  const sha = faux.pr(PR).sha;
  const ecrit = await demanderSurLeTicket(faux.pour("A"), { sorte: "design-validation", ticket: TICKET, pr: PR, sha, question: "Q?", chef: CHEF, suite: [] });
  assert.deepEqual(ecrit, { ticket: false, pr: false });
  assert.deepEqual([TICKET, PR].map((numero) => (faux.commentaires.get(numero) ?? []).length), avant);
});

test("once the chef has answered for the pull request and the commit, the pass asks nothing: no comment, no card, it merges", async () => {
  const faux = enPass(ECRAN);
  const sha = faux.pr(PR).sha;
  faux.poster(TICKET, "chef", `<!-- brigade:validation-design-validee carte=${TICKET} pr=${PR} sha=${sha} -->\nValidated by the chef.`);
  const avant = [TICKET, PR].map((numero) => (faux.commentaires.get(numero) ?? []).length);
  const { s, creees } = station(faux);
  await tours(s, 3);
  assert.equal(faux.mergee(TICKET)?.number, PR);
  assert.deepEqual(demandes(faux, "design-validation", TICKET), []);
  assert.deepEqual(demandes(faux, "design-validation", PR), []);
  assert.equal((faux.commentaires.get(PR) ?? []).length, avant[1]);
  assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), false);
  assert.deepEqual(creees, []);
});

test("for a pull request already merged or closed, no validation is asked", async () => {
  for (const cas of ["merged", "closed"] as const) {
    const faux = enPass(ECRAN);
    const ouverte = { ...faux.pr(PR) };
    Object.assign(faux.pr(PR), cas === "merged" ? { merged: true, state: "closed" } : { state: "closed" });
    const ticket = faux.ticket(TICKET);
    // La lecture du tour est celle d'avant : le ticket et sa PR y sont encore ouverts.
    const { s, creees } = station(faux, {
      pannes: {
        fires: async () => [{ number: TICKET, title: ticket.title, labels: [...ticket.labels], state: "open" }],
        prDuTicket: async () => ({ ...ouverte }),
        prsOuvertes: async () => [{ number: PR, branche: brancheDuTicket(TICKET), fichiers: ECRAN }],
      },
    });
    await tours(s, 3);
    assert.deepEqual(demandes(faux, "design-validation", TICKET), [], cas);
    assert.deepEqual(demandes(faux, "design-validation", PR), [], cas);
    assert.equal(faux.ticket(TICKET).labels.has(CHEF_TODO), false, cas);
    assert.equal(mentions(faux), 0, cas);
    assert.deepEqual(creees, [], cas);
  }
});

test("a validation that is not a design — a sensitive ticket held for the chef's review — behaves the same: a comment on the ticket and on its pull request, no issue apart, the chef mentioned once", async () => {
  const faux = enPass(["runtime/src/x.ts"], [...CALIBRE, LABEL_SENSITIVE]);
  const issues = faux.tickets.size;
  const { s, creees } = station(faux);
  await tours(s, 3);
  const sha = faux.pr(PR).sha;
  assert.equal(faux.mergee(TICKET), undefined);
  assert.deepEqual(creees, []);
  assert.equal(faux.tickets.size, issues);
  const [surLeTicket, ...autres] = demandes(faux, "review-before-merge", TICKET);
  const [surLaPR, ...plus] = demandes(faux, "review-before-merge", PR);
  assert.ok(surLeTicket !== undefined && surLaPR !== undefined);
  assert.deepEqual([autres, plus], [[], []]);
  assert.deepEqual(demandeDuCorps("review-before-merge", surLeTicket.body), { pr: PR, ticket: TICKET, sha });
  for (const { body } of [surLeTicket, surLaPR]) {
    assert.match(body, /#40 is sensitive: review PR #1040 before it is merged\./);
    assert.ok(body.includes("### What was asked") && body.includes("### What was done\n\n- the TODO column takes the full width"), body);
  }
  assert.deepEqual(demandes(faux, "design-validation", TICKET), []);
  const ticket = faux.ticket(TICKET);
  assert.ok(ticket.labels.has(CHEF_TODO));
  assert.equal(ticket.labels.has("decision"), false);
  assert.equal(carteEnCours([...ticket.labels], faux.commentaires.get(TICKET) ?? [])?.sorte, "review-before-merge");
  assert.equal(mentions(faux), 1);
  // Rejouée, la pass ne pose rien de plus.
  await tours(s, 3);
  assert.equal(demandes(faux, "review-before-merge", TICKET).length, 1);
  assert.equal(demandes(faux, "review-before-merge", PR).length, 1);
});

test("without a resolved chef, the validation is still asked on the ticket, mentioning nobody, and the station says why once", async () => {
  for (const chef of [async () => null, async () => Promise.reject(new Error("HTTP 502"))]) {
    const faux = enPass(ECRAN);
    const avertis: string[] = [];
    const { s } = station(faux, { avertis, chef });
    await tours(s, 3);
    const corps = demandes(faux, "design-validation", TICKET)[0]?.body ?? assert.fail("no validation asked on the ticket");
    assert.ok(corps.split("\n")[1]?.startsWith("**Does the screen of #40 look right?"), corps);
    assert.ok(!corps.includes("cc @"), corps);
    assert.equal(mentions(faux), 0);
    assert.ok(faux.ticket(TICKET).labels.has(CHEF_TODO));
    const dits = avertis.filter((ligne) => ligne.includes("chef not mentioned on a validation asked on its ticket"));
    assert.equal(dits.length, 1, avertis.join("\n"));
  }
});

test("the marker of a validation request: its first line names the kind, the pull request, the ticket and the commit, and only that line is read", () => {
  assert.deepEqual(demandeDuCorps("design-validation", "<!-- brigade:todo kind=design-validation pr=12 ticket=3 sha=abcdef1 -->\n**Q?**"), { pr: 12, ticket: 3, sha: "abcdef1" });
  assert.equal(demandeDuCorps("review-before-merge", "<!-- brigade:todo kind=design-validation pr=12 ticket=3 sha=abcdef1 -->"), null);
  assert.equal(demandeDuCorps("design-validation", "text\n<!-- brigade:todo kind=design-validation pr=12 ticket=3 sha=abcdef1 -->"), null);
  assert.equal(demandeDuCorps("design-validation", "<!-- brigade:todo kind=design-validation -->"), null);
  // TODO lit la demande comme toute carte : sa sorte, et le texte après le marqueur.
  assert.deepEqual(carteEnCours([CHEF_TODO], [{ body: "<!-- brigade:todo kind=design-validation pr=12 ticket=3 sha=abcdef1 -->\n**Q?**", association: "OWNER" }]), { sorte: "design-validation", texte: "**Q?**" });
});
