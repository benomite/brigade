// Les gestes du chef : ceux qu'il répète. Chacun est une commande de
// docs/runtime.md — « Piloter », et « Mettre en service » pour les trois de la
// mise en service —, reprise mot pour mot dans sa forme de poste
// (`ssh <hote> brigade <nom> <commande>`). Ils ont deux formes :
// - écrit : la commande est posée dans un shell de l'espace par `shell`
//   (terminaux.ts), et rien ne l'envoie — c'est le chef qui la lit et fait Entrée ;
// - direct : un geste sans jugement, qui ne détruit ni n'engage rien. Sa commande
//   part vraiment — préfixée du `!` qui la lance sur le Mac depuis la session
//   `claude`, écrite dans le second puis envoyée par `envoyer` (terminaux.ts) —
//   et sa sortie se lit dans le fil du second. Elle ne part que d'un second dit
//   libre : sinon rien n'est écrit, et le refus dit pourquoi.
// Ce module ne lance rien — ni `ssh`, ni commande — et ne demande rien de plus
// à la box : il n'a que ce `shell` et cet `envoyer` pour toucher au monde.
// Ce qui se joue sur la box à côté du runtime (`systemctl`, `brigade-bascule`,
// `brigade-mise-en-service`, `claude /login`) n'est pas un geste de l'app :
// rien de tel n'est ici, et aucun `sudo`. La mise en service ne fait pas
// exception : ses trois gestes écrivent la commande du runtime qui la demande,
// la coupe ou y renonce (`mise-en-service`), comme les autres écrivent la leur.
// C'est le runtime qui lance le geste de box, quand il le peut, sous sa propre
// règle `sudo` — l'app n'a ni shell sur la box, ni `sudo`, ni chemin vers lui.
import { cite } from "./box.ts";
import type { Projet } from "./config.ts";
import { CONTROLE, SANS_ECRIRE, type Terminal } from "./terminaux.ts";

// `commande` : ce qui suit `brigade <projet>` sur sa ligne de la doc.
// `parGrant` : le geste porte sur un grant, que la vue nomme — il s'écrit à la suite.
// `direct` : le geste part dans le second au lieu de s'écrire dans un shell.
export type Geste = { id: string; commande: string; parGrant?: true; direct?: true };

// Un geste qu'un bouton écrit déjà dans le second (boutons.ts) porte ici le même nom.
export const GESTES: readonly Geste[] = [
  { id: "manager-allumer", commande: "manager allumer" },
  { id: "manager-eteindre", commande: "manager eteindre", direct: true },
  { id: "grant-activer", commande: "grant activer", parGrant: true },
  { id: "grant-revoquer", commande: "grant revoquer", parGrant: true },
  { id: "reprendre", commande: "garde-fous reprendre" },
  { id: "stop", commande: "garde-fous stop" },
  { id: "installation", commande: "installation", direct: true },
  { id: "mise-en-service", commande: "mise-en-service" },
  { id: "mise-en-service-couper", commande: "mise-en-service --couper" },
  { id: "mise-en-service-annuler", commande: "mise-en-service annuler" },
];

// Les gestes directs, par leur nom : la vue dit de chacun ce que son clic fait.
// Éteindre le manager et vérifier l'installation n'engagent rien. Allumer le manager est
// direct lui aussi dans la spec, mais il engage — son avertissement se pose sur la commande
// écrite (allumage.ts) : il reste écrit tant que cet avertissement n'a pas sa forme directe.
export const DIRECTS: readonly string[] = GESTES.filter(({ direct }) => direct).map(({ id }) => id);

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
  // Le registre la refuserait aussi, mais dans un shell ouvert pour rien : le refus tombe avant.
  return CONTROLE.test(commande) ? { refus: SANS_ECRIRE } : { commande };
}

// Écrit le geste dans un shell de l'espace, sans l'envoyer — ou dit pourquoi
// rien n'est écrit. Un shell neuf, à son invite : la commande n'y est prise
// pour rien d'autre, et ce qu'elle demande — un mot de passe — s'y tape.
// Un geste direct, lui, part dans le second : ce qui est rendu est le second, dont la
// note dit ce qui est parti — ou pourquoi rien ne l'est, s'il n'est pas dit libre.
type Registre = { shell(projet: Projet, ecrit: string): Terminal; envoyer(projet: Projet, commande: string): Promise<Terminal | { refus: string }> };
export function ecrireGeste(terminaux: Registre, id: unknown, projet: Projet, grant?: unknown): Terminal | { refus: string } | undefined | Promise<Terminal | { refus: string }> {
  const ecrit = commandeDuGeste(id, projet, grant);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  if (projet.refus !== undefined) return { refus: `rien n'est écrit : « ${projet.nom} » ne s'ouvre pas — ${projet.refus}` };
  return DIRECTS.includes(String(id)) ? terminaux.envoyer(projet, `!${ecrit.commande}`) : terminaux.shell(projet, ecrit.commande);
}
