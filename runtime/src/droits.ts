// Qui peut lire un fichier de secrets — la clé d'une App, le jeton de la
// connexion Max, les secrets d'un projet, ce que la station garde pour elle —,
// et comment le runtime écrit les siens : au seul compte du service.
//
// Sous macOS et Linux, les bits de mode le disent : aucun pour le groupe ni pour
// les autres (`chmod 600`). Sous Windows, Node les rend toujours à 0o666 : ce
// sont les ACL du fichier qui le disent, lues et posées par .NET, depuis le
// PowerShell du système. Aussi strict que `chmod 600` : toute entrée qui accorde
// quoi que ce soit — lecture, écriture, exécution — à un autre compte que celui
// du service ou que SYSTEM (le système lui-même, comme root) ouvre le fichier,
// Administrators, Users et Everyone compris, qu'elle soit écrite sur lui ou
// héritée de son dossier. Un propriétaire étranger l'ouvre aussi : il peut s'en
// donner la lecture — sauf SYSTEM et Administrators, qui le peuvent de toute
// façon, comme root.
import { spawnSync } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Une entrée de l'ACL, telle que .NET la rend : le compte par son SID, jamais
// par un nom, qui dépend de la langue du système.
export type Regle = { sid: string; autorise: boolean; droits: number; heritageSeul: boolean };
// `compte` : le SID du compte du service. `daclNulle` : le fichier n'a pas
// d'ACL du tout, et Windows l'ouvre alors à tous.
export type Acl = { compte: string; proprietaire: string; daclNulle: boolean; regles: Regle[] };

const SYSTEM = "S-1-5-18";
const ADMINISTRATORS = "S-1-5-32-544";
// Le propriétaire, quel qu'il soit.
const OWNER_RIGHTS = "S-1-3-4";

// Les comptes et groupes que Windows connaît partout : nommés dans un refus.
const CONNUS: Record<string, string> = {
  "S-1-1-0": "Everyone",
  "S-1-2-0": "Local",
  "S-1-3-0": "Creator Owner",
  "S-1-3-1": "Creator Group",
  "S-1-3-4": "Owner Rights",
  "S-1-5-2": "Network",
  "S-1-5-4": "Interactive",
  "S-1-5-6": "Service",
  "S-1-5-7": "Anonymous Logon",
  "S-1-5-11": "Authenticated Users",
  "S-1-5-19": "Local Service",
  "S-1-5-20": "Network Service",
  "S-1-5-32-544": "Administrators",
  "S-1-5-32-545": "Users",
  "S-1-5-32-546": "Guests",
  "S-1-5-32-547": "Power Users",
  "S-1-5-32-555": "Remote Desktop Users",
};
const nommer = (sid: string) => (CONNUS[sid] ? `${CONNUS[sid]} (${sid})` : sid);
const proprietaireEtranger = (acl: Acl) => ![acl.compte, SYSTEM, ADMINISTRATORS].includes(acl.proprietaire);

// Ceux, autres que le compte du service et SYSTEM, à qui l'ACL ouvre le
// fichier. Vide : il est au seul compte du service. Une entrée qui refuse ne
// ferme rien ici : seules celles qui accordent comptent, quel que soit leur
// ordre — plus strict que Windows, jamais moins.
export function ouvertsParLAcl(acl: Acl): string[] {
  if (acl.daclNulle) return ["Everyone (S-1-1-0), le fichier n'ayant aucune ACL"];
  const permis = (sid: string) => sid === acl.compte || sid === SYSTEM || (sid === OWNER_RIGHTS && acl.proprietaire === acl.compte);
  const ouverts = new Set<string>();
  for (const regle of acl.regles) {
    // Une entrée qui ne vaut que pour ce qu'un dossier crée ne vaut pas pour le fichier.
    if (regle.autorise && !regle.heritageSeul && regle.droits !== 0 && !permis(regle.sid)) ouverts.add(nommer(regle.sid));
  }
  if (proprietaireEtranger(acl)) ouverts.add(`${nommer(acl.proprietaire)}, son propriétaire`);
  return [...ouverts];
}

// Les commandes qui remettent le fichier au seul compte du service : son ACL
// ramenée à celle du dossier, puis l'héritage coupé et le compte seul ajouté.
// Un propriétaire étranger se reprend d'abord — en administrateur.
export function remedeWindows(fichier: string, acl: Acl): string[][] {
  const etapes = [
    [fichier, "/reset"],
    [fichier, "/inheritance:r", "/grant:r", `*${acl.compte}:F`],
  ];
  return proprietaireEtranger(acl) ? [[fichier, "/setowner", `*${acl.compte}`], ...etapes] : etapes;
}

const commande = (etape: string[]) => `\`icacls ${etape.map((mot, rang) => (rang === 0 ? `"${mot}"` : mot)).join(" ")}\``;

// Le refus sous Windows, ou null : qui lit le fichier, et les commandes qui le
// ferment. `quoi` dit au chef ce que le fichier porte.
export function defautDeLAcl(fichier: string, acl: Acl, quoi: string): string | null {
  const ouverts = ouvertsParLAcl(acl);
  if (ouverts.length === 0) return null;
  return `est lisible par d'autres que le compte du service (${ouverts.join(", ")}) — ${quoi} : ${remedeWindows(fichier, acl).map(commande).join(", puis ")}`;
}

// Le PowerShell du système, par son chemin : jamais celui qu'un PATH trouverait.
const powershell = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

// Joue `script` sur `fichier`, passé par l'environnement : aucun chemin n'est
// cité dans le script. .NET seul, sans module : celui d'un PowerShell 7 parent
// (`PSModulePath`) ne se charge pas dans celui du système.
function jouer(script: string, fichier: string): string {
  const env: NodeJS.ProcessEnv = { ...process.env, BRIGADE_FICHIER_PROTEGE: fichier };
  for (const nom of Object.keys(env)) if (nom.toUpperCase() === "PSMODULEPATH") delete env[nom];
  const fait = spawnSync(powershell(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    env,
    encoding: "utf8",
    windowsHide: true,
    // Une garde large : PowerShell démarre lentement sur une machine chargée.
    timeout: 120_000,
  });
  if (fait.error) throw fait.error;
  if (fait.status !== 0) {
    const dit = `${fait.stderr ?? ""}\n${fait.stdout ?? ""}`.split(/\r?\n/).find((ligne) => ligne.trim() !== "" && !ligne.startsWith("#< CLIXML"));
    throw new Error(`PowerShell a rendu ${fait.status ?? fait.signal}${dit ? ` — ${dit.trim()}` : ""}`);
  }
  return fait.stdout;
}

const LIRE = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sid = [System.Security.Principal.SecurityIdentifier]
$acl = [System.IO.File]::GetAccessControl($env:BRIGADE_FICHIER_PROTEGE)
$regles = @($acl.GetAccessRules($true, $true, $sid) | ForEach-Object {
  @{ sid = $_.IdentityReference.Value; autorise = ($_.AccessControlType -eq 'Allow'); droits = [int]$_.FileSystemRights; heritageSeul = (([int]$_.PropagationFlags -band 2) -ne 0) }
})
$proprietaire = $acl.GetOwner($sid)
$nom = $null
if ($proprietaire) { $nom = $proprietaire.Value }
$sddl = $acl.GetSecurityDescriptorSddlForm('Access')
[Console]::Out.Write((ConvertTo-Json -Compress -Depth 4 @{
  compte = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  proprietaire = $nom
  daclNulle = (($sddl -notmatch 'D:') -or ($sddl -match 'D:[A-Z]*NO_ACCESS_CONTROL'))
  regles = $regles
}))
`;

// L'ACL de `fichier`, lue par .NET. Lève si elle ne se lit pas.
export function lireAcl(fichier: string): Acl {
  const lu = JSON.parse(jouer(LIRE, fichier)) as { compte?: unknown; proprietaire?: unknown; daclNulle?: unknown; regles?: unknown };
  if (typeof lu.compte !== "string" || typeof lu.proprietaire !== "string" || typeof lu.daclNulle !== "boolean") {
    throw new Error("PowerShell n'a rendu ni le compte, ni le propriétaire du fichier");
  }
  const regles = (lu.regles === null || lu.regles === undefined ? [] : Array.isArray(lu.regles) ? lu.regles : [lu.regles]) as Regle[];
  return { compte: lu.compte, proprietaire: lu.proprietaire, daclNulle: lu.daclNulle, regles };
}

// Pourquoi d'autres que le compte du service peuvent lire `fichier`, ou null.
// Le fichier existe : l'appelant l'a vu. `quoi` dit au chef ce qu'il porte.
// Sous Windows, une ACL qui ne se lit pas est un refus : rien n'est lu sans
// savoir qui d'autre le lit.
export function ouvertADAutres(fichier: string, quoi: string): string | null {
  if (process.platform !== "win32") {
    return (statSync(fichier).mode & 0o077) === 0 ? null : `est lisible par d'autres que le compte du service — ${quoi} : chmod 600`;
  }
  let acl: Acl;
  try {
    acl = lireAcl(fichier);
  } catch (erreur) {
    return `ne dit pas qui d'autre peut le lire (${erreur instanceof Error ? erreur.message : String(erreur)}) — ${quoi} : il n'est lu qu'au seul compte du service`;
  }
  return defautDeLAcl(fichier, acl, quoi);
}

const PROTEGER = `
$ErrorActionPreference = 'Stop'
$moi = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($moi, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)))
[System.IO.File]::SetAccessControl($env:BRIGADE_FICHIER_PROTEGE, $acl)
`;

// Ne laisse à `fichier` qu'une entrée : le compte du service, sans rien hériter
// de son dossier. Lève si Windows refuse.
export function protegerSousWindows(fichier: string): void {
  jouer(PROTEGER, fichier);
}

// Les fichiers que ce process a déjà fermés : les réécrire garde leur ACL.
const fermes = new Set<string>();

// Écrit un fichier que seul le compte du service lit. Sous macOS et Linux, créé
// en 600, comme toujours. Sous Windows, fermé avant d'y écrire quoi que ce
// soit : créé vide s'il n'existe pas, puis réduit au compte du service — une
// fois par process, ses réécritures gardant son ACL. Lève s'il ne se ferme pas :
// rien n'est écrit dans un fichier que d'autres liraient.
export function ecrireSecret(fichier: string, contenu: string): void {
  if (process.platform !== "win32") {
    writeFileSync(fichier, contenu, { mode: 0o600 });
    return;
  }
  const chemin = resolve(fichier);
  if (!fermes.has(chemin) || !existsSync(chemin)) {
    if (!existsSync(chemin)) writeFileSync(chemin, "");
    protegerSousWindows(chemin);
    fermes.add(chemin);
  }
  writeFileSync(chemin, contenu);
}
