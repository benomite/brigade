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
export type Commande = { commande: string; args: string[] };

// Un nom que les deux multiplexeurs prennent tel quel, et que les scripts ci-dessous
// portent sans guillemets.
export const NOM_DE_SESSION = /^[a-z0-9][a-z0-9-]*$/;

// Ce qui est réglé sur la session, à chaque rattachement — le réglage du chef
// (`~/.tmux.conf`, `~/.screenrc`) ne s'y impose pas. Ni souris, ni préfixe : aucune
// touche n'est détournée, et le détachement se fait en fermant le terminal. Ni barre
// d'état : le terminal dit lui-même où il est.
export const REGLAGES_TMUX = ["mouse off", "prefix None", "prefix2 None", "status off"] as const;
// `escape ""` : `screen` n'a plus de touche de commande, Ctrl-A revient au shell.
export const REGLAGES_SCREEN = ["defmousetrack off", "mousetrack off", 'escape ""'] as const;

// Ce que dit un shell ouvert là où aucun multiplexeur n'est installé : il s'ouvre quand même.
export const SANS_MULTIPLEXEUR = "brigade: neither tmux nor screen on this machine — this shell is not persistent: it ends with its terminal";

// Le nom de la session d'un shell : `brigade-<projet>-<rang>`. Un projet dont le nom
// ne s'écrit pas tel quel y porte aussi une empreinte du sien : deux projets ne
// partagent jamais une session.
export function nomDeSession(projet: string, rang: number): string {
  const lisible = projet.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projet";
  const empreinte = lisible === projet ? "" : `-${createHash("sha256").update(projet).digest("hex").slice(0, 8)}`;
  return `brigade-${lisible}${empreinte}-${rang}`;
}

function verifier(nom: string): void {
  if (!NOM_DE_SESSION.test(nom)) throw new Error(`session name \`${nom}\`: lowercase letters, digits and dashes only`);
}

// `screen` prend un nom qui n'est que le début d'un autre : l'existence se vérifie à la lettre.
const ecranExiste = (nom: string) => `screen -ls 2>/dev/null | grep -q "[.]${nom}[[:space:]]"`;

// Le script qui crée la session ou s'y rattache. Il est lu par `sh`.
// `TMUX`, `STY` : une app lancée depuis un multiplexeur ne s'y emboîte pas.
export function scriptDeRattachement(nom: string): string {
  verifier(nom);
  return [
    "unset TMUX STY",
    "if command -v tmux >/dev/null 2>&1; then",
    `  tmux has-session -t =${nom} 2>/dev/null || tmux new-session -d -s ${nom} -c "$PWD" || exit`,
    ...REGLAGES_TMUX.map((reglage) => `  tmux set-option -t =${nom} ${reglage}`),
    `  exec tmux attach-session -t =${nom}`,
    "elif command -v screen >/dev/null 2>&1; then",
    `  ${ecranExiste(nom)} || screen -dmS ${nom} || exit`,
    ...REGLAGES_SCREEN.map((reglage) => `  screen -S ${nom} -X ${reglage}`),
    `  exec screen -x ${nom}`,
    "fi",
    `echo "${SANS_MULTIPLEXEUR}"`,
    'exec "${SHELL:-/bin/sh}" -l',
  ].join("\n");
}

// Le script qui détruit la session, de quelque multiplexeur qu'elle soit. Une session
// qui n'existe pas n'est pas un échec : il n'y a rien à détruire.
export function scriptDeDestruction(nom: string): string {
  verifier(nom);
  return [
    "unset TMUX STY",
    "r=0",
    `if command -v tmux >/dev/null 2>&1 && tmux has-session -t =${nom} 2>/dev/null; then tmux kill-session -t =${nom} || r=1; fi`,
    `if command -v screen >/dev/null 2>&1 && ${ecranExiste(nom)}; then screen -S ${nom} -X quit || r=1; fi`,
    "exit $r",
  ].join("\n");
}

// La commande que le pty d'un shell persistant lance : la même crée la session ou s'y rattache.
export const rattachement = ({ nom }: Session): Commande => ({ commande: "/bin/sh", args: ["-c", scriptDeRattachement(nom)] });

// La commande qui détruit la session.
export const destruction = ({ nom }: Session): Commande => ({ commande: "/bin/sh", args: ["-c", scriptDeDestruction(nom)] });

// Détruit la session pour de bon : un rattachement ultérieur en crée une neuve. Jamais
// d'exception : un échec rend ce qui a été lancé, et ce qui en est revenu.
export function detruire(session: Session, reglages: { delaiMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ detruite: true } | { erreur: string }> {
  const { commande, args } = destruction(session);
  return new Promise((rendre) => {
    execFile(commande, args, { windowsHide: true, timeout: reglages.delaiMs ?? 30_000, env: reglages.env ?? process.env }, (erreur: ExecFileException | null, sortie, erreurs) => {
      if (erreur === null) return rendre({ detruite: true });
      const suite = erreur.killed === true ? "stopped: no answer in time" : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
      rendre({ erreur: `$ ${commande} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}` });
    });
  });
}
