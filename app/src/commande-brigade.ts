// La commande `brigade` du chef sur son Mac (#4072) : l'app installée la pose dans
// `~/.local/bin`, que son PATH et celui du shell de connexion portent (emplacements.ts), pour qu'un
// terminal neuf et l'onglet du second la trouvent sans geste du chef. Elle lance le geste de la
// station (`runtime/src/station/geste.ts`, comme `deploy/brigade` sous Linux et
// installer-station.sh) avec le runtime et le `node` du paquet. Réécrite à chaque lancement de
// l'app, avec sa version en tête : après une mise à jour, elle pointe le runtime de la nouvelle.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type OptionsCommande = {
  plateforme: string;
  // Seule l'app installée a un runtime et un `node` à elle ; depuis le dépôt, rien n'est posé.
  installee: boolean;
  maison: string;
  version: string;
  runtime: string;
  node: string;
  // La racine de la station de cet ordinateur (BRIGADE_STATION_DIR).
  racine: string;
  // Le PATH que la commande donne à ce qu'elle lance : celui de l'app.
  chemin: string;
};

const cite = (texte: string): string => `'${texte.replaceAll("'", `'\\''`)}'`;

export function texteDeLaCommande(o: OptionsCommande): string {
  return `#!/bin/sh
# Écrit par l'app Brigade ${o.version}, et réécrit à chaque lancement : ne pas l'éditer.
# brigade-version: ${o.version}
#   brigade <project> <command> [arguments…]
#   brigade <project> help
cd ${cite(o.runtime)} 2>/dev/null || {
  echo ${cite(`brigade : le runtime de l'app (${o.runtime}) n'est pas là — réinstalle l'app Brigade`)} >&2
  exit 70
}
exec env -i BRIGADE_STATION_DIR=${cite(o.racine)} HOME=${cite(o.maison)} PATH=${cite(o.chemin)} LANG=en_US.UTF-8 \${USER:+"USER=$USER"} \${LOGNAME:+"LOGNAME=$LOGNAME"} \${TMPDIR:+"TMPDIR=$TMPDIR"} \${TERM:+"TERM=$TERM"} ${cite(o.node)} src/station/geste.ts "$@"
`;
}

// Pose la commande ; rend son chemin, ou rien si ce poste n'en reçoit pas ou si l'écriture échoue
// (l'app démarre quand même : la commande manque, elle n'arrête rien).
export function poserLaCommande(o: OptionsCommande, ecrire: (message: string) => void = console.error): string | undefined {
  if (o.plateforme !== "darwin" || !o.installee) return undefined;
  const fichier = join(o.maison, ".local", "bin", "brigade");
  const dossier = dirname(fichier);
  const texte = texteDeLaCommande(o);
  try {
    let present: string | undefined;
    try {
      present = readFileSync(fichier, "utf8");
    } catch {
      present = undefined;
    }
    if (present === texte) return fichier;
    mkdirSync(dossier, { recursive: true });
    const provisoire = `${fichier}.${process.pid}.tmp`;
    writeFileSync(provisoire, texte);
    chmodSync(provisoire, 0o755);
    renameSync(provisoire, fichier);
    return fichier;
  } catch (erreur) {
    ecrire(`brigade : la commande ${fichier} n'a pas pu être écrite — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return undefined;
  }
}
