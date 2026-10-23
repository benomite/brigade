// The packages a release carries, the platform each one is for, and the release notes that say so.
//
//   node scripts/app-release/paquets.ts notes --produit app|station --version <v> [--signe] [--commit <sha>]
//   node scripts/app-release/paquets.ts renommer --version <v> --dossier <dir>
//
// `notes` writes the release notes (Markdown) on stdout: one table, a row per package, with its
// platform and the steps to open it when it is unsigned. Without `--commit` it is a dry run on
// no particular commit; nothing is published either way. `renommer` gives the files that the
// builds wrote (`Brigade-<v>-arm64.dmg`, …) the names the release carries, which include the
// platform, and rewrites the names inside `latest-mac.yml` and `latest.yml` to match.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Produit = "app" | "station";
export type Plateforme = "Mac" | "Windows" | "Linux" | "Android";

export type Paquet = {
  // The name the build writes (the updater's own, app/src/mise-a-jour/flux.ts).
  construit: string;
  // The name the release carries: it includes the platform.
  nom: string;
  plateforme: Plateforme;
  // What the package is, in a few words.
  quoi: string;
  // How to open it the first time when it is not signed.
  ouverture: string;
};

// The three unsigned-app instructions, worded as #1525 words them in the app's banner.
export const OUVERTURE: Record<Plateforme, string> = {
  Mac: "Gatekeeper blocks it: right-click Brigade in Applications, choose Open, then Open again. On macOS 15 and later, open System Settings > Privacy & Security and click Open Anyway.",
  Windows: "SmartScreen warns about an unknown app: click More info, then Run anyway.",
  Linux: "Make the file executable first: `chmod +x installer-station.sh`, then run it with `sudo ./installer-station.sh`.",
  Android: "Allow your browser or file manager to install unknown apps when Android asks, then open the file. It is signed with a debug key.",
};

export function paquetsDeLApp(version: string, signe: boolean): Paquet[] {
  return [
    { construit: `Brigade-${version}-arm64.dmg`, nom: `Brigade-${version}-mac-arm64.dmg`, plateforme: "Mac", quoi: "App, Apple silicon", ouverture: OUVERTURE.Mac },
    { construit: `Brigade-${version}-x64-setup.exe`, nom: `Brigade-${version}-windows-x64-setup.exe`, plateforme: "Windows", quoi: "App, installer", ouverture: OUVERTURE.Windows },
    // The only .apk is unsigned (debug key): the signed path builds none.
    ...(signe ? [] : [{ construit: `Brigade-${version}.apk`, nom: `Brigade-${version}-android.apk`, plateforme: "Android" as const, quoi: "App", ouverture: OUVERTURE.Android }]),
  ];
}

// The station runs on Linux only. `installer-station.sh` and `brigade-station_amd64.deb` keep their
// names: the install command (`releases/latest/download/installer-station.sh`) and the running
// stations' own update (runtime/src/mise-a-jour/publications.ts) read them by name.
export function paquetsDeLaStation(): Paquet[] {
  return [
    { construit: "installer-station.sh", nom: "installer-station.sh", plateforme: "Linux", quoi: "Station, install script", ouverture: OUVERTURE.Linux },
    { construit: "brigade-station_amd64.deb", nom: "brigade-station-linux-amd64.deb", plateforme: "Linux", quoi: "Station, Debian/Ubuntu package (amd64)", ouverture: "No executable bit to set: install it with `sudo apt install ./brigade-station-linux-amd64.deb`." },
  ];
}

export type OptionsNotes = { produit: Produit; version: string; signe: boolean; commit?: string };

const cellule = (texte: string) => texte.replaceAll("|", "\\|");

export function notes({ produit, version, signe, commit }: OptionsNotes): string {
  const paquets = produit === "app" ? paquetsDeLApp(version, signe) : paquetsDeLaStation();
  const titre = produit === "app" ? `The Brigade app ${version}` : `The Brigade station ${version}`;
  const origine = commit === undefined ? "" : `, built from the commit ${commit}`;
  // The station has no signing: its row says what to do, not that the build is unsigned.
  const etat =
    produit === "station"
      ? "The station is a Linux package: it is not signed by an app store, so there is no warning to click through."
      : signe
        ? "These builds are signed: the Mac app is notarized and the Windows installer is signed, so they open without a warning. The steps below only apply to an unsigned build."
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

function option(args: string[], nom: string): string | undefined {
  const i = args.indexOf(nom);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [commande, ...args] = process.argv.slice(2);
  const usage = () => {
    console.error("usage: paquets.ts notes --produit app|station --version <v> [--signe] [--commit <sha>]\n       paquets.ts renommer --version <v> --dossier <dir>");
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
  } else usage();
}
