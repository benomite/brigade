// Un projet servi sur l'état GitHub seul (`brigade-github.ts`, #2060) : deux
// stations égales sur un faux GitHub, l'interrupteur par projet, et ce que le
// chemin d'avant garde quand il est éteint.
//
// L'état des tickets, la relecture et le merge sont les vrais modules de
// l'épique (`github-etat/etats.ts`, `github-etat/fusion.ts`,
// `github-etat/prise.ts`) : seul le client GitHub est faux, plus bas qu'eux.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ATTENTE_PRESSEE_MS, PASS_MAX, TOURS_PRESSES, brancherBrigadeGithub, brancheDuTicket, clientDuTour, dependancesDuCorps, priseDeLaStation, stationDuDepot, stationGitHub, surGitHubSeul, secoupent, zoneDuCorps, type GitHubDuTour, type Juger, type Lancer, type Prise, type StationGitHub } from "../src/brigade-github.ts";
import type { CommentaireDeVerdict } from "../src/github-etat/fusion.ts";
import { corpsDeLacher, corpsDePrise } from "../src/github-etat/prise.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../src/github-etat/etats.ts";
import type { GitHub } from "../src/github.ts";
import { reglagesDuTexte, ReglageRefuse, texteDuFichier } from "../src/reglages-projet/reglages.ts";
import { jusqua } from "./outils.ts";

const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

type Ticket = { number: number; title: string; labels: Set<string>; state: "open" | "closed"; corps: string };
type PR = { number: number; issue: number; branche: string; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean; enConflit?: boolean; mergeePar: string | null; fichiers: string[] };

// Le faux GitHub, partagé par les stations : chaque appel est noté sous le nom
// de la station qui le fait, et rend la main avant de répondre, pour que deux
// stations s'entrelacent comme sur le vrai.
class FauxGitHub {
  tickets = new Map<number, Ticket>();
  prs: PR[] = [];
  commentaires = new Map<number, Array<CommentaireDeVerdict & { station: string }>>();
  appels: Array<{ station: string; quoi: string }> = [];
  // Les retraits de label, comme GitHub les date.
  retraits = new Map<number, Array<{ label: string; createdAt: string }>>();
  cuissons: Array<{ station: string; issue: number }> = [];
  relectures: Array<{ station: string; pr: number }> = [];
  base: "green" | "red" = "green";
  // Le dernier commit de la base, et les issues de réparation que le faux a vu créer.
  teteDeLaBase = "b".repeat(40);
  creations: number[] = [];
  // Des checks qui ne tournent que sur la base, jamais sur une PR (les tests Windows).
  checksDeLaBaseSeule: Array<{ name: string; outcome: "green" | "red" }> = [];
  // Les PR dont la CI est rouge, et celles dont la CI tourne encore.
  ciRouge = new Set<number>();
  ciEnCours = new Set<number>();
  // Le run de GitHub Actions du check `tests` de la base, que la station peut
  // relancer (#2323) ; null : un check sans lien, qui ne se relance pas.
  runDeLaBase: number | null = null;
  tentatives = new Map<number, number>();
  // Une relance tourne : le check `tests` de la base est en cours jusqu'à
  // `finirLaRelance`.
  relanceEnCours = false;
  private horloge = 0;

  // La relance des jobs de la base finit, verte ou rouge.
  finirLaRelance(couleur: "green" | "red"): void {
    this.relanceEnCours = false;
    this.base = couleur;
  }

  feu(number: number, labels: string[] = CALIBRE, corps = "the ticket's body"): void {
    this.tickets.set(number, { number, title: `ticket ${number}`, labels: new Set(labels), state: "open", corps });
  }

  // Une PR ouverte qui n'est celle d'aucun ticket du faux, et les fichiers qu'elle change.
  prOuverte(fichiers: string[], branche = "cook/autre"): PR {
    const pr: PR = { number: 2000 + this.prs.length, issue: 0, branche, sha: this.sha(), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers };
    this.prs.push(pr);
    return pr;
  }

  ticket(number: number): Ticket {
    const ticket = this.tickets.get(number);
    if (ticket === undefined) throw new Error(`#${number} inconnu`);
    return ticket;
  }

  pr(number: number): PR {
    const trouvee = this.prs.find((p) => p.number === number);
    if (trouvee === undefined) throw new Error(`PR ${number} inconnue`);
    return trouvee;
  }

  mergee(issue: number): PR | undefined {
    return this.prs.find((p) => p.issue === issue && p.merged);
  }

  appelsDe(station: string): number {
    return this.appels.filter((appel) => appel.station === station).length;
  }

  sha(): string {
    this.horloge += 1;
    return this.horloge.toString(16).padStart(40, "0");
  }

  private poster(numero: number, station: string, body: string): void {
    this.horloge += 1;
    const liste = this.commentaires.get(numero) ?? [];
    liste.push({ id: this.horloge, body, association: "OWNER", createdAt: new Date(Date.UTC(2026, 10, 2) + this.horloge * 1000).toISOString(), station });
    this.commentaires.set(numero, liste);
  }

  pour(station: string): GitHubDuTour {
    const noter = async (quoi: string) => {
      this.appels.push({ station, quoi });
      await new Promise((suite) => setImmediate(suite));
    };
    return {
      fires: async () => {
        await noter("fires");
        return [...this.tickets.values()].filter((t) => t.state === "open" && t.labels.has("fire")).map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state }));
      },
      dependancesOuvertes: async (issue) => {
        await noter("dependancesOuvertes");
        // Le vrai client du tour, sur le faux GitHub : la lecture du corps est celle du runtime.
        return clientDuTour(fauxClient(this, station), "main").dependancesOuvertes(issue);
      },
      prDuTicket: async (issue) => {
        await noter("prDuTicket");
        const pr = this.prs.findLast((p) => p.issue === issue);
        return pr === undefined ? null : { ...pr };
      },
      corpsDuTicket: async (issue) => {
        await noter("corpsDuTicket");
        return this.ticket(issue).corps;
      },
      prsOuvertes: async () => {
        await noter("prsOuvertes");
        return this.prs.filter((p) => p.state === "open").map((p) => ({ branche: p.branche, fichiers: [...p.fichiers] }));
      },
      checksDeLaBase: async () => {
        await noter("checksDeLaBase");
        const url = this.runDeLaBase === null ? {} : { url: `https://github.com/faux/depot/actions/runs/${this.runDeLaBase}/job/1` };
        return [{ name: "tests", outcome: this.relanceEnCours ? ("pending" as const) : this.base, ...url }, ...this.checksDeLaBaseSeule];
      },
      teteDeLaBase: async () => {
        await noter("teteDeLaBase");
        return this.teteDeLaBase;
      },
      issuesDepuis: async () => {
        await noter("issuesDepuis");
        return [...this.tickets.values()].map((t) => ({ number: t.number, body: t.corps, association: "OWNER" }));
      },
      fermerIssue: async (numero) => {
        await noter("fermerIssue");
        this.ticket(numero).state = "closed";
      },
      creerIssue: async ({ corps, labels }) => {
        await noter("creerIssue");
        const number = 900 + this.creations.length;
        this.creations.push(number);
        this.feu(number, labels, corps);
        return number;
      },
      commentaires: async (numero) => {
        await noter("commentaires");
        return (this.commentaires.get(numero) ?? []).map(({ station: _station, ...commentaire }) => commentaire);
      },
      commenter: async (numero, corps) => {
        await noter("commenter");
        this.poster(numero, station, corps);
      },
      labelliser: async (issue, labels) => {
        await noter("labelliser");
        for (const label of labels) this.ticket(issue).labels.add(label);
      },
      delabelliser: async (issue, label) => {
        await noter("delabelliser");
        this.ticket(issue).labels.delete(label);
        this.horloge += 1;
        this.retraits.set(issue, [...(this.retraits.get(issue) ?? []), { label, createdAt: new Date(Date.UTC(2026, 10, 2) + this.horloge * 1000).toISOString() }]);
      },
      retraitsDeLabels: async (numero) => this.retraits.get(numero) ?? [],
      etatDuRun: async (run) => {
        await noter("etatDuRun");
        return { tentative: this.tentatives.get(run) ?? 1, termine: !this.relanceEnCours };
      },
      relancerLesEchecs: async (run) => {
        await noter("relancerLesEchecs");
        this.tentatives.set(run, (this.tentatives.get(run) ?? 1) + 1);
        this.relanceEnCours = true;
      },
      ouvrirPR: async ({ branche, corps }) => {
        await noter("ouvrirPR");
        const [, ferme] = /Closes #(\d+)/.exec(corps) ?? [];
        const number = 1000 + this.prs.length;
        // En retard sur sa base dès l'ouverture : la mise à jour se joue.
        this.prs.push({ number, issue: Number(ferme), branche, sha: this.sha(), state: "open", merged: false, enRetard: true, mergeePar: null, fichiers: [] });
        return `https://github.com/faux/depot/pull/${number}`;
      },
      ci: async (sha) => {
        await noter("ci");
        const pr = this.prs.find((p) => p.sha === sha);
        if (pr !== undefined && this.ciEnCours.has(pr.number)) return [{ name: "tests", outcome: "pending" as const }];
        return [{ name: "tests", outcome: pr !== undefined && this.ciRouge.has(pr.number) ? "red" : "green" }];
      },
      mettreAJour: async (numero, sha) => {
        await noter("mettreAJour");
        const pr = this.pr(numero);
        if (pr.sha !== sha) return;
        pr.enRetard = false;
        pr.sha = this.sha();
      },
      merger: async (numero, sha) => {
        await noter("merger");
        const pr = this.pr(numero);
        if (pr.merged) return { fait: false, motif: "HTTP 405 — Pull Request is not mergeable" };
        if (pr.sha !== sha) return { fait: false, motif: "HTTP 409 — Head branch was modified" };
        if (pr.enRetard) return { fait: false, motif: "HTTP 405 — Head branch is out of date" };
        Object.assign(pr, { merged: true, state: "closed", mergeePar: station });
        this.ticket(pr.issue).state = "closed";
        return { fait: true };
      },
    };
  }

  // La prise de #2056, celle du runtime.
  prise(github: GitHubDuTour, station: string): Prise {
    return priseDeLaStation(github, station);
  }

  // Un tour du faux attend ses relectures, qui tournent hors du tour (#2329) :
  // `horsDuTour` laisse le tour rendre la main pendant qu'elles tournent.
  station(nom: string, options: { places?: number; capacites?: string[]; cuisiner?: (issue: number) => Promise<{ branche: string } | { echec: string }>; juger?: Juger; avertir?: (texte: string) => void; horsDuTour?: boolean } = {}): StationGitHub {
    const station = this.stationSeule(nom, options);
    if (options.horsDuTour === true) return station;
    // La même station, pas une copie : ce que la boucle y pose (`presser`), elle le lit.
    const { tour } = station;
    station.tour = async () => {
      await tour();
      await station.relu();
    };
    return station;
  }

  stationSeule(nom: string, options: { places?: number; capacites?: string[]; cuisiner?: (issue: number) => Promise<{ branche: string } | { echec: string }>; juger?: Juger; avertir?: (texte: string) => void } = {}): StationGitHub {
    const github = this.pour(nom);
    return stationGitHub({
      nom,
      places: options.places ?? 1,
      ...(options.capacites === undefined ? {} : { capacites: options.capacites }),
      base: "main",
      github,
      prise: this.prise(github, nom),
      cuisiner: async (ticket) => {
        if (options.cuisiner) return options.cuisiner(ticket.number);
        this.cuissons.push({ station: nom, issue: ticket.number });
        // Un renvoi : le cook pousse sur la branche de la PR ouverte, sa tête change.
        const ouverte = this.prs.findLast((p) => p.issue === ticket.number && p.state === "open");
        if (ouverte !== undefined) Object.assign(ouverte, { sha: this.sha(), enConflit: false });
        return { branche: brancheDuTicket(ticket.number) };
      },
      juger:
        options.juger ??
        (async (_ticket, pr) => {
          this.relectures.push({ station: nom, pr: pr.number });
          return { verdict: "approve", motif: "" };
        }),
      avertir: options.avertir ?? ((texte) => assert.fail(texte)),
    });
  }

  // Les tickets qui portent `taken` en ce moment.
  pris(): number[] {
    return [...this.tickets.values()].filter((t) => t.labels.has(LABEL_TAKEN)).map((t) => t.number);
  }

  // Les commentaires de prise postés par la station, tous tickets confondus.
  prisesDe(station: string): number {
    return [...this.commentaires.values()].flat().filter((c) => c.station === station && c.body.startsWith("<!-- brigade:prise")).length;
  }
}

const zoneDe = (...chemins: string[]) => `## Context\n\nwhatever\n\n## Zone\n\n${chemins.map((c) => `- \`${c}\``).join("\n")}\n\n## Acceptance\n\n- done\n`;

const verdictDe = (faux: FauxGitHub, pr: number) => (faux.commentaires.get(pr) ?? []).filter((c) => c.body.startsWith("<!-- brigade:verdict"));

// Un projet ouvert sur le chemin GitHub seul, arrêté en fin de test.
function ouvrir(t: TestContext, station: StationGitHub) {
  const ouvert = brancherBrigadeGithub({ reglages: { githubOnlyState: true }, ancien: () => assert.fail("l'ancien chemin ne doit pas s'ouvrir"), station: () => station, intervalleMs: 5, avertir: () => {} });
  assert.equal(ouvert.chemin, "github");
  if (ouvert.chemin !== "github") throw new Error("inaccessible");
  t.after(() => ouvert.arreter());
  return ouvert;
}

test("two stations claim the same ticket at once: the earliest claim cooks it, the other lets go", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const [a, b] = [faux.station("A"), faux.station("B")];
  await Promise.all([a.tour(), b.tour()]);
  await Promise.all([a.calme(), b.calme()]);
  const premiere = faux.commentaires.get(1)?.find((c) => c.body.startsWith("<!-- brigade:prise"))?.station;
  assert.deepEqual(faux.cuissons, [{ station: premiere, issue: 1 }]);
  assert.deepEqual([...faux.ticket(1).labels].sort(), [...CALIBRE, LABEL_IN_PASS].sort());
  assert.equal(faux.prs.length, 1);
});

test("a ticket whose dependency is open is held back, and claimed once the dependency closes", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, ["model:sonnet", "effort:medium"]);
  faux.feu(2, CALIBRE, "Context.\n\nDepends on #1");
  faux.feu(3, CALIBRE, "Depends on #1, #4");
  faux.feu(4, ["model:sonnet", "effort:medium"]);
  const a = faux.station("A", { places: 5 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.deepEqual(faux.pris(), []);
  faux.ticket(1).state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 2 }]);
  faux.ticket(4).state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons.map((cuisson: { issue: number }) => cuisson.issue), [2, 3]);
});

test("the `Depends on` lines of an issue body name its dependencies", () => {
  assert.deepEqual(dependancesDuCorps("no dependency, see #5"), []);
  assert.deepEqual(dependancesDuCorps("Depends on #7"), [7]);
  assert.deepEqual(dependancesDuCorps("intro\nDepends on #7, #8 and #9\nDepends on #7\nrelated to #10"), [7, 8, 9]);
});

for (const [arretee, restante] of [
  ["A", "B"],
  ["B", "A"],
] as const) {
  test(`two stations on a fake GitHub: station ${arretee} stops, station ${restante} still takes, cooks and merges a ticket`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(1);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    const ouverts = { A: ouvrir(t, stations.A), B: ouvrir(t, stations.B) };
    await jusqua(() => faux.mergee(1) !== undefined);

    await ouverts[arretee].arreter();
    await stations[arretee].calme();
    const avant = faux.appelsDe(arretee);

    faux.feu(2);
    await jusqua(() => faux.mergee(2) !== undefined);
    assert.deepEqual(
      faux.cuissons.filter((cuisson) => cuisson.issue === 2),
      [{ station: restante, issue: 2 }],
    );
    const pr = faux.mergee(2);
    assert.equal(pr?.mergeePar, restante);
    // Le verdict qui l'a approuvée est un commentaire de la PR, signé de la restante.
    assert.match(verdictDe(faux, pr?.number ?? 0)[0]?.body ?? "", new RegExp(`station=${restante} verdict=approve`));
    assert.equal(faux.ticket(2).state, "closed");
    // L'arrêtée n'a plus rien lu ni écrit.
    assert.equal(faux.appelsDe(arretee), avant);
  });

  test(`station ${arretee} delivers a ticket and stops before it is reviewed: station ${restante} reviews and merges it`, async (t) => {
    const faux = new FauxGitHub();
    faux.feu(3);
    const stations = { A: faux.station("A"), B: faux.station("B") };
    // Elle prend, cuisine et livre en pass, puis ne tourne plus.
    await stations[arretee].tour();
    await stations[arretee].calme();
    assert.ok(faux.ticket(3).labels.has(LABEL_IN_PASS));
    assert.ok(!faux.ticket(3).labels.has(LABEL_TAKEN));
    const avant = faux.appelsDe(arretee);

    ouvrir(t, stations[restante]);
    await jusqua(() => faux.mergee(3) !== undefined);
    assert.equal(faux.mergee(3)?.mergeePar, restante);
    assert.deepEqual(faux.relectures, [{ station: restante, pr: faux.mergee(3)?.number }]);
    assert.deepEqual(faux.cuissons, [{ station: arretee, issue: 3 }]);
    assert.equal(faux.appelsDe(arretee), avant);
  });
}

test("a branch behind its base is updated, never merged on that turn, then merged once up to date", async () => {
  const faux = new FauxGitHub();
  faux.feu(4);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  await a.tour();
  assert.equal(faux.mergee(4), undefined, "en retard : la mise à jour est demandée");
  assert.deepEqual(
    faux.appels.filter((appel) => ["mettreAJour", "merger"].includes(appel.quoi)).map((appel) => appel.quoi),
    ["mettreAJour"],
  );
  await a.tour();
  assert.equal(faux.mergee(4)?.mergeePar, "A");
  // Une seule relecture : l'approbation tient après la mise à jour.
  assert.equal(faux.relectures.length, 1);
});

test("a review that requests changes keeps the PR unmerged", async () => {
  const faux = new FauxGitHub();
  faux.feu(5);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "tests missing" }) });
  for (let tour = 0; tour < 4; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(5), undefined);
  assert.ok(!faux.appels.some((appel) => appel.quoi === "merger"));
  assert.match(verdictDe(faux, 1000)[0]?.body ?? "", /verdict=request-changes[\s\S]*tests missing/);
});

test("a cook that delivers nothing gives the ticket back on the issue, which another station then takes", async () => {
  const faux = new FauxGitHub();
  faux.feu(6);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "gates red" }) });
  await a.tour();
  await a.calme();
  assert.deepEqual([...faux.ticket(6).labels].sort(), [...CALIBRE].sort());
  assert.match((faux.commentaires.get(6) ?? []).map((c) => c.body).join("\n"), /Station `A`: the cook stopped without a delivery — gates red/);
  const b = faux.station("B");
  await b.tour();
  await b.calme();
  assert.deepEqual(faux.cuissons, [{ station: "B", issue: 6 }]);
});

test("a station with 3 places never holds more than 3 tickets, even when its cooks throw at once (GitHub limiting its calls, #2179)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 13; n += 1) faux.feu(n);
  const avertis: string[] = [];
  const a = faux.station("A", {
    places: 3,
    cuisiner: async () => {
      throw new Error("GitHub a atteint sa limite d'appels");
    },
    avertir: (texte) => avertis.push(texte),
  });
  await a.tour();
  await a.calme();
  // Trois prises, pas treize : un cook qui lève garde sa place.
  assert.equal(faux.prisesDe("A"), 3);
  assert.equal(faux.pris().length, 3);
  // Le tour suivant rend les trois sur l'issue avant d'en prendre d'autres.
  await a.tour();
  await a.calme();
  assert.ok(faux.pris().length <= 3, `taken: ${faux.pris().join(", ")}`);
  const lachers = [...faux.commentaires.values()].flat().filter((c) => c.body.startsWith("<!-- brigade:lache station=A")).length;
  assert.equal(lachers, 3);
  assert.ok(avertis.some((texte) => /limite d'appels/.test(texte)));
});

test("with 5 tickets in pass a station with free places claims nothing; at 4 it claims (PASS_MAX, #2300)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n, [...CALIBRE, LABEL_IN_PASS]);
  faux.feu(10);
  const a = faux.station("A", { places: 3 });
  await a.tour();
  await a.calme();
  assert.equal(PASS_MAX, 5);
  assert.equal(faux.prisesDe("A"), 0);
  assert.equal(faux.cuissons.length, 0);
  // One leaves the pass: under the cap, the station claims again.
  faux.ticket(5).labels.delete(LABEL_IN_PASS);
  await a.tour();
  await a.calme();
  assert.ok(faux.cuissons.some((c) => c.issue === 10));
});

test("a restarted station gives back, at its first turn, the tickets it held with no cook, then takes only what its places allow (#2179)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n);
  // Un runtime d'avant a pris les cinq, puis s'est arrêté sans les rendre.
  const avant = faux.station("A", { places: 5, cuisiner: () => new Promise(() => {}) });
  void avant.tour();
  await jusqua(() => faux.pris().length === 5);
  // Un sixième, pris par une autre station : il n'est pas à A de le rendre.
  faux.feu(6);
  const b = faux.station("B", { cuisiner: () => new Promise(() => {}) });
  void b.tour();
  await jusqua(() => faux.pris().includes(6));
  const apres = faux.station("A", { places: 2, cuisiner: () => new Promise(() => {}) });
  await apres.tour();
  await apres.calme();
  const lachersDeA = [...faux.commentaires.values()].flat().filter((c) => c.body.startsWith("<!-- brigade:lache station=A")).length;
  assert.equal(lachersDeA, 5);
  assert.ok(faux.ticket(6).labels.has(LABEL_TAKEN), "#6 stays B's");
  // Rendus à ce tour, ils ne sont repris qu'au suivant, et pas plus que ses places.
  assert.deepEqual(faux.pris(), [6]);
  await apres.tour();
  assert.deepEqual(faux.pris(), [1, 2, 6]);
});

test("a delivery whose CI is red is never merged: it goes back to a cook with the failing check, then off the kitchen after 2 sends back (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(31);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 31);
  assert.ok(pr);
  faux.ciRouge.add(pr.number);
  for (let i = 0; i < 12; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(31), undefined);
  const renvois = (faux.commentaires.get(31) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.equal(renvois.length, 3);
  assert.match(renvois[0]?.body ?? "", /sent back to a cook \(1\/2\) — the CI is red on `[0-9a-f]+`: tests/);
  assert.match(renvois[2]?.body ?? "", /Taken off the kitchen/);
  assert.ok(faux.ticket(31).labels.has("hors-cuisine"));
  // Recuisiné deux fois, sous la même PR : aucune seconde PR.
  assert.equal(faux.cuissons.filter((c) => c.issue === 31).length, 3);
  assert.equal(faux.prs.filter((p) => p.issue === 31).length, 1);
});

test("a delivery the review refuses goes back to a cook with the review's reason (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(32);
  let refus = true;
  const a = faux.station("A", { juger: async () => (refus ? { verdict: "request-changes", motif: "tests missing for the empty case" } : { verdict: "approve", motif: "" }) });
  for (let i = 0; i < 3; i += 1) {
    await a.tour();
    await a.calme();
  }
  const renvoi = (faux.commentaires.get(32) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /the review requested changes: tests missing for the empty case/);
  refus = false;
  for (let i = 0; i < 6; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(32)?.mergeePar, "A");
});

test("a delivery that changes what judges it is never merged on the review alone: it waits for the chef, said once (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(33);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 33);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml", "runtime/src/x.ts"];
  for (let i = 0; i < 5; i += 1) await a.tour();
  assert.equal(faux.mergee(33), undefined);
  assert.ok(faux.ticket(33).labels.has("blocked-on-human"));
  const dits = (faux.commentaires.get(33) ?? []).filter((c) => /changes what judges it \(`\.github\/workflows\/tests\.yml`\)/.test(c.body));
  assert.equal(dits.length, 1);
});

test("a delivery that changes what judges it asks the chef only once its CI is green: red goes back to a cook, running waits, green raises the card by itself (#2442)", async () => {
  const faux = new FauxGitHub();
  faux.feu(37);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 37);
  assert.ok(pr);
  pr.fichiers = [".github/workflows/tests.yml", "runtime/src/x.ts"];
  faux.ciEnCours.add(pr.number);
  for (let i = 0; i < 4; i += 1) await a.tour();
  assert.ok(!faux.ticket(37).labels.has("blocked-on-human"), "running CI: no card");
  faux.ciEnCours.delete(pr.number);
  faux.ciRouge.add(pr.number);
  for (let i = 0; i < 4; i += 1) await a.tour();
  assert.ok(!faux.ticket(37).labels.has("blocked-on-human"), "red CI: no card");
  assert.equal(faux.mergee(37), undefined);
  faux.ciRouge.delete(pr.number);
  faux.ticket(37).labels.add(LABEL_IN_PASS);
  for (let i = 0; i < 4; i += 1) await a.tour();
  assert.ok(faux.ticket(37).labels.has("blocked-on-human"), "green CI: the card shows");
});

test("a head already sent back is not sent back again, even if a stale list still shows it in pass (#2189)", async () => {
  const faux = new FauxGitHub();
  faux.feu(34);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "not wired" }) });
  await a.tour();
  await a.calme();
  await a.tour();
  // La liste lue sous ETag porte encore `in-pass` : le tour revoit la même tête refusée.
  faux.ticket(34).labels.add(LABEL_IN_PASS);
  faux.ticket(34).labels.delete(LABEL_TAKEN);
  await a.tour();
  await a.tour();
  const renvois = (faux.commentaires.get(34) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.equal(renvois.length, 1);
});

test("a delivery that conflicts with the base goes back to a cook to merge the base in, then merges (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(36);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 36);
  assert.ok(pr);
  pr.enConflit = true;
  for (let i = 0; i < 6; i += 1) {
    await a.tour();
    await a.calme();
  }
  const renvoi = (faux.commentaires.get(36) ?? []).find((c) => c.body.startsWith("<!-- brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /conflicts with the base/);
  assert.equal(faux.mergee(36)?.mergeePar, "A");
});

test("a ticket whose cooks fail 3 times goes off the kitchen instead of looping (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(35);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "the cook committed nothing" }) });
  for (let i = 0; i < 8; i += 1) {
    await a.tour();
    await a.calme();
  }
  const echecs = (faux.commentaires.get(35) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec"));
  assert.equal(echecs.length, 3);
  assert.match(echecs[2]?.body ?? "", /Taken off the kitchen/);
  assert.ok(faux.ticket(35).labels.has("hors-cuisine"));
});

test("removing hors-cuisine restarts the count of cooks without a delivery (#2430)", async () => {
  const faux = new FauxGitHub();
  faux.feu(35);
  const a = faux.station("A", { cuisiner: async () => ({ echec: "the cook committed nothing" }) });
  for (let i = 0; i < 8 && !faux.ticket(35).labels.has("hors-cuisine"); i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(faux.ticket(35).labels.has("hors-cuisine"));
  // Le second relance le ticket : il retire `hors-cuisine`, sur GitHub.
  await faux.pour("chef").delabelliser(35, "hors-cuisine");
  for (let i = 0; i < 1; i += 1) {
    await a.tour();
    await a.calme();
  }
  const echecs = (faux.commentaires.get(35) ?? []).filter((c) => c.body.startsWith("<!-- brigade:echec"));
  assert.equal(echecs.length, 4);
  assert.equal(faux.ticket(35).labels.has("hors-cuisine"), false);
});

test("a send-back whose label removal failed is completed at the next turn, without a second comment (#2319)", async () => {
  const faux = new FauxGitHub();
  faux.feu(39);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "no" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  await a.tour();
  // Le renvoi est écrit, mais \`in-pass\` est resté : son retrait avait échoué.
  faux.ticket(39).labels.add(LABEL_IN_PASS);
  faux.ticket(39).labels.delete(LABEL_TAKEN);
  await a.tour();
  assert.equal(faux.ticket(39).labels.has(LABEL_IN_PASS), false);
  assert.equal((faux.commentaires.get(39) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi")).length, 1);
});

test("tickets are taken in prio order, then oldest first (#2209)", async () => {
  const faux = new FauxGitHub();
  faux.feu(40, CALIBRE);
  faux.feu(41, [...CALIBRE, "prio:2"]);
  faux.feu(42, [...CALIBRE, "prio:0"]);
  faux.feu(43, [...CALIBRE, "prio:1"]);
  faux.feu(44, [...CALIBRE, "prio:0"]);
  const a = faux.station("A", { places: 1 });
  for (let i = 0; i < 5; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [42, 44, 43, 41, 40]);
});

test("a red check that runs only on the base (Windows) holds nothing; a red check the PR also runs holds its merge (#2279)", async () => {
  const faux = new FauxGitHub();
  faux.feu(37);
  faux.checksDeLaBaseSeule = [{ name: "windows tests (2/4)", outcome: "red" }];
  const a = faux.station("A");
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(37)?.mergeePar, "A");
  faux.feu(38);
  faux.base = "red";
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(38), undefined);
});

test("a red base re-runs its failed jobs once: while they run, nothing is held, nothing is sent back, and green after them the pass merges (#2323)", async () => {
  const faux = new FauxGitHub();
  const avertis: string[] = [];
  faux.runDeLaBase = 501;
  faux.base = "red";
  faux.feu(39);
  const a = faux.station("A", { avertir: (texte) => void avertis.push(texte) });
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  // La relance tourne encore : la livraison qui court `tests` s'est mergée, et
  // la station n'a rien dit d'autre que la relance.
  assert.equal(faux.relanceEnCours, true);
  assert.equal(faux.mergee(39)?.mergeePar, "A");
  assert.deepEqual(avertis, ["brigade : base red on A — the failed jobs of run 501 are re-run once before any merge is held"]);
  assert.deepEqual(faux.commentaires.get(39)?.filter((c) => c.body.includes("sent back")) ?? [], []);
  faux.finirLaRelance("green");
  faux.feu(40);
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(40)?.mergeePar, "A");
  assert.equal(faux.tentatives.get(501), 2);
  assert.equal(faux.appels.filter((appel) => appel.quoi === "relancerLesEchecs").length, 1);
});

test("a base still red after its re-run holds as before, and neither another station nor a restarted one re-runs it again (#2323)", async () => {
  const faux = new FauxGitHub();
  const avertis: string[] = [];
  const avertir = (texte: string) => void avertis.push(texte);
  faux.runDeLaBase = 502;
  faux.base = "red";
  const a = faux.station("A", { avertir });
  await a.tour();
  await a.calme();
  assert.equal(faux.relanceEnCours, true);
  // Tant que la relance tourne, aucun ticket de réparation (#2339).
  assert.equal(faux.creations.length, 0);
  faux.finirLaRelance("red");
  faux.feu(41);
  // B, et A redémarrée, ne savent pas que A l'a relancée : GitHub le leur dit.
  const b = faux.station("B", { avertir });
  const relancee = faux.station("A", { avertir });
  for (let i = 0; i < 4; i += 1) {
    for (const station of [a, b, relancee]) {
      await station.tour();
      await station.calme();
    }
  }
  assert.equal(faux.mergee(41), undefined);
  assert.equal(faux.tentatives.get(502), 2);
  assert.equal(faux.appels.filter((appel) => appel.quoi === "relancerLesEchecs").length, 1);
  assert.equal(avertis.filter((texte) => texte.includes("re-run")).length, 1);
  // Rouge après sa relance : un seul ticket de réparation, quelle que soit la
  // station, et c'est lui que la base rouge laisse merger (#2339).
  assert.deepEqual(faux.creations, [900]);
  assert.ok(faux.ticket(900).corps.includes(`brigade:base-rouge sha=${faux.teteDeLaBase}`));
  assert.equal(faux.mergee(900)?.mergeePar, "A");
});

test("a review runs off the turn: while one delivery's review runs, the turn reviews and merges another one (#2329)", async () => {
  const faux = new FauxGitHub();
  faux.feu(51);
  faux.feu(52);
  let liberer = () => {};
  const retenue = new Promise<void>((resoudre) => (liberer = resoudre));
  const a = faux.station("A", {
    places: 2,
    horsDuTour: true,
    juger: async (ticket) => {
      if (ticket.number === 51) await retenue;
      return { verdict: "approve", motif: "" };
    },
  });
  await a.tour();
  await jusqua(() => a.enCuisine().length === 0);
  // #51 se relit encore : les tours suivants relisent, mettent à jour et mergent #52.
  for (let i = 0; i < 20 && faux.mergee(52) === undefined; i += 1) {
    await a.tour();
    await new Promise((resoudre) => setImmediate(resoudre));
  }
  assert.equal(faux.mergee(52)?.mergeePar, "A");
  assert.equal(faux.mergee(51), undefined);
  liberer();
  for (let i = 0; i < 4 && faux.mergee(51) === undefined; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(51)?.mergeePar, "A");
});

test("the pass presses the next turns on a delivery, a fresh verdict and a merge attempt — CI running included, once per head — and never on a quiet turn (#2333)", async () => {
  const faux = new FauxGitHub();
  faux.feu(61);
  const a = faux.station("A");
  const pressions: boolean[] = [];
  a.presser = (maintenant = false) => pressions.push(maintenant);
  await a.tour();
  assert.deepEqual(pressions, [], "a ticket taken presses nothing");
  await a.calme();
  assert.deepEqual(pressions, [true], "delivered: its review at once");
  assert.ok(faux.ticket(61).labels.has(LABEL_IN_PASS) && !faux.ticket(61).labels.has(LABEL_TAKEN), "woken once `taken` is gone");
  await a.tour();
  assert.deepEqual(pressions, [true, false], "approved, its branch updated");
  const pr = faux.prs[0] as (typeof faux.prs)[number];
  faux.ciEnCours.add(pr.number);
  await a.tour();
  assert.deepEqual(pressions, [true, false, false], "its CI still running");
  await a.tour();
  assert.deepEqual(pressions, [true, false, false], "the same head, its CI still running: nothing new");
  faux.ciEnCours.delete(pr.number);
  await a.tour();
  assert.equal(faux.mergee(61)?.mergeePar, "A");
  assert.deepEqual(pressions, [true, false, false, false], "merged");
  await a.tour();
  assert.deepEqual(pressions, [true, false, false, false], "a quiet kitchen");
});

test("a review that requests changes presses the next turns: the ticket sent back is taken again within 30 s (#2333)", async () => {
  const faux = new FauxGitHub();
  faux.feu(62);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: "not yet" }) });
  const pressions: boolean[] = [];
  a.presser = (maintenant = false) => pressions.push(maintenant);
  await a.tour();
  await a.calme();
  assert.deepEqual(pressions, [true]);
  await a.tour();
  assert.ok(!faux.ticket(62).labels.has(LABEL_IN_PASS), "sent back to a cook");
  assert.deepEqual(pressions.slice(0, 2), [true, false], "the verdict presses");
});

test("the loop: with a first-turn delay, the first turn waits for it, then the interval runs as before (#2436)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const tours: number[] = [];
  const station: StationGitHub = {
    tour: async () => void tours.push(Date.now() / 1000),
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ reglages: { githubOnlyState: true }, ancien: () => assert.fail("old path"), station: () => station, intervalleMs: 120_000, premierTourMs: 40_000, avertir: () => {} });
  t.after(() => (ouvert.chemin === "github" ? ouvert.arreter() : undefined));
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  await fini();
  assert.deepEqual(tours, []);
  t.mock.timers.tick(39_000);
  await fini();
  assert.deepEqual(tours, []);
  t.mock.timers.tick(1_000);
  await fini();
  assert.deepEqual(tours, [40]);
  t.mock.timers.tick(120_000);
  await fini();
  assert.deepEqual(tours, [40, 160]);
});

test("the loop: a press brings the next turn within 30 s, a delivery's at once, then TOURS_PRESSES turns 30 s apart and the interval again; a quiet kitchen keeps the interval (#2333)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const tours: number[] = [];
  let pendant: (() => void) | undefined;
  const station: StationGitHub = {
    tour: async () => {
      tours.push(Date.now() / 1000);
      const faire = pendant;
      pendant = undefined;
      faire?.();
    },
    enCuisine: () => [],
    calme: async () => {},
    relu: async () => {},
  };
  const ouvert = brancherBrigadeGithub({ reglages: { githubOnlyState: true }, ancien: () => assert.fail("old path"), station: () => station, intervalleMs: 120_000, avertir: () => {} });
  t.after(() => (ouvert.chemin === "github" ? ouvert.arreter() : undefined));
  const fini = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise<void>((resoudre) => queueMicrotask(resoudre));
  };
  // Le temps avance par pas de 5 s : chaque tour programme le suivant après lui.
  const avancer = async (secondes: number) => {
    t.mock.timers.tick(0);
    await fini();
    for (let s = 0; s < secondes; s += 5) {
      t.mock.timers.tick(5_000);
      await fini();
    }
  };
  const presser = (maintenant?: boolean) => {
    assert.ok(station.presser !== undefined, "the loop sets `presser`");
    station.presser(maintenant);
  };
  assert.equal(TOURS_PRESSES, 4);
  assert.equal(ATTENTE_PRESSEE_MS, 30_000);
  await avancer(300);
  assert.deepEqual(tours, [0, 120, 240], "quiet: the interval");
  // Un verdict à 300 s, le prochain tour était à 360 s : il vient à 330 s.
  presser();
  await avancer(300);
  assert.deepEqual(tours.slice(3), [330, 360, 390, 420, 540], "pressed: 4 turns 30 s apart, then the interval");
  // Une livraison à 600 s : un tour tout de suite.
  presser(true);
  await avancer(5);
  assert.deepEqual(tours.slice(8), [600], "delivered: at once");
  await avancer(250);
  assert.deepEqual(tours.slice(8), [600, 630, 660, 690, 810]);
  // Un fait pendant le tour de 930 s : les 4 suivants viennent à 30 s.
  pendant = () => presser();
  await avancer(350);
  assert.deepEqual(tours.slice(13), [930, 960, 990, 1020, 1050, 1170]);
});

test("WAITING, off-kitchen and uncalibrated tickets are not taken; with the base red, nothing in pass is reviewed or merged", async () => {
  const faux = new FauxGitHub();
  faux.feu(7, [...CALIBRE, "waiting"]);
  faux.feu(8, [...CALIBRE, "hors-cuisine"]);
  faux.feu(9, ["fire"]);
  faux.feu(10);
  const a = faux.station("A", { places: 4 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 10 }]);
  faux.base = "red";
  await a.tour();
  await a.tour();
  // Seule la réparation que la base rouge a fait ouvrir est relue ; #10 attend.
  assert.deepEqual(faux.relectures.filter(({ pr }) => faux.pr(pr).issue === 10), []);
  assert.equal(faux.mergee(10), undefined);
  faux.base = "green";
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(10)?.mergeePar, "A");
});

const reparations = (faux: FauxGitHub) => [...faux.tickets.values()].filter((t) => t.state === "open" && t.corps.includes("brigade:base-rouge"));

test("a red main: no PR is merged, and the next turns merge nothing either (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const a = faux.station("A", { places: 2 });
  await a.tour();
  await a.calme();
  faux.base = "red";
  for (let i = 0; i < 3; i++) await a.tour();
  assert.equal(faux.mergee(10), undefined);
  assert.deepEqual(faux.relectures.filter(({ pr }) => faux.pr(pr).issue === 10), []);
  assert.equal(faux.prs.filter((pr) => pr.merged && pr.issue === 10).length, 0);
});

test("a red commit gets exactly one repair issue, however many turns and stations see it (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  const a = faux.station("A", { places: 0, avertir: () => {} });
  const b = faux.station("B", { places: 0, avertir: () => {} });
  for (let i = 0; i < 3; i++) await Promise.all([a.tour(), b.tour()]);
  const [reparation, ...autres] = reparations(faux);
  assert.deepEqual(autres, []);
  assert.ok(faux.creations.length <= 2);
  assert.ok(reparation?.corps.includes(`brigade:base-rouge sha=${faux.teteDeLaBase}`));
  assert.ok(reparation?.labels.has("prio:0") && reparation.labels.has("fire"));
  // Les deux stations ont créé la leur au même instant : la plus récente s'est fermée.
  assert.equal(reparation?.number, 900);
  // Un autre commit rouge : une autre réparation.
  faux.teteDeLaBase = "c".repeat(40);
  await a.tour();
  assert.equal(reparations(faux).length, 2);
});

test("a repair issue that GitHub refused to create is retried on the next turn, and the merges stay stopped (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const dits: string[] = [];
  const a = faux.station("A", { places: 1, avertir: (texte) => dits.push(texte) });
  await a.tour();
  await a.calme();
  faux.base = "red";
  const github = faux.pour("A");
  const creer = github.creerIssue;
  let refus = true;
  github.creerIssue = async (issue) => {
    if (refus) throw new Error("rate limited");
    return creer(issue);
  };
  const station = stationGitHub({ nom: "A", places: 1, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: (texte) => dits.push(texte) });
  await station.tour();
  assert.equal(faux.creations.length, 0);
  assert.ok(dits.some((texte) => texte.includes("rate limited")));
  refus = false;
  await station.tour();
  assert.equal(faux.creations.length, 1);
  assert.equal(faux.mergee(10), undefined);
});

test("merges resume once main is green again, and the repair itself is merged on the red main (#2214)", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  const a = faux.station("A", { places: 2, avertir: () => {} });
  await a.tour();
  await a.calme();
  faux.base = "red";
  // Le tour ouvre la réparation et la prend ; son cook la livre.
  await a.tour();
  await a.calme();
  const [reparation] = reparations(faux);
  assert.ok(reparation);
  assert.equal(faux.mergee(10), undefined);
  // La réparation est livrée, mise à jour, puis mergée malgré la base rouge ; #10 attend.
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(reparation.number)?.mergeePar, "A");
  assert.equal(faux.mergee(10), undefined);
  faux.base = "green";
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(10)?.mergeePar, "A");
  assert.equal(faux.creations.length, 1);
});

test("switch off: the old path opens as is, and the GitHub-only station is never built", () => {
  for (const reglages of [null, {}, { githubOnlyState: false }]) {
    const ancien = { stations: ["box"], decisions: "les décisions" };
    const ouvert = brancherBrigadeGithub({ reglages, ancien: () => ancien, station: () => assert.fail("rien du chemin GitHub seul ne se construit"), avertir: () => assert.fail("rien à dire") });
    assert.deepEqual(ouvert, { chemin: "ancien", ancien });
    // Le même objet, pas une copie : l'ancien chemin reçoit ce qu'il recevait.
    assert.equal(ouvert.chemin === "ancien" && ouvert.ancien, ancien);
  }
});

test("switch on, but this runtime cannot serve it: it says why, and the old path opens", () => {
  const dits: string[] = [];
  const ouvert = brancherBrigadeGithub({ reglages: { githubOnlyState: true }, ancien: () => "ancien", station: () => ({ refus: "no claim module" }), avertir: (texte) => dits.push(texte) });
  assert.deepEqual(ouvert, { chemin: "ancien", ancien: "ancien" });
  assert.match(dits.join("\n"), /GitHub-only state is on .* no claim module; the old path is kept/);
});

test("switch on: a ticket goes from fire to merged with no call to the relay, the mailbox or the log", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  // L'ancien chemin, tel que la station l'ouvre : le relais de prise, la boîte
  // aux lettres du Kitchen board et le journal.
  const appels = { relais: 0, boite: 0, journal: 0 };
  const ouvert = brancherBrigadeGithub({
    reglages: { githubOnlyState: true },
    ancien: () => {
      appels.relais += 1;
      appels.boite += 1;
      appels.journal += 1;
    },
    station: () => faux.station("A"),
    intervalleMs: 5,
    avertir: () => {},
  });
  t.after(() => ouvert.chemin === "github" && ouvert.arreter());
  await jusqua(() => faux.mergee(1) !== undefined);
  assert.deepEqual(appels, { relais: 0, boite: 0, journal: 0 });

  // Et le module n'en importe aucun.
  const source = readFileSync(join(import.meta.dirname, "../src/brigade-github.ts"), "utf8");
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, module]) => module ?? "");
  assert.ok(imports.includes("./github-etat/etats.ts") && imports.includes("./github-etat/fusion.ts"));
  assert.deepEqual(
    imports.filter((module) => /relais|tirer-par-github|tableau|distantes|journal|porte-journal|base\.ts|rail\.ts|alimenter/.test(module)),
    [],
  );
});

// Le client GitHub du runtime, réduit à ce que la station GitHub seul appelle.
function fauxClient(faux: FauxGitHub, station = "box"): GitHub {
  const bas = faux.pour(station);
  const client: Partial<GitHub> = {
    tickets: async () => ({ inchange: false, issues: (await bas.fires()).map((t) => ({ ...t, createdAt: "", updatedAt: "", url: "" })), confirmer: () => {} }),
    prDeBranche: async (branche) => {
      const pr = faux.prs.findLast((p) => p.branche === branche);
      return pr === undefined ? null : { number: pr.number, url: "", base: "main", sha: pr.sha, state: pr.state, merged: pr.merged, enRetard: pr.enRetard, mergeePar: pr.mergeePar, ...(pr.enConflit ? { enConflit: true } : {}) };
    },
    ci: async () => [{ name: "tests", conclusion: "success", outcome: "green", url: null }] as never,
    commentaires: async (numero) => (await bas.commentaires(numero)).map(({ body, association, createdAt }) => ({ body, author: "brigade", association, createdAt })),
    commenter: bas.commenter,
    mettreAJour: bas.mettreAJour,
    merger: bas.merger,
    labelliser: bas.labelliser,
    delabelliser: bas.delabelliser,
    ouvrirPR: bas.ouvrirPR,
    retraitsDeLabels: async () => [],
    teteDeLaBase: async () => faux.teteDeLaBase,
    prsOuvertes: async () => (await bas.prsOuvertes()).map((pr, rang) => ({ number: rang, ...pr })),
    issue: async (numero) => {
      const ticket = faux.tickets.get(numero);
      return ticket === undefined ? null : { ...ticket, labels: [...ticket.labels], createdAt: "", updatedAt: "", url: "", body: ticket.corps };
    },
  };
  return client as GitHub;
}

// Un flux de `claude` qui conclut sur `texte`.
const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

test("the station of this runtime: a ticket is cooked in the station's repository, reviewed by the reviewer and merged, through the real GitHub client", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"]);
  const fait: string[] = [];
  const lancements: Array<{ args: string[]; cwd: string }> = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    lancements.push({ args, cwd });
    const reviewer = args.includes("--tools");
    writeFileSync(flux, fluxQuiConclut(reviewer ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [{ gravite: "remarque", fichier: "a.ts", constat: "a nit" }] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => {
        fait.push(`preparer ${run}`);
        return { worktree: join(repertoire, run), branche: `cook/${run}` };
      },
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return join(repertoire, run);
      },
      retirer: (worktree) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)}`),
      ranger: async (_worktree, branche) => {
        fait.push(`ranger ${branche}`);
        return null;
      },
      pousser: (branche) => void fait.push(`pousser ${branche}`),
      commits: () => 1,
      changes: () => ["a.ts"],
      diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  for (let tour = 0; tour < 3 && faux.mergee(11) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.equal(faux.mergee(11)?.branche, "cook/11-github");
  assert.deepEqual(fait, ["preparer 11-github", "ranger cook/11-github", "pousser cook/11-github", "reprendre review-11-github cook/11-github", "retirer review-11-github"]);
  // Le cook part sous son calibrage, la relecture sous celui du reviewer.
  assert.deepEqual(
    lancements.map(({ args }) => args.slice(args.indexOf("--model"), args.indexOf("--model") + 4)),
    [
      ["--model", "opus", "--effort", "high"],
      ["--model", "sonnet", "--effort", "medium"],
    ],
  );
  assert.match(verdictDe(faux, faux.mergee(11)?.number ?? 0)[0]?.body ?? "", /station=box verdict=approve[\s\S]*Looks right\.[\s\S]*Remark \(`a\.ts`\): a nit/);
});

test("a ticket whose branch a previous cook left in the clone is resumed from that branch, not prepared anew, and a failed resume keeps the branch", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(13);
  const fait: string[] = [];
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut("done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: { reason: "tokens", limit: 1, observed: 2 }, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: (branche) => branche === "cook/13-github",
      preparer: async () => assert.fail("`git worktree add -b` cannot recreate a branch the clone already has"),
      reprendre: async (run, branche) => {
        fait.push(`reprendre ${run} ${branche}`);
        return join(repertoire, run);
      },
      retirer: (worktree, branche) => void fait.push(`retirer ${worktree.slice(repertoire.length + 1)} ${branche ?? "-"}`),
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  assert.deepEqual(fait, ["reprendre 13-github cook/13-github", "retirer 13-github -"]);
});

// Une station dont le cook reprend la branche que le clone porte déjà, conclut
// « done », et laisse sa tête telle quelle — ou la fait avancer (#2372).
async function repriseQui(t: TestContext, avance: boolean, enConflit = false) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  if (enConflit) faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: true, mergeePar: null, fichiers: [] });
  let tete = "a".repeat(40);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut("done"));
    if (avance) tete = "b".repeat(40);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: (branche) => branche === "cook/14-github",
      preparer: async () => assert.fail("the branch is resumed"),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => tete,
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  await station.tour();
  await station.calme();
  return faux;
}

test("a cook that resumes a branch and adds nothing to it delivers nothing: it counts as a failed cook, and the ticket is not put back in pass (#2372)", async (t) => {
  const faux = await repriseQui(t, false);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  assert.match((faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n"), /brigade:echec n=1[\s\S]*the cook added nothing since its last delivery/);
});

test("a cook that adds nothing to a branch whose PR conflicts with main is not a failed cook: three of them do not take the ticket off the kitchen (#2454, #2061 of 2026-11-05)", async (t) => {
  for (let i = 0; i < 3; i += 1) {
    const faux = await repriseQui(t, false, true);
    const corps = (faux.commentaires.get(14) ?? []).map((c) => c.body).join("\n");
    assert.doesNotMatch(corps, /brigade:echec/);
    assert.equal(faux.ticket(14).labels.has("hors-cuisine"), false);
    assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), false);
  }
});

test("a cook that takes a ticket whose PR conflicts with main is told to bring the branch up to date, and its delivery goes back in pass (#2454)", async (t) => {
  const faux = await repriseQui(t, true, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
});

test("a cook that resumes a branch and moves its head delivers as before (#2372)", async (t) => {
  const faux = await repriseQui(t, true);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
});

test("without the claim module of #2056, the station of this runtime refuses to run, and says why", () => {
  const refus = stationDuDepot({ prise: null } as unknown as Parameters<typeof stationDuDepot>[0]);
  assert.deepEqual(refus, { refus: "the claim module (`github-etat/prise.ts`, #2056) is not in this runtime" });
});

for (const nom of ["box/claude", "macbook-air-de-benoit/claude"]) {
  test(`the station declared \`${nom}\` runs on GitHub only: it takes the ticket, signs its verdict and merges, under its name as declared`, async (t) => {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
    t.after(() => rmSync(repertoire, { recursive: true, force: true }));
    const faux = new FauxGitHub();
    faux.feu(12);
    const lancer: Lancer = ({ args, flux }) => {
      writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
      return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
    };
    const station = stationDuDepot({
      nom,
      places: 1,
      base: "main",
      depotGitHub: "faux/depot",
      github: fauxClient(faux, nom),
      depot: {
        connait: () => false,
        preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
        reprendre: async (run) => join(repertoire, run),
        retirer: () => {},
        ranger: async () => null,
        pousser: () => {},
        commits: () => 1,
        changes: () => ["a.ts"],
        diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
      },
      prise: priseDeLaStation,
      claude: "claude",
      env: {},
      cloison: null,
      plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
      graceMs: 1,
      reviewer: { model: "sonnet", effort: "medium" },
      flux: repertoire,
      lancer,
      avertir: (texte) => assert.fail(texte),
    });
    assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
    if ("refus" in station) return;
    await station.tour();
    await station.calme();
    for (let tour = 0; tour < 3 && faux.mergee(12) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
    assert.ok((faux.commentaires.get(12) ?? []).some((c) => c.body.endsWith(`Taken by station \`${nom}\`.`)));
    assert.match(verdictDe(faux, faux.mergee(12)?.number ?? 0)[0]?.body ?? "", new RegExp(`^<!-- brigade:verdict station=${nom} verdict=approve `));
    assert.equal(faux.mergee(12)?.mergeePar, nom);
  });
}

test("the switch is on for brigade, in its project settings file, and off for a project whose file does not set it", () => {
  const texte = readFileSync(join(import.meta.dirname, "../../.claude/brigade/projet.json"), "utf8");
  const brigade = reglagesDuTexte(texte);
  assert.equal(surGitHubSeul(brigade), true);
  // Le fichier de brigade est tel que l'écriture le rendrait.
  assert.equal(texteDuFichier(brigade), texte);

  assert.equal(surGitHubSeul(reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main" }))), false);
  assert.equal(surGitHubSeul(null), false);
  assert.equal(surGitHubSeul(reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", githubOnlyState: false }))), false);
  assert.throws(
    () => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", githubOnlyState: "yes" })),
    (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === "githubOnlyState",
  );
});

test("a station never claims a ticket that needs a capability it lacks, and claims it once it has every one (#2187)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "needs:mac"]);
  faux.feu(2, [...CALIBRE, "needs:mac", "needs:android"]);
  faux.feu(3);
  const sans = faux.station("A", { places: 3 });
  await sans.tour();
  await sans.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 3 }]);
  const partielle = faux.station("B", { places: 3, capacites: ["mac"] });
  await partielle.tour();
  await partielle.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [3, 1]);
  const complete = faux.station("C", { places: 3, capacites: ["mac", "android"] });
  await complete.tour();
  await complete.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue), [3, 1, 2]);
});

test("a ticket whose zone is held by another open PR is held back, and claimed once that PR is closed (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE, zoneDe("runtime/src/a.ts", "docs/"));
  const autre = faux.prOuverte(["runtime/src/b.ts", "docs/runtime/README.md"]);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.equal(faux.prisesDe("A"), 0);
  // La PR qui tenait la zone est fermée : le ticket est pris au tour suivant.
  autre.state = "closed";
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 1 }]);
});

test("a free zone is claimed, a zone inside or around a changed folder is held, an own PR holds nothing (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE, zoneDe("app/src/x.ts"));
  faux.feu(2, CALIBRE, zoneDe("runtime/src/deep/file.ts"));
  faux.feu(3, CALIBRE, zoneDe("runtime"));
  faux.feu(4, CALIBRE, zoneDe("scripts/x.sh"));
  faux.feu(5, CALIBRE);
  faux.prOuverte(["runtime/src"]);
  // La PR du ticket 4 : elle change sa propre zone.
  faux.prOuverte(["scripts/x.sh"], brancheDuTicket(4));
  const a = faux.station("A", { places: 5 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons.map((c) => c.issue).sort(), [1, 4, 5]);
});

test("the open PRs are read only when a ticket has a zone (#2188)", async () => {
  const faux = new FauxGitHub();
  faux.feu(1);
  const a = faux.station("A");
  await a.tour();
  await a.calme();
  assert.ok(!faux.appels.some((appel) => appel.quoi === "prsOuvertes"));
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 1 }]);
});

test("the zone of a ticket is read from its Zone section", () => {
  assert.deepEqual(zoneDuCorps(zoneDe("a/b.ts", "c/")), ["a/b.ts", "c"]);
  assert.deepEqual(zoneDuCorps("## Zone\n\n`a.ts`, ./b/\n"), ["a.ts", "b"]);
  assert.deepEqual(zoneDuCorps("## Context\n\nno zone here"), []);
  assert.ok(secoupent("runtime", "runtime/src/a.ts"));
  assert.ok(!secoupent("runtime", "runtime2/a.ts"));
});

test("a taken label nobody holds — a release whose removal failed, left by another station — is removed at any turn, and the ticket is taken again (#2206)", async () => {
  const faux = new FauxGitHub();
  const b = faux.station("B", { cuisiner: () => new Promise(() => {}) });
  // B a déjà passé son premier tour : rien n'est plus rendu par redémarrage.
  await b.tour();
  // A a lâché #7 — le commentaire est parti — mais le retrait du label a échoué.
  faux.feu(7, [...CALIBRE, LABEL_TAKEN]);
  const a = faux.pour("A");
  await a.commenter(7, corpsDePrise("A"));
  await a.commenter(7, corpsDeLacher("A"));
  // Un ticket que A tient vraiment garde son label.
  faux.feu(8, [...CALIBRE, LABEL_TAKEN]);
  await a.commenter(8, corpsDePrise("A"));
  await b.tour();
  assert.ok(!faux.ticket(7).labels.has(LABEL_TAKEN), "the stale label is gone");
  assert.ok(faux.ticket(8).labels.has(LABEL_TAKEN), "#8 stays A's");
  await b.tour();
  assert.deepEqual(faux.pris(), [7, 8]);
  assert.equal(faux.prisesDe("B"), 1);
});
