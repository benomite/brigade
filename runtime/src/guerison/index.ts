// La guérison d'un projet, à chaque tour de la station qui le sert (épique
// #2745, ticket #2757). Les gestes qu'une routine humaine faisait à la main,
// chacun dans son module, sont joués ici l'un après l'autre :
// - la libération d'un `taken` resté plus de 45 min sans cook vivant
//   (`claim-perime.ts`, #2751) ;
// - `in-pass` sur le ticket d'une PR approuvée, verte et mergeable
//   (`pr-prete.ts`, #2752) ;
// - la clôture d'une épique dont tous les sous-tickets sont fermés
//   (`epique-finie.ts`, #2754) ;
// - le défaut d'une carte de TODO sans question, déposé sur la brigade
//   (`../signalement-carte-sans-question.ts`, #3134) ;
// - un ticket en limbes — jugé décision ou attente par le manager, sans
//   calibrage, ni décision ouverte, ni attente — remis en carte ou parqué
//   (`../limbo/on-github.ts`, #4215).
// La lacune technique que le manager complète seul (#2753) est dans ses
// instructions, pas ici.
//
// Aucun ne touche un ticket parqué (#4260) : il attend sa date, son fait ou sa
// réponse, et reprend exactement où il était.
//
// Un geste qui échoue ne retient pas les autres : son erreur va à `avertir`.
// Rien n'est propre à un dépôt : le projet, sa base et sa station viennent de
// l'appelant. Ce qui se tient d'un tour à l'autre (l'horloge des claims) vit
// dans l'objet que rend `ouvrirGuerison`, un par station.
import { cartesDesIssues } from "../attente-github/attente-github.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import { estMisDeCote, type GitHub, type Issue, type PR } from "../github.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import { dernierVerdict, type CommentaireDeVerdict, type PRAFusionner } from "../github-etat/fusion.ts";
import type { Check } from "../events/pass.ts";
import { lireTenant, type RetraitDeLabel } from "../github-etat/prise.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { ouvrirClaimPerime } from "./claim-perime.ts";
import { DEPOT_BRIGADE, type GitHubDeLaBrigade } from "../issue-de-la-cuisine.ts";
import { fermerEpiqueFinie } from "./epique-finie.ts";
import { poserInPassSurLesPrsPretes } from "./pr-prete.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { ouvrirSignalement } from "../signalement-carte-sans-question.ts";
import { repairLimboOnGitHub } from "../limbo/on-github.ts";

// Ce que la guérison demande au client GitHub de la station, et rien de plus.
export type GitHubDeLaGuerison = {
  // Les commentaires d'une issue ou d'une PR, du plus ancien au plus récent.
  commentaires(numero: number): Promise<CommentaireDeVerdict[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  // La PR qui livre le ticket, ou null.
  prDuTicket(issue: number): Promise<(PRAFusionner & Partial<Pick<PR, "base">>) | null>;
  // Les checks de la CI sur le commit `sha`.
  ci(sha: string): Promise<Pick<Check, "outcome" | "name">[]>;
};

// Ce que la guérison demande au client du tour, et rien de plus. `issue` :
// absent, les épiques ne se ferment pas.
export type GitHubDuProjet = GitHubDeLaGuerison &
  Pick<GitHub, "fermerIssue"> & {
    retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
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

export type Geste = "claim" | "in-pass" | "epique" | "sans-question" | "limbes";

// Ce qu'un tour de guérison a fait, geste par geste. `tickets` : ceux du tour
// tels que la guérison les laisse — un
// claim libéré sans `taken`, une PR prête avec `in-pass`, une épique fermée
// hors de la liste —, pour que le tour ne lise pas des labels périmés.
export type BilanDeLaGuerison<T extends TicketDuTour = TicketDuTour> = {
  tickets: T[];
  liberes: number[];
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
    const bilan: BilanDeLaGuerison<T> = { tickets: [], liberes: [], enPass: [], epiquesFermees: [], echecs: [] };
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

    // Un ticket qu'une autre station tient n'est jamais libéré ici : son cook
    // tourne peut-être encore là-bas, et le retrait de `taken` lâcherait sa
    // prise — un second cook partirait sur le même ticket. Cette station ne
    // libère que ses propres prises et celles que personne ne tient.
    await tache("claim", async () => {
      const pris = tickets.filter((t) => t.labels.includes(LABEL_TAKEN) && !t.labels.includes(LABEL_IN_PASS) && !estParque(t.labels));
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

    // Ni un ticket mis de côté (aucune minuterie ne le remet sur le rail : le superviseur en décide) ou parqué, ni une
    // épique, ni un ticket qu'un cook tient encore.
    await tache("in-pass", async () => {
      const candidats = tickets.filter((t) => t.epique !== true && !estMisDeCote(t.labels) && !estParque(t.labels) && !t.labels.includes(LABEL_TAKEN) && !enCuisine.has(t.number));
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

    // Un ticket en limbes : sa carte revient, ou il se parque, comme le manager l'a jugé (#4215).
    await tache("limbes", async () => {
      // Le client du runtime la lit toujours ; un client réduit (un test) ne pose aucune carte.
      const { issue } = github;
      if (issue === undefined) return;
      const client = {
        issue: (numero: number) => issue.call(github, numero),
        commentaires: async (numero: number) => (await github.commentaires(numero)).map(({ body, association, createdAt }) => ({ body, association, createdAt, author: "" })),
        commenter: (numero: number, corps: string) => github.commenter(numero, corps),
        labelliser: (numero: number, labels: string[]) => github.labelliser(numero, labels),
        delabelliser: (numero: number, label: string) => github.delabelliser(numero, label),
      };
      await repairLimboOnGitHub(client, tickets, () => new Date(maintenant()));
    });

    const sans = (labels: readonly string[], label: string) => labels.filter((l) => l !== label);
    bilan.tickets = tickets
      .filter((t) => !bilan.epiquesFermees.includes(t.number))
      .map((t) => {
        let labels = [...t.labels];
        if (bilan.liberes.includes(t.number)) labels = sans(labels, LABEL_TAKEN);
        if (bilan.enPass.includes(t.number)) labels.push(LABEL_IN_PASS);
        return labels.length === t.labels.length && labels.every((l, i) => l === t.labels[i]) ? t : { ...t, labels };
      });
    return bilan;
  }

  return { guerir };
}
