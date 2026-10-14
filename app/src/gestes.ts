// Les gestes du chef : ceux qu'il répète. Chacun est une commande de
// docs/runtime.md — « Piloter », et « Mettre en service » pour les trois de la
// mise en service —, reprise mot pour mot dans sa forme de poste
// (`ssh <hote> brigade <nom> <commande>`). Chacun part dans le second : préfixée du `!`
// qui la lance sur le Mac depuis la session `claude`, la commande y est écrite puis
// envoyée par `envoyer` (terminaux.ts), et sa sortie se lit dans son fil. Elle ne part
// que d'un second dit libre : sinon rien n'est écrit, et le refus dit pourquoi.
// Un geste a l'une de deux formes (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md,
// « Ce qu'un clic fait, geste par geste ») :
// - direct : sans jugement, il ne détruit ni n'engage rien — il part au clic ;
// - confirmé : destructif ou lourd, il ne part qu'après un « oui » du chef, devant une
//   confirmation qui dit son prix en clair (confirmation.ts) — pas un LLM. Nommé sans ce
//   « oui », il refuse, et rien n'est écrit.
// La troisième forme, le geste avec jugement, n'est pas ici : ce n'est pas une commande
// mais une demande en prose, écrite dans le second sans Entrée (demande.ts).
// Ce module ne lance rien — ni `ssh`, ni commande — et ne demande rien de plus
// à la box : il n'a que cet `envoyer` pour toucher au monde.
// Ce qui se joue sur la box à côté du runtime (`systemctl`, `brigade-bascule`,
// `brigade-mise-en-service`, `claude /login`) n'est pas un geste de l'app :
// rien de tel n'est ici, et aucun `sudo`. La mise en service ne fait pas
// exception : ses trois gestes envoient la commande du runtime qui la demande,
// la coupe ou y renonce (`mise-en-service`), comme les autres envoient la leur.
// C'est le runtime qui lance le geste de box, quand il le peut, sous sa propre
// règle `sudo` — l'app n'a ni shell sur la box, ni `sudo`, ni chemin vers lui.
import { cite } from "./box.ts";
import type { Projet } from "./config.ts";
import { CONTROLE, SANS_ECRIRE, type Terminal } from "./terminaux.ts";

// `commande` : ce qui suit `brigade <projet>` sur sa ligne de la doc.
// `parGrant` : le geste porte sur un grant, que la vue nomme — il s'écrit à la suite.
// `forme` : direct, il part au clic ; confirmé, il attend le « oui » du chef.
export type Geste = { id: string; commande: string; parGrant?: true; forme: "direct" | "confirmé" };

export const GESTES: readonly Geste[] = [
  // Allumer engage : il juge tout le backlog, et ce qu'il juge exécutable part en cuisine (allumage.ts).
  { id: "manager-allumer", commande: "manager allumer", forme: "confirmé" },
  { id: "manager-eteindre", commande: "manager eteindre", forme: "direct" },
  // Accordé, une pass verte est mergée sans le chef ; révoqué, plus rien ne l'est.
  { id: "grant-activer", commande: "grant activer", parGrant: true, forme: "confirmé" },
  { id: "grant-revoquer", commande: "grant revoquer", parGrant: true, forme: "confirmé" },
  // Arrêter tue les cooks en vol ; reprendre relance les tickets, sur le quota du chef.
  { id: "reprendre", commande: "garde-fous reprendre", forme: "confirmé" },
  { id: "stop", commande: "garde-fous stop", forme: "confirmé" },
  { id: "installation", commande: "installation", forme: "direct" },
  // Mettre en service est un vrai redémarrage ; y renoncer n'interrompt rien.
  { id: "mise-en-service", commande: "mise-en-service", forme: "confirmé" },
  { id: "mise-en-service-couper", commande: "mise-en-service --couper", forme: "confirmé" },
  { id: "mise-en-service-annuler", commande: "mise-en-service annuler", forme: "direct" },
];

// Les gestes de chaque forme, par leur nom : la vue dit de chacun ce que son clic fait.
export const DIRECTS: readonly string[] = GESTES.filter(({ forme }) => forme === "direct").map(({ id }) => id);
export const CONFIRMES: readonly string[] = GESTES.filter(({ forme }) => forme === "confirmé").map(({ id }) => id);

// Ce qu'un geste confirmé dit quand il est nommé sans le « oui » du chef.
export const SANS_OUI = "rien n'est parti : ce geste attend ton « oui », devant ce qu'il coûte — rien n'est écrit dans le second";

// Les grants que la doc nomme : aucune commande ne s'écrit pour un autre.
export const GRANTS: readonly string[] = ["merge"];

// Un mot tel que le shell du Mac le rendra à `ssh` : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

// Ce que le geste écrit pour ce projet — ou pourquoi il n'écrit rien. La vue
// nomme un geste, et son grant s'il en a un, jamais une commande ; un projet
// sans box n'a rien à écrire. Le nom passe deux shells — celui du Mac, puis
// celui de la box : un nom que le geste de box accepte part tel quel.
export function commandeDuGeste(id: unknown, projet: Projet, grant?: unknown): { commande: string } | { refus: string } | undefined {
  const geste = GESTES.find((candidat) => candidat.id === id);
  if (geste === undefined || projet.box === undefined) return undefined;
  const nomme = typeof grant === "string" && GRANTS.includes(grant) ? grant : undefined;
  if (geste.parGrant && nomme === undefined) return { refus: `rien n'est écrit : ce geste porte sur un grant, à nommer parmi ceux de la doc (${GRANTS.join(", ")})` };
  const { hote } = projet.box;
  // La forme de la doc ne met pas de `--` devant l'hôte : un tiret en tête y serait une option.
  if (hote.startsWith("-")) return { refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets` };
  const commande = `ssh ${mot(hote)} brigade ${mot(cite(projet.nom))} ${geste.commande}${geste.parGrant ? ` ${nomme}` : ""}`;
  // Le registre la refuserait aussi : le refus tombe avant, et le dit pour le projet.
  return CONTROLE.test(commande) ? { refus: SANS_ECRIRE } : { commande };
}

// Envoie le geste dans le second du projet — ou dit pourquoi rien n'est parti. Ce qui est
// rendu est le second, dont la note dit ce qui est parti ; le refus dit pourquoi rien ne
// l'est : un second qui n'est pas dit libre, ou un geste confirmé nommé sans `oui`. Seul
// `true` vaut « oui » : rien d'autre venu de la vue ne fait partir un geste confirmé.
type Registre = { envoyer(projet: Projet, commande: string): Promise<Terminal | { refus: string }> };
export function ecrireGeste(terminaux: Registre, id: unknown, projet: Projet, grant?: unknown, oui?: unknown): { refus: string } | undefined | Promise<Terminal | { refus: string }> {
  const ecrit = commandeDuGeste(id, projet, grant);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  if (projet.refus !== undefined) return { refus: `rien n'est écrit : « ${projet.nom} » ne s'ouvre pas — ${projet.refus}` };
  if (CONFIRMES.includes(String(id)) && oui !== true) return { refus: SANS_OUI };
  return terminaux.envoyer(projet, `!${ecrit.commande}`);
}
