// Un cook qui n'a pas accès à GitHub : ce que la station lui remet pour qu'il
// n'ait besoin d'aucun `gh`. Le bac à sable d'une cuisine locale refuse de lire
// `~/.config/gh` et le trousseau (`LECTURES_INTERDITES`, `configuration.ts`),
// et c'est voulu : aucun cook ne lit les jetons du chef. Son `gh` n'y a donc
// aucun identifiant — `gh issue view` lui est refusé —, et un cook qui ne
// trouve pas son ticket s'arrête sans rien livrer.
//
// D'où deux choses. Son ticket — corps, zone de sa fiche, derniers
// commentaires — lui est remis dans sa consigne, lu par la station. Et rien de
// ce qui ferait parler son `gh` au nom du chef n'entre dans son environnement :
// ni ses jetons en variables, ni, dans le bac à sable, un `GH_CONFIG_DIR` qui
// mènerait à sa connexion hors des chemins interdits. Ce qu'il faut faire sur
// GitHub pour lui — pousser sa branche, ouvrir sa PR — la station le fait,
// hors du bac à sable, sous l'identité cook quand chaque rôle a la sienne
// (`identites.ts`) : aucun jeton n'entre dans l'environnement d'un cook.
//
// Pur : rien n'est lu ni écrit.
import { fiche, porteFiche } from "../fiche.ts";
import type { Commentaire } from "../github.ts";
import { VARIABLES_GITHUB } from "../identites.ts";

// Les commentaires remis, parmi les derniers de l'issue — la fiche en plus,
// où qu'elle soit. La consigne part en argument de `claude` : un argument ne
// passe pas 128 Kio sous Linux, d'où ces bornes, en octets.
export const DERNIERS_COMMENTAIRES = 8;
export const OCTETS_DU_CORPS = 32_000;
export const OCTETS_D_UN_COMMENTAIRE = 6_000;

// Les commentaires de la prise sur l'issue (`github-etat/prise.ts`) : des
// marques pour les stations, rien que le cook ait à lire.
const MARQUE_DE_PRISE = /^<!-- brigade:(prise|lache) station=/;

export type TicketALire = { number: number; title: string; body: string; commentaires: Commentaire[] };

// Coupe `texte` à `octets` en UTF-8, sans couper un caractère, et le dit.
export function borner(texte: string, octets: number): string {
  const brut = Buffer.from(texte, "utf8");
  if (brut.length <= octets) return texte;
  const coupe = brut.subarray(0, octets).toString("utf8").replace(/�+$/, "");
  return `${coupe}\n\n[… coupé : ${brut.length - octets} octets de plus sur l'issue]`;
}

// Le ticket tel que la consigne du cook le porte, entre `<ticket>` et
// `</ticket>` : ce que `gh issue view --comments` lui aurait montré d'utile.
export function ticketJoint(ticket: TicketALire): string {
  const lus = ticket.commentaires.filter((commentaire) => !MARQUE_DE_PRISE.test(commentaire.body));
  const laFiche = fiche(lus.map((commentaire) => commentaire.body));
  const derniers = lus.slice(-DERNIERS_COMMENTAIRES);
  const sa = lus.find((commentaire) => porteFiche(commentaire.body));
  const remis = sa !== undefined && !derniers.includes(sa) ? [sa, ...derniers] : derniers;
  const zone = laFiche === null ? "aucune fiche sur l'issue : le ticket ne possède aucun fichier" : laFiche.zone.length === 0 ? "rien" : laFiche.zone.join(", ");
  return [
    "<ticket>",
    `# #${ticket.number} — ${ticket.title}`,
    "",
    borner(ticket.body.trim(), OCTETS_DU_CORPS) || "(corps vide)",
    "",
    `**Zone** (fiche du ticket) : ${zone}`,
    "",
    lus.length === 0 ? "**Commentaires** : aucun" : `**Commentaires** : ${remis.length} sur ${lus.length} (les derniers, et la fiche), du plus ancien au plus récent`,
    ...remis.flatMap((commentaire) => ["", "---", "", `**Commentaire de ${commentaire.author || "inconnu"} (${commentaire.association}), ${commentaire.createdAt}**`, "", borner(commentaire.body.trim(), OCTETS_D_UN_COMMENTAIRE)]),
    "</ticket>",
  ].join("\n");
}

// L'environnement d'un cook qui n'a pas accès à GitHub : sans les jetons de
// `gh` ; dans le bac à sable, sans `GH_CONFIG_DIR` non plus — `gh` y cherche
// alors `~/.config/gh`, que le bac à sable refuse. Hors du bac à sable, un
// `GH_CONFIG_DIR` posé reste : c'est le répertoire vide où, sous une identité
// par rôle, `gh` ne trouve aucun compte (`environnementSansGitHub`).
export function environnementHorsGitHub(env: NodeJS.ProcessEnv, lieu: { bacASable: boolean }): NodeJS.ProcessEnv {
  const ecartees = lieu.bacASable ? [...VARIABLES_GITHUB, "GH_CONFIG_DIR"] : VARIABLES_GITHUB;
  return Object.fromEntries(Object.entries(env).filter(([nom]) => !ecartees.includes(nom)));
}
