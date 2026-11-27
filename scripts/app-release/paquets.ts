// The packages a release carries, the platform each one is for, and the release notes that say so.
//
//   node scripts/app-release/paquets.ts notes --produit app|station --version <v> [--signe] [--commit <sha>]
//   node scripts/app-release/paquets.ts renommer --version <v> --dossier <dir>
//   node scripts/app-release/paquets.ts fichiers --version <v> [--plateforme Mac|Windows|Linux|Android] [--signe]
//
// `notes` writes the release notes (Markdown) on stdout: one table, a row per package, with its
// platform and the steps to open it when it is unsigned. Without `--commit` it is a dry run on
// no particular commit; nothing is published either way. `renommer` gives the files that the
// builds wrote (`Brigade-<v>-arm64.dmg`, …) the names the release carries, which include the
// platform, and rewrites the names inside `latest-mac.yml` and `latest.yml` to match. `fichiers`
// prints the release names of the app's packages, one per line: `app-release-linux` uploads the
// Linux one by that name.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Produit = "app" | "station";
export type Plateforme = "Mac" | "Windows" | "Linux" | "Android";

export type Paquet = {
  // The name the build writes (the updater's own, app/src/update/flux.ts).
  construit: string;
  // The name the release carries: it includes the platform.
  nom: string;
  plateforme: Plateforme;
  // What the package is, in a few words.
  quoi: string;
  // How to open it the first time when it is not signed.
  ouverture: string;
};

// The unsigned-app instructions, worded as #1525 words them in the app's banner. The app's
// AppImage has its own (`ouvertureAppImage`).
export const OUVERTURE: Record<Exclude<Plateforme, "Linux">, string> = {
  Mac: "Gatekeeper blocks it: right-click Brigade in Applications, choose Open, then Open again. On macOS 15 and later, open System Settings > Privacy & Security and click Open Anyway.",
  Windows: "SmartScreen warns about an unknown app: click More info, then Run anyway.",
  Android: "Allow your browser or file manager to install unknown apps when Android asks, then open the file. It is signed with a debug key.",
};

// The AppImage is never signed: its row applies to both paths.
export const ouvertureAppImage = (nom: string) =>
  `Make it executable, \`chmod +x ${nom}\`, then run it. Where FUSE is missing, run it with \`--appimage-extract-and-run\`.`;

export function paquetsDeLApp(version: string, signe: boolean): Paquet[] {
  // Built by app/packaging/linux.ts under its release name, attached by app-release-linux.
  const appImage = `brigade-${version}-linux-x64.AppImage`;
  return [
    { construit: `Brigade-${version}-arm64.dmg`, nom: `Brigade-${version}-mac-arm64.dmg`, plateforme: "Mac", quoi: "App, Apple silicon", ouverture: OUVERTURE.Mac },
    { construit: `Brigade-${version}-x64-setup.exe`, nom: `Brigade-${version}-windows-x64-setup.exe`, plateforme: "Windows", quoi: "App, installer", ouverture: OUVERTURE.Windows },
    { construit: appImage, nom: appImage, plateforme: "Linux", quoi: "App, AppImage (x64)", ouverture: ouvertureAppImage(appImage) },
    // The only .apk is unsigned (debug key): the signed path builds none.
    ...(signe ? [] : [{ construit: `Brigade-${version}.apk`, nom: `Brigade-${version}-android.apk`, plateforme: "Android" as const, quoi: "App", ouverture: OUVERTURE.Android }]),
  ];
}

// The station runs on Linux and macOS, installed by the `install.sh` of its archive.
// `brigade-station_amd64.deb` keeps its name: the running stations' own update reads it by name.
// It is the one-way bridge of the boxes that still run the .deb, and can be removed once no station does.
export function paquetsDeLaStation(version = "<version>"): Paquet[] {
  return [
    { construit: "brigade-station_amd64.deb", nom: "brigade-station_amd64.deb", plateforme: "Linux", quoi: "Station, Debian/Ubuntu package (amd64): a one-way bridge to the archive", ouverture: "Only for a box that already runs the .deb: `sudo apt install ./brigade-station_amd64.deb` moves it to the archive layout (/opt/brigade-station), keeps its state and secrets, then removes itself from dpkg. It never goes back: the station updates itself from the archive." },
    { construit: `brigade-station-${version}-linux-x64.tar.gz`, nom: `brigade-station-${version}-linux-x64.tar.gz`, plateforme: "Linux", quoi: "Station, archive (x64): runtime, node, services", ouverture: "Nothing to open: its `install.sh` sets it up." },
    { construit: `brigade-station-${version}-darwin-arm64.tar.gz`, nom: `brigade-station-${version}-darwin-arm64.tar.gz`, plateforme: "Mac", quoi: "Station, archive (Apple silicon): runtime, node, services", ouverture: "Nothing to open: its `install.sh` sets it up, under your account, without sudo." },
  ];
}

export type OptionsNotes = { produit: Produit; version: string; signe: boolean; commit?: string };

const cellule = (texte: string) => texte.replaceAll("|", "\\|");

export function notes({ produit, version, signe, commit }: OptionsNotes): string {
  const paquets = produit === "app" ? paquetsDeLApp(version, signe) : paquetsDeLaStation(version);
  const titre = produit === "app" ? `The Brigade app ${version}` : `The Brigade station ${version}`;
  const origine = commit === undefined ? "" : `, built from the commit ${commit}`;
  // The station has no signing: its row says what to do, not that the build is unsigned.
  const etat =
    produit === "station"
      ? "The station is archives for Linux and macOS, each set up by its `install.sh`, and a one-way bridge package for the Debian boxes that still run the old one: nothing is signed by an app store, so there is no warning to click through."
      : signe
        ? "These builds are signed: the Mac app is notarized and the Windows installer is signed, so they open without a warning. The steps below only apply to an unsigned build, and to the Linux AppImage, which is not signed."
        : "These builds are unsigned: the first time you open one, your system warns you. Follow the steps of its row.";
  const lignes = [
    `${titre}${origine}.`,
    "",
    etat,
    "",
    "| Package | Platform | What it is | To open it when unsigned |",
    "| --- | --- | --- | --- |",
    ...paquets.map((p) => `| \`${p.nom}\` | ${p.plateforme} | ${cellule(p.quoi)} | ${cellule(p.ouverture)} |`),
    "",
  ];
  return lignes.join("\n");
}

// Renames what the builds wrote in `dossier` to the release names, and the names the updater files
// carry with them (the files' bytes, hence their sha512, do not change). Returns the new names.
export function renommer(dossier: string, version: string): string[] {
  const renommes: string[] = [];
  const paquets = paquetsDeLApp(version, false);
  for (const p of paquets) {
    const avant = join(dossier, p.construit);
    if (!existsSync(avant)) continue;
    renameSync(avant, join(dossier, p.nom));
    renommes.push(p.nom);
  }
  for (const metadonnees of ["latest-mac.yml", "latest.yml"]) {
    const chemin = join(dossier, metadonnees);
    if (!existsSync(chemin)) continue;
    let texte = readFileSync(chemin, "utf8");
    for (const p of paquets) texte = texte.replaceAll(p.construit, p.nom);
    writeFileSync(chemin, texte);
  }
  return renommes;
}

// The release names of the app's packages, for one platform or all.
export function fichiers(version: string, signe: boolean, plateforme?: Plateforme): string[] {
  return paquetsDeLApp(version, signe)
    .filter((p) => plateforme === undefined || p.plateforme === plateforme)
    .map((p) => p.nom);
}

const PLATEFORMES: readonly string[] = ["Mac", "Windows", "Linux", "Android"] satisfies Plateforme[];

function option(args: string[], nom: string): string | undefined {
  const i = args.indexOf(nom);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [commande, ...args] = process.argv.slice(2);
  const usage = () => {
    console.error(
      "usage: paquets.ts notes --produit app|station --version <v> [--signe] [--commit <sha>]\n       paquets.ts renommer --version <v> --dossier <dir>\n       paquets.ts fichiers --version <v> [--plateforme Mac|Windows|Linux|Android] [--signe]",
    );
    process.exit(2);
  };
  const version = option(args, "--version");
  if (version === undefined) usage();
  if (commande === "notes") {
    const produit = option(args, "--produit");
    if (produit !== "app" && produit !== "station") usage();
    process.stdout.write(notes({ produit: produit as Produit, version: version as string, signe: args.includes("--signe"), commit: option(args, "--commit") }));
  } else if (commande === "renommer") {
    const dossier = option(args, "--dossier");
    if (dossier === undefined) usage();
    for (const nom of renommer(dossier as string, version as string)) console.log(`renamed to ${nom}`);
  } else if (commande === "fichiers") {
    const plateforme = option(args, "--plateforme");
    if (plateforme !== undefined && !PLATEFORMES.includes(plateforme)) usage();
    for (const nom of fichiers(version as string, args.includes("--signe"), plateforme as Plateforme | undefined)) console.log(nom);
  } else usage();
}
