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
import { ATTENTE_DE_PLACE_MS, ouvrirArbitre, type Mot } from "../../../src/arbitre.ts";
import { brancheDuTicket, brancherBrigadeGithub, stationDuDepot, stationGitHub, type GitHubDuTour, type Prise, type TicketLu } from "../../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../../src/github-etat/etats.ts";
import type { GitHub } from "../../../src/github.ts";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { gardesDuTour } from "../../../src/github-seul/garde-fous/garde-fous.ts";
import { configMachine, type Machine } from "../../../src/machine.ts";
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
    attendreUnePlace: (projet) => arbitre.attendre(projet, ATTENTE_DE_PLACE_MS),
    etat: async () => arbitre.etat(),
  };
  return { arbitre, joint };
}

const mot = (cooks: number, demande: boolean): Mot => ({ cooks, demande, machine: false, nonArbitres: 0, consommation: { jour: 0, semaine: 0 } });

// Une cuisine GitHub seul : le runtime du projet et ses garde-fous, la station
// du tour et ses gardes. Le cook de chaque ticket est la doublure de `claude`,
// lancée par les gardes, avec le scénario que le test lui donne.
function cuisine(t: TestContext, options: { arbitre?: Arbitrage | null; scenario?: (issue: number) => string; avertir?: (texte: string) => void; machine?: () => Machine } = {}) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const machine = options.machine;
  const gardes = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: options.arbitre ?? null, ...(machine === undefined ? {} : { machine: { lire: machine, seuils: configMachine({}) } }), avertir: options.avertir ?? (() => {}) });
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

// La box de #3560 : 8 cœurs, de la mémoire et du disque à revendre ; seule sa charge bouge.
// Au seuil par défaut, 1,5 par cœur, elle retient au-delà d'une charge de 12.
const GO = 1024 * 1024 * 1024;
const BOX = (charge: number): Machine => ({ charge, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: 100 * GO });

test("a machine short of processor holds the GitHub-only claim beyond the first cook, says so, and says when it has room again (#3560)", async (t) => {
  let charge = 16.2;
  const avertis: string[] = [];
  const { runtime, faux, station, faits } = cuisine(t, { machine: () => BOX(charge), avertir: (texte) => avertis.push(texte) });
  faux.feu(1);
  faux.feu(2);

  // Jamais moins d'un cook : #1 part ; #2, derrière lui, attend que la machine respire.
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1]);
  assert.equal(etatStation(runtime.journal.base, STATION)?.heldReason, "machine");
  assert.deepEqual(faits("station.saturated").map(({ payload }) => payload), [{ station: STATION, resource: "cpu", observed: 16.2, limit: 12 }]);
  assert.equal(etatStation(runtime.journal.base, STATION)?.saturatedResource, "cpu");
  assert.match(avertis.join("\n"), /runs short of CPU — load of 16\.2 for at most 12/);

  charge = 2.3;
  await station.tour();
  await station.calme();
  assert.deepEqual(faux.prises, [1, 2]);
  assert.equal(faits("station.saturated").length, 1);
  assert.equal(faits("station.relieved").length, 1);
  assert.equal(etatStation(runtime.journal.base, STATION)?.saturatedResource, null);
});

test("each claim granted counts on the machine before its load shows it: a full rail does not leave in one block (#3560)", async (t) => {
  // 11,5 : une prise tient sous 12 ; la suivante, comptée d'avance, la passerait.
  const { gardes } = cuisine(t, { machine: () => BOX(11.5) });
  assert.equal(await gardes.retenue(1), null);
  assert.equal(await gardes.retenue(2), "machine");
});

test("a machine that cannot be read holds nothing: the station's places still bound its cooks, and it is said once (#3560)", async (t) => {
  const avertis: string[] = [];
  const { gardes, faits } = cuisine(t, {
    machine: () => {
      throw new Error("statfs refused");
    },
    avertir: (texte) => avertis.push(texte),
  });
  assert.equal(await gardes.retenue(1), null);
  assert.equal(await gardes.retenue(2), null);
  assert.deepEqual(avertis.filter((texte) => /could not be read \(statfs refused\)/.test(texte)).length, 1);
  assert.deepEqual(faits("station.saturated"), []);
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
    attendreUnePlace: async () => assert.fail("nothing refused, nothing to wait for"),
    etat: async () => assert.fail("not read"),
  };
  const { gardes } = cuisine(t, { arbitre: injoignable });
  assert.equal(await gardes.retenue(0), null);
  assert.equal(await gardes.retenue(1), "unarbitrated");
  // Retenue sans refus de l'arbitre : il n'y a pas de place à attendre.
  assert.equal(await gardes.attendreUnePlace(), false);
});

// Le délai entre l'instant où un ticket devient prenable et sa prise (#2832) :
// l'arbitre donnait la seule place du compte à un autre projet, qui la rend.
// La boucle est la vraie (`brancherBrigadeGithub`), à l'intervalle d'une minute :
// sans réveil, le projet refusé ne redemandait qu'à son tour suivant, et son
// ticket attendait sa prise jusque-là. Il est pris dans la seconde.
test("a project the arbiter refused is woken when a place frees: its ticket is claimed at once, not at the next interval (#2832)", async (t) => {
  const { arbitre, joint } = arbitreEnMemoire(t, 1);
  assert.equal(arbitre.demander("compta", mot(0, true)).accorde, true);
  const { runtime, faux, station, faits } = cuisine(t, { arbitre: joint, scenario: () => "bavard" });
  faux.feu(1);
  const boucle = brancherBrigadeGithub({ station: () => station, intervalleMs: 60_000, avertir: () => {} });
  t.after(() => boucle.arreter());
  await jusqua(() => etatStation(runtime.journal.base, STATION)?.heldReason === "arbiter");
  assert.deepEqual(faux.prises, []);

  // Le cook de l'autre projet a fini : la place est libre, le ticket prenable.
  const libre = Date.now();
  arbitre.dire("compta", mot(0, false));
  let prise: number | null = null;
  await jusqua(() => faux.prises.length > 0, 2000).then(() => (prise = Date.now() - libre), () => {});
  t.diagnostic(`claimed ${prise ?? "never"} ms after the place freed`);
  assert.ok(prise !== null && prise < 2000, `ms between the place freeing and the claim: ${prise ?? "none within 2 s — the next turn is at the interval, 60 s"}`);
  assert.deepEqual(faux.prises, [1]);
  await jusqua(() => faits("cook.launched").length === 1);
});

test("an unreachable arbiter while a project waits for a place: said, nothing pressed, the next turn asks again", async (t) => {
  const { arbitre, joint } = arbitreEnMemoire(t, 1);
  assert.equal(arbitre.demander("compta", mot(0, true)).accorde, true);
  const dit: string[] = [];
  const { gardes } = cuisine(t, { arbitre: { ...joint, attendreUnePlace: async () => Promise.reject(new Error("connexion refusée")) }, avertir: (texte) => void dit.push(texte) });
  assert.equal(await gardes.retenue(0), "arbiter");
  assert.equal(await gardes.attendreUnePlace(), false);
  assert.equal(dit.filter((texte) => /connexion refusée — GitHub-only station box\/claude waits for its next turn/.test(texte)).length, 1);
  // Le tour suivant redemande, et attend de nouveau.
  assert.equal(await gardes.retenue(0), "arbiter");
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
