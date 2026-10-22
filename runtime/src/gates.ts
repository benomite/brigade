// Les scripts du projet, joués dans le worktree d'un ticket : son setup, avant
// qu'un cook ou des gates n'y entrent, et ses gates, par lesquelles la pass
// juge une livraison. Le contrat est celui de la V1 :
// `.claude/brigade/worktree-setup.sh <n> <worktree>` n'imprime que des `export`,
// `.claude/brigade/gates.sh <worktree>` a pour verdict son code de sortie. Seul
// module qui lance les scripts du projet.
import { envSansInvite, spawn } from "./sans-invite.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { envelopper, type Cloison } from "./cloison.ts";
import type { Depassement, Gates } from "./events/pass.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "./scripts-du-projet.ts";

export { SCRIPT_GATES, SCRIPT_SETUP };

// Le canal par lequel le setup rend ce qu'il a exporté : ni sa sortie ni sa
// sortie d'erreur, qui sont au projet.
const CANAL = 3;

// Le contrat du setup est `eval "$(worktree-setup.sh N WT)"` : ses exports ne
// se lisent qu'évalués par un shell. Une fois évalués, tout ce que ce shell
// exporte part sur le canal, une variable par enregistrement.
const SETUP = `
set -u
EXPORTS="$("$1" "$2" "$3")" || exit
eval "$EXPORTS" || exit
for nom in $(compgen -e); do printf '%s=%s\\0' "$nom" "\${!nom}"; done >&${CANAL}
`;
// Un seul canal pour les gates : entre deux tubes, l'ordre où deux lignes sont
// lues n'est pas celui où elles ont été écrites. Le shell attend leur fin pour
// dire sur le canal, par `times`, le processeur de tout ce qu'il a attendu —
// les gates et ce qu'elles ont lancé et attendu, workers compris. Tuées par un
// signal, il en meurt de même : leur code reste le leur.
const GATES = `
"$1" "$2" 2>&1
code=$?
times >&${CANAL}
if [ "$code" -gt 128 ]; then kill -s "$(kill -l "$code")" "$$" 2>/dev/null; fi
exit "$code"
`;
// Un outil du projet, sa commande et ses arguments : de même, un seul canal.
const OUTIL = 'exec "$@" 2>&1';
// Ce que le shell du setup exporte de lui-même.
const DU_SHELL = ["_", "OLDPWD", "PWD", "SHLVL"];

const LIGNES_DE_FIN = 40;
// Ce que le verdict garde des gates part au journal, sur l'issue et dans la
// consigne d'un renvoi : borné.
const ECHECS_MAX = 20;
const LIGNE_MAX = 300;
const SORTIE_MAX = 256 * 1024;
// Une mesure déclarée par les gates : `MESURE  <nom>=<nombre>`, seule sur sa
// ligne. Le nombre s'écrit avec un point ou une virgule.
const MESURE = /^MESURE\s+([a-z][a-z0-9_]*)=([0-9]+(?:[.,][0-9]+)?)\s*$/;
const MESURES_MAX = 20;
const FIN_MAX = 4000;
// Le plafond de durée que les gates se donnent (binding « Plafond des gates »),
// franchi : la ligne de leur mesure, puis leur ligne FAIL — celle dont le hook
// d'arrêt tire l'empreinte de l'échec. Les deux nomment le même plafond.
const NOMBRE = "([0-9]+(?:[.,][0-9]+)?)";
const MESURE_FRANCHIE = new RegExp(`^durée des gates : ${NOMBRE} s de processeur\\b.* pour un plafond de ${NOMBRE} s — `);
const PLAFOND_FRANCHI = new RegExp(`^FAIL\\s+plafond des gates franchi : plus de ${NOMBRE} s de processeur\\s*$`);
const lire = (nombre: string | undefined) => Number(nombre?.replace(",", "."));
// Des tests coupés par la garde d'horloge des gates sans qu'aucun n'ait échoué
// avant la coupure : leur ligne FAIL le dit en ces mots.
const COUPEE_SANS_ECHEC = /^FAIL\s.*garde d'horloge, aucun test en échec/;
// Ce qu'on laisse à la sortie d'un script pour se fermer une fois qu'il a fini.
const DELAI_DE_FERMETURE_MS = 1000;

export type DemandeScript = {
  worktree: string;
  ticket: number;
  env: NodeJS.ProcessEnv;
  // Le plafond de durée : au-delà, le script est arrêté.
  delaiMs: number;
  // Abandonne le script en cours : le runtime s'arrête.
  signal?: AbortSignal;
  // Les variables que le setup ne peut pas faire entrer dans l'environnement
  // de ce qui vient après lui : ce qu'il en exporte est écarté.
  interdites?: string[];
  // Le masque des secrets du projet que `env` porte : ce que le runtime garde
  // de la sortie du script — journald, journal, issue — ne les montre pas.
  // Avec ou sans lui, la forme des identifiants de Claude y est masquée.
  masquer?: (texte: string) => string;
  // La cloison dans laquelle le script part : il y retrouve son worktree, en
  // écriture. Absente, il tourne sous le compte du runtime, sans rien autour.
  cloison?: Cloison | null;
};

// `joue` : le projet a un setup. Sans lui, l'environnement est rendu tel quel.
// `masques` : combien de fois la forme des identifiants de Claude a été
// masquée dans sa sortie.
export type Setup =
  | { pret: true; joue: boolean; env: NodeJS.ProcessEnv; sortie: string; masques: number }
  | { pret: false; depasse: boolean; code: number | null; sortie: string; masques: number };

export const aDesGates = (worktree: string) => existsSync(join(worktree, SCRIPT_GATES));

// `coupee` : la sortie ne tenait pas dans ce qui en est gardé, son début manque.
// `retenues` : les lignes de sa sortie standard que `retenir` a reconnues,
// toutes, coupée ou non.
type Passage = { code: number | null; depasse: boolean; sortie: string; coupee: boolean; masques: number; canal: string; retenues: string[] };

// Joue un script du projet dans le worktree, sous son plafond. Ne lève pas : un
// script impossible à lancer est un script en échec, et sa sortie dit pourquoi.
// `retenir` : les lignes de sa sortie standard à garder entières, hors de ce
// que le plafond de sortie laisse.
function jouer(script: string, args: string[], demande: DemandeScript, retenir?: RegExp): Promise<Passage> {
  return new Promise((resoudre) => {
    // Son propre groupe de process : au plafond, le script meurt avec tout ce
    // qu'il a lancé.
    const lancement = envelopper(demande.cloison, { commande: "bash", args: ["-c", script, "brigade", ...args] }, { cwd: demande.worktree, depot: "ecriture" });
    const enfant = spawn(lancement.commande, lancement.args, {
      cwd: demande.worktree,
      env: demande.env,
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      detached: true,
    });
    let sortie = "";
    let coupee = false;
    const noter = (morceau: Buffer) => {
      const entiere = sortie + morceau.toString();
      coupee ||= entiere.length > SORTIE_MAX;
      sortie = entiere.slice(-SORTIE_MAX);
    };
    const retenues: string[] = [];
    let entamee = "";
    const trier = (morceau: string) => {
      const lignes = (entamee + morceau).split("\n");
      entamee = lignes.pop() ?? "";
      for (const ligne of lignes) if (retenir?.test(ligne)) retenues.push(ligne);
    };
    enfant.stdout?.on("data", (morceau: Buffer) => {
      noter(morceau);
      if (retenir) trier(morceau.toString());
    });
    enfant.stderr?.on("data", noter);
    const canal: Buffer[] = [];
    enfant.stdio[CANAL]?.on("data", (morceau: Buffer) => canal.push(morceau));

    let echu = false;
    const tuer = () => {
      try {
        if (enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
      } catch {
        // Déjà mort.
      }
    };
    const plafond = setTimeout(() => {
      echu = true;
      tuer();
    }, demande.delaiMs);
    demande.signal?.addEventListener("abort", tuer, { once: true });

    let rendu = false;
    const rendre = (code: number | null, erreur?: string) => {
      if (rendu) return;
      rendu = true;
      clearTimeout(plafond);
      demande.signal?.removeEventListener("abort", tuer);
      if (entamee !== "") trier("\n");
      const dite = erreur ? `${sortie}\n${erreur}` : sortie;
      const masquee = masquerIdentifiants(demande.masquer?.(dite) ?? dite);
      // Arrêté au plafond : le plafond est échu, et le script en est mort. Sorti
      // de lui-même, il a un code, et c'est lui qui le juge — même si le plafond
      // est tombé avant que le runtime, en retard, ait traité sa fin.
      resoudre({ code, depasse: echu && code === null, sortie: masquee.texte, coupee, masques: masquee.masques, canal: Buffer.concat(canal).toString(), retenues });
    };
    enfant.on("error", (erreur) => rendre(null, erreur.message));
    // Le verdict est le code de sortie du script, connu dès sa fin — pas la
    // fermeture de sa sortie, qu'un process laissé en arrière-plan tiendrait
    // ouverte jusqu'au plafond. Ce qu'il a laissé meurt avec son groupe ; la
    // sortie se ferme alors, et ce qui restait à lire est lu.
    enfant.on("exit", (code) => {
      clearTimeout(plafond);
      tuer();
      const fini = () => rendre(code);
      enfant.on("close", fini);
      setTimeout(fini, DELAI_DE_FERMETURE_MS);
    });
  });
}

// Rend le worktree exécutable : joue le setup du projet, s'il en a un, et rend
// l'environnement augmenté de ce qu'il exporte — celui dans lequel lancer ce
// qui vient après, cook ou gates. Rejouable : c'est le contrat du script.
export async function jouerSetup(demande: DemandeScript): Promise<Setup> {
  const script = join(demande.worktree, SCRIPT_SETUP);
  if (!existsSync(script)) return { pret: true, joue: false, env: demande.env, sortie: "", masques: 0 };
  const { code, depasse, sortie, masques, canal } = await jouer(SETUP, [script, String(demande.ticket), demande.worktree], demande);
  if (code !== 0 || depasse) return { pret: false, depasse, code, sortie, masques };
  // Ce que le lancement ajoute lui-même (les réglages sans invite) n'est pas un export du setup.
  const lancee = envSansInvite(demande.env);
  const exports = canal
    .split("\0")
    .filter(Boolean)
    .map((ligne): [string, string] => [ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)])
    .filter(([nom, valeur]) => !DU_SHELL.includes(nom) && !demande.interdites?.includes(nom) && lancee[nom] !== valeur);
  return { pret: true, joue: true, env: { ...demande.env, ...Object.fromEntries(exports) }, sortie, masques };
}

// Un outil du projet, joué dans le worktree comme ses scripts — l'outil du
// renommage du code (`pause/renommage.ts`) : son propre groupe de process, son
// plafond, l'abandon. Rend son code de sortie (null : arrêté, au plafond ou
// abandonné), s'il est tombé sur son plafond, et la fin de sa sortie. Ne lève
// pas : un outil impossible à lancer est un outil en échec. `retenir` : les
// lignes de sa sortie standard rendues entières (`retenues`) — les
// déplacements que dit l'outil de renommage.
export async function jouerOutil(commande: string, args: string[], demande: DemandeScript, retenir?: RegExp): Promise<{ code: number | null; depasse: boolean; fin: string; retenues: string[] }> {
  const { code, depasse, sortie, retenues } = await jouer(OUTIL, [commande, ...args], demande, retenir);
  const lignes = sortie.split("\n").filter((ligne) => ligne.trim() !== "");
  return { code, depasse, fin: lignes.slice(-LIGNES_DE_FIN).join("\n").slice(-FIN_MAX), retenues };
}

// Le plafond que nomme une ligne FAIL de plafond franchi.
const plafondDeLaLigne = (ligne: string) => (PLAFOND_FRANCHI.exec(ligne) ?? []).slice(1, 2).map(lire);

// Le dépassement que des gates sorties rouges déclarent, ou null. Une ligne
// FAIL de plafond sans la mesure qui nomme le même plafond n'en est pas un :
// elle peut venir d'un test, et reste un échec comme un autre.
function plafondFranchi(lignes: string[]): Depassement | null {
  const plafonds = lignes.flatMap(plafondDeLaLigne);
  for (const ligne of lignes) {
    const [, cout, plafond] = MESURE_FRANCHIE.exec(ligne) ?? [];
    if (cout !== undefined && plafonds.includes(lire(plafond))) return { cpuSeconds: lire(cout), limitSeconds: lire(plafond), line: ligne.slice(0, LIGNE_MAX) };
  }
  return null;
}

// Le processeur que `times` dit des enfants du shell — sa seconde ligne,
// utilisateur puis système, `0m1.234s` —, en millisecondes. Null s'il ne l'a
// pas dit : le shell est mort avant, avec les gates.
export function processeurDit(canal: string): number | null {
  const enfants = canal.trim().split("\n")[1] ?? "";
  const temps = [...enfants.matchAll(/(\d+)m(\d+(?:[.,]\d+)?)s/g)].map(([, minutes, secondes]) => Number(minutes) * 60 + lire(secondes));
  if (temps.length !== 2 || temps.some((valeur) => !Number.isFinite(valeur))) return null;
  return Math.round((temps[0]! + temps[1]!) * 1000);
}

// Ce qu'un passage des gates a coûté : l'horloge et le processeur de leur
// script, le setup à part (`events/gates.ts`). Nul : le script n'a pas été
// lancé — setup en échec.
export type CoutDesGates = { durationMs: number; cpuMs: number | null };

// Joue les gates et rend ce qu'elles ont dit. Le setup du worktree passe
// d'abord, sous le même plafond, et ce qu'il exporte vaut pour elles. Ne lève
// pas : des gates impossibles à lancer sont des gates rouges, avec leur motif.
export async function jouerGates(demande: DemandeScript): Promise<Gates> {
  return (await jouerGatesMesurees(demande)).gates;
}

// De même, avec ce que leur passage a coûté.
export async function jouerGatesMesurees(demande: DemandeScript): Promise<{ gates: Gates; cout: CoutDesGates | null }> {
  const { worktree } = demande;
  const debut = Date.now();
  const setup = await jouerSetup(demande);
  const lancees = Date.now();
  const passage = setup.pret
    ? await jouer(GATES, [join(worktree, SCRIPT_GATES), worktree], { ...demande, env: setup.env, delaiMs: demande.delaiMs - (lancees - debut) })
    : { ...setup, coupee: false, masques: 0, canal: "", sortie: `${setup.sortie}\nFAIL  setup du worktree en échec : ${join(worktree, SCRIPT_SETUP)}` };
  const cout = setup.pret ? { durationMs: Date.now() - lancees, cpuMs: processeurDit(passage.canal) } : null;
  const masques = setup.masques + passage.masques;
  const lignes = [setup.pret ? setup.sortie : "", passage.sortie].join("\n").split("\n").filter((ligne) => ligne.trim() !== "");
  // Déclarée deux fois, une mesure vaut sa dernière valeur.
  const mesures = lignes.flatMap((ligne) => {
    const [, nom, valeur] = MESURE.exec(ligne) ?? [];
    return nom === undefined || valeur === undefined ? [] : [[nom, Number(valeur.replace(",", "."))] as const];
  });
  const rouges = !passage.depasse && passage.code !== 0;
  const franchi = rouges && passage.code !== null && !passage.coupee ? plafondFranchi(lignes) : null;
  // Seule la ligne qui nomme le plafond reconnu n'est pas un échec : une autre,
  // qui en nomme un autre, n'a pas sa mesure.
  const echecs = lignes.filter((ligne) => /^FAIL\b/.test(ligne) && !(franchi && plafondDeLaLigne(ligne).includes(franchi.limitSeconds)));
  // Coupées par leur garde d'horloge, et rien d'autre : aucune autre ligne
  // FAIL. Une sortie dont le début manque peut en avoir perdu une.
  const coupees = rouges && passage.code !== null && !passage.coupee ? echecs.filter((ligne) => COUPEE_SANS_ECHEC.test(ligne)) : [];
  const coupee = coupees.length === echecs.length ? coupees[0] : undefined;
  const gates: Gates = {
    // Le plafond de durée n'est pas jugé ici : il a été mesuré sur le poste de
    // ceux qui écrivent la suite, pas sur la machine du runtime. Des gates dont
    // il est le seul rouge sont vertes, et leur dépassement se lit.
    outcome: passage.depasse ? "timeout" : !rouges || (franchi && echecs.length === 0) ? "green" : "red",
    code: passage.code,
    failures: echecs.slice(0, ECHECS_MAX).map((ligne) => ligne.slice(0, LIGNE_MAX)),
    tail: lignes.slice(-LIGNES_DE_FIN).join("\n").slice(-FIN_MAX),
    ...(franchi ? { overCeiling: franchi } : {}),
    ...(coupee === undefined ? {} : { clockGuardCut: coupee.slice(0, LIGNE_MAX) }),
    ...(mesures.length === 0 ? {} : { measures: Object.fromEntries(mesures.slice(-MESURES_MAX)) }),
    ...(masques === 0 ? {} : { credentialsMasked: masques }),
  };
  return { gates, cout };
}
