// La roadmap du projet n'est jamais un ticket (#3436). Le 2026-11-13, le
// manager a jugé BOBL-tech/espace#1 (« Roadmap ») : il y a posé `decision` et
// demandé au chef de confirmer qu'elle restait un document de suivi — alors que
// le `CLAUDE.md` du projet la nommait (`**Roadmap** : issue #1`). Le tri la
// reconnaît désormais avant tout jugement et l'écarte (`roadmap`) ; ce module
// fait le reste, à chaque tour qui la sert :
//   - elle porte ce qui pose une question au chef — `question`, `decision`,
//     `chef-todo`, ou une carte de TODO au journal — : le manager le retire, sans
//     geste du chef, et le note (`manager.roadmap-cleared`) ;
//   - il la lit, une fois par état, pour le travail séparé qu'elle porte — une
//     observation, un bug glissé entre deux jalons, comme celle du
//     `_ds_manifest.json` sur espace#1 : chaque travail devient sa propre issue,
//     sans label, que le manager jugera comme toute autre (`manager.roadmap-read`,
//     puis `manager.roadmap-filed`). Il ne demande rien au chef.
// La roadmap elle-même reste telle quelle : ni label, ni commentaire, ni corps
// réécrit.
import { DE_CONFIANCE } from "../alimenter.ts";
import { cartesEnTodo, sortirDeTodo } from "../carte-todo.ts";
import type { IssueOuverte } from "../github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { empreinte, issueEnDonnee, objet, phrase } from "../juger.ts";
import type { AtelierDuManager } from "../requalifier.ts";

// La première ligne de la consigne : ce qui distingue une lecture de la roadmap
// d'un jugement, pour qui lit les lancements.
export const MARQUE_DE_LA_ROADMAP = "<!-- brigade:roadmap-consigne -->";

// Ce qui, sur une issue, pose une question au chef : les labels dont l'app fait
// une carte de TODO (`carteDeLEcart`, #3370 ; `chef-todo`, #2217).
export const LABELS_AU_CHEF: readonly string[] = ["question", "decision", CHEF_TODO];

export type Travail = { title: string; body: string };

// La marque d'une issue née de la roadmap : son état et son rang. Elle retrouve
// l'issue dont GitHub a perdu la réponse, au lieu d'en ouvrir une seconde.
const marque = (roadmap: number, etat: string, rang: number) => `<!-- brigade:roadmap-work of=${roadmap} state=${etat} index=${rang} -->`;

export function corpsDuTravail(roadmap: number, etat: string, rang: number, travail: Travail): string {
  return [marque(roadmap, etat, rang), travail.body, "", `_Spotted by the manager in the roadmap #${roadmap}, which stays a tracking document._`].join("\n");
}

export function consigneDeRoadmap(mission: { depot: string; issue: Pick<IssueOuverte, "number" | "title" | "body" | "labels">; commentaires: string[]; ouvertes: ReadonlyArray<Pick<IssueOuverte, "number" | "title">> }): string {
  const { depot, issue, commentaires, ouvertes } = mission;
  const autres = ouvertes.filter((ouverte) => ouverte.number !== issue.number).slice(0, 200);
  return [
    MARQUE_DE_LA_ROADMAP,
    `Tu es le manager de la brigade sur le dépôt ${depot}. Cette issue est la roadmap du projet : un document de suivi, jamais un ticket. Tu ne la juges pas, tu ne poses aucune question à son sujet, et personne n'a rien à y trancher.`,
    "",
    "Tu y cherches une seule chose : un travail séparé qui s'y est glissé sans issue à lui — une observation, un bug, une tâche concrète qu'un cook pourrait livrer dans une PR. Ses jalons, ses lignes de plan, ses cases à cocher, ce qui renvoie déjà à une issue (#N) ne sont pas du travail à ouvrir : la roadmap les suit, c'est son rôle. Ce qu'une issue ouverte ci-dessous porte déjà non plus.",
    "",
    "Dans le doute, rien : une issue ouverte à tort brûle le quota du chef.",
    "",
    "## Les issues ouvertes",
    "",
    ...(autres.length === 0 ? ["(aucune)"] : autres.map((ouverte) => `- #${ouverte.number} — ${ouverte.title}`)),
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui. Chaque travail devient une issue : un titre court, et un corps qui dit ce qui est observé, ce qu'il faut livrer et comment vérifier que c'est fait. En anglais.",
    "",
    "```json",
    '{"travaux": [{"titre": "titre de l\'issue", "corps": "le corps de l\'issue"}]}',
    "```",
    "",
    "Aucun travail séparé : `{\"travaux\": []}`.",
    "",
    ...issueEnDonnee(issue, commentaires),
  ].join("\n");
}

// Les travaux qu'une réponse porte, ou ce qui la rend illisible.
export function lireTravaux(message: string | null): { valeur: Travail[] } | { illisible: string } {
  const lu = objet(message ?? "");
  if (lu === null) return { illisible: "no JSON object in the answer" };
  if (!Array.isArray(lu.travaux)) return { illisible: "`travaux` is not a list" };
  const travaux: Travail[] = [];
  for (const element of lu.travaux as unknown[]) {
    const champs = element !== null && typeof element === "object" ? (element as Record<string, unknown>) : {};
    const title = phrase(champs.titre);
    const body = phrase(champs.corps);
    if (title === null || body === null) return { illisible: "a work item without `titre` or `corps`" };
    travaux.push({ title, body });
  }
  return { valeur: travaux };
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

type Lecture = { fingerprint: string; outcome: string; work: Travail[] };

export function ouvrirRoadmap(atelier: AtelierDuManager) {
  const { journal, projet, github, noter, avertir, arrete } = atelier;

  // Retire de la roadmap ce qui pose une question au chef. Rend faux si c'est
  // à refaire au tour suivant.
  const guerir = async (issue: IssueOuverte): Promise<boolean> => {
    const carte = cartesEnTodo(journal.base).some((enTodo) => enTodo.ticket === issue.number);
    if (!carte && !issue.labels.some((label) => LABELS_AU_CHEF.includes(label))) return true;
    const retires: string[] = [];
    try {
      // Relus juste avant d'écrire : ceux du sondage ont l'âge du tour.
      const fraiche = await github.issue(issue.number);
      if (arrete()) return false;
      if (fraiche?.state === "open") {
        for (const label of fraiche.labels.filter((pose) => LABELS_AU_CHEF.includes(pose))) {
          await github.delabelliser(issue.number, label);
          retires.push(label);
          if (arrete()) return false;
        }
      }
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : la roadmap #${issue.number} garde ce qui questionne le chef — repris au tour suivant — ${message(erreur)}`);
      return false;
    }
    const sortie = sortirDeTodo(journal, projet, issue.number, "it is the project's roadmap, a tracking document", "manager");
    noter(issue.number, { type: "manager.roadmap-cleared", payload: { labels: retires, card: sortie } });
    return true;
  };

  const lectureDe = (numero: number, etat: string): Lecture | null => {
    const lue = journal.duTicket(numero).findLast((evenement) => evenement.type === "manager.roadmap-read")?.payload as Lecture | undefined;
    return lue?.fingerprint === etat ? lue : null;
  };
  const rangsOuverts = (numero: number, etat: string): Set<number> =>
    new Set(
      journal
        .duTicket(numero)
        .filter((evenement) => evenement.type === "manager.roadmap-filed" && (evenement.payload as { fingerprint?: unknown }).fingerprint === etat)
        .map((evenement) => (evenement.payload as { index: number }).index),
    );

  // Lit la roadmap pour le travail séparé qu'elle porte, une fois par état, et
  // ouvre chacun en issue. Rend faux si quelque chose reste à faire.
  const lire = async (issue: IssueOuverte, corps: string[], ouvertes: readonly IssueOuverte[]): Promise<boolean> => {
    const etat = empreinte(issue, corps);
    let lue = lectureDe(issue.number, etat);
    if (lue === null) {
      if (!atelier.peutJuger()) return false;
      const reponse = await atelier.demander<Travail[]>(
        { numero: issue.number, prefixe: "roadmap", nom: "lecture de la roadmap" },
        consigneDeRoadmap({ depot: atelier.depotGitHub, issue, commentaires: corps, ouvertes }),
        lireTravaux,
      );
      if (!reponse) return false;
      if ("valeur" in reponse) {
        const work = reponse.valeur;
        noter(issue.number, { type: "manager.roadmap-read", payload: { run: reponse.run, fingerprint: etat, outcome: work.length === 0 ? "none" : "work", reason: "", work } });
      } else {
        noter(issue.number, { type: "manager.roadmap-read", payload: { run: reponse.run, fingerprint: etat, outcome: "unreadable", reason: reponse.illisible, work: [] } });
        avertir(`brigade : lecture illisible de la roadmap #${issue.number} (${reponse.illisible}) — rien n'est ouvert, elle sera relue quand elle changera`);
      }
      lue = lectureDe(issue.number, etat);
      if (lue === null) return true;
    }
    const ouverts = rangsOuverts(issue.number, etat);
    for (const [rang, travail] of lue.work.entries()) {
      if (ouverts.has(rang)) continue;
      if (arrete()) return false;
      // Née à un tour d'avant, sa réponse perdue : elle est déjà ouverte. La
      // marque ne vaut que sur une issue de confiance.
      const deja = ouvertes.find((ouverte) => DE_CONFIANCE.includes(ouverte.association) && ouverte.body.includes(marque(issue.number, etat, rang)));
      let numero = deja?.number;
      if (numero === undefined) {
        try {
          numero = await github.creerIssue({ titre: travail.title, corps: corpsDuTravail(issue.number, etat, rang, travail), labels: [] });
        } catch (erreur) {
          if (!arrete()) avertir(`brigade : travail de la roadmap #${issue.number} non ouvert (« ${travail.title} ») — repris au tour suivant — ${message(erreur)}`);
          return false;
        }
      }
      noter(issue.number, { type: "manager.roadmap-filed", payload: { fingerprint: etat, index: rang, issue: numero } });
    }
    return true;
  };

  return {
    // Sert la roadmap écartée : vrai quand il n'y reste rien à faire.
    async traiter(issue: IssueOuverte, corps: string[], ouvertes: readonly IssueOuverte[]): Promise<boolean> {
      return (await guerir(issue)) && (await lire(issue, corps, ouvertes));
    },
  };
}
