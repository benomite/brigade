// Lit une Brigade.app construite, sans Mac, et échoue si elle se nomme autrement que « Brigade » :
//  - CFBundleName et CFBundleDisplayName de l'app ;
//  - dans l'Info.plist de chaque .app sous Contents/ (l'app, ses auxiliaires), ni CFBundleName,
//    CFBundleDisplayName, CFBundleExecutable ni CFBundleIdentifier ne dit « Electron », l'identifiant
//    est sous celui de Brigade, et l'exécutable existe sous MacOS/ ;
//  - aucun fichier nommé `node` sous Resources/ : le `node` porté est renommé ;
//  - aucun agent launchd, login item ou déclaration SM* de Contents/ ne cite Electron ou la
//    Node.js Foundation, et chaque agent a une étiquette de Brigade.
// `construire.ts` le joue sur chaque paquet avant de le signer.
//
//   node app/packaging/verifier-plist.ts <Brigade.app>      sortie 0 si le nom est bon, 1 sinon
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const NOM = "Brigade";
export const IDENTIFIANT = "com.github.benomite.brigade";
const CHAMPS = ["CFBundleName", "CFBundleDisplayName"] as const;
const CHAMPS_DE_NOM = [...CHAMPS, "CFBundleExecutable", "CFBundleIdentifier"] as const;
const cle = (xml: string, nom: string) => new RegExp(`<key>${nom}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
const ELECTRON_OU_NODE = /electron|node\.js foundation/i;
const DECLARATIONS_DE_FOND = /<key>(?:SMAuthorizedClients|SMPrivilegedExecutables|SMLoginItemBundleIdentifier)<\/key>[\s\S]*?<\/(?:array|dict|string)>/g;

// Les fichiers sous `dossier`, hors `Resources/app` (du code de Brigade, pas d'Electron).
function fichiers(dossier: string, ignorer: (chemin: string) => boolean): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (ignorer(chemin)) return [];
    return entree.isDirectory() ? fichiers(chemin, ignorer) : entree.isFile() ? [chemin] : [];
  });
}

// Ce qui ne va pas dans les noms du paquet, une phrase par défaut ; rien si tout va.
export function defautsDeNom(paquet: string): string[] {
  const defauts: string[] = [];
  const lire = (chemin: string): string | undefined => {
    try {
      return readFileSync(chemin, "utf8");
    } catch (erreur) {
      defauts.push(`${chemin} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      return undefined;
    }
  };
  const plist = join(paquet, "Contents", "Info.plist");
  const xml = lire(plist);
  if (xml !== undefined)
    for (const champ of CHAMPS) {
      const valeur = cle(xml, champ);
      if (valeur !== NOM) defauts.push(`${plist}: ${champ} is ${valeur === undefined ? "missing" : `“${valeur}”`}, not “${NOM}”`);
    }
  const contenu = join(paquet, "Contents");
  const ressources = join(contenu, "Resources");
  let tout: string[] = [];
  try {
    tout = fichiers(contenu, (chemin) => chemin === join(ressources, "app"));
  } catch (erreur) {
    defauts.push(`${contenu} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  for (const chemin of tout) {
    const ici = relative(paquet, chemin);
    if (chemin.endsWith(".app/Contents/Info.plist") || chemin === plist) {
      const texte = chemin === plist ? xml : lire(chemin);
      if (texte === undefined) continue;
      for (const champ of CHAMPS_DE_NOM.filter((c) => chemin !== plist || !(CHAMPS as readonly string[]).includes(c))) if (ELECTRON_OU_NODE.test(cle(texte, champ) ?? "")) defauts.push(`${ici}: ${champ} still says “${cle(texte, champ)}”`);
      const identifiant = cle(texte, "CFBundleIdentifier") ?? "";
      if (!identifiant.startsWith(IDENTIFIANT)) defauts.push(`${ici}: CFBundleIdentifier “${identifiant}” is outside ${IDENTIFIANT}`);
      const executable = cle(texte, "CFBundleExecutable") ?? "";
      if (executable === "" || !existsSync(join(chemin, "..", "MacOS", executable))) defauts.push(`${ici}: executable “${executable}” is not in MacOS/`);
      for (const declaration of texte.match(DECLARATIONS_DE_FOND) ?? []) if (ELECTRON_OU_NODE.test(declaration)) defauts.push(`${ici}: a background declaration names Electron or Node.js Foundation`);
    } else if (/\/Library\/(LaunchAgents|LaunchDaemons|LoginItems)\/.+\.plist$/.test(chemin)) {
      const texte = lire(chemin);
      if (texte === undefined) continue;
      if (ELECTRON_OU_NODE.test(texte)) defauts.push(`${ici}: names Electron or Node.js Foundation`);
      if (!(cle(texte, "Label") ?? "").startsWith(IDENTIFIANT)) defauts.push(`${ici}: Label is outside ${IDENTIFIANT}`);
    } else if (chemin.startsWith(`${ressources}/`) && /^node(\.exe)?$/i.test(chemin.split("/").pop() ?? "")) {
      defauts.push(`${ici}: the bundled node keeps the plain “node” name`);
    }
  }
  return defauts;
}

if (import.meta.main) {
  const paquet = process.argv[2];
  if (paquet === undefined) {
    console.error("usage: verifier-plist.ts <Brigade.app>");
    process.exit(2);
  }
  const defauts = defautsDeNom(paquet);
  for (const defaut of defauts) console.error(`brigade: ${defaut}`);
  if (defauts.length > 0) process.exit(1);
  console.log(`brigade: ${paquet} is named “${NOM}”`);
}
