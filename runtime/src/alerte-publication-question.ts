// L'alerte d'une publication ratée (#3090, épique #3087) : l'issue que le job
// `alerter` des workflows de publication ouvre (« publier-app: app-v1.0.185 was
// not published, a build failed », #3084) est un ticket de la cuisine (#3088).
// Elle n'arrive au chef que si la cuisine ne sait pas la réparer, et alors en
// question : un choix entre des voies, dit en mots de produit — jamais l'issue
// d'un inconnu ni une remontée technique nue.
//
// Ce module tranche, sans E/S : d'une alerte, de l'état des essais de la cuisine
// et de ce que l'on sait de la publication, il rend « la cuisine s'en charge »
// (rien pour le chef) ou la question au chef. La file du chef (attend.ts) s'en
// sert là où une remontée ou un abandon y entre, et la carte du ticket
// (carte-todo/cartes.ts) dit la question qu'il rend.
//
// La publication déjà faite se lit des tags du clone de la station : le
// workflow crée le tag de la release en la publiant, et une release plus
// récente de la même série porte le changement qui avait échoué (le run suivant
// publie depuis le dernier tag). Un clone illisible n'en dit rien (`null`) : la
// question reste au chef, rien n'est caché sur une lecture manquée.
import { execFileSync } from "./sans-invite.ts";
import type { Choix } from "./carte-todo.ts";

// Le titre que le job `alerter` donne à son issue : le workflow, puis
// l'étiquette de la release (`app-v1.0.185`).
const TITRE_D_ALERTE = /^publier-[a-z-]+: (\S+) was not published\b/;

// L'étiquette de la release qu'une alerte dit non publiée, nulle pour tout
// autre titre.
export const etiquetteDeLAlerte = (titre: string | null | undefined): string | null => (titre == null ? null : (TITRE_D_ALERTE.exec(titre.trim())?.[1] ?? null));

// Où en sont les essais de la cuisine : elle peut encore y travailler
// (`at-work` — elle reprend la remontée, elle n'a rien abandonné), ou elle a
// jugé qu'elle ne sait pas la réparer (`gave-up` — elle l'a sortie du rail, ou
// remontée au chef pour une cause que seul le chef lève).
export type EssaisDeLaCuisine = "at-work" | "gave-up";

// Ce que le chef voit de l'alerte : rien (`kitchen`, et pourquoi), ou une
// question, son résumé et ses voies — chacune jouant un geste de la carte
// (reponse-carte.ts) : `resume`, la cuisine réessaie ; `drop`, le chef la prend
// en main ; `close`, l'alerte est fermée et la release suivante publie le
// changement.
export type SuiteDeLAlerte = { pour: "kitchen"; pourquoi: string } | { pour: "chef"; resume: string; question: string; choix: Choix[] };

// `publiee` : vrai si la release est publiée, nul si on ne le sait pas.
export function questionDeLAlerte({ etiquette, essais, publiee }: { etiquette: string; essais: EssaisDeLaCuisine; publiee: boolean | null }): SuiteDeLAlerte {
  if (publiee === true) return { pour: "kitchen", pourquoi: `${etiquette} is already published` };
  if (essais === "at-work") return { pour: "kitchen", pourquoi: `the kitchen is still working on ${etiquette}` };
  return {
    pour: "chef",
    resume: `The release ${etiquette} was not published, and the kitchen could not fix it. No user gets this version until a run publishes it.`,
    question: `How should ${etiquette} reach users?`,
    choix: [
      { texte: `Let the kitchen try to publish ${etiquette} again`, suite: "resume" },
      { texte: `I fix the publication of ${etiquette} myself`, suite: "drop" },
      { texte: `Skip ${etiquette}: the next release carries its changes`, suite: "close" },
    ],
  };
}

// La question d'une entrée de la file dont le ticket est une alerte — nulle
// pour tout autre ticket. La file n'y garde une remontée ou un abandon que si la
// cuisine a renoncé et que la release n'est pas publiée.
export function questionDuTicket(titre: string | null | undefined): Extract<SuiteDeLAlerte, { pour: "chef" }> | null {
  const etiquette = etiquetteDeLAlerte(titre);
  if (etiquette === null) return null;
  const suite = questionDeLAlerte({ etiquette, essais: "gave-up", publiee: null });
  return suite.pour === "chef" ? suite : null;
}

// Les nombres d'une version (`1.0.185`), nuls si elle ne se lit pas.
const nombres = (version: string): number[] | null => (/^\d+(\.\d+)*$/.test(version) ? version.split(".").map(Number) : null);
const apres = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

// Publiée, d'après les tags connus : son tag est là, ou celui d'une version
// plus récente de la même série (`app-v`), qui porte son changement.
export function publieeParLesTags(etiquette: string, tags: readonly string[]): boolean {
  if (tags.includes(etiquette)) return true;
  const [, serie, version] = /^(.*?)(\d+(?:\.\d+)*)$/.exec(etiquette) ?? [];
  const elle = version === undefined ? null : nombres(version);
  if (serie === undefined || serie === "" || elle === null) return false;
  return tags.some((tag) => {
    if (!tag.startsWith(serie)) return false;
    const autre = nombres(tag.slice(serie.length));
    return autre !== null && apres(autre, elle);
  });
}

// Lit la publication d'une étiquette dans les tags du clone, une fois par
// lecteur : nul sans clone, ou quand `git` ne les rend pas.
export function publieeDansLeClone(clone: string | undefined): (etiquette: string) => boolean | null {
  let tags: string[] | null | undefined;
  return (etiquette) => {
    if (tags === undefined) {
      try {
        tags = clone ? execFileSync("git", ["-C", clone, "tag", "--list"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 }).split("\n").filter((tag) => tag !== "") : null;
      } catch {
        tags = null;
      }
    }
    return tags === null ? null : publieeParLesTags(etiquette, tags);
  };
}
