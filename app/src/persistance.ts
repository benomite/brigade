// Les shells persistants : un shell de l'app ouvert dans une session qui lui
// survit — `tmux`, ou `screen` là où `tmux` manque —, sur une cible : ce poste,
// la box du projet, ou une station. Fermer le terminal, ou l'app, ne fait que s'en
// détacher : la session tient, sa commande en cours tourne toujours, et le
// rattachement la retrouve telle qu'elle est. Seule sa destruction y met fin.
//
// Ce module ne lance rien qui tienne un terminal : il rend la commande qu'un pty
// lance (terminaux.ts) — la même crée la session ou s'y rattache. Il lance
// lui-même la destruction, qui n'a pas besoin de terminal.
//
// Sur une machine distante, la connexion est celle par laquelle l'app joint déjà
// la box : `ssh <hote>`, le nom que le `ssh` du chef connaît, avec le compte que sa
// configuration lui donne. Rien n'y change de compte — ni `-l`, ni `<compte>@`
// ajouté, ni `sudo`, ni `su` : un shell de l'app ne s'ouvre jamais sous le compte du
// service qui fait tourner la cuisine.
//
// La session est réglée pour se comporter comme un terminal ordinaire : rien n'y
// capture la souris (la sélection, la copie et le collage restent ceux de la vue), aucun
// mode de copie n'est à apprendre, et aucune touche n'est prise par le multiplexeur.
// Le second ne passe jamais par ici.
import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";

// `poste` : cet ordinateur — un Mac ou un Linux : Windows n'a ni `sh`, ni `tmux`, ni `screen`, et
// aucun shell de ce poste n'y passe par ici (terminaux.ts, `persistantIci`). `box`, `station` : une
// machine que `ssh` joint par `hote` — depuis Windows aussi, par son `ssh`. `nom` est celui sous
// lequel le chef la connaît.
export type Cible = { lieu: "poste" } | { lieu: "box" | "station"; nom: string; hote: string };
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

// Le script qui crée la session ou s'y rattache. Il est lu par `sh` : sur le poste
// directement, sur une machine distante par le shell de connexion du compte, quel
// qu'il soit — il ne porte donc aucune apostrophe, et s'écrit entre deux.
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

function sur(cible: Cible, script: string, ssh: string, options: string[]): Commande {
  if (cible.lieu === "poste") return { commande: "/bin/sh", args: ["-c", script] };
  // Le compte est celui que le `ssh` du chef donne à `hote` : la destination part telle
  // qu'elle est déclarée, et rien ne la suit qui en change.
  return { commande: ssh, args: [...options, "--", cible.hote, `sh -c '${script}'`] };
}

// Ce qui fait lâcher une connexion morte au lieu d'attendre : une machine qui ne répond pas à
// l'ouverture est laissée au bout de dix secondes, et une connexion établie qui ne répond plus
// (réseau perdu, poste endormi) l'est au bout de trente — `ssh` sort alors en 255, et le terminal
// le dit (terminaux.ts). La session, elle, tient sur sa machine.
export const VIGILANCE_SSH = ["-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3"] as const;

// La commande que le pty d'un shell persistant lance. `-t` : la session distante a un
// terminal, celui de la vue — c'est là que se tape un mot de passe, s'il en faut un.
export const rattachement = ({ nom, cible }: Session, ssh = "ssh"): Commande => sur(cible, scriptDeRattachement(nom), ssh, ["-t", ...VIGILANCE_SSH]);

// Ce qui demande à une machine si elle répond, sans terminal et sans rien y lancer : la même
// connexion que celle de la veille, qui ne demande rien — ni mot de passe, ni hôte à confirmer.
export const sonde = (cible: Cible, ssh = "ssh", connexionS = 10): Commande =>
  cible.lieu === "poste" ? { commande: "/bin/sh", args: ["-c", "true"] } : { commande: ssh, args: ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${connexionS}`, "--", cible.hote, "true"] };

// La machine répond-elle ? Jamais d'exception : quand elle ne répond pas, ce que `ssh` en a dit,
// sa dernière ligne — « connect to host … : Network is unreachable ».
export function joindre(cible: Cible, reglages: { ssh?: string; delaiMs?: number; connexionS?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ joint: true } | { erreur: string }> {
  const { commande, args } = sonde(cible, reglages.ssh, reglages.connexionS);
  return new Promise((rendre) => {
    execFile(commande, args, { windowsHide: true, timeout: reglages.delaiMs ?? 30_000, env: reglages.env ?? process.env }, (erreur: ExecFileException | null, _, erreurs) => {
      if (erreur === null) return rendre({ joint: true });
      const dit = String(erreurs).trim().split("\n").at(-1)?.trim();
      const suite = erreur.killed === true ? "no answer in time" : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
      rendre({ erreur: dit === undefined || dit === "" ? suite : `${dit} (${suite})` });
    });
  });
}

// La commande qui détruit la session. Sans terminal, `ssh` ne peut rien demander : il
// échoue plutôt que d'attendre un mot de passe.
export const destruction = ({ nom, cible }: Session, ssh = "ssh", connexionS = 10): Commande =>
  sur(cible, scriptDeDestruction(nom), ssh, ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${connexionS}`]);

// Détruit la session pour de bon : un rattachement ultérieur en crée une neuve. Jamais
// d'exception : un échec rend ce qui a été lancé, et ce qui en est revenu.
export function detruire(session: Session, reglages: { ssh?: string; delaiMs?: number; connexionS?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ detruite: true } | { erreur: string }> {
  const { commande, args } = destruction(session, reglages.ssh, reglages.connexionS);
  return new Promise((rendre) => {
    execFile(commande, args, { windowsHide: true, timeout: reglages.delaiMs ?? 30_000, env: reglages.env ?? process.env }, (erreur: ExecFileException | null, sortie, erreurs) => {
      if (erreur === null) return rendre({ detruite: true });
      const suite = erreur.killed === true ? "stopped: no answer in time" : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
      rendre({ erreur: `$ ${commande} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}` });
    });
  });
}
