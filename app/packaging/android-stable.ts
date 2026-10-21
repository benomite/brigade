// Vérifie que l'APK Android reste une mise à jour : installé par-dessus l'ancien, il garde les données
// de l'app (appairage, projets liés). Android n'accepte cela que si l'identifiant de l'app et la clé
// de signature sont les mêmes, et si la `versionCode` croît.
//
//   node app/packaging/android-stable.ts                                   l'état du dépôt
//   node app/packaging/android-stable.ts --previous-version-code <n>      et que la versionCode dépasse <n>
//
// Il lit app/android/natif/ (build.gradle, AndroidManifest.xml, file_paths.xml) et le point fixe
// android-stable.json — l'identifiant et la source de la clé qu'on ne change pas. Sans rien écrire ni
// SDK : il imprime l'identifiant, la versionCode et la source de la signature.
//
// Codes de sortie : 0 stable, 1 un réglage a bougé ou manque, 2 option invalide.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ANDROID, NATIF } from "./android.ts";

const ICI = import.meta.dirname;
export const POINT_FIXE = join(ICI, "android-stable.json");
const APP_GRADLE = join(NATIF, "app", "build.gradle");
const MANIFESTE = join(NATIF, "app", "src", "main", "AndroidManifest.xml");
const CHEMINS_FICHIERS = join(NATIF, "app", "src", "main", "res", "xml", "file_paths.xml");
const PERMISSION_INSTALLER = "android.permission.REQUEST_INSTALL_PACKAGES";

export type PointFixe = { applicationId: string; signing: { source: string; variables: string[] } };
export type Reglages = { applicationId: string | undefined; versionCode: number | undefined; signature: string };
export type Constat = { reglages: Reglages; erreurs: string[] };

const lire = (chemin: string) => readFileSync(chemin, "utf8");

// Le Gradle sans ses commentaires : une ligne commentée ne règle rien.
const sansCommentaires = (gradle: string) => gradle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

// Le bloc `{ … }` qui suit `ouvrant` (accolades équilibrées), ou undefined.
function bloc(texte: string, ouvrant: RegExp): string | undefined {
  const debut = ouvrant.exec(texte);
  if (debut === null) return undefined;
  let profondeur = 0;
  for (let i = debut.index + debut[0].length - 1; i < texte.length; i++) {
    if (texte[i] === "{") profondeur++;
    else if (texte[i] === "}" && --profondeur === 0) return texte.slice(debut.index + debut[0].length, i);
  }
  return undefined;
}

export function verifier(precedente: number | undefined, racine = { gradle: APP_GRADLE, manifeste: MANIFESTE, chemins: CHEMINS_FICHIERS, android: ANDROID, point: POINT_FIXE }): Constat {
  const erreurs: string[] = [];
  const fixe: PointFixe = JSON.parse(lire(racine.point));
  const gradle = sansCommentaires(lire(racine.gradle));

  const id = /^\s*applicationId\s*=?\s*["']([^"']+)["']/m.exec(gradle)?.[1];
  const code = /^\s*versionCode\s*=?\s*(\d+)\s*$/m.exec(gradle)?.[1];
  const versionCode = code === undefined ? undefined : Number(code);

  if (id === undefined) erreurs.push("the application id is not declared in build.gradle (applicationId)");
  else if (id !== fixe.applicationId) erreurs.push(`the application id changed: build.gradle says ${id}, the installed app is ${fixe.applicationId} — a new id installs next to the old app instead of updating it, and loses its data`);
  const autres = [
    ["capacitor.config.json", /"appId"\s*:\s*"([^"]+)"/.exec(lire(join(racine.android, "capacitor.config.json")))?.[1]],
    ["strings.xml", /name="package_name">([^<]+)</.exec(lire(join(racine.android, "natif", "app", "src", "main", "res", "values", "strings.xml")))?.[1]],
  ] as const;
  for (const [fichier, valeur] of autres) if (valeur !== fixe.applicationId) erreurs.push(`the application id differs in ${fichier}: ${valeur ?? "none"}, not ${fixe.applicationId}`);

  if (versionCode === undefined || !Number.isSafeInteger(versionCode) || versionCode < 1) erreurs.push("the version code is not a positive integer in build.gradle (versionCode)");
  else if (precedente !== undefined && versionCode <= precedente) erreurs.push(`the version code ${versionCode} does not increase: the previous release is ${precedente}, and Android refuses to update to a version code that is not higher`);

  // La signature : une config `release` qui lit l'environnement, branchée sur le type de build release,
  // sans mot de passe, chemin de clé ni clé dans le dépôt.
  const config = bloc(gradle, /signingConfigs\s*\{[\s\S]*?\brelease\s*\{/);
  const type = bloc(gradle, /buildTypes\s*\{[\s\S]*?\brelease\s*\{/);
  if (config === undefined) erreurs.push("the signing configuration changed: build.gradle has no signingConfigs.release");
  else {
    for (const variable of fixe.signing.variables) if (!config.includes(`System.getenv('${variable}')`) && !config.includes(`System.getenv("${variable}")`)) erreurs.push(`the signing configuration changed: signingConfigs.release does not read ${variable} from the environment`);
    for (const champ of ["storePassword", "keyPassword", "keyAlias", "storeFile"]) {
      const ligne = new RegExp(`${champ}\\s*=?\\s*(.+)`).exec(config)?.[1] ?? "";
      if (/^["']/.test(ligne.trim()) || (champ === "storeFile" && /\bfile\(\s*["']/.test(ligne))) erreurs.push(`the signing configuration changed: ${champ} is written in build.gradle, it must come from the environment`);
    }
  }
  if (type === undefined || !/signingConfig\s*=?\s*signingConfigs\.release\b/.test(type)) erreurs.push("the signing configuration changed: the release build type does not use signingConfigs.release");
  const cles = existsSync(racine.android) ? trouverCles(racine.android) : [];
  if (cles.length > 0) erreurs.push(`a signing key is in the repo: ${cles.join(", ")} — keys come from the environment, never from a commit`);

  const manifeste = lire(racine.manifeste);
  if (!new RegExp(`<uses-permission[^>]*android:name="${PERMISSION_INSTALLER.replaceAll(".", "\\.")}"`).test(manifeste.replace(/<!--[\s\S]*?-->/g, ""))) erreurs.push(`the install permission is missing: AndroidManifest.xml has no ${PERMISSION_INSTALLER}`);
  const sansNotes = manifeste.replace(/<!--[\s\S]*?-->/g, "");
  const fournisseur = /<provider\b[^>]*androidx\.core\.content\.FileProvider[\s\S]*?<\/provider>/.exec(sansNotes)?.[0];
  if (fournisseur === undefined) erreurs.push("the file provider is missing: AndroidManifest.xml has no androidx.core.content.FileProvider <provider>");
  else {
    if (!/android:authorities="\$\{applicationId\}\.fileprovider"/.test(fournisseur)) erreurs.push("the file provider authority must be ${applicationId}.fileprovider");
    if (!/android:grantUriPermissions="true"/.test(fournisseur)) erreurs.push("the file provider must set grantUriPermissions=\"true\", or the installer cannot read the APK");
    if (!/android:resource="@xml\/file_paths"/.test(fournisseur)) erreurs.push("the file provider does not point to @xml/file_paths");
  }
  if (!/<(?:cache|files|external-cache|external-files)-path\b/.test(lire(racine.chemins).replace(/<!--[\s\S]*?-->/g, ""))) erreurs.push("the file provider shares no path: file_paths.xml declares none");

  return { reglages: { applicationId: id, versionCode, signature: `${fixe.signing.source} (${fixe.signing.variables.join(", ")})` }, erreurs };
}

// Les clés posées sous app/android/ (hors node_modules et build) : il n'y en a aucune à commiter.
function trouverCles(dossier: string): string[] {
  const trouvees: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.name === "node_modules" || entree.name === "build" || entree.name === ".gradle") continue;
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouvees.push(...trouverCles(chemin));
    else if (/\.(jks|keystore|p12|pfx)$/i.test(entree.name)) trouvees.push(chemin);
  }
  return trouvees;
}

if (import.meta.main) {
  let precedente: number | undefined;
  try {
    const { values } = parseArgs({ options: { "previous-version-code": { type: "string" } }, strict: true });
    if (values["previous-version-code"] !== undefined) {
      precedente = Number(values["previous-version-code"]);
      if (!/^\d+$/.test(values["previous-version-code"])) throw new Error(`the previous version code “${values["previous-version-code"]}” is not an integer`);
    }
  } catch (erreur) {
    console.error(`brigade: ${erreur instanceof Error ? erreur.message : String(erreur)} — usage: android-stable.ts [--previous-version-code <n>]`);
    process.exit(2);
  }
  const { reglages, erreurs } = verifier(precedente);
  console.log(`brigade: application id ${reglages.applicationId ?? "(none)"}`);
  console.log(`brigade: version code ${reglages.versionCode ?? "(none)"}${precedente === undefined ? "" : ` (previous ${precedente})`}`);
  console.log(`brigade: signing source ${reglages.signature}`);
  if (erreurs.length > 0) {
    for (const erreur of erreurs) console.error(`brigade: Android update not safe — ${erreur}`);
    process.exit(1);
  }
  console.log("brigade: the Android build updates in place and keeps its data");
}
