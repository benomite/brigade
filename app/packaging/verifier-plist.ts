// Lit les Info.plist d'une Brigade.app construite et échoue si son nom n'est pas « Brigade » :
// CFBundleName et CFBundleDisplayName de l'app, et « Electron » nulle part dans ceux de ses
// auxiliaires. `construire.ts` le joue sur chaque paquet avant de le signer.
//
//   node app/packaging/verifier-plist.ts <Brigade.app>      sortie 0 si le nom est bon, 1 sinon
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const NOM = "Brigade";
const CHAMPS = ["CFBundleName", "CFBundleDisplayName"] as const;
const cle = (xml: string, nom: string) => new RegExp(`<key>${nom}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

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
  const frameworks = join(paquet, "Contents", "Frameworks");
  let auxiliaires: string[] = [];
  try {
    auxiliaires = readdirSync(frameworks).filter((nom) => nom.endsWith(".app"));
  } catch (erreur) {
    defauts.push(`${frameworks} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  for (const nom of auxiliaires) {
    const chemin = join(frameworks, nom, "Contents", "Info.plist");
    const texte = lire(chemin);
    if (texte === undefined) continue;
    for (const champ of CHAMPS) if (/electron/i.test(cle(texte, champ) ?? "")) defauts.push(`${chemin}: ${champ} still says “${cle(texte, champ)}”`);
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
