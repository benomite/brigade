// Le geste qui tire le code d'appairage d'un téléphone, chez la station :
//
//   code [--url <adresse du guichet>] [--registry <répertoire>]
//       un code neuf, à usage unique, pour un quart d'heure —
//       {"code", "expiresAt", "qr"}. `qr` est ce que le QR porte : le code, et
//       l'adresse du guichet (`--url`) où le téléphone l'envoie.
//
// L'app du chef le lance et montre le code, ou son QR : aucun terminal à
// ouvrir. Le téléphone l'envoie au guichet de la station (`guichet.ts`), qui
// lit la même base.
//
// Le registre est celui du chef : `--registry`, sinon BRIGADE_REGISTRE_DIR,
// sinon `$XDG_STATE_HOME/brigade` (`~/.local/state/brigade`).
//
// Fait pour un programme : la réponse est un objet JSON, sur une ligne de la
// sortie standard ; ce qui s'adresse à un humain va sur la sortie d'erreur.
// Codes de sortie : 0, servi ; 2, mal écrit.
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { DemandeInvalide, repertoireDuRegistre } from "../enrolement/enrolement.ts";
import { ouvrirTelephones, type OptionsTelephones } from "./appairage.ts";

const USAGE = "usage : node runtime/src/telephone/appairage-cli.ts code [--url <adresse du guichet>] [--registry <répertoire>]";

export const SERVI = 0;
export const MAL_ECRIT = 2;

const OPTIONS = ["--url", "--registry"];

// Une adresse que le téléphone peut joindre : http ou https, rien d'autre.
function lireAdresse(ecrite: string): string | null {
  try {
    const url = new URL(ecrite);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export async function principal({ args, env, dire, redire }: Appel, options: OptionsTelephones = {}): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [geste, ...suite] = args;
  if (geste !== "code") echouer(MAL_ECRIT, USAGE);
  const lues = new Map<string, string>();
  for (let i = 0; i < suite.length; i += 2) {
    const mot = suite[i] ?? "";
    if (!OPTIONS.includes(mot) || lues.has(mot) || i + 1 >= suite.length) echouer(MAL_ECRIT, USAGE);
    lues.set(mot, suite[i + 1] ?? "");
  }
  const ecrite = lues.get("--url");
  const adresse = ecrite === undefined ? undefined : (lireAdresse(ecrite) ?? echouer(MAL_ECRIT, `--url : « ${ecrite} » n'est pas une adresse http(s) que le téléphone puisse joindre`));
  let repertoire: string;
  try {
    repertoire = lues.get("--registry") ?? repertoireDuRegistre(env);
  } catch (erreur) {
    if (erreur instanceof DemandeInvalide) echouer(MAL_ECRIT, erreur.message);
    throw erreur;
  }
  const telephones = ouvrirTelephones(repertoire, options);
  try {
    const { code, expireLe, qr } = telephones.emettre({ adresse });
    dire(JSON.stringify({ code, expiresAt: expireLe, qr }));
    redire(`brigade : type ${code} on the phone, or scan its QR, before ${expireLe} — it pairs one phone, once`);
  } finally {
    telephones.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
