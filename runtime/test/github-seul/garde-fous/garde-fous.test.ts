// Les garde-fous de l'ancien chemin sur les cooks de l'état GitHub seul
// (`github-seul/garde-fous/garde-fous.ts`, #2213) : le disjoncteur, le budget
// du compte Max, le « stop » du chef et l'arbitre retiennent la prise, et les
// cooks passent par les garde-fous du runtime.
//
// Le tour est le vrai (`stationGitHub`), sur un vrai runtime et ses vrais
// garde-fous, avec la vraie règle de l'arbitre : seuls GitHub et `claude` sont
// faux — un GitHub en mémoire et la doublure de `claude`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Arbitrage } from "../../../src/arbitrage.ts";
import { ouvrirArbitre, type Mot } from "../../../src/arbitre.ts";
import { brancheDuTicket, stationDuDepot, stationGitHub, type GitHubDuTour, type Prise, type TicketLu } from "../../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../../src/github-etat/etats.ts";
import type { GitHub } from "../../../src/github.ts";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { gardesDuTour } from "../../../src/github-seul/garde-fous/garde-fous.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { etatStation } from "../../../src/projections/stations.ts";
import { demarrer } from "../../../src/runtime.ts";
import { ENV_ENFANT, FAUX_CLAUDE, jusqua, repertoireTemporaire } from "../../outils.ts";

const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const STATION = "box/claude";
const PROJET = "brigade";

// Un GitHub en mémoire : les tickets, leurs labels, les PR ouvertes et ce que
// la station y commente.
class FauxGitHub {
  tickets = new Map<number, { number: number; title: string; labels: Set<string>; state: "open" }>();
  prs: string[] = [];
  commentaires: Array<{ issue: number; corps: string }> = [];
  prises: number[] = [];

  feu(number: number): void {
    this.tickets.set(number, { number, title: `ticket ${number}`, labels: new Set(CALIBRE), state: "open" });
  }

  labels(number: number): string[] {
    return [...(this.tickets.get(number)?.labels ?? [])].sort();
  }

  client(): GitHubDuTour {
    const ticket = (numero: number) => {
      const lu = this.tickets.get(numero);
      if (lu === undefined) throw new Error(`#${numero} inconnu`);
      return lu;
    };
    return {
      fires: async (): Promise<TicketLu[]> => [...this.tickets.values()].map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state })),
      dependancesOuvertes: async () => [],
      prDuTicket: async () => null,
      corpsDuTicket: async () => "",
      prsOuvertes: async () => this.prs.map((branche) => ({ branche, fichiers: [] })),
      checksDeLaBase: async () => [{ outcome: "green" }],
      teteDeLaBase: async () => "0".repeat(40),
      issuesDepuis: async () => [],
      creerIssue: async () => 0,
      fermerIssue: async () => {},
      commentaires: async () => [],
      commenter: async (issue, corps) => void this.commentaires.push({ issue, corps }),
      labelliser: async (issue, labels) => labels.forEach((label) => ticket(issue).labels.add(label)),
      delabelliser: async (issue, label) => void ticket(issue).labels.delete(label),
      retraitsDeLabels: async () => [],
      ouvrirPR: async ({ branche }) => {
        this.prs.push(branche);
        return `https://github.com/faux/depot/pull/${this.prs.length}`;
      },
      ci: async () => [],
      etatDuRun: async () => ({ tentative: 1, termine: true }),
      relancerLesEchecs: async () => {},
      mettreAJour: async () => {},
      merger: async () => ({ fait: true }),
    };
  }

  // La prise : personne d'autre ne tient le ticket, elle l'emporte.
  prise(): Prise {
    return {
      prendre: async (issue) => {
        this.prises.push(issue.number);
        this.tickets.get(issue.number)?.labels.add(LABEL_TAKEN);
        return { prise: true };
      },
      lacher: async (issue) => this.tickets.get(issue.number)?.labels.delete(LABEL_TAKEN) ?? false,
    };
  }
}

// L'arbitre de la machine, sa vraie règle, joint sans réseau.
function arbitreEnMemoire(t: TestContext, plafond: number) {
  const arbitre = ouvrirArbitre({ repertoire: repertoireTemporaire(t), plafond });
  t.after(() => arbitre.fermer());
  const joint: Arbitrage = {
    port: 0,
    echanger: async (projet, { veut, ...mot }) => {
      if (veut) return arbitre.demander(projet, mot);
      arbitre.dire(projet, mot);
      return { accorde: null, motif: null };
    },
    quitter: async (projet) => arbitre.quitter(projet),
    etat: async () => arbitre.etat(),
  };
  return { arbitre, joint };
}

const mot = (cooks: number, demande: boolean): Mot => ({ cooks, demande, machine: false, nonArbitres: 0, consommation: { jour: 0, semaine: 0 } });

// Une cuisine GitHub seul : le runtime du projet et ses garde-fous, la station
// du tour et ses gardes. Le cook de chaque ticket est la doublure de `claude`,
// lancée par les gardes, avec le scénario que le test lui donne.
function cuisine(t: TestContext, options: { arbitre?: Arbitrage | null; scenario?: (issue: number) => string } = {}) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const gardes = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: options.arbitre ?? null, avertir: () => {} });
  const faux = new FauxGitHub();
  const fins: string[] = [];
  const station = stationGitHub({
    nom: STATION,
    places: 2,
    base: "main",
    github: faux.client(),
    prise: faux.prise(),
    cuisiner: async (ticket) => {
      const lance = gardes.lancer({ commande: FAUX_CLAUDE, args: [], cwd: repertoire, env: { ...ENV_ENFANT, FAUX_CLAUDE: options.scenario?.(ticket.number) ?? "fini" }, flux: join(repertoire, `${ticket.number}-github.flux.jsonl`) });
      const fin = await lance.fin;
      fins.push(fin.arret?.reason ?? (fin.code === 0 ? "ok" : `code ${fin.code}`));
      return fin.code === 0 && fin.arret === null ? { branche: brancheDuTicket(ticket.number) } : { echec: fin.arret ? `guard:${fin.arret.reason}` : "failed" };
    },
    juger: async () => assert.fail("nothing is in pass"),
    gardes,
    avertir: (texte) => { if (!/the cook stopped without a delivery/.test(texte)) assert.fail(texte); },
  });
  // Les faits d'un type, et ce qu'ils portent.
  const faits = (type: string) => runtime.journal.tout().flatMap((evenement) => (evenement.type === type ? [{ payload: evenement.payload as Record<string, unknown> }] : []));
  return { repertoire, runtime, gardes, faux, station, fins, faits };
}

// Ce que ferait la CLI du chef depuis son propre process : une autre connexion.
function chef(repertoire: string, type: "kitchen.stopped" | "kitchen.resumed") {
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "chef", type, payload: {} });
  journal.fermer();
}

test("with the breaker open, no GitHub-only cook starts: no claim, no launch, and the station says it is held by the breaker", async (t) => {
  const { runtime, faux, station, faits } = cuisine(t);
  runtime.journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  faux.feu(1);

  await station.tour();
  await station.calme();

  assert.deepEqual(faux.prises, []);
  assert.deepEqual(faits("cook.launched"), []);
  assert.deepEqual(faux.labels(1), [...CALIBRE].sort());
  assert.equal(etatStation(runtime.journal.base, STATION)?.heldReason, "breaker");
});

test("GitHub-only cooks count for the breaker: three failures in a row open it, and the ticket is not taken again", async (t) => {
  const { faux, station, faits } = cuisine(t, { scenario: () => "echec" });
  faux.feu(1);
  for (let essai = 0; essai < 3; essai++) {
    await station.tour();
    await station.calme();
  }
  assert.deepEqual(faits("cook.exited").map((evenement) => evenement.payload.outcome), ["failed", "failed", "failed"]);
  assert.equal(faits("breaker.opened").length, 1);

  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1, 1, 1]);
});

test("once the Max quota is spent, no GitHub-only cook starts: the cook that hit it writes its return time, and the next ticket is not claimed", async (t) => {
  const { runtime, faux, station, faits } = cuisine(t, { scenario: () => "quota" });
  faux.feu(1);
  await station.tour();
  await station.calme();
  // Le quota n'est pas un échec : le disjoncteur ne le compte pas.
  assert.deepEqual(faits("cook.exited").map((evenement) => evenement.payload.outcome), ["neutral"]);
  const [epuise] = faits("station.86");
  assert.equal(epuise?.payload.station, STATION);
  assert.ok(String(epuise?.payload.until) > new Date().toISOString());

  faux.feu(2);
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1]);
  assert.deepEqual(faits("cook.launched").length, 1);
  assert.equal(etatStation(runtime.journal.base, STATION)?.heldReason, "quota");
});

test("the chef's stop halts a running GitHub-only cook, its ticket is released, and no new claim is made", async (t) => {
  const { repertoire, faux, station, fins, faits } = cuisine(t, { scenario: () => "bavard" });
  faux.feu(1);
  await station.tour();
  await jusqua(() => faits("cook.launched").length > 0);

  chef(repertoire, "kitchen.stopped");
  await station.calme();
  assert.deepEqual(fins, ["stop"]);
  assert.deepEqual(faits("cook.exited").map((evenement) => evenement.payload.outcome), ["stop"]);
  // Rendu sur l'issue, sans livraison.
  assert.deepEqual(faux.labels(1), [...CALIBRE].sort());
  assert.match(faux.commentaires[0]?.corps ?? "", /guard:stop/);

  faux.feu(2);
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1]);
  assert.equal(faits("cook.launched").length, 1);
});

test("the arbiter refuses a GitHub-only cook while another project holds the account's Max places, and grants it once they are free", async (t) => {
  const { arbitre, joint } = arbitreEnMemoire(t, 1);
  // L'autre projet a pris la seule place du compte.
  assert.equal(arbitre.demander("compta", mot(0, true)).accorde, true);
  const { runtime, faux, station, faits } = cuisine(t, { arbitre: joint });
  faux.feu(1);

  await station.tour();
  assert.deepEqual(faux.prises, []);
  assert.deepEqual(faits("cook.launched"), []);
  assert.equal(etatStation(runtime.journal.base, STATION)?.heldReason, "arbiter");
  // Le projet a dit à l'arbitre qu'il a des tickets qui attendent.
  assert.equal(arbitre.etat().projets.find((projet) => projet.projet === PROJET)?.demande, true);

  // Le cook de l'autre projet a fini : la place est libre.
  arbitre.dire("compta", mot(0, false));
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1]);
  assert.deepEqual(faux.labels(1), [...CALIBRE, LABEL_IN_PASS].sort());
  assert.equal(etatStation(runtime.journal.base, STATION)?.heldReason, null);
});

test("an unreachable arbiter lets one GitHub-only cook start, and holds the next while it runs", async (t) => {
  const injoignable: Arbitrage = {
    port: 0,
    echanger: async () => {
      throw new Error("connexion refusée");
    },
    quitter: async () => {},
    etat: async () => assert.fail("not read"),
  };
  const { gardes } = cuisine(t, { arbitre: injoignable });
  assert.equal(await gardes.retenue(0), null);
  assert.equal(await gardes.retenue(1), "unarbitrated");
});

test("with the four guards clear, a GitHub-only cook starts as before: claimed, cooked through the runtime's guardrails, handed to the pass", async (t) => {
  const { arbitre, joint } = arbitreEnMemoire(t, 2);
  const { faux, station, fins, faits } = cuisine(t, { arbitre: joint });
  faux.feu(1);

  await station.tour();
  await station.calme();

  assert.deepEqual(faux.prises, [1]);
  assert.deepEqual(fins, ["ok"]);
  assert.deepEqual(faux.prs, [brancheDuTicket(1)]);
  assert.deepEqual(faux.labels(1), [...CALIBRE, LABEL_IN_PASS].sort());
  // Lancé par les garde-fous du runtime, au nom de la station.
  const [lance] = faits("cook.launched");
  assert.equal(lance?.payload.station, STATION);
  assert.deepEqual(faits("cook.exited").map((evenement) => evenement.payload.outcome), ["ok"]);
  // Le tour suivant redit à l'arbitre ce qui tourne : plus rien.
  await station.tour();
  assert.equal(arbitre.etat().projets.find((projet) => projet.projet === PROJET)?.cooks, 0);
});

test("the station of this runtime launches its cook through the guards: the stream the guardrails wrote is the one it reads, and the delivery goes to the pass", async (t) => {
  const { repertoire, runtime, gardes, faux, faits } = cuisine(t);
  faux.feu(1);
  const tour = faux.client();
  // Le client du runtime, tel que le tour le lit.
  const client: Partial<GitHub> = {
    tickets: async () => ({ inchange: false, issues: (await tour.fires()).map((lu) => ({ ...lu, createdAt: "", updatedAt: "", url: "" })), confirmer: () => {} }),
    prDeBranche: async () => null,
    ci: async () => [],
    issue: async (numero) => ({ number: numero, title: `ticket ${numero}`, labels: faux.labels(numero), state: "open", createdAt: "", updatedAt: "", url: "", body: "" }),
    commentaires: async () => [],
    commenter: tour.commenter,
    labelliser: tour.labelliser,
    delabelliser: tour.delabelliser,
    ouvrirPR: tour.ouvrirPR,
    mettreAJour: tour.mettreAJour,
    merger: tour.merger,
    retraitsDeLabels: async () => [],
    prsOuvertes: async () => [],
  };
  const fait: string[] = [];
  const station = stationDuDepot({
    nom: STATION,
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: client as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: repertoire, branche: `cook/${run}` }),
      reprendre: async () => repertoire,
      retirer: () => void fait.push("retirer"),
      ranger: async () => null,
      pousser: (branche) => void fait.push(`pousser ${branche}`),
      commits: () => 1,
      changes: () => [],
      diff: () => "",
    },
    prise: () => faux.prise(),
    claude: FAUX_CLAUDE,
    env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini" },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: join(repertoire, "github-seul"),
    gardes,
    avertir: (texte) => { if (!/the cook stopped without a delivery/.test(texte)) assert.fail(texte); },
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;

  await station.tour();
  await station.calme();

  assert.deepEqual(fait, ["pousser cook/1-github"]);
  assert.deepEqual(faux.prs, ["cook/1-github"]);
  assert.deepEqual(faux.labels(1), [...CALIBRE, LABEL_IN_PASS].sort());
  const [lance] = faits("cook.launched");
  assert.match(String(lance?.payload.stream), /^runs\/1-github-[0-9a-f]{8}\.jsonl$/);
  assert.deepEqual(faits("cook.exited").map((evenement) => evenement.payload.outcome), ["ok"]);
  assert.equal(runtime.journal.tout().filter((evenement) => evenement.type === "station.86").length, 0);
});
