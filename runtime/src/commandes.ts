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
  { nom: "status", description: "The photo of the project; --follow [<ticket>] then follows the log live", mots: { "--suivre": "--follow" } },
  { nom: "facts", ancien: "faits", description: "The machine-readable form of status, for the app" },
  { nom: "rail", description: "The ticket rail; remove <ticket>, priority <ticket> <1-9 | none>, merge <ticket>" },
  { nom: "log", ancien: "journal", description: "Read the log: [<ticket> | --ticks] [--last <N>]", mots: { "--derniers": "--last" } },
  { nom: "pass", description: "The pass and its verdicts: [<ticket> [--json]]; <ticket> issue reads the card's GitHub issue, <ticket> comment <text> posts on it, <ticket> ask [<text>] composes the request for the second" },
  { nom: "station", description: "A station's settings: cooks <N>, a chef's decision, remove <setting>, help", mots: { retirer: "remove", aide: "help" } },
  { nom: "manager", description: "The manager's switch and decisions: on, off, return <n°>, backlog, upstream", mots: { allumer: "on", eteindre: "off", rendre: "return" } },
  {
    nom: "grant",
    description: "The merge grant: enable, extend, revoke — with --until, --for, --uses, --no-expiry",
    mots: { activer: "enable", prolonger: "extend", revoquer: "revoke", "--jusqu-a": "--until", "--pour": "--for", "--usages": "--uses", "--sans-echeance": "--no-expiry" },
  },
  {
    nom: "waiting",
    ancien: "attente",
    description: "Tickets waiting on a third party: set <ticket> --what <…> --from <who> [--remind <when>], resume <ticket>, arrived <ticket>",
    mots: { poser: "set", reprendre: "resume", arrive: "arrived", "--quoi": "--what", "--de": "--from", "--relance": "--remind" },
  },
  { nom: "profile", description: "The cook profiles proposed: yes <proposal> writes its definition in the project's repository, no <proposal> declines it" },
  { nom: "guardrails", ancien: "garde-fous", description: "Show the caps and the breaker; stop or resume the kitchen", mots: { reprendre: "resume" } },
  { nom: "base", description: "Show the integration base; replay its gates when red", mots: { rejouer: "replay" } },
  { nom: "installation", description: "Check that a project is ready to be served (--json: the verdict for a program); labels, setup, uninstall [--confirm]", mots: { desinstaller: "uninstall", "--confirmer": "--confirm" } },
  { nom: "measures", ancien: "mesures", description: "The measures behind drift, and the rework of the last tickets served: [--by <merges>] [--last <tickets>]", mots: { "--par": "--by" } },
  { nom: "closing", ancien: "fermeture", description: "The closing pass: observe; write requests it, cancel withdraws the request", mots: { ecrire: "write", annuler: "cancel" } },
  { nom: "backup", ancien: "sauvegarder", description: "Take a backup of the log" },
  { nom: "restore", ancien: "restaurer", description: "Restore a backup into a fresh state directory" },
  {
    nom: "pull",
    ancien: "tirer",
    description: "A remote station asks the box for work: <station> announce | claim | renew | return",
    rang: 1,
    mots: { annoncer: "announce", reclamer: "claim", renouveler: "renew", rendre: "return", "--preuve": "--proof", "--tours": "--turns", "--jetons": "--tokens", "--fin": "--end", "--raison": "--reason" },
  },
  { nom: "partition", ancien: "cloison", description: "Show the partition; probe [<tries>] runs real probes inside it", mots: { eprouver: "probe" } },
  { nom: "arbiter", ancien: "arbitre", description: "The arbiter's weights: weight <project> <n>, remove <project>", mots: { poids: "weight", retirer: "remove" } },
  { nom: "door", ancien: "porte", description: "Hold the door of the project's remote stations (its service)" },
  { nom: "hold-arbiter", ancien: "tenir-arbitre", description: "Run the arbiter between projects (its service)" },
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
