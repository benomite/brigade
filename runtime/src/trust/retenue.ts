// L'issue d'un auteur sans l'écriture est retenue (#4358) : ni jugée, ni mise sur le rail, ni
// donnée à un agent — pas même pour une proposition de tri, comme avant (#2934) : le manager
// lisait son texte. Elle attend que le chef l'accepte, sur une carte de TODO qui nomme son auteur
// et offre `accept`. Une seule carte : la pose relit l'issue, et ne double rien d'un tour à
// l'autre (`poserCarte`).
//
// Les labels que la cuisine lit pour prendre du travail (`fire`, `prio:`, `model:`, `effort:`),
// posés sur une issue retenue par un compte sans l'écriture, n'ont aucun effet : ils sont
// retirés. Le même label posé par un compte de confiance fait de l'issue celle qu'un membre a
// lancée ou priorisée, et elle passe comme toute autre (#2619).
//
// Accepter, c'est un commentaire du chef — ou de l'humain `product` à qui la carte va (#2760) —
// après la carte : le bouton `accept` de l'app (`<!-- brigade:reponse gesture=accept -->`), ou
// une ligne `accept`. La cuisine lève alors la carte et pose la marque de l'accord, qui nomme
// l'empreinte du titre et du corps acceptés : l'accord est gardé, et la cuisine ne redemande
// pas — tant que l'auteur ne réécrit pas son issue, que l'accord ne couvre plus.
//
// L'état est sur GitHub : la carte, puis la marque de l'accord. Chaque pas se relit avant
// d'écrire : une station qui tombe au milieu laisse au tour suivant le pas qui manque.
import { createHash } from "node:crypto";
import { priorite } from "../alimenter.ts";
import { aiguiller, type Humain } from "../aiguillage-humains/aiguillage.ts";
import { deposeParUneStation } from "../github-etat/auteur.ts";
import { LABEL, type Commentaire, type GitHub, type IssueOuverte } from "../github.ts";
import { CHEF_TODO, leverCarte, marqueur, poserCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import { porteDeConfiance, type PorteDeConfiance } from "./confiance.ts";

// Une question de produit, que l'aiguillage donne à l'humain `product` — au chef s'il n'en déclare pas.
export const SORTE_DE_LA_CARTE = "product-question" as const;

// La question de la carte, par laquelle elle se reconnaît parmi les autres questions de produit.
const QUESTION = /^Held issue #[1-9][0-9]*: /m;
const MARQUE_ACCORD = /^<!-- brigade:trust-accepted of=([0-9a-f]{12}) -->$/m;
const MARQUE_GESTE_ACCEPT = /<!-- brigade:reponse gesture=accept -->/;

// Les labels par lesquels la cuisine prend du travail.
export const labelDeLaCuisine = (label: string): boolean => label === LABEL || priorite([label]) !== null || label.startsWith("model:") || label.startsWith("effort:");

// L'empreinte de ce que le chef accepte : le titre et le corps de l'issue.
const empreinteAcceptee = ({ title, body }: { title: string; body: string }): string => createHash("sha256").update(`${title}\n${body}`).digest("hex").slice(0, 12);

const marqueDeLAccord = (issue: { title: string; body: string }, par: string): string =>
  `<!-- brigade:trust-accepted of=${empreinteAcceptee(issue)} -->\n**Accepted** by @${par}: the kitchen now reads this issue and judges it like any other.`;

const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Un texte sur une ligne, d'au plus `max` signes.
const uneLigne = (texte: string, max: number): string => {
  const ligne = texte.replace(/[`*_>#\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return ligne.length <= max ? ligne : `${ligne.slice(0, max - 1).trimEnd()}…`;
};

// Ce que l'issue demande, en une ligne : son titre, puis la première ligne de son corps.
const ceQuElleDemande = ({ title, body }: { title: string; body: string }): string => {
  const debut = uneLigne(body.split("\n").find((ligne) => ligne.trim() !== "") ?? "", 120);
  return debut === "" ? uneLigne(title, 160) : `${uneLigne(title, 80)} — ${debut}`;
};

// La carte : sa question, `accept` puis `close`, ce que l'issue demande et qui l'a ouverte.
// `declare` : l'auteur est un humain que le projet déclare (`humans`), sans l'écriture.
function carteDeRetenue(numero: number, issue: { title: string; body: string; auteur?: string; declare?: boolean }): Carte {
  const auteur = issue.auteur === undefined || issue.auteur === "" ? "someone" : `@${issue.auteur}`;
  const qui = issue.declare === true ? `Opened by ${auteur}, a declared human of the project without write access.` : `Opened by ${auteur}, who has no write access to the repository.`;
  return {
    sorte: SORTE_DE_LA_CARTE,
    texte: [
      `Held issue #${numero}: accept it, so the kitchen reads it?`,
      "",
      "- [accept] Accept it",
      "- [close] Close it",
      "",
      `Asks: ${ceQuElleDemande(issue)}`,
      qui,
      "",
      `Until you accept it, no agent reads #${numero} and nothing of it reaches the rail. You can also answer on the issue with one line: \`accept\`.`,
    ].join("\n"),
  };
}

// L'accord parmi ces commentaires — ceux qui suivent la carte —, ou nul. Fait foi : un compte de
// confiance, ou l'humain à qui la carte va ; jamais une autre marque de la cuisine.
async function accordDu(commentaires: readonly Commentaire[], humain: string | null, porte: Pick<PorteDeConfiance, "deConfiance">): Promise<{ par: string } | null> {
  for (const commentaire of [...commentaires].reverse()) {
    const { body, author } = commentaire;
    const geste = MARQUE_GESTE_ACCEPT.test(body);
    if (!geste && body.includes("<!-- brigade:")) continue;
    if (!(humain !== null && meme(author, humain)) && !(await porte.deConfiance(commentaire))) continue;
    const ligne = (body.split("\n").find((lue) => lue.trim() !== "") ?? "").replace(/[`*_>]/g, "").trim().toLowerCase();
    if (geste || /^accept\b/.test(ligne)) return { par: author };
  }
  return null;
}

export type AtelierDeLaRetenue = {
  github: Pick<GitHub, "commentaires" | "commenter" | "issue" | "labelliser" | "delabelliser" | "assigner" | "labelsPosesParDeConfiance" | "permissionDe">;
  // Les humains du projet (`humans` de ses réglages), relus à chaque carte.
  humains: () => Humain[];
  avertir: (message: string) => void;
  arrete: () => boolean;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirRetenues(atelier: AtelierDeLaRetenue) {
  const { github, avertir, arrete } = atelier;
  const porte = porteDeConfiance(github);
  // Le verdict de chaque issue d'un auteur sans l'écriture, à l'instant de sa dernière
  // modification et pour ses labels : tant qu'ils ne changent pas, rien n'est à relire — le
  // chef qui retire son `fire` entre un jugement et la pose des labels la retient de nouveau,
  // même lue d'une issue au même instant. Cache, pas état.
  const verdicts = new Map<number, { version: string; retenue: boolean }>();
  const versionDe = (issue: IssueOuverte) => JSON.stringify([issue.updatedAt, [...issue.labels].sort()]);
  // Les issues dont la carte attend l'humain, à l'instant de leur dernière modification.
  const enAttente = new Map<number, string>();
  const declares = () => {
    try {
      return atelier.humains().map(({ login }) => login);
    } catch {
      return [];
    }
  };

  // La marque d'accord de confiance qui couvre l'issue telle qu'elle est.
  const acceptee = async (issue: Pick<IssueOuverte, "title" | "body">, lus: readonly Commentaire[]): Promise<boolean> => {
    const empreinte = empreinteAcceptee(issue);
    for (const lu of lus) if (MARQUE_ACCORD.exec(lu.body)?.[1] === empreinte && (await porte.deConfiance(lu))) return true;
    return false;
  };

  // Les labels de la cuisine qu'un compte de confiance a posés sur l'issue — aucun, sans client qui le lise.
  const garantis = async (issue: IssueOuverte): Promise<string[]> => {
    if (!issue.labels.some(labelDeLaCuisine) || github.labelsPosesParDeConfiance === undefined) return [];
    return (await github.labelsPosesParDeConfiance(issue.number)).filter((label) => issue.labels.includes(label));
  };

  return {
    porte,
    // L'issue est-elle retenue ? Non si son auteur est de confiance, si une station l'a déposée
    // sous un compte déclaré (#3012), si un compte de confiance y a posé `fire` ou un `prio:`
    // (#2619), ou si le chef l'a acceptée telle qu'elle est. Lève si GitHub ne répond pas.
    async retenue(issue: IssueOuverte): Promise<boolean> {
      if (await porte.deConfiance(issue)) return false;
      const auteur = issue.author;
      if (deposeParUneStation(issue.body) && auteur !== undefined && auteur !== "" && declares().some((login) => meme(login, auteur))) return false;
      const version = versionDe(issue);
      const connu = verdicts.get(issue.number);
      if (connu?.version === version) return connu.retenue;
      const lance = (await garantis(issue)).some((label) => label === LABEL || priorite([label]) !== null);
      const retenue = !lance && !(await acceptee(issue, await github.commentaires(issue.number)));
      verdicts.set(issue.number, { version, retenue });
      return retenue;
    },

    // Sert une issue retenue. `fait` : rien n'y reste à faire avant l'accord ; `acceptee` : le chef
    // vient de l'accepter, elle passe comme toute autre ; `reste` : un pas a échoué, repris au tour suivant.
    async traiter(issue: IssueOuverte): Promise<"fait" | "reste" | "acceptee"> {
      if (enAttente.get(issue.number) === issue.updatedAt) return "fait";
      enAttente.delete(issue.number);
      try {
        const posesParDeConfiance = await garantis(issue);
        for (const label of issue.labels.filter((label) => labelDeLaCuisine(label) && !posesParDeConfiance.includes(label))) await github.delabelliser(issue.number, label);
        if (arrete()) return "reste";
        const lus = await github.commentaires(issue.number);
        const estLaCarte = async (lu: Commentaire) => lu.body.startsWith(marqueur(SORTE_DE_LA_CARTE)) && QUESTION.test(lu.body) && (await porte.deConfiance(lu));
        let carte = -1;
        let accord = -1;
        for (const [rang, lu] of lus.entries()) {
          if (await estLaCarte(lu)) carte = rang;
          else if (MARQUE_ACCORD.test(lu.body) && (await porte.deConfiance(lu))) accord = rang;
        }
        const aiguillage = aiguiller(atelier.humains(), SORTE_DE_LA_CARTE);
        const poser = async () => {
          if (aiguillage.vers === "humain") await github.assigner?.(issue.number, [aiguillage.login]);
          const auteur = issue.author ?? (await github.issue(issue.number))?.author;
          const declare = auteur !== undefined && atelier.humains().some(({ login }) => meme(login, auteur));
          await poserCarte(issue.number, carteDeRetenue(issue.number, { title: issue.title, body: issue.body, ...(auteur === undefined ? {} : { auteur }), declare }), github);
        };
        // Aucune carte, ou un accord qui ne couvre plus l'issue réécrite : la carte se pose.
        if (carte === -1 || accord > carte) {
          await poser();
          return "fait";
        }
        const reponse = await accordDu(lus.slice(carte + 1), aiguillage.vers === "humain" ? aiguillage.login : null, porte);
        if (reponse === null) {
          // Répondue sans accord — ses mots, que l'app poste en levant la carte : l'issue reste retenue, et revient au TODO.
          if (!issue.labels.includes(CHEF_TODO)) await poser();
          enAttente.set(issue.number, issue.updatedAt);
          return "fait";
        }
        // La carte levée d'abord : un arrêt après elle relit l'accord au tour suivant, et le rejoue.
        await leverCarte(issue.number, github, SORTE_DE_LA_CARTE);
        await github.commenter(issue.number, marqueDeLAccord(issue, reponse.par));
        verdicts.delete(issue.number);
        return "acceptee";
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : issue #${issue.number}, d'un auteur sans l'écriture, retenue — reprise au tour suivant — ${message(erreur)}`);
        return "reste";
      }
    },
  };
}
