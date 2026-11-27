// Les shells persistants : un shell de l'app ouvert dans une session qui lui
// survit — `tmux`, ou `screen` là où `tmux` manque —, sur ce poste. Fermer le terminal, ou l'app, ne fait que s'en
// détacher : la session tient, sa commande en cours tourne toujours, et le
// rattachement la retrouve telle qu'elle est. Seule sa destruction y met fin.
//
// Ce module ne lance rien qui tienne un terminal : il rend la commande qu'un pty
// lance (terminals.ts) — la même crée la session ou s'y rattache. Il lance
// lui-même la destruction, qui n'a pas besoin de terminal.
//
// La session est réglée pour se comporter comme un terminal ordinaire : rien n'y
// capture la souris (la sélection, la copie et le collage restent ceux de la vue), la molette
// remonte l'historique, aucun mode de copie n'est à apprendre, et aucune touche n'est prise par le
// multiplexeur.
// Le second ne passe jamais par ici.
import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";

// `poste` : cet ordinateur — un Mac ou un Linux : Windows n'a ni `sh`, ni `tmux`, ni `screen`, et
// aucun shell de ce poste n'y passe par ici (terminals.ts, `persistantIci`).
export type Target = { lieu: "poste" };
export type Session = { nom: string; cible: Target };
export type Command = { commande: string; args: string[] };

// Un nom que les deux multiplexeurs prennent tel quel, et que les scripts ci-dessous
// portent sans guillemets.
export const NAME_OF_SESSION = /^[a-z0-9][a-z0-9-]*$/;

// Ce qui est réglé sur la session, à chaque rattachement — le réglage du chef
// (`~/.tmux.conf`, `~/.screenrc`) ne s'y impose pas. Ni souris, ni préfixe : aucune
// touche n'est détournée, et le détachement se fait en fermant le terminal. Ni barre
// d'état : le terminal dit lui-même où il est.
export const SETTINGS_TMUX = ["mouse off", "prefix None", "prefix2 None", "status off"] as const;
// `escape ""` : `screen` n'a plus de touche de commande, Ctrl-A revient au shell.
export const SETTINGS_SCREEN = ["defmousetrack off", "mousetrack off", 'escape ""'] as const;

// Ce que dit un shell ouvert là où aucun multiplexeur n'est installé : il s'ouvre quand même.
export const WITHOUT_MULTIPLEXER = "brigade: neither tmux nor screen on this computer — this shell is not persistent: it ends with its terminal";

// Le nom de la session d'un shell : `brigade-<projet>-<rang>`. Un projet dont le nom
// ne s'écrit pas tel quel y porte aussi une empreinte du sien : deux projets ne
// partagent jamais une session.
export function nameOfSession(project: string, rank: number): string {
  const readable = project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projet";
  const fingerprint = readable === project ? "" : `-${createHash("sha256").update(project).digest("hex").slice(0, 8)}`;
  return `brigade-${readable}${fingerprint}-${rank}`;
}

function check(name: string): void {
  if (!NAME_OF_SESSION.test(name)) throw new Error(`session name \`${name}\`: lowercase letters, digits and dashes only`);
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

// Le défilement d'un shell. `screen` écrit sur l'écran normal du terminal (`ti`/`te` retirés) : ce qui
// défile passe par xterm.js, qui le garde, et la molette le remonte comme pour le second. Il ne le lit
// qu'à la création de la session, par un fichier de réglage (`-c`) : ni `-X`, ni `-c` au rattachement
// n'y changent rien. Une session créée avant ce réglage garde l'écran alterné jusqu'à sa destruction.
// tmux, lui, garde l'écran alterné : sur l'écran normal, il ne passerait pas tout au terminal — ce qui
// défile vite s'y regroupe, et seul le dernier écran s'en écrit. Sa molette remonte l'historique de
// la session (`scriptOfScroll`).
export const RC_SCREEN_NORMAL_SCREEN = "termcapinfo * ti@:te@";

// Le script qui crée la session ou s'y rattache. Il est lu par `sh`.
// `TMUX`, `STY` : une app lancée depuis un multiplexeur ne s'y emboîte pas.
export function scriptOfAttachment(name: string): string {
  check(name);
  return [
    "unset TMUX STY",
    ...LOCALE_UTF8,
    "if command -v tmux >/dev/null 2>&1; then",
    `  tmux -u has-session -t =${name} 2>/dev/null || tmux -u new-session -d -s ${name} -c "$PWD" || exit`,
    ...SETTINGS_TMUX.map((setting) => `  tmux -u set-option -t =${name}: ${setting}`),
    `  exec tmux -u attach-session -t =${name}`,
    "elif command -v screen >/dev/null 2>&1; then",
    `  ${screenExists(name)} || {`,
    // Le fichier de réglage vit dans un répertoire du chef (`~/.brigade/screen`, 0700), jamais sous un nom
    // prévisible d'un répertoire partagé. Il n'est pas supprimé : `screen` ne le lit qu'au premier
    // rattachement, pas à `-dmS`. `-c` remplace `~/.screenrc` : il le charge d'abord, le réglage du chef reste.
    '    dir="$HOME/.brigade/screen"; mkdir -p "$dir" && chmod 700 "$dir" || exit',
    `    rc="$dir/${name}.screenrc"`,
    '    { [ ! -f "$HOME/.screenrc" ] || echo "source \\"$HOME/.screenrc\\""; echo "' + RC_SCREEN_NORMAL_SCREEN + '"; } > "$rc" || exit',
    `    screen -U -c "$rc" -dmS ${name} || exit`,
    "  }",
    ...SETTINGS_SCREEN.map((setting) => `  screen -S ${name} -X ${setting}`),
    `  exec screen -U -x ${name}`,
    "fi",
    `echo "${WITHOUT_MULTIPLEXER}"`,
    'exec "${SHELL:-/bin/sh}" -l',
  ].join("\n");
}

// Le script qui détruit la session, de quelque multiplexeur qu'elle soit. Une session
// qui n'existe pas n'est pas un échec : il n'y a rien à détruire.
export function scriptOfDestruction(name: string): string {
  check(name);
  return [
    "unset TMUX STY",
    "r=0",
    `if command -v tmux >/dev/null 2>&1 && tmux has-session -t =${name} 2>/dev/null; then tmux kill-session -t =${name} || r=1; fi`,
    `if command -v screen >/dev/null 2>&1 && ${screenExists(name)}; then screen -S ${name} -X quit || r=1; fi`,
    "exit $r",
  ].join("\n");
}

// Le script qui fait défiler un shell tmux : l'historique de sa session, par son mode de copie, que la
// ligne de commande de tmux pilote — la souris reste à la vue, et sa sélection avec. `lignes` > 0
// remonte, < 0 redescend : au bas, le mode se quitte de lui-même (`-e`). 0 le quitte, avant une frappe :
// aucune touche n'est prise par le mode de copie. Un programme sur l'écran alterné de la session
// (`vim`, `less`) reçoit des flèches, comme xterm.js les lui enverrait. Sans session tmux — `screen`,
// qui défile dans xterm.js —, rien n'est fait.
export function scriptOfScroll(name: string, lines: number): string {
  check(name);
  const count = Math.abs(Math.trunc(lines));
  const pane = `-t =${name}:`;
  const command =
    lines > 0
      ? `-F '#{alternate_on}' 'send-keys ${pane} -N ${count} Up' 'copy-mode -e ${pane} ; send-keys -X ${pane} -N ${count} scroll-up'`
      : lines < 0
        ? `-F '#{pane_in_mode}' 'send-keys -X ${pane} -N ${count} scroll-down' 'if-shell -F "#{alternate_on}" "send-keys ${pane} -N ${count} Down"'`
        : `-F '#{pane_in_mode}' 'send-keys -X ${pane} cancel'`;
  return ["unset TMUX STY", "command -v tmux >/dev/null 2>&1 || exit 0", `tmux -u has-session -t =${name} 2>/dev/null || exit 0`, `exec tmux -u if-shell ${pane} ${command}`].join("\n");
}

// La commande que le pty d'un shell persistant lance : la même crée la session ou s'y rattache.
export const attachment = ({ nom: name }: Session): Command => ({ commande: "/bin/sh", args: ["-c", scriptOfAttachment(name)] });

// La commande qui détruit la session.
export const destruction = ({ nom: name }: Session): Command => ({ commande: "/bin/sh", args: ["-c", scriptOfDestruction(name)] });

// Fait défiler le shell de la session (`scriptOfScroll`). Jamais d'exception : un défilement qui
// échoue n'a rien bougé.
export function scroll(session: Session, lines: number, settings: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  return new Promise((done) => {
    execFile("/bin/sh", ["-c", scriptOfScroll(session.nom, lines)], { windowsHide: true, timeout: 5_000, env: settings.env ?? process.env }, () => done());
  });
}

// Détruit la session pour de bon : un rattachement ultérieur en crée une neuve. Jamais
// d'exception : un échec rend ce qui a été lancé, et ce qui en est revenu.
export function destroy(session: Session, settings: { delaiMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ detruite: true } | { erreur: string }> {
  const { commande: command, args } = destruction(session);
  return new Promise((render) => {
    execFile(command, args, { windowsHide: true, timeout: settings.delaiMs ?? 30_000, env: settings.env ?? process.env }, (error: ExecFileException | null, output, errors) => {
      if (error === null) return render({ detruite: true });
      const suite = error.killed === true ? "stopped: no answer in time" : typeof error.code === "number" ? `exit code ${error.code}` : error.message;
      render({ erreur: `$ ${command} ${args.join(" ")}\n${errors}${output}\n→ ${suite}` });
    });
  });
}
