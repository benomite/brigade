// La guérison d'un projet, à chaque tour de la station qui le sert (épique
// #2745, ticket #2757). Les gestes qu'une routine humaine faisait à la main,
// chacun dans son module, sont joués ici l'un après l'autre :
// - la relance d'un ticket mis de côté pour une raison qu'un cook répare,
//   deux fois au plus pour la même raison (`relance.ts`, #2750) ;
// - la libération d'un `taken` resté plus de 45 min sans cook vivant
//   (`claim-perime.ts`, #2751) ;
// - `in-pass` sur le ticket d'une PR approuvée, verte et mergeable
//   (`pr-prete.ts`, #2752) ;
// - le renvoi à un cook d'une PR `cook/<n>-github` rouge sur laquelle aucun
//   cook ne travaille, jamais au chef (`../ci-rouge/ci-rouge.ts`, #2970) ;
// - la clôture d'une épique dont tous les sous-tickets sont fermés
//   (`epique-finie.ts`, #2754) ;
// - le défaut d'une carte de TODO sans question, déposé sur la brigade
//   (`../signalement-carte-sans-question.ts`, #3134).
// La lacune technique que le manager complète seul (#2753) est dans ses
// instructions, pas ici.
//
// Un geste qui échoue ne retient pas les autres : son erreur va à `avertir`.
// Rien n'est propre à un dépôt : le projet, sa base et sa station viennent de
// l'appelant. Ce qui se tient d'un tour à l'autre (l'horloge des claims) vit
// dans l'objet que rend `ouvrirGuerison`, un par station.
import { cartesDesIssues } from "../attente-github/attente-github.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import { aExaminer, renvoyerLesCiRouges, type PROuverte } from "../ci-rouge/ci-rouge.ts";
import { estMisDeCote, MIS_DE_COTE, type GitHub, type Issue } from "../github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import { dernierVerdict } from "../github-etat/fusion.ts";
import { lireTenant, type RetraitDeLabel } from "../github-etat/prise.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { ouvrirClaimPerime } from "./claim-perime.ts";
import { DEPOT_BRIGADE, type GitHubDeLaBrigade } from "../routage-temps-perdu.ts";
import { fermerEpiqueFinie } from "./epique-finie.ts";
import { poserInPassSurLesPrsPretes } from "./pr-prete.ts";
import { relancer, type GitHubDeLaGuerison } from "./relance.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { ouvrirSignalement } from "../signalement-carte-sans-question.ts";

// Ce que la guérison demande au client du tour, et rien de plus. `issue` :
// absent, les épiques ne se ferment pas. `prsOuvertes` : absent, aucune PR
// rouge n'est renvoyée.
export type GitHubDuProjet = GitHubDeLaGuerison &
  Pick<GitHub, "fermerIssue"> & {
    retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
    prsOuvertes?(): Promise<PROuverte[]>;
    prOuverteDuTicket?: GitHubDeLaGuerison["prDuTicket"];
    issue?: GitHub["issue"];
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
  // Le projet servi et le GitHub de la brigade : le défaut d'une carte sans
  // question se dépose sur la brigade (#3134) ; sans eux, il ne se dépose pas.
  servi?: string;
  brigade?: GitHubDeLaBrigade;
  // En millisecondes ; l'horloge du système par défaut.
  maintenant?: () => number;
};

export type Geste = "relance" | "claim" | "ci-rouge" | "in-pass" | "epique" | "sans-question";

// Ce qu'un tour de guérison a fait, geste par geste. `tickets` : ceux du tour
// tels que la guérison les laisse — un ticket relancé sans `served-elsewhere`, un
// claim libéré sans `taken`, une PR rouge renvoyée sans ce qui la tenait pour
// le chef, une PR prête avec `in-pass`, une épique fermée
// hors de la liste —, pour que le tour ne lise pas des labels périmés.
export type BilanDeLaGuerison<T extends TicketDuTour = TicketDuTour> = {
  tickets: T[];
  relances: number[];
  liberes: number[];
  // Les tickets dont la PR rouge repart à un cook, et les labels levés de chacun.
  ciRouges: { ticket: number; leves: string[] }[];
  enPass: number[];
  epiquesFermees: number[];
  echecs: { geste: Geste; message: string }[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirGuerison(options: OptionsDeLaGuerison) {
  const { github, station, base, avertir, servi } = options;
  const maintenant = options.maintenant ?? Date.now;
  const claim = ouvrirClaimPerime({ github, maintenant });
  // Le défaut d'une carte sans question va sur la brigade, le projet servi la brigade elle-même compris :
  // sans son GitHub, rien ne se dépose.
  const sansQuestion = servi === undefined || options.brigade === undefined ? null : ouvrirSignalement({ servi, brigade: options.brigade, maintenant: () => new Date(maintenant()) });
  // `tickets` : ceux que le tour vient de lire (`fire`, ouverts). `enCuisine` :
  // les tickets qu'un cook de cette station cuisine en ce moment.
  async function guerir<T extends TicketDuTour>(tickets: readonly T[], enCuisine: ReadonlySet<number>): Promise<BilanDeLaGuerison<T>> {
    const bilan: BilanDeLaGuerison<T> = { tickets: [], relances: [], liberes: [], ciRouges: [], enPass: [], epiquesFermees: [], echecs: [] };
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
        const tient = await lireTenant(ticket.number, github, ticket.labels);
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
          const pr = numero === undefined ? null : await (github.prOuverteDuTicket ?? github.prDuTicket).call(github, numero);
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
