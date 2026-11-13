import assert from "node:assert/strict";
import { join } from "node:path";
import { brancheDuTicket, clientDuTour, priseDeLaStation, stationGitHub, type GitHubDuTour, type Juger, type JugerEnSecond, type OptionsDuDepot, type Prise, type StationGitHub, type TicketLu } from "../src/brigade-github.ts";
import { porteListe } from "../src/epique.ts";
import type { CommentaireDeVerdict } from "../src/github-etat/fusion.ts";
import { LABEL_TAKEN } from "../src/github-etat/etats.ts";
import type { GitHub, StatutDeCommit } from "../src/github.ts";
import type { LieuDesGates } from "../src/github-etat/gates-de-la-tete.ts";

export const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

export type Ticket = { number: number; title: string; labels: Set<string>; state: "open" | "closed"; corps: string; fermeLe?: string };
export type PR = { number: number; issue: number; branche: string; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean; enConflit?: boolean; conflitDeContenu?: boolean; mergeePar: string | null; fichiers: string[] };

export type OptionsDuFaux = {
  places?: number | (() => number);
  capacites?: string[];
  cuisiner?: (issue: number) => Promise<{ branche: string } | { echec: string }>;
  juger?: Juger;
  // Le second juge (#2555) ; null : la station n'en lance aucun.
  jugerEnSecond?: JugerEnSecond | null;
  avertir?: (texte: string) => void;
  ciDesPR?: (fichiers: string[]) => boolean;
  gates?: (ticket: { number: number }, pr: { number: number; sha: string }) => Promise<LieuDesGates>;
  maintenant?: () => Date;
  sauter?: (ticket: number, ligne: string) => void;
};

// Le faux GitHub, partagé par les stations : chaque appel est noté sous le nom
// de la station qui le fait, et rend la main avant de répondre, pour que deux
// stations s'entrelacent comme sur le vrai.
export class FauxGitHub {
  tickets = new Map<number, Ticket>();
  prs: PR[] = [];
  commentaires = new Map<number, Array<CommentaireDeVerdict & { station: string }>>();
  // Le refus de GitHub à l'ouverture d'une PR (422…), s'il y en a un.
  refusDePR: Error | null = null;
  appels: Array<{ station: string; quoi: string }> = [];
  // Les retraits de label, comme GitHub les date.
  retraits = new Map<number, Array<{ label: string; createdAt: string }>>();
  cuissons: Array<{ station: string; issue: number }> = [];
  relectures: Array<{ station: string; pr: number }> = [];
  secondsJugements: Array<{ station: string; pr: number; sha: string; juges: string[] }> = [];
  base: "green" | "red" = "green";
  // Le dernier commit de la base, et les issues de réparation que le faux a vu créer.
  teteDeLaBase = "b".repeat(40);
  creations: number[] = [];
  // Des checks qui ne tournent que sur la base, jamais sur une PR (les tests Windows).
  checksDeLaBaseSeule: Array<{ name: string; outcome: "green" | "red" }> = [];
  // Les PR dont la CI est rouge, et celles dont la CI tourne encore.
  ciRouge = new Set<number>();
  ciEnCours = new Set<number>();
  // Les fichiers changés de la tête `de` à la tête `a` (#3426) : aucun, par
  // défaut ; null, GitHub ne connaît pas l'une des deux.
  changesEntre: (de: string, a: string) => string[] | null = () => [];
  // Les PR qui ne portent aucune CI (espace, #2456), et les statuts de chaque commit.
  sansCI = new Set<number>();
  statutsDeCommit = new Map<string, StatutDeCommit[]>();
  // Le run de GitHub Actions du check `tests` de la base, que la station peut
  // relancer (#2323) ; null : un check sans lien, qui ne se relance pas.
  runDeLaBase: number | null = null;
  tentatives = new Map<number, number>();
  // Les issues que GitHub ne ferme pas au merge de leur PR (#2467), malgré `Closes #N`.
  nonFermees = new Set<number>();
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

  poster(numero: number, station: string, body: string): void {
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
        return [...this.tickets.values()].filter((t) => t.state === "open" && t.labels.has("fire")).map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, ...(porteListe(t.corps) ? { epique: true as const } : {}) }));
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
      issue: async (numero) => {
        const ticket = this.tickets.get(numero);
        return ticket === undefined ? null : { number: numero, title: ticket.title, labels: [...ticket.labels], state: ticket.state, createdAt: "", updatedAt: "", url: "", body: ticket.corps, ...(ticket.state === "closed" ? { closedAt: ticket.fermeLe ?? "2026-10-23T00:00:00Z" } : {}) };
      },
      fermerPR: async (numero) => {
        await noter("fermerPR");
        this.pr(numero).state = "closed";
      },
      prsOuvertes: async () => {
        await noter("prsOuvertes");
        return this.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, branche: p.branche, fichiers: [...p.fichiers] }));
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
        if (this.refusDePR !== null) throw this.refusDePR;
        const [, ferme] = /Closes #(\d+)/.exec(corps) ?? [];
        const number = 1000 + this.prs.length;
        // En retard sur sa base dès l'ouverture : la mise à jour se joue.
        this.prs.push({ number, issue: Number(ferme), branche, sha: this.sha(), state: "open", merged: false, enRetard: true, mergeePar: null, fichiers: [] });
        return `https://github.com/faux/depot/pull/${number}`;
      },
      ci: async (sha) => {
        await noter("ci");
        const pr = this.prs.find((p) => p.sha === sha);
        // Les statuts de commit, le dernier de chaque contexte, comme GitHub les combine.
        const derniers = new Map((this.statutsDeCommit.get(sha) ?? []).map((statut) => [statut.context, statut]));
        const statuts = [...derniers.values()].map(({ context, state }) => ({ name: context, outcome: state === "success" ? ("green" as const) : state === "pending" ? ("pending" as const) : ("red" as const) }));
        if (pr !== undefined && this.sansCI.has(pr.number)) return statuts;
        if (pr !== undefined && this.ciEnCours.has(pr.number)) return [{ name: "tests", outcome: "pending" as const }, ...statuts];
        return [{ name: "tests", outcome: pr !== undefined && this.ciRouge.has(pr.number) ? "red" : "green" }, ...statuts];
      },
      statuts: async (sha, contexte) => {
        await noter("statuts");
        return (this.statutsDeCommit.get(sha) ?? []).filter((statut) => statut.context === contexte);
      },
      poserStatut: async (sha, { state, context, description }) => {
        await noter("poserStatut");
        this.horloge += 1;
        const statut = { id: this.horloge, state, context, description, createdAt: new Date().toISOString() };
        this.statutsDeCommit.set(sha, [...(this.statutsDeCommit.get(sha) ?? []), statut]);
        return statut.id;
      },
      mettreAJour: async (numero, sha) => {
        await noter("mettreAJour");
        const pr = this.pr(numero);
        if (pr.sha !== sha) return;
        if (pr.enConflit && pr.conflitDeContenu) throw new Error("HTTP 422 — merge conflict between base and head");
        pr.enConflit = false;
        pr.enRetard = false;
        pr.sha = this.sha();
      },
      fichiersEntre: async (de, a) => {
        await noter("fichiersEntre");
        const fichiers = this.changesEntre(de, a);
        return fichiers === null ? null : { fichiers, complet: true };
      },
      merger: async (numero, sha) => {
        await noter("merger");
        const pr = this.pr(numero);
        if (pr.merged) return { fait: false, motif: "HTTP 405 — Pull Request is not mergeable" };
        if (pr.sha !== sha) return { fait: false, motif: "HTTP 409 — Head branch was modified" };
        if (pr.enRetard) return { fait: false, motif: "HTTP 405 — Head branch is out of date" };
        Object.assign(pr, { merged: true, state: "closed", mergeePar: station });
        if (!this.nonFermees.has(pr.issue)) this.ticket(pr.issue).state = "closed";
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
  station(nom: string, options: OptionsDuFaux & { horsDuTour?: boolean } = {}): StationGitHub {
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

  stationSeule(nom: string, options: OptionsDuFaux = {}): StationGitHub {
    const github = this.pour(nom);
    return stationGitHub({
      nom,
      ...(options.sauter === undefined ? {} : { sauter: options.sauter }),
      ...(options.ciDesPR === undefined ? {} : { ciDesPR: options.ciDesPR }),
      ...(options.gates === undefined ? {} : { gates: options.gates }),
      ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }),
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
      ...(options.jugerEnSecond === null
        ? {}
        : {
            jugerEnSecond:
              options.jugerEnSecond ??
              (async (_ticket, pr, juges) => {
                this.secondsJugements.push({ station: nom, pr: pr.number, sha: pr.sha, juges });
                return { verdict: "approve", motif: "Adds a check, weakens none." };
              }),
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

// Le client GitHub du runtime, réduit à ce que la station GitHub seul appelle.
export function fauxClient(faux: FauxGitHub, station = "box"): GitHub {
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
    fermerIssue: async (numero) => {
      faux.ticket(numero).state = "closed";
    },
    ouvrirPR: bas.ouvrirPR,
    retraitsDeLabels: async () => [],
    teteDeLaBase: async () => faux.teteDeLaBase,
    prsOuvertes: async () => faux.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, branche: p.branche, fichiers: [...p.fichiers] })),
    fermerPR: async (numero) => {
      faux.pr(numero).state = "closed";
    },
    issue: async (numero) => {
      const ticket = faux.tickets.get(numero);
      return ticket === undefined ? null : { ...ticket, labels: [...ticket.labels], createdAt: "", updatedAt: "", url: "", body: ticket.corps, ...(ticket.state === "closed" ? { closedAt: ticket.fermeLe ?? "2026-10-23T00:00:00Z" } : {}) };
    },
  };
  return client as GitHub;
}

// Ce que les stations du dépôt (`stationDuDepot`) des tests sur le faux ont en
// commun : une place sur `main`, la prise de #2056, des plafonds d'une minute.
export const STATION_DU_DEPOT = {
  nom: "box",
  places: 1,
  base: "main",
  depotGitHub: "faux/depot",
  prise: priseDeLaStation,
  claude: "claude",
  env: {},
  cloison: null,
  plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
  graceMs: 1,
  reviewer: { model: "sonnet", effort: "medium" },
} satisfies Partial<OptionsDuDepot>;

// Le dépôt d'une station dont le cook part d'une branche neuve, sous `repertoire`.
export const depotNeuf = (repertoire: string): OptionsDuDepot["depot"] => ({ connait: () => true, preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" });

// Le dépôt d'une station dont le cook reprend sa branche, livrée à `tete`.
export const depotRepris = (repertoire: string, tete: string): OptionsDuDepot["depot"] => ({ connait: () => true, preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => tete });

type IssueDuTour = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed" };

// Le GitHub d'un projet à la base verte, réduit à ce que le tour lit et écrit ;
// la station ne prend rien (`prise` refuse), elle ne fait que tourner.
export function fauxDuTour() {
  const issues: IssueDuTour[] = [];
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async (): Promise<TicketLu[]> => issues.filter((i) => i.state === "open" && i.labels.includes("fire")).map(({ number, title, labels, state }) => ({ number, title, labels, state })),
    issuesDepuis: async () => issues.map(({ number, body, state }) => ({ number, body, state, association: "OWNER" })),
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = 3000 + issues.length;
      issues.push({ number, title: titre, body: corps, labels, state: "open" });
      return number;
    },
    fermerIssue: async (numero: number) => {
      const issue = issues.find((i) => i.number === numero);
      if (issue) issue.state = "closed";
    },
    corpsDuTicket: async (numero: number) => issues.find((i) => i.number === numero)?.body ?? "",
    prDuTicket: async () => null,
    commentaires: async () => [],
    dependancesOuvertes: async () => [],
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
  };
  return { issues, github: github as unknown as GitHubDuTour };
}

// Une station qui ne fait que tourner sur le clone `depot` : elle ne prend
// rien, ne cuisine rien, et note ce qu'elle dit dans `avertis`.
export const stationQuiTourne = (github: GitHubDuTour, depot: string, avertis: string[]) =>
  stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: depot,
    avertir: (texte) => avertis.push(texte),
  });
