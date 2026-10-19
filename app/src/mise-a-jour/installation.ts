// L'app installée se remplace par la version téléchargée (etat.ts). Une app ne s'écrase pas
// pendant qu'elle tourne : un installeur part à côté d'elle, détaché, et attend qu'elle soit fermée.
// Il ouvre alors le .dmg, vérifie que l'app qu'il porte est bien signée — et, quand celle qui
// tourne l'est par un développeur identifié, par le même —, la copie à côté de l'installée, prend
// sa place par deux renommages, puis la rouvre. Quoi qu'il échoue, l'app en place n'est pas touchée :
// il écrit la raison dans `echec.txt`, que l'app rouverte dit, et rouvre l'ancienne.
//
// L'installeur est un script `sh` et les outils du système (`hdiutil`, `codesign`, `ditto`, `open`) :
// rien qui dépende de l'app qu'il remplace.
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { ECHEC } from "./etat.ts";

// Ce que le .dmg porte, sous la racine de son volume : la forme qu'écrit app/packaging/.
export const APP_DU_DMG = "Brigade.app";

// Le paquet `.app` qui joue l'app, d'après son `Contents/Resources` (`process.resourcesPath`).
export const paquetDe = (ressources: string) => resolve(ressources, "..", "..");

// Pourquoi l'app ne pourrait pas se remplacer là où elle est — rien quand elle le peut.
export function installabilite(paquet: string, acceder: (chemin: string) => void = (chemin) => accessSync(chemin, constants.W_OK)): string | undefined {
  if (!paquet.endsWith(".app")) return `this app does not run from an app bundle (${paquet})`;
  if (paquet.includes("/AppTranslocation/")) return "macOS runs this app from a temporary copy: move Brigade to the Applications folder, then open it again";
  if (paquet.startsWith("/Volumes/")) return "this app runs from its disk image: drag Brigade to the Applications folder, then open it from there";
  for (const chemin of [dirname(paquet), paquet]) {
    try {
      acceder(chemin);
    } catch {
      return `this account cannot write to ${chemin}`;
    }
  }
  return undefined;
}

// Le script de l'installeur. Ses arguments : le pid de l'app à attendre, le .dmg, le paquet à
// remplacer, le dossier de la mise à jour (où écrire `echec.txt`) et le nom de l'app dans le .dmg.
// Ses outils se changent par l'environnement — les tests y mettent des doublures.
export const SCRIPT = `set -u
pid=$1 dmg=$2 paquet=$3 dossier=$4 dans_le_dmg=$5
hdiutil=\${BRIGADE_HDIUTIL:-/usr/bin/hdiutil}
codesign=\${BRIGADE_CODESIGN:-/usr/bin/codesign}
ditto=\${BRIGADE_DITTO:-/usr/bin/ditto}
ouvrir=\${BRIGADE_OPEN:-/usr/bin/open}
point="" monte="" neuve=""
echouer() {
  printf '%s\\n' "$1" > "$dossier/${ECHEC}"
  [ -n "$monte" ] && "$hdiutil" detach "$point" -force >/dev/null 2>&1
  [ -n "$point" ] && rmdir "$point" 2>/dev/null
  [ -n "$neuve" ] && rm -rf "$neuve"
  rm -f "$dmg"
  "$ouvrir" "$paquet"
  exit 1
}
# L'app se ferme : deux minutes au plus. Toujours ouverte, rien n'est remplacé ni rouvert.
n=0
while kill -0 "$pid" 2>/dev/null; do
  n=$((n + 1))
  if [ "$n" -gt 1200 ]; then
    printf '%s\\n' "the app did not quit within two minutes" > "$dossier/${ECHEC}"
    rm -f "$dmg"
    exit 1
  fi
  sleep 0.1
done
point=$(mktemp -d "\${TMPDIR:-/tmp}/brigade-mise-a-jour.XXXXXX") || echouer "no temporary folder to open the disk image"
"$hdiutil" attach -nobrowse -readonly -noautoopen -mountpoint "$point" "$dmg" >/dev/null 2>&1 || echouer "the disk image of the new version could not be opened"
monte=1
nouvelle="$point/$dans_le_dmg"
[ -d "$nouvelle" ] || echouer "the disk image does not hold $dans_le_dmg"
"$codesign" --verify --deep --strict "$nouvelle" >/dev/null 2>&1 || echouer "the new version is not correctly signed"
equipe() { "$codesign" -dv "$1" 2>&1 | sed -n 's/^TeamIdentifier=//p'; }
avant=$(equipe "$paquet")
case "$avant" in
  "" | "not set") ;;
  *) [ "$(equipe "$nouvelle")" = "$avant" ] || echouer "the new version is not signed by the same developer as this one ($avant)" ;;
esac
parent=$(dirname "$paquet")
nom=$(basename "$paquet")
neuve="$parent/.$nom.nouvelle.$$"
ancienne="$parent/.$nom.ancienne.$$"
rm -rf "$neuve" "$ancienne"
"$ditto" "$nouvelle" "$neuve" >/dev/null 2>&1 || echouer "the new version could not be copied next to the app ($parent)"
"$hdiutil" detach "$point" -force >/dev/null 2>&1
monte=""
rmdir "$point" 2>/dev/null
point=""
mv "$paquet" "$ancienne" || echouer "the app could not be moved aside to make room for the new version"
if ! mv "$neuve" "$paquet"; then
  mv "$ancienne" "$paquet"
  echouer "the new version could not take the place of the app"
fi
neuve=""
rm -rf "$ancienne"
rm -f "$dmg"
"$ouvrir" "$paquet"
`;

export type OptionsInstallation = {
  pid: number;
  dmg: string;
  paquet: string;
  dossier: string;
  env?: Record<string, string | undefined>;
};

// Ce qui lance l'installeur : le process, ses arguments et son environnement.
export function commandeDInstallation(options: OptionsInstallation): { commande: string; args: string[]; env: Record<string, string | undefined> } {
  return { commande: "/bin/sh", args: ["-c", SCRIPT, "brigade-installeur", String(options.pid), options.dmg, options.paquet, options.dossier, APP_DU_DMG], env: options.env ?? process.env };
}

// Lance l'installeur, détaché : il survit à l'app, qui doit se fermer ensuite. Lève s'il ne part pas.
export function lancerInstallation(options: OptionsInstallation): void {
  if (basename(options.paquet) === "" || !options.paquet.endsWith(".app")) throw new Error(`not an app bundle: ${options.paquet}`);
  const { commande, args, env } = commandeDInstallation(options);
  const enfant = spawn(commande, args, { detached: true, stdio: "ignore", env, cwd: options.dossier });
  enfant.on("error", () => {});
  if (enfant.pid === undefined) throw new Error("the installer could not be launched");
  enfant.unref();
}
