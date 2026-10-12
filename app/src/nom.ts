// Le nom d'un projet n'est pas qu'une étiquette : c'est celui que la box donne à son
// instance (`brigade@<nom>.service`), et celui que le geste reçoit. Deux choses se
// disent ici, sans rien interdire : la forme que la box accepte, et ce que sa réponse
// prouve du nom saisi.
import type { Echec, Sortie } from "./box.ts";

// docs/installer.md, geste 6 : « minuscules, chiffres, tirets ».
const FORME = /^[a-z0-9-]+$/;
export const FORME_ATTENDUE = "minuscules, chiffres et tirets (`boutique`, `ma-cuisine-2`)";

// La raison, si ce nom ne peut pas être celui d'une instance ; rien sinon, et rien d'un champ vide.
export function refusDeForme(nom: string): string | undefined {
  const saisi = nom.trim();
  if (saisi === "" || FORME.test(saisi)) return undefined;
  const mauvais = [...new Set([...saisi].filter((c) => !/[a-z0-9-]/.test(c)).map((c) => (c === " " ? "espace" : `« ${c} »`)))].join(", ");
  return `Une box ne peut pas servir ce nom — il contient ${mauvais}. Attendu : ${FORME_ATTENDUE}.`;
}

// `connue` : la box a répondu au nom. `inconnue` : elle l'a refusé (code 65). `muette` :
// rien n'a été prouvé du nom — la box n'a pas été jointe, ou son refus est d'une autre nature.
export type Verdict = { etat: "connue" | "inconnue" | "muette"; texte: string };

export function verdictDeLecture(nom: string, hote: string, rendu: { sorties: Sortie[] } | Echec): Verdict {
  if ("sorties" in rendu) return { etat: "connue", texte: `La box « ${hote} » connaît « ${nom} ».` };
  if (rendu.cas === "projet-inconnu") {
    return {
      etat: "inconnue",
      texte:
        `La box « ${hote} » ne connaît pas « ${nom} » — le projet est ajouté quand même : il peut être déclaré ici avant d'exister là-bas. ` +
        `Sur la box, c'est le geste 6 de docs/installer.md qui le crée : l'instance brigade@${nom}.service, avec ce nom exactement.`,
    };
  }
  const dernier = rendu.erreur.split("\n").filter(Boolean).at(-1) ?? "";
  const pourquoi = rendu.cas === "ssh-en-echec" || !rendu.atteinte ? `la box « ${hote} » n'a pas été jointe` : `la box « ${hote} » a répondu sans rien dire du nom`;
  return { etat: "muette", texte: `Le projet est ajouté, mais la box n'a rien dit de « ${nom} » : ${pourquoi} (${dernier.replace(/^→ /, "")}). Son panneau montre le détail.` };
}
