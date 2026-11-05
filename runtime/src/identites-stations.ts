// Ranger les GitHub Apps des rôles d'une station : ce que l'app appelle quand
// le chef lui remet l'identifiant et la clé privée d'une App, pour un rôle.
// Elles vont dans le répertoire des Apps de la station (`identites.ts`,
// `repertoireDesApps`) : lui en 700, chaque fichier en 600, au seul compte du
// service — le même sur la box et sur le Mac du chef. La cuisine les lit à son
// ouverture (`configIdentites`) : un projet ouvert après coup part sous elles.
//
// La clé n'est jamais rendue : ni sur la sortie, ni dans un refus, ni dans une
// erreur. Elle arrive sur l'entrée standard — un argument se lirait dans la
// liste des process — et chacune de ses lignes est retenue par le masque des
// identifiants avant toute autre chose (`retenirCle`).
//
//   BRIGADE_STATION_DIR=<station> node src/identites-stations.ts store <rôle> <App ID> < <clé>.pem
//   BRIGADE_STATION_DIR=<station> node src/identites-stations.ts show
//
// Codes : 0, fait ; 1, refusé (clé illisible, répertoire ouvert ou mal placé) ;
// 2, l'appel ne se lit pas.
import { createPrivateKey } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { ecrireSecret } from "./droits.ts";
import { ID_D_APP, lieuInterdit, repertoireDesApps, repertoireOuvert, retenirCle, ROLES, type Role } from "./identites.ts";

// Ce que l'enregistrement refuse, quoi qu'on réessaie : son message ne cite
// jamais la clé.
export class AppRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppRefusee";
  }
}

export type AppRangee = { role: Role; id: string; repertoire: string };

const estUnRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role);

// Range l'App d'un rôle dans le répertoire des Apps de `station`, en remplaçant
// celle d'avant. Le répertoire se crée en 700 ; s'il existe déjà, ouvert à
// d'autres, rien n'est écrit et le refus le dit. Chaque fichier s'écrit à côté
// puis prend son nom : il naît en 600, jamais lu à moitié écrit.
// `env` : de quoi savoir où une clé ne doit pas aller — l'état d'un projet, ses
// sauvegardes, son dépôt (`lieuInterdit`).
export function rangerApp(options: { station: string; role: string; id: string; cle: string; env?: Record<string, string | undefined> }): AppRangee {
  retenirCle(options.cle);
  const { role, station } = options;
  const id = options.id.trim();
  if (!estUnRole(role)) throw new AppRefusee(`unknown role "${role.slice(0, 40)}" — expected one of ${ROLES.join(", ")}`);
  // Sans le citer : une clé collée à sa place y serait.
  if (!ID_D_APP.test(id)) throw new AppRefusee(`the App ID given for the ${role} role is not one — expected the App's "App ID" (a number) or its "Client ID"`);
  try {
    createPrivateKey(options.cle);
  } catch {
    // Sans le motif de `node:crypto`, ni rien de ce qui a été reçu.
    throw new AppRefusee(`the key given for the ${role} App is not a private key — expected the .pem file downloaded from the App's page`);
  }
  const repertoire = repertoireDesApps(station);
  const interdit = lieuInterdit(repertoire, options.env ?? {});
  if (interdit !== null) throw new AppRefusee(`the station's Apps directory "${repertoire}" cannot hold a key: ${interdit}`);
  const cree = mkdirSync(repertoire, { recursive: true, mode: 0o700 });
  if (cree !== undefined) {
    // Le mode, dit plutôt que laissé au masque de création du process.
    if (process.platform !== "win32") chmodSync(repertoire, 0o700);
  } else {
    const ouvert = repertoireOuvert(repertoire);
    if (ouvert !== null) throw new AppRefusee(`the station's Apps directory "${repertoire}" is open to other accounts than the service's (mode ${ouvert}) — it holds the Apps' keys: chmod 700 "${repertoire}"; nothing was written`);
  }
  const jumeau = ROLES.find((autre) => autre !== role && lireId(repertoire, autre) === id);
  if (jumeau) throw new AppRefusee(`the ${jumeau} role already has the App ${id} — one identity per role, so one App per role`);
  ecrire(repertoire, `${role}.pem`, options.cle);
  ecrire(repertoire, `${role}.id`, `${id}\n`);
  return { role, id, repertoire };
}

function ecrire(repertoire: string, fichier: string, contenu: string): void {
  const provisoire = join(repertoire, `.${fichier}.${process.pid}`);
  rmSync(provisoire, { force: true });
  try {
    ecrireSecret(provisoire, contenu);
    renameSync(provisoire, join(repertoire, fichier));
  } catch (erreur) {
    rmSync(provisoire, { force: true });
    throw erreur;
  }
}

function lireId(repertoire: string, role: Role): string | null {
  try {
    return readFileSync(join(repertoire, `${role}.id`), "utf8").trim();
  } catch {
    return null;
  }
}

// Ce que la station a de chaque rôle : son App, et si sa clé est là. Jamais la clé.
export type AppDuRole = { role: Role; id: string | null; cle: boolean };

export function appsRangees(station: string): AppDuRole[] {
  const repertoire = repertoireDesApps(station);
  return ROLES.map((role) => ({ role, id: lireId(repertoire, role), cle: existsSync(join(repertoire, `${role}.pem`)) }));
}

const USAGE = [
  "usage: BRIGADE_STATION_DIR=<station directory> node src/identites-stations.ts store <cook|pass|manager> <App ID> < <key>.pem",
  "       BRIGADE_STATION_DIR=<station directory> node src/identites-stations.ts show",
].join("\n");

async function lireLEntree(): Promise<string> {
  const morceaux: Buffer[] = [];
  for await (const morceau of process.stdin) morceaux.push(morceau as Buffer);
  return Buffer.concat(morceaux).toString("utf8");
}

export async function principal({ args, env, dire, redire }: Appel, lireCle: () => Promise<string> = lireLEntree): Promise<void> {
  const echouer = (code: number, message: string): never => {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  };
  const station = env.BRIGADE_STATION_DIR;
  if (!station) echouer(2, `BRIGADE_STATION_DIR is not set\n${USAGE}`);
  const [geste, ...reste] = args;
  if (geste === "show" && reste.length === 0) {
    for (const { role, id, cle } of appsRangees(station as string)) dire(`${role}: ${id === null ? "no App" : `App ${id}`}, ${cle ? "key stored" : "no key"}`);
    return;
  }
  if (geste !== "store" || reste.length !== 2) return echouer(2, USAGE);
  const [role, id] = reste as [string, string];
  let rangee: AppRangee;
  try {
    rangee = rangerApp({ station: station as string, role, id, cle: await lireCle(), env });
  } catch (erreur) {
    if (erreur instanceof AppRefusee) return echouer(1, erreur.message);
    // Une écriture qui échoue : son code, jamais rien de ce qui était écrit.
    return echouer(1, `the ${role} App could not be stored (${(erreur as NodeJS.ErrnoException).code ?? "error"})`);
  }
  dire(`brigade: the ${rangee.role} App (${rangee.id}) is stored in ${rangee.repertoire} — its key is not shown; projects opened from now on act under it`);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
