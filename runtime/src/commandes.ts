// Les commandes de la box, sous leur nom anglais (docs/glossary.md, « Box
// commands and their options ») : celui que `help` montre, que le geste de box
// nomme quand il refuse une commande, et que les messages du runtime citent.
//
// Les noms d'avant — français — répondent encore jusqu'à `FIN_DES_ANCIENS_NOMS`
// (CHANGELOG.md) : un ancien nom de commande est un script du `package.json` qui
// lance `ancien-nom.ts`, lequel dit le nouveau nom et lance la commande ; un
// ancien mot d'une commande (sous-commande ou option) est remplacé par le sien
// par `enAnglais`, qui le dit aussi. Rien d'autre ne connaît les anciens noms.

// Le jour à partir duquel un ancien nom ne répond plus. Annoncé dans CHANGELOG.md.
export const FIN_DES_ANCIENS_NOMS = "2027-01-14";

// Le script d'un ancien nom de commande, dans le `package.json`.
export const SCRIPT_D_ANCIEN_NOM = "node src/ancien-nom.ts";

// `ancien` : le nom d'avant, s'il a changé. `mots` : les anciens mots de la
// commande, chacun avec le sien — une option (`--…`) où qu'elle soit, une
// sous-commande seulement au rang `rang` (0 par défaut : le premier argument).
export type DeLaBox = { nom: string; description: string; ancien?: string; mots?: Readonly<Record<string, string>>; rang?: number };

export const COMMANDES: readonly DeLaBox[] = [
  { nom: "status", description: "The photo of the project; --follow [<ticket>] then follows the log live; --json, the delays of the tickets merged in 24 h", mots: { "--suivre": "--follow" } },
  { nom: "facts", ancien: "faits", description: "The machine-readable form of status, for the app" },
  { nom: "rail", description: "The ticket rail; remove <ticket>, choose, answer, human <ticket> [who] (a ticket for a human cook)" },
  { nom: "release-notes", description: "Publish a weekly summary as the release notes of a version: <tag> <summary.json> creates the GitHub Release of that tag, once, on this explicit call only" },
  { nom: "log", ancien: "journal", description: "Read the log: [<ticket> | --ticks] [--last <N>]", mots: { "--derniers": "--last" } },
  { nom: "station", description: "A station's settings: cooks <N>, stop <station>, start <station>, a chef's decision, remove <setting>, help", mots: { retirer: "remove", aide: "help" } },
  { nom: "setting", description: "The project's settings, from its repository, for the app; a change is refused: make it by a pull request on GitHub" },
  { nom: "human-cooks", description: "The tickets waiting on a human cook, read on GitHub: each open ticket marked `human-cook` with who holds it, then the address of the same list on GitHub (read-only)" },
  { nom: "humans", description: "The project's humans, from its repository, for the app: save <login> [<role>…], remove <login> — each change opens a pull request" },
  { nom: "recurring", description: "The project's recurring tickets, for the app: declare --title <title> [--body <body>] --rhythm daily | weekly --weekday <1-7> | monthly --day <1-31>, pause <id>, resume <id>, remove <id> — each one lands on the rail with `fire` on its next date" },
  { nom: "explanations", description: "The explanations of the kitchen's words a chef has seen, for the app: --chef <login>, seen <word> --chef <login>, reset --chef <login> — each word is explained once per chef, on all their devices" },
  { nom: "agent-settings", description: "Each agent's settings, for the app's Agents tab: <agent> reads them (value, where it comes from, who changed it and when), <agent> set <key> <value> --by <author> changes one — it holds at the runtime's next read, with no restart" },
  { nom: "recap", description: "What the kitchen did since the chef last looked, for the app: <owner>/<repo> reads it (served tickets and their pull requests, sends back and refusals, guardrail stops), <owner>/<repo> seen <instant> marks it shown up to that instant" },
  { nom: "contributor-stations", description: "The contributor stations that took a ticket, for the app: refuse <station>, accept <station> — a refused station takes no ticket" },
  { nom: "switch", description: "The project switch, one for the whole project: on (tickets are taken, the manager judges and splits, green deliveries are merged), off (nothing new is)" },
  { nom: "manager", description: "The manager's decisions — it follows the project switch: return <n°>, backlog, upstream; approve <n> does once a gesture an agent holds for the chef's OK", mots: { allumer: "on", eteindre: "off", rendre: "return" } },
  { nom: "design", description: "A green design delivery held for the chef's validation (its card “Validate its screen”): validate <owner>/<repo>#<ticket> merges it, send-back <owner>/<repo>#<ticket> --comment <what to change> sends it back to a cook; both close the card; the pull request's number is still accepted in place of the ticket's" },
  { nom: "sensitive", description: "A green delivery of a sensitive ticket held for the chef's review (its card “review before merge”): merge <owner>/<repo>#<ticket> merges it, send-back <owner>/<repo>#<ticket> --note <note> sends the ticket back to a cook with the note; both close the card; the pull request's number is still accepted in place of the ticket's" },
  { nom: "undo", description: "Undo a served ticket (its card's “undo”): <owner>/<repo>#<ticket> opens a pull request reverting its merge, which the pass judges and merges like any delivery, and reopens the ticket; a revert that does not apply cleanly files a ticket for the kitchen instead" },
  { nom: "send-word", description: "A word to the cook of a taken ticket: <owner>/<repo>#<ticket> <word…> posts it on the issue and queues it; it reaches the cook at the end of its current turn, never in the middle of it. Answers {\"ok\":true} or {\"ok\":false,\"reason\":\"…\"} on one line" },
  { nom: "report", description: "The project's weekly kitchen summary of the week starting a day (--week <YYYY-MM-DD>) (read-only)" },
  { nom: "guardrails", ancien: "garde-fous", description: "Show the caps and the breaker; stop or resume the kitchen", mots: { reprendre: "resume" } },
  { nom: "base", description: "Show the integration base; replay its gates when red", mots: { rejouer: "replay" } },
  { nom: "installation", description: "Check that a project is ready to be served (--json: the verdict for a program); labels, setup, uninstall [--confirm]", mots: { desinstaller: "uninstall", "--confirmer": "--confirm" } },
  { nom: "measures", ancien: "mesures", description: "The measures behind drift, and the rework of the last tickets served: [--by <merges>] [--last <tickets>]", mots: { "--par": "--by" } },
  { nom: "closing", ancien: "fermeture", description: "The closing pass: observe; write requests it, cancel withdraws the request", mots: { ecrire: "write", annuler: "cancel" } },
  { nom: "backup", ancien: "sauvegarder", description: "Take a backup of the log" },
  { nom: "restore", ancien: "restaurer", description: "Restore a backup into a fresh state directory" },
  { nom: "partition", ancien: "cloison", description: "Show the partition; probe [<tries>] runs real probes inside it", mots: { eprouver: "probe" } },
  { nom: "arbiter", ancien: "arbitre", description: "The arbiter's weights: weight <project> <n>, remove <project>", mots: { poids: "weight", retirer: "remove" } },
  { nom: "door", ancien: "porte", description: "Hold the door of the project's remote stations (its service)" },
  { nom: "hold-arbiter", ancien: "tenir-arbitre", description: "Run the arbiter between projects (its service)" },
  { nom: "agents", description: "The Agents tab, for the app: [/api/agents] lists every agent with its state, next run and 7-day figures; /api/agents/<id>/gestures gives its last gestures, newest first" },
  { nom: "help", description: "List these commands" },
];

export const commande = (nom: string): DeLaBox | undefined => COMMANDES.find((candidate) => candidate.nom === nom);
export const parAncienNom = (ancien: string): DeLaBox | undefined => COMMANDES.find((candidate) => candidate.ancien === ancien);

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
