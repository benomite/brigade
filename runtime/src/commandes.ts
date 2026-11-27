// Les commandes de la box, sous leur nom anglais (docs/glossary.md, « Box
// commands and their options ») : celui que `help` montre, que le geste de box
// nomme quand il refuse une commande, et que les messages du runtime citent.
//
// Ce sont les commandes que l'app lance par le geste de sa station
// (station/geste.ts) : les autres sont parties avec l'ancien runtime (#4499).
// Les mots d'avant — français — répondent encore jusqu'à `FIN_DES_ANCIENS_NOMS`
// (CHANGELOG.md) : un ancien mot d'une commande (sous-commande ou option) est
// remplacé par le sien par `enAnglais`, qui le dit. Rien d'autre ne connaît les
// anciens mots.

// Le jour à partir duquel un ancien nom ne répond plus. Annoncé dans CHANGELOG.md.
export const FIN_DES_ANCIENS_NOMS = "2027-01-14";

// `mots` : les anciens mots de la commande, chacun avec le sien — une option (`--…`) où qu'elle soit, une
// sous-commande seulement au rang `rang` (0 par défaut : le premier argument).
export type DeLaBox = { nom: string; description: string; mots?: Readonly<Record<string, string>>; rang?: number };

export const COMMANDES: readonly DeLaBox[] = [
  { nom: "facts", description: "The project's facts, machine-readable, for the app" },
  { nom: "station", description: "A station's settings: cooks <N>, stop <station>, start <station>, a chef's decision, remove <setting>, help", mots: { retirer: "remove", aide: "help" } },
  { nom: "setting", description: "The project's settings, from its repository, for the app; a change is refused: make it by a pull request on GitHub" },
  { nom: "humans", description: "The project's humans, from its repository, for the app: save <login> [<role>…], remove <login> — each change opens a pull request" },
  { nom: "contributor-stations", description: "The contributor stations that took a ticket, for the app: refuse <station>, accept <station> — a refused station takes no ticket" },
  { nom: "switch", description: "The project switch, one for the whole project: on (tickets are taken, the manager judges and splits, green deliveries are merged), off (nothing new is)" },
  { nom: "manager", description: "The manager's decisions — it follows the project switch: return <n°>, backlog, upstream; approve <n> does once a gesture an agent holds for the chef's OK", mots: { allumer: "on", eteindre: "off", rendre: "return" } },
  { nom: "send-word", description: "A word to the cook of a taken ticket: <owner>/<repo>#<ticket> <word…> posts it on the issue and queues it; it reaches the cook at the end of its current turn, never in the middle of it. Answers {\"ok\":true} or {\"ok\":false,\"reason\":\"…\"} on one line" },
  { nom: "guardrails", description: "Show the caps and the breaker; stop or resume the kitchen", mots: { reprendre: "resume" } },
  { nom: "installation", description: "Check that a project is ready to be served (--json: the verdict for a program); labels, setup, uninstall [--confirm]", mots: { desinstaller: "uninstall", "--confirmer": "--confirm" } },
  { nom: "agents", description: "The Agents tab, for the app: [/api/agents] lists every agent with its state, next run and 7-day figures; /api/agents/<id>/gestures gives its last gestures, newest first" },
  { nom: "help", description: "List these commands" },
];

export const commande = (nom: string): DeLaBox | undefined => COMMANDES.find((candidate) => candidate.nom === nom);

// Ce qu'un ancien nom écrit sur la sortie d'erreur avant de répondre : le
// nouveau nom, et le jour où l'ancien ne répondra plus.
export const direAncien = (ancien: string, nouveau: string) =>
  `brigade: “${ancien}” is now “${nouveau}” — the old name still works until ${FIN_DES_ANCIENS_NOMS}, then stops (CHANGELOG.md)`;

// Les arguments de la commande `nom`, chaque ancien mot remplacé par le sien.
// Chaque remplacement est dit par `redire`, une fois : la commande répond, et le
// chef sait quoi taper la prochaine fois. Une option s'écrit seule ou
// `--option=valeur`.
export function enAnglais(nom: string, args: readonly string[], redire: (ligne: string) => void): string[] {
  const mots = commande(nom)?.mots ?? {};
  const rang = commande(nom)?.rang ?? 0;
  const dits = new Set<string>();
  const remplacer = (ancien: string, nouveau: string) => {
    if (!dits.has(ancien)) redire(direAncien(ancien, nouveau));
    dits.add(ancien);
    return nouveau;
  };
  return args.map((arg, i) => {
    if (arg.startsWith("--")) {
      const [option = "", ...valeur] = arg.split("=");
      const nouveau = Object.hasOwn(mots, option) ? mots[option] : undefined;
      return nouveau === undefined ? arg : [remplacer(option, nouveau), ...valeur].join("=");
    }
    const nouveau = i === rang && Object.hasOwn(mots, arg) ? mots[arg] : undefined;
    return nouveau === undefined ? arg : remplacer(arg, nouveau);
  });
}
