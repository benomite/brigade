// Les shells persistants : un shell de l'app ouvert dans une session qui lui
// survit — `tmux`, ou `screen` là où `tmux` manque —, sur ce poste. Fermer le terminal, ou l'app, ne fait que s'en
// détacher : la session tient, sa commande en cours tourne toujours, et le
// rattachement la retrouve telle qu'elle est. Seule sa destruction y met fin.
//
// Ce module ne lance rien qui tienne un terminal : il rend la commande qu'un pty
// lance (terminaux.ts) — la même crée la session ou s'y rattache. Il lance
// lui-même la destruction, qui n'a pas besoin de terminal.
//
// La session est réglée pour se comporter comme un terminal ordinaire : rien n'y
// capture la souris (la sélection, la copie et le collage restent ceux de la vue), aucun
// mode de copie n'est à apprendre, et aucune touche n'est prise par le multiplexeur.
// Le second ne passe jamais par ici.
import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";

// `poste` : cet ordinateur — un Mac ou un Linux : Windows n'a ni `sh`, ni `tmux`, ni `screen`, et
// aucun shell de ce poste n'y passe par ici (terminaux.ts, `persistantIci`).
export type Cible = { lieu: "poste" };
export type Session = { nom: string; cible: Cible };
export type Command = { commande: string; args: string[] };

// Un nom que les deux multiplexeurs prennent tel quel, et que les scripts ci-dessous
// portent sans guillemets.
export const NAME_DE_SESSION = /^[a-z0-9][a-z0-9-]*$/;

// Ce qui est réglé sur la session, à chaque rattachement — le réglage du chef
// (`~/.tmux.conf`, `~/.screenrc`) ne s'y impose pas. Ni souris, ni préfixe : aucune
// touche n'est détournée, et le détachement se fait en fermant le terminal. Ni barre
// d'état : le terminal dit lui-même où il est.
export const SETTINGS_TMUX = ["mouse off", "prefix None", "prefix2 None", "status off"] as const;
// `escape ""` : `screen` n'a plus de touche de commande, Ctrl-A revient au shell.
export const SETTINGS_SCREEN = ["defmousetrack off", "mousetrack off", 'escape ""'] as const;

// Ce que dit un shell ouvert là où aucun multiplexeur n'est installé : il s'ouvre quand même.
export const SANS_MULTIPLEXEUR = "brigade: neither tmux nor screen on this computer — this shell is not persistent: it ends with its terminal";

// Le nom de la session d'un shell : `brigade-<projet>-<rang>`. Un projet dont le nom
// ne s'écrit pas tel quel y porte aussi une empreinte du sien : deux projets ne
// partagent jamais une session.
export function nameDeSession(project: string, rang: number): string {
  const lisible = project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projet";
  const empreinte = lisible === project ? "" : `-${createHash("sha256").update(project).digest("hex").slice(0, 8)}`;
  return `brigade-${lisible}${empreinte}-${rang}`;
}

function verifier(name: string): void {
  if (!NAME_DE_SESSION.test(name)) throw new Error(`session name \`${name}\`: lowercase letters, digits and dashes only`);
}

// `screen` prend un nom qui n'est que le début d'un autre : l'existence se vérifie à la lettre.
const screenExists = (name: string) => `screen -ls 2>/dev/null | grep -q "[.]${name}[[:space:]]"`;

// Une app lancée depuis le Dock n'a pas de locale : sans UTF-8, tmux affiche chaque caractère non ASCII
// en `_`. `-u` / `-U` forcent l'UTF-8 côté client, même sur un serveur déjà lancé ; la locale posée ici
// sert au shell de la session.
const LOCALE_UTF8 = [
  'case "${LC_ALL:-${LC_CTYPE:-$LANG}}" in',
  "  *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) ;;",
  '  *) unset LC_ALL LC_CTYPE; if [ "$(uname)" = Darwin ]; then LANG=en_US.UTF-8; else LANG=C.UTF-8; fi; export LANG ;;',
  "esac",
];

// Le script qui crée la session ou s'y rattache. Il est lu par `sh`.
// `TMUX`, `STY` : une app lancée depuis un multiplexeur ne s'y emboîte pas.
export function scriptDeRattachement(name: string): string {
  verifier(name);
  return [
    "unset TMUX STY",
    ...LOCALE_UTF8,
    "if command -v tmux >/dev/null 2>&1; then",
    `  tmux -u has-session -t =${name} 2>/dev/null || tmux -u new-session -d -s ${name} -c "$PWD" || exit`,
    ...SETTINGS_TMUX.map((setting) => `  tmux -u set-option -t =${name} ${setting}`),
    `  exec tmux -u attach-session -t =${name}`,
    "elif command -v screen >/dev/null 2>&1; then",
    `  ${screenExists(name)} || screen -U -dmS ${name} || exit`,
    ...SETTINGS_SCREEN.map((setting) => `  screen -S ${name} -X ${setting}`),
    `  exec screen -U -x ${name}`,
    "fi",
    `echo "${SANS_MULTIPLEXEUR}"`,
    'exec "${SHELL:-/bin/sh}" -l',
  ].join("\n");
}

// Le script qui détruit la session, de quelque multiplexeur qu'elle soit. Une session
// qui n'existe pas n'est pas un échec : il n'y a rien à détruire.
export function scriptDeDestruction(name: string): string {
  verifier(name);
  return [
    "unset TMUX STY",
    "r=0",
    `if command -v tmux >/dev/null 2>&1 && tmux has-session -t =${name} 2>/dev/null; then tmux kill-session -t =${name} || r=1; fi`,
    `if command -v screen >/dev/null 2>&1 && ${screenExists(name)}; then screen -S ${name} -X quit || r=1; fi`,
    "exit $r",
  ].join("\n");
}

// La commande que le pty d'un shell persistant lance : la même crée la session ou s'y rattache.
export const rattachement = ({ nom: name }: Session): Command => ({ commande: "/bin/sh", args: ["-c", scriptDeRattachement(name)] });

// La commande qui détruit la session.
export const destruction = ({ nom: name }: Session): Command => ({ commande: "/bin/sh", args: ["-c", scriptDeDestruction(name)] });

// Détruit la session pour de bon : un rattachement ultérieur en crée une neuve. Jamais
// d'exception : un échec rend ce qui a été lancé, et ce qui en est revenu.
export function detruire(session: Session, settings: { delaiMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ detruite: true } | { erreur: string }> {
  const { commande: command, args } = destruction(session);
  return new Promise((rendre) => {
    execFile(command, args, { windowsHide: true, timeout: settings.delaiMs ?? 30_000, env: settings.env ?? process.env }, (error: ExecFileException | null, sortie, erreurs) => {
      if (error === null) return rendre({ detruite: true });
      const suite = error.killed === true ? "stopped: no answer in time" : typeof error.code === "number" ? `exit code ${error.code}` : error.message;
      rendre({ erreur: `$ ${command} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}` });
    });
  });
}
