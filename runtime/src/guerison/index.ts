// La guérison d'un projet, à chaque tour de la station qui le sert (épique
// #2745, ticket #2757). Les gestes qu'une routine humaine faisait à la main,
// chacun dans son module, sont joués ici l'un après l'autre :
// - la relance d'un ticket mis de côté pour une raison qu'un cook répare,
//   avec sa garde contre la boucle (`relance.ts`, #2750) ;
// - la libération d'un `taken` resté plus de 45 min sans cook vivant
//   (`claim-perime.ts`, #2751) ;
// - `in-pass` sur le ticket d'une PR approuvée, verte et mergeable
//   (`pr-prete.ts`, #2752) ;
// - la clôture d'une épique dont tous les sous-tickets sont fermés
//   (`epique-finie.ts`, #2754) ;
// - le signalement d'une cuisine oisive : des tickets à prendre, et aucun cook
//   ni aucune livraison depuis 30 min.
// La lacune technique que le manager complète seul (#2753) est dans ses
// instructions, pas ici.
//
// Un geste qui échoue ne retient pas les autres : son erreur va à `avertir`.
// Rien n'est propre à un dépôt : le projet, sa base et sa station viennent de
// l'appelant. Ce qui se tient d'un tour à l'autre (l'horloge des claims, celle
// de l'oisiveté) vit dans l'objet que rend `ouvrirGuerison`, un par station.
import { brancheDuTicket } from "../brigade-github.ts";
import { HORS_CUISINE, type GitHub, type Issue } from "../github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { dernierVerdict } from "../github-etat/fusion.ts";
import { lireTenant, type RetraitDeLabel } from "../github-etat/prise.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { OISIVE_APRES_MS } from "../cuisine-oisive.ts";
import { ouvrirClaimPerime } from "./claim-perime.ts";
import { fermerEpiqueFinie } from "./epique-finie.ts";
import { poserInPassSurLesPrsPretes } from "./pr-prete.ts";
import { relancer, type GitHubDeLaGuerison } from "./relance.ts";

// Ce que la guérison demande au client du tour, et rien de plus. `issue` :
// absent, les épiques ne se ferment pas.
export type GitHubDuProjet = GitHubDeLaGuerison &
  Pick<GitHub, "fermerIssue"> & {
    retraitsDeLabels(numero: number): Promise<RetraitDeLabel[]>;
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
  // En millisecondes ; l'horloge du système par défaut.
  maintenant?: () => number;
};

export type Geste = "relance" | "claim" | "in-pass" | "epique" | "oisive";

// Ce qu'un tour de guérison a fait, geste par geste. `tickets` : ceux du tour
// tels que la guérison les laisse — un ticket relancé sans `hors-cuisine`, un
// claim libéré sans `taken`, une PR prête avec `in-pass`, une épique fermée
// hors de la liste —, pour que le tour ne lise pas des labels périmés.
export type BilanDeLaGuerison<T extends TicketDuTour = TicketDuTour> = {
  tickets: T[];
  relances: number[];
  boucles: number[];
  liberes: number[];
  enPass: number[];
  epiquesFermees: number[];
  oisive: boolean;
  echecs: { geste: Geste; message: string }[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirGuerison(options: OptionsDeLaGuerison) {
  const { github, station, base, avertir } = options;
  const maintenant = options.maintenant ?? Date.now;
  const claim = ouvrirClaimPerime({ github, maintenant });
  // Depuis quand la cuisine est oisive, et si elle l'a déjà dit pour cette fois.
  let oisiveDepuis: number | null = null;
  let oisiveDite = false;

  // `tickets` : ceux que le tour vient de lire (`fire`, ouverts). `enCuisine` :
  // les tickets qu'un cook de cette station cuisine en ce moment.
  async function guerir<T extends TicketDuTour>(tickets: readonly T[], enCuisine: ReadonlySet<number>): Promise<BilanDeLaGuerison<T>> {
    const bilan: BilanDeLaGuerison<T> = { tickets: [], relances: [], boucles: [], liberes: [], enPass: [], epiquesFermees: [], oisive: false, echecs: [] };
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
      for (const ticket of tickets.filter((t) => t.labels.includes(HORS_CUISINE))) {
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

    // Ni un ticket mis de côté (la relance en décide), ni une épique, ni un
    // ticket qu'un cook tient encore.
    await tache("in-pass", async () => {
      const candidats = tickets.filter((t) => t.epique !== true && !t.labels.includes(HORS_CUISINE) && !t.labels.includes(LABEL_TAKEN) && !enCuisine.has(t.number));
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

    // Oisive : des tickets à prendre — ni de côté, ni en attente, ni pris, ni
    // en pass, ni une épique —, et ni cook ici ni livraison en pass, 30 min
    // durant. Dit une fois par épisode ; le premier cook ou la première
    // livraison remet le compte à zéro.
    await tache("oisive", async () => {
      const aPrendre = tickets.filter((t) => t.epique !== true && ![HORS_CUISINE, LABEL_WAITING, LABEL_TAKEN, LABEL_IN_PASS].some((label) => t.labels.includes(label)));
      const auTravail = enCuisine.size > 0 || tickets.some((t) => t.labels.includes(LABEL_TAKEN) || t.labels.includes(LABEL_IN_PASS));
      if (aPrendre.length === 0 || auTravail) {
        oisiveDepuis = null;
        oisiveDite = false;
        return;
      }
      const instant = maintenant();
      oisiveDepuis ??= instant;
      if (instant - oisiveDepuis < OISIVE_APRES_MS) return;
      bilan.oisive = true;
      if (oisiveDite) return;
      oisiveDite = true;
      avertir(`brigade : idle kitchen on ${station} — ${aPrendre.map((t) => `#${t.number}`).join(", ")} wait on the rail and no cook has run for ${Math.round((instant - oisiveDepuis) / 60_000)} min`);
    });

    const sans = (labels: readonly string[], label: string) => labels.filter((l) => l !== label);
    bilan.tickets = tickets
      .filter((t) => !bilan.epiquesFermees.includes(t.number))
      .map((t) => {
        let labels = [...t.labels];
        if (bilan.relances.includes(t.number)) labels = sans(labels, HORS_CUISINE);
        if (bilan.liberes.includes(t.number)) labels = sans(labels, LABEL_TAKEN);
        if (bilan.enPass.includes(t.number)) labels.push(LABEL_IN_PASS);
        return labels.length === t.labels.length && labels.every((l, i) => l === t.labels[i]) ? t : { ...t, labels };
      });
    return bilan;
  }

  return { guerir };
}
