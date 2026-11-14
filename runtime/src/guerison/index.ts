// La guérison d'un projet, à chaque tour de la station qui le sert (épique
// #2745, ticket #2757). Les gestes qu'une routine humaine faisait à la main,
// chacun dans son module, sont joués ici l'un après l'autre :
// - la relance d'un ticket mis de côté pour une raison qu'un cook répare,
//   avec sa garde contre la boucle (`relance.ts`, #2750) ;
// - la libération d'un `taken` resté plus de 45 min sans cook vivant
//   (`claim-perime.ts`, #2751) ;
// - `in-pass` sur le ticket d'une PR approuvée, verte et mergeable
//   (`pr-prete.ts`, #2752) ;
// - le renvoi à un cook d'une PR `cook/<n>-github` rouge sur laquelle aucun
//   cook ne travaille, jamais au chef (`../ci-rouge/ci-rouge.ts`, #2970) ;
// - la clôture d'une épique dont tous les sous-tickets sont fermés
//   (`epique-finie.ts`, #2754) ;
// - le bug d'une cuisine inerte : des tickets à prendre, et rien n'avance
//   depuis 90 min (`cuisine-inerte.ts`, #2755) ;
// - le défaut d'une carte de TODO sans question, déposé sur la brigade
//   (`../signalement-carte-sans-question.ts`, #3134).
// La lacune technique que le manager complète seul (#2753) est dans ses
// instructions, pas ici.
//
// Un geste qui échoue ne retient pas les autres : son erreur va à `avertir`.
// Rien n'est propre à un dépôt : le projet, sa base et sa station viennent de
// l'appelant. Ce qui se tient d'un tour à l'autre (l'horloge des claims, celle
// de l'inertie) vit dans l'objet que rend `ouvrirGuerison`, un par station.
import { cartesDesIssues } from "../attente-github/attente-github.ts";
import { A_LA_MAIN, brancheDuTicket, termeDeLAttente } from "../brigade-github.ts";
import { calibrage, complet } from "../calibrage.ts";
import { aExaminer, renvoyerLesCiRouges, type PROuverte } from "../ci-rouge/ci-rouge.ts";
import { estMisDeCote, MIS_DE_COTE, type GitHub, type Issue, type IssueOuverte } from "../github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { dernierVerdict } from "../github-etat/fusion.ts";
import { lireTenant, type RetraitDeLabel } from "../github-etat/prise.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { ouvrirClaimPerime } from "./claim-perime.ts";
import { DEPOT_BRIGADE, marqueDuProjet, type GitHubDeLaBrigade } from "../routage-temps-perdu.ts";
import { signalerInertie, type TenantDeZone } from "./cuisine-inerte.ts";
import { fermerEpiqueFinie } from "./epique-finie.ts";
import { poserInPassSurLesPrsPretes } from "./pr-prete.ts";
import { relancer, type GitHubDeLaGuerison } from "./relance.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { ouvrirSignalement } from "../signalement-carte-sans-question.ts";

// Ce que la guérison demande au client du tour, et rien de plus. `issue` :
// absent, les épiques ne se ferment pas. `issuesDepuis` : absent, le bug de
// l'inertie ne se retrouve que s'il a été ouvert par cette station.
// `prsOuvertes` : absent, aucune PR rouge n'est renvoyée.
export type GitHubDuProjet = GitHubDeLaGuerison &
  Pick<GitHub, "fermerIssue"> & {
    retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
    prsOuvertes?(): Promise<PROuverte[]>;
    issue?: GitHub["issue"];
    issuesDepuis?: (instant: string) => Promise<(Pick<IssueOuverte, "number" | "body"> & Partial<Pick<IssueOuverte, "labels" | "state">>)[]>;
  };

// Un ticket tel que le tour le lit.
export type TicketDuTour = Pick<Issue, "number" | "title" | "labels" | "state" | "epique">;

export type OptionsDeLaGuerison = {
  github: GitHubDuProjet;
  // La station qui guérit, telle que ses commentaires la nomment.
  station: string;
  // La branche d'intégration du projet.
  base: string;
  avertir: (message: string) => void;
  // Le projet servi et le GitHub de la brigade : une cause de l'inertie qui vit
  // dans la station se dépose sur la brigade (#3098). Absents, ou sur la
  // brigade elle-même, le bug reste sur le projet.
  servi?: string;
  brigade?: GitHubDeLaBrigade;
  // En millisecondes ; l'horloge du système par défaut.
  maintenant?: () => number;
};

export type Geste = "relance" | "claim" | "ci-rouge" | "in-pass" | "epique" | "inertie" | "sans-question";

// Ce qu'un tour de guérison a fait, geste par geste. `tickets` : ceux du tour
// tels que la guérison les laisse — un ticket relancé sans `served-elsewhere`, un
// claim libéré sans `taken`, une PR rouge renvoyée sans ce qui la tenait pour
// le chef, une PR prête avec `in-pass`, une épique fermée
// hors de la liste —, pour que le tour ne lise pas des labels périmés.
export type BilanDeLaGuerison<T extends TicketDuTour = TicketDuTour> = {
  tickets: T[];
  relances: number[];
  boucles: number[];
  liberes: number[];
  // Les tickets dont la PR rouge repart à un cook, et les labels levés de chacun.
  ciRouges: { ticket: number; leves: string[] }[];
  enPass: number[];
  epiquesFermees: number[];
  // Le bug de la cuisine inerte, ouvert à ce tour.
  inertie: number | null;
  echecs: { geste: Geste; message: string }[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirGuerison(options: OptionsDeLaGuerison) {
  const { github, station, base, avertir, servi } = options;
  const brigade = servi === undefined || servi.toLowerCase() === DEPOT_BRIGADE ? undefined : options.brigade;
  const maintenant = options.maintenant ?? Date.now;
  const claim = ouvrirClaimPerime({ github, maintenant });
  // Le défaut d'une carte sans question va sur la brigade, le projet servi la brigade elle-même compris :
  // sans son GitHub, rien ne se dépose.
  const sansQuestion = servi === undefined || options.brigade === undefined ? null : ouvrirSignalement({ servi, brigade: options.brigade, maintenant: () => new Date(maintenant()) });
  // La dernière fois que la station a vu la cuisine au travail (un cook ici,
  // un ticket pris ou en pass) ou sans rien à prendre : le tour ne lit pas les
  // merges, c'est d'elle que l'inertie compte. Une cuisine sans ticket à
  // prendre n'est pas inerte : sans cela, le premier ticket qui arrivait après
  // 90 min de rail vide ouvrait le bug au tour même qui le prenait (#2865).
  // Au départ, l'ouverture de la guérison.
  let auTravailLe = maintenant();
  // Le bug d'inertie que cette station a ouvert, s'il en est un.
  let bugOuvert: number | null = null;
  // Une semaine : le bug d'inertie se cherche parmi les issues touchées depuis.
  const SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;
  // Un mois : sur la brigade, le bug d'un projet se cherche plus loin, comme les tickets d'une famille.
  const MOIS_MS = 30 * 24 * 60 * 60 * 1000;

  // `tickets` : ceux que le tour vient de lire (`fire`, ouverts). `enCuisine` :
  // les tickets qu'un cook de cette station cuisine en ce moment. `zonesTenues` :
  // ceux que la porte de prise a sautés à son dernier tour, leur zone tenue.
  async function guerir<T extends TicketDuTour>(tickets: readonly T[], enCuisine: ReadonlySet<number>, zonesTenues: ReadonlyMap<number, TenantDeZone> = new Map()): Promise<BilanDeLaGuerison<T>> {
    const bilan: BilanDeLaGuerison<T> = { tickets: [], relances: [], boucles: [], liberes: [], ciRouges: [], enPass: [], epiquesFermees: [], inertie: null, echecs: [] };
    const echouer = (geste: Geste, erreur: unknown, ticket?: number) => {
      const dit = message(erreur);
      bilan.echecs.push({ geste, message: dit });
      avertir(`brigade : healing (${geste}${ticket === undefined ? "" : ` #${ticket}`}) on ${station} — ${dit}`);
    };
    const tache = async (geste: Geste, jouer: () => Promise<void>) => {
      try {
        await jouer();
      } catch (erreur) {
        echouer(geste, erreur);
      }
    };

    await tache("relance", async () => {
      for (const ticket of tickets.filter((t) => estMisDeCote(t.labels))) {
        try {
          const fait = await relancer(ticket, { github, station, base });
          if (fait.fait === "relance") bilan.relances.push(ticket.number);
          if (fait.fait === "boucle") bilan.boucles.push(ticket.number);
        } catch (erreur) {
          echouer("relance", erreur, ticket.number);
        }
      }
    });

    // Un ticket qu'une autre station tient n'est jamais libéré ici : son cook
    // tourne peut-être encore là-bas, et le retrait de `taken` lâcherait sa
    // prise — un second cook partirait sur le même ticket. Cette station ne
    // libère que ses propres prises et celles que personne ne tient.
    await tache("claim", async () => {
      const pris = tickets.filter((t) => t.labels.includes(LABEL_TAKEN) && !t.labels.includes(LABEL_IN_PASS));
      const vivants = new Set(enCuisine);
      for (const ticket of pris) {
        if (vivants.has(ticket.number)) continue;
        const tient = await lireTenant(ticket.number, github);
        if (tient !== null && tient.station !== station) vivants.add(ticket.number);
      }
      const fait = await claim.passer(pris, vivants);
      bilan.liberes.push(...fait.liberes);
      for (const { ticket, message: dit } of fait.echecs) echouer("claim", new Error(dit), ticket);
    });

    // Après le claim : un ticket dont le claim vient de tomber n'a plus de cook.
    await tache("ci-rouge", async () => {
      const libres = new Set(bilan.liberes);
      const lus = tickets.map((t) => (libres.has(t.number) ? { ...t, labels: t.labels.filter((l) => l !== LABEL_TAKEN) } : t));
      if (github.prsOuvertes === undefined || !lus.some((t) => aExaminer(t, enCuisine))) return;
      const fait = await renvoyerLesCiRouges({ github, station, prs: await github.prsOuvertes(), tickets: lus, enCuisine });
      bilan.ciRouges.push(...fait.renvoyes.map(({ ticket, leves }) => ({ ticket, leves })));
      for (const { ticket, message: dit } of fait.echecs) echouer("ci-rouge", new Error(dit), ticket);
    });

    // Ni un ticket mis de côté (la relance en décide), ni une épique, ni un
    // ticket qu'un cook tient encore.
    await tache("in-pass", async () => {
      const candidats = tickets.filter((t) => t.epique !== true && !estMisDeCote(t.labels) && !t.labels.includes(LABEL_TAKEN) && !enCuisine.has(t.number));
      const parBranche = new Map(candidats.map((t) => [brancheDuTicket(t.number), t.number]));
      const poses = await poserInPassSurLesPrsPretes({
        tickets: async () => ({ inchange: false, issues: candidats.map((t) => ({ ...t, createdAt: "", updatedAt: "", url: "" })), confirmer: () => {} }),
        // Une approbation ne vaut que sur la tête qu'elle a lue, et pas sur une
        // tête que la station a renvoyée à un cook (le second juge, une base
        // rouge) : la remettre en pass déferait ce renvoi.
        prDeBranche: async (branche) => {
          const numero = parBranche.get(branche);
          const pr = numero === undefined ? null : await github.prDuTicket(numero);
          if (numero === undefined || pr === null) return null;
          if (dernierVerdict(await github.commentaires(pr.number))?.sha !== pr.sha) return null;
          if ((await github.commentaires(numero)).some((c) => c.body.startsWith(MARQUE_DE_RENVOI) && c.body.includes(` sha=${pr.sha}`))) return null;
          return { url: "", base, mergeePar: null, ...pr };
        },
        ci: async (sha) => (await github.ci(sha)).map((check) => ({ conclusion: "", url: null, ...check })) as Awaited<ReturnType<GitHub["ci"]>>,
        labelliser: (numero, labels) => github.labelliser(numero, labels),
        commentaires: (numero) => github.commentaires(numero),
      });
      bilan.enPass.push(...poses);
    });

    await tache("epique", async () => {
      const epiques = tickets.filter((t) => t.epique === true);
      if (epiques.length === 0) return;
      // Le client du runtime la lit toujours ; un client réduit (un test) ne ferme rien.
      const { issue } = github;
      if (issue === undefined) return;
      const client = {
        issue: (numero: number) => issue.call(github, numero),
        commentaires: async (numero: number) => (await github.commentaires(numero)).map(({ body, association, createdAt }) => ({ body, association, createdAt, author: "" })),
        commenter: (numero: number, corps: string) => github.commenter(numero, corps),
        fermerIssue: (numero: number) => github.fermerIssue(numero),
      };
      for (const epique of epiques) {
        try {
          if ((await fermerEpiqueFinie(client, epique.number)).fermee) bilan.epiquesFermees.push(epique.number);
        } catch (erreur) {
          echouer("epique", erreur, epique.number);
        }
      }
    });

    // Inerte : des tickets à prendre — ni de côté, ni pris, ni en pass, ni en
    // attente (`waiting` : sa colonne, pas le rail, #1924), ni une épique, ni en
    // attente du chef, calibrés —, et depuis `INERTIE_MINUTES` rien au travail
    // alors qu'il y en avait à prendre.
    // Un seul bug tant qu'il reste ouvert (#2755).
    await tache("inertie", async () => {
      const instant = maintenant();
      const auTravail = enCuisine.size > 0 || tickets.some((t) => t.labels.includes(LABEL_TAKEN) || t.labels.includes(LABEL_IN_PASS));
      // Comme la retenue (`retenue/tour.ts`) : un ticket qui attend le chef, ou
      // dont le calibrage est incomplet, n'est pas prenable — la station le
      // saute — et ne vaut pas une inertie. Un `waiting` non plus : il est sur
      // sa colonne, pas sur le rail.
      // Ni un ticket que l'attente d'après un arrêt retient : la porte de prise le saute (#2508, #2975).
      const aPrendre: typeof tickets[number][] = [];
      for (const t of tickets) {
        if (t.epique === true || [...MIS_DE_COTE, LABEL_TAKEN, LABEL_IN_PASS, LABEL_WAITING, A_LA_MAIN].some((label) => t.labels.includes(label)) || !complet(calibrage([...t.labels]))) continue;
        // Ni un ticket dont la zone est tenue : la porte de prise le saute, et ce
        // qui le tient se compte de lui-même — son ticket pris ou en pass est du
        // travail, à prendre il vaut une inertie, mis de côté ou chez le chef il
        // attend un humain, que rien sur le rail ne remplace (#2977).
        if (zonesTenues.has(t.number)) continue;
        // Illisibles, ses commentaires ne le retiennent pas : comme la porte.
        if (termeDeLAttente(await github.commentaires(t.number).catch(() => []), instant) !== null) continue;
        aPrendre.push(t);
      }
      if (auTravail || aPrendre.length === 0) auTravailLe = instant;
      const fait = await signalerInertie({
        maintenant: new Date(instant),
        github: {
          dernierMerge: async () => new Date(auTravailLe).toISOString(),
          cuisinables: async () => aPrendre.map((t) => ({ number: t.number, title: t.title })),
          // Rien n'est pris quand l'inertie se lit : un ticket pris est du travail.
          prises: async () => [],
          prsEnPasse: async () => tickets.filter((t) => t.labels.includes(LABEL_IN_PASS)).length,
          issuesOuvertes: async (label) => {
            const lues = github.issuesDepuis === undefined ? [] : (await github.issuesDepuis(new Date(instant - SEMAINE_MS).toISOString())).filter((i) => i.state === "open" && i.labels?.includes(label) === true);
            if (bugOuvert !== null && !lues.some((i) => i.number === bugOuvert)) {
              const lue = await github.issue?.(bugOuvert);
              if (lue?.state === "open") lues.push({ number: bugOuvert, body: lue.body ?? "", labels: lue.labels, state: lue.state });
            }
            return lues;
          },
          creerIssue: (issue) => github.creerIssue(issue),
          // Les zones tenues des tickets sautés au dernier tour de la porte de prise.
          zonesTenues: async () => [...zonesTenues].map(([ticket, tenant]) => ({ ticket, tenant })),
        },
        ...(brigade === undefined || servi === undefined
          ? {}
          : {
              brigade: {
                servi,
                marqueDuProjet: marqueDuProjet(servi),
                creerIssue: (issue) => brigade.creerIssue(issue),
                issuesOuvertes: async () => (await brigade.issuesDepuis(new Date(instant - MOIS_MS).toISOString())).filter((i) => i.state !== "closed"),
              },
            }),
      });
      if (fait.fait === "bug") {
        // Le bug de la brigade n'est pas une issue du projet : il ne se relit pas là.
        if (fait.sur !== "brigade") bugOuvert = fait.bug;
        bilan.inertie = fait.bug;
        avertir(`brigade : idle kitchen on ${station} (${fait.cause}) — bug #${fait.bug} filed${fait.sur === "brigade" ? ` on ${DEPOT_BRIGADE}` : ""}`);
      }
    });

    // Une carte de TODO qui ne pose pas de question : son défaut sur la brigade, une fois (#3134).
    await tache("sans-question", async () => {
      const posees = tickets.filter((t) => t.labels.includes(CHEF_TODO));
      if (sansQuestion === null || posees.length === 0) return;
      for (const { carte, defaut } of await sansQuestion.signaler((await cartesDesIssues(github, posees)).todo)) avertir(`brigade : the TODO card of #${carte} asks no question — defect #${defaut} filed on ${DEPOT_BRIGADE}`);
    });

    const sans = (labels: readonly string[], label: string) => labels.filter((l) => l !== label);
    bilan.tickets = tickets
      .filter((t) => !bilan.epiquesFermees.includes(t.number))
      .map((t) => {
        let labels = [...t.labels];
        if (bilan.relances.includes(t.number)) for (const label of MIS_DE_COTE) labels = sans(labels, label);
        if (bilan.liberes.includes(t.number)) labels = sans(labels, LABEL_TAKEN);
        for (const label of bilan.ciRouges.find((c) => c.ticket === t.number)?.leves ?? []) labels = sans(labels, label);
        if (bilan.enPass.includes(t.number)) labels.push(LABEL_IN_PASS);
        return labels.length === t.labels.length && labels.every((l, i) => l === t.labels[i]) ? t : { ...t, labels };
      });
    return bilan;
  }

  return { guerir };
}
