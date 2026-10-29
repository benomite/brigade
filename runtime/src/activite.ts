// Ce qu'un cook fait en ce moment, lu dans son flux au fil de l'eau : la
// nature de son dernier geste, et le fichier ou la commande qu'il vise. Rien
// d'autre n'en sort — ni le code, ni ce que le modèle dit ou pense, ni ce
// qu'une commande rend : le flux est lu ici pour être réduit à un mot.
import { basename, isAbsolute, relative, sep } from "node:path";

// Les gestes, en mots de journal. Ce que chacun dit au chef est dans `DIT`.
export const GESTES = [
  "starting",
  "reading",
  "searching",
  "writing",
  "testing",
  "tests-red",
  "tests-green",
  "fixing-tests",
  "gating",
  "gates-red",
  "gates-green",
  "fixing-gates",
  "checking-types",
  "committing",
  "pushing",
  "opening-pr",
  "reading-ticket",
  "running",
  "browsing",
  "delegating",
  "planning",
  "tool",
  "thinking",
  "finishing",
] as const;
export type Geste = (typeof GESTES)[number];

// `target` : le fichier, la commande ou l'outil que le geste vise — jamais ce
// qu'il y a dedans. `since` : depuis quand le cook fait cette chose.
export type Activite = { doing: Geste; target: string | null; since: string };

// Ce que chaque geste dit au chef, sans rien connaître de Claude Code.
const DIT: Record<Geste, string> = {
  starting: "démarre",
  reading: "lit",
  searching: "cherche dans le code",
  writing: "écrit",
  testing: "lance les tests",
  "tests-red": "tests rouges",
  "tests-green": "tests verts",
  "fixing-tests": "tests rouges, corrige",
  gating: "lance les gates",
  "gates-red": "gates rouges",
  "gates-green": "gates vertes",
  "fixing-gates": "gates rouges, corrige",
  "checking-types": "vérifie les types",
  committing: "commite",
  pushing: "pousse sa branche",
  "opening-pr": "ouvre la PR",
  "reading-ticket": "lit le ticket",
  running: "lance",
  browsing: "cherche sur le web",
  delegating: "confie une tâche à un agent",
  planning: "planifie",
  tool: "utilise l'outil",
  thinking: "réfléchit",
  finishing: "rend son travail",
};

// Les mêmes, en anglais : ce que dit `status`.
const DIT_EN: Record<Geste, string> = {
  starting: "starting",
  reading: "reading",
  searching: "searching the code",
  writing: "writing",
  testing: "running the tests",
  "tests-red": "tests red",
  "tests-green": "tests green",
  "fixing-tests": "tests red, fixing",
  gating: "running the gates",
  "gates-red": "gates red",
  "gates-green": "gates green",
  "fixing-gates": "gates red, fixing",
  "checking-types": "checking the types",
  committing: "committing",
  pushing: "pushing its branch",
  "opening-pr": "opening the PR",
  "reading-ticket": "reading the ticket",
  running: "running",
  browsing: "searching the web",
  delegating: "handing a task to an agent",
  planning: "planning",
  tool: "using the tool",
  thinking: "thinking",
  finishing: "handing back its work",
};

export const estGeste = (valeur: unknown): valeur is Geste => typeof valeur === "string" && (GESTES as readonly string[]).includes(valeur);

// Le geste en mots, dans les deux langues, et ce qu'il vise à part. Une commande
// dont rien ne se montre reste une commande. Une seule règle de nommage : les
// deux formes en sortent.
export function nommer({ doing, target }: Pick<Activite, "doing" | "target">): { fait: string; faitEn: string; cible: string | null } {
  const sansCible = target === null && doing === "running";
  return { fait: sansCible ? "lance une commande" : DIT[doing], faitEn: sansCible ? "running a command" : DIT_EN[doing], cible: target };
}

// Le geste en clair : « lit runtime/src/etat.ts », « lance les tests ».
export function direActivite(activite: Pick<Activite, "doing" | "target">): string {
  const { fait, cible } = nommer(activite);
  return cible === null ? fait : `${fait} ${cible}`;
}

// Le geste en clair, en anglais : « reading runtime/src/etat.ts », « running the tests ».
export function direActiviteEn(activite: Pick<Activite, "doing" | "target">): string {
  const { faitEn, cible } = nommer(activite);
  return cible === null ? faitEn : `${faitEn} ${cible}`;
}

// Ce qu'une cible peut faire de long : au-delà, seule sa fin est gardée — c'est
// elle qui nomme le fichier.
const CIBLE_MAX = 120;

function borner(cible: string): string | null {
  // Une cible tient sur une ligne : rien de ce qui la suivrait ne passe.
  const [ligne = ""] = cible.split(/[\r\n]/);
  const propre = ligne.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (propre === "") return null;
  return propre.length > CIBLE_MAX ? `…${propre.slice(-(CIBLE_MAX - 1))}` : propre;
}

// Le chemin d'un fichier, relatif au worktree du cook quand il y est — écrit
// avec `/`, comme git l'écrit, sur toutes les plateformes.
function chemin(valeur: unknown, cwd: string | undefined): string | null {
  if (typeof valeur !== "string" || valeur === "") return null;
  if (cwd !== undefined && isAbsolute(valeur)) {
    const dedans = relative(cwd, valeur);
    if (dedans !== "" && !dedans.startsWith("..") && !isAbsolute(dedans)) return borner(dedans.replaceAll(sep, "/"));
  }
  return borner(valeur);
}

// Un mot de commande qui se montre : un nom de programme, sans chemin, sans
// option, sans guillemet — rien qui puisse porter une valeur. Sa sous-commande
// ne se montre que pour les programmes qui en ont : ailleurs, le mot suivant est
// un argument, et un argument peut être un secret.
const PROGRAMME = /^[A-Za-z0-9._+-]+$/;
const SOUS_COMMANDE = /^[a-z][a-z-]*$/;
const A_SOUS_COMMANDES = new Set(["git", "gh", "npm", "pnpm", "yarn", "bun", "cargo", "go", "deno", "docker", "kubectl", "make", "pip", "uv", "poetry", "systemctl"]);
// Ce qui ne fait que préparer la commande : changer de répertoire, poser une variable.
const PREAMBULES = new Set(["cd", "export", "set", "source", ".", "env", "pushd", "popd"]);

// Ce qu'une commande cite — un texte entre guillemets, le corps d'un
// here-document — n'est pas ce qu'elle fait : un message de commit qui parle de
// tests ne lance pas les tests.
const sansCitations = (commande: string) =>
  commande.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, "").replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");

// La commande, réduite à son programme et à sa sous-commande : « git status »,
// « npm install ». Les arguments n'en sortent pas — ils peuvent porter un
// secret, un message, du code —, ni une variable posée devant.
function resumerCommande(commande: string): string | null {
  for (const segment of commande.split(/&&|\|\||[;|\n]/)) {
    const mots = segment.trim().split(/\s+/).filter((mot) => mot !== "");
    // Une variable posée devant la commande n'en est pas le nom.
    while (mots.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[0] as string)) mots.shift();
    const [tete, suite] = mots;
    if (tete === undefined) continue;
    const programme = tete.includes("/") ? basename(tete) : tete;
    if (PREAMBULES.has(programme)) continue;
    if (!PROGRAMME.test(programme)) return null;
    return suite !== undefined && A_SOUS_COMMANDES.has(programme) && SOUS_COMMANDE.test(suite) ? `${programme} ${suite}` : programme;
  }
  return null;
}

// Ce qu'une commande fait, quand elle a un nom pour le chef. L'ordre compte :
// `npm test && git commit` lance d'abord les tests.
const COMMANDES: { geste: Geste; forme: RegExp }[] = [
  { geste: "gating", forme: /(?:^|[\s/])gates\.sh\b/ },
  {
    geste: "testing",
    forme: /\b(?:npm|pnpm|yarn|bun)\b[^;&|\n]*\s(?:run\s+)?test\b|\bnode\b[^;&|\n]*\s--test\b|\b(?:pytest|vitest|jest|phpunit|rspec)\b|\b(?:cargo|go|deno|mix|dotnet)\s+test\b|\bmake\b[^;&|\n]*\stest\b/,
  },
  { geste: "checking-types", forme: /\btypecheck\b|\btsc\b|\bmypy\b/ },
  { geste: "opening-pr", forme: /\bgh\s+pr\s+create\b/ },
  { geste: "pushing", forme: /\bgit\s+(?:-C\s+\S+\s+)?push\b/ },
  { geste: "committing", forme: /\bgit\s+(?:-C\s+\S+\s+)?commit\b/ },
  { geste: "reading-ticket", forme: /\bgh\s+issue\s+view\b/ },
];

// Les outils de Claude Code, rangés par geste. Un outil absent d'ici est dit
// par son nom : « utilise l'outil … ».
const OUTILS: Record<string, Geste> = {
  Read: "reading",
  Write: "writing",
  Edit: "writing",
  MultiEdit: "writing",
  NotebookEdit: "writing",
  Grep: "searching",
  Glob: "searching",
  LS: "searching",
  WebFetch: "browsing",
  WebSearch: "browsing",
  Task: "delegating",
  Agent: "delegating",
  TodoWrite: "planning",
  TaskCreate: "planning",
  TaskUpdate: "planning",
};
const NOM_D_OUTIL = /^[A-Za-z0-9_.:-]{1,64}$/;

// Ce que vise un appel d'outil, d'après son nom et ses arguments.
function viser(nom: string, entree: Record<string, unknown>, cwd: string | undefined): { doing: Geste; target: string | null } {
  if (nom === "Bash") {
    const commande = sansCitations(typeof entree.command === "string" ? entree.command : "");
    const nommee = COMMANDES.find(({ forme }) => forme.test(commande));
    return nommee === undefined ? { doing: "running", target: resumerCommande(commande) } : { doing: nommee.geste, target: null };
  }
  const geste = OUTILS[nom];
  if (geste === "reading" || geste === "writing") return { doing: geste, target: chemin(entree.file_path ?? entree.notebook_path, cwd) };
  if (geste !== undefined) return { doing: geste, target: null };
  return { doing: "tool", target: NOM_D_OUTIL.test(nom) ? nom : null };
}

export type OptionsLecteur = {
  // Le worktree du cook : les chemins qui y sont s'y disent relatifs.
  cwd?: string;
  // Ce qui passe sur une cible avant qu'elle ne sorte : le masque des secrets.
  masquer?: (texte: string) => string;
  maintenant?: () => Date;
};

export type LecteurDActivite = {
  // Une ligne du flux, telle que le cook l'a dite.
  lire(ligne: string): void;
  // Ce que le cook fait d'après ce qu'il a dit jusqu'ici — rien tant qu'il n'a
  // rien dit qui se lise.
  activite(): Activite | null;
};

type Contenu = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; is_error?: unknown };

export function lecteurDActivite(options: OptionsLecteur = {}): LecteurDActivite {
  const maintenant = options.maintenant ?? (() => new Date());
  let courante: Activite | null = null;
  // Les appels d'outil en cours, et ce que chacun fait.
  const enCours = new Map<string, Geste>();
  // Les derniers tests ou les dernières gates lancés sont rouges : ce qui
  // s'écrit ensuite les corrige.
  let rouge: "tests" | "gates" | null = null;

  const poser = (doing: Geste, target: string | null) => {
    const cible = target === null ? null : borner(options.masquer?.(target) ?? target);
    // Le même geste qui continue garde son heure : c'est depuis quand il dure.
    if (courante?.doing === doing && courante.target === cible) return;
    courante = { doing, target: cible, since: maintenant().toISOString() };
  };

  const appeler = (contenu: Contenu) => {
    if (typeof contenu.name !== "string") return;
    const entree = typeof contenu.input === "object" && contenu.input !== null ? (contenu.input as Record<string, unknown>) : {};
    let { doing, target } = viser(contenu.name, entree, options.cwd);
    if (doing === "writing" && rouge !== null) doing = rouge === "tests" ? "fixing-tests" : "fixing-gates";
    if (typeof contenu.id === "string") enCours.set(contenu.id, doing);
    poser(doing, target);
  };

  const rendre = (contenu: Contenu) => {
    const id = typeof contenu.tool_use_id === "string" ? contenu.tool_use_id : null;
    const geste = id === null ? undefined : enCours.get(id);
    if (id !== null) enCours.delete(id);
    const echec = contenu.is_error === true;
    if (geste === "testing" || geste === "gating") {
      rouge = echec ? (geste === "testing" ? "tests" : "gates") : null;
      return poser(geste === "testing" ? (echec ? "tests-red" : "tests-green") : echec ? "gates-red" : "gates-green", null);
    }
    // Un outil rendu, plus rien ne tourne : le modèle reprend la main.
    if (enCours.size === 0) poser("thinking", null);
  };

  return {
    lire(ligne) {
      let evenement: { type?: unknown; subtype?: unknown; message?: { content?: unknown } };
      try {
        evenement = JSON.parse(ligne);
      } catch {
        return;
      }
      if (typeof evenement !== "object" || evenement === null) return;
      if (evenement.type === "system" && evenement.subtype === "init") return poser("starting", null);
      if (evenement.type === "result") return poser("finishing", null);
      const contenus = Array.isArray(evenement.message?.content) ? (evenement.message.content as unknown[]) : [];
      for (const brut of contenus) {
        if (typeof brut !== "object" || brut === null) continue;
        const contenu = brut as Contenu;
        if (evenement.type === "assistant" && contenu.type === "tool_use") appeler(contenu);
        else if (evenement.type === "assistant" && (contenu.type === "text" || contenu.type === "thinking") && enCours.size === 0) poser("thinking", null);
        else if (evenement.type === "user" && contenu.type === "tool_result") rendre(contenu);
      }
    },
    activite: () => courante,
  };
}
