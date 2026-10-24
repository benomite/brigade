// Les gestes de l'appairage d'un téléphone, chez la station :
//
//   code [--url <adresse du guichet>] [--registry <répertoire>]
//       un code neuf, à usage unique, pour un quart d'heure —
//       {"code", "expiresAt", "qr", "url"}. `qr` est ce que le QR porte : le
//       code, et l'adresse du guichet (`url`) où le téléphone l'envoie — sa
//       forme ne s'écrit que dans `appairage.ts` (`contenuDuQr`). Sans
//       `--url`, c'est celle du guichet que la station a ouvert sur ce
//       registre : sur le tailnet du chef quand `tailscale serve` l'y publie
//       (`tailnet.ts`) — le téléphone la joint alors de n'importe quel réseau —,
//       sinon l'adresse même où il écoute, si elle n'est pas la boucle locale.
//       Aucune des deux : `url` est nul, et le QR ne porte que le code.
//   status <code> [--registry <répertoire>]
//       où en est un code tiré : {"code", "status", "expiresAt", "usedAt",
//       "phone"}, `status` valant exactement un de `valid`, `expired` ou
//       `used` — `used` dès qu'il a servi, échu ou non. `usedAt` et `phone`,
//       le téléphone qu'il a appairé, sont nuls tant qu'il n'a pas servi. Un
//       code que la station n'a jamais tiré est refusé ; ce qui n'a pas la
//       forme d'un code est mal écrit.
//   list [--registry <répertoire>]
//       les téléphones appairés à la station, dans l'ordre de leur nom :
//       {"phones": [{"name", "machine", "pairedAt"}, ...]}.
//   revoke <nom> [--registry <répertoire>]
//       le téléphone de ce nom est retiré — perdu, donné : son jeton n'ouvre
//       plus rien, d'aucun réseau, et il quitte la liste. {"revoked": true,
//       "station"} ; un nom qui n'est pas celui d'un téléphone appairé est
//       refusé, et rien ne change.
//
// L'app du chef les lance sans terminal, par le geste de la station :
// `brigade <projet> phones …` (`telephones.ts`), par `ssh` — sa règle sudoers
// est ce qui authentifie l'ordinateur du chef, et celui qu'elle ne nomme pas
// est refusé avant que rien ne parte (`deploy/brigade`, code 68). Le téléphone
// envoie le code au guichet de la station (`guichet.ts`), qui lit la même base
// — et qui, lui, ne tire, ne liste ni ne révoque rien.
//
// Le registre est celui du chef : `--registry`, sinon BRIGADE_REGISTRE_DIR,
// sinon `$XDG_STATE_HOME/brigade` (`~/.local/state/brigade`).
//
// Fait pour un programme : la réponse est un objet JSON, sur une ligne de la
// sortie standard ; ce qui s'adresse à un humain va sur la sortie d'erreur.
// Codes de sortie : 0, servi ; 1, refusé ; 2, mal écrit.
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { normaliser } from "../appairage/document.ts";
import { DemandeInvalide, repertoireDuRegistre } from "../enrolement/enrolement.ts";
import { ouvrirTelephones, RevocationRefusee, type Ecoute, type EtatDuCode, type OptionsTelephones } from "./appairage.ts";
import { lirePublication, publicationDuGuichet } from "./tailnet.ts";

// Les gestes, et ce que chacun prend : `<code>` et `<phone>`, un argument
// avant les options.
const GESTES = {
  code: { argument: null, options: ["--url", "--registry"] },
  status: { argument: "<code>", options: ["--registry"] },
  list: { argument: null, options: ["--registry"] },
  revoke: { argument: "<phone>", options: ["--registry"] },
} as const;
type Geste = keyof typeof GESTES;
const estUnGeste = (mot: string | undefined): mot is Geste => mot !== undefined && Object.hasOwn(GESTES, mot);

// L'usage, sous la forme où la commande se lance : `lance`, ce qui précède le
// geste.
export function usage(lance = "node runtime/src/telephone/appairage-cli.ts"): string {
  const lignes = (Object.entries(GESTES) as [Geste, (typeof GESTES)[Geste]][]).map(([geste, { argument, options }]) =>
    [lance, geste, argument, ...options.map((option) => `[${option} <${option === "--url" ? "phone desk address" : "directory"}>]`)].filter((mot) => mot !== null).join(" "),
  );
  return lignes.map((ligne, rang) => `${rang === 0 ? "usage: " : "       "}${ligne}`).join("\n");
}

export const SERVI = 0;
export const REFUSE = 1;
export const MAL_ECRIT = 2;

// `status` : le mot anglais de chaque état d'un code.
const STATUTS: Record<EtatDuCode["etat"], string> = { valable: "valid", expire: "expired", utilise: "used" };

// `lirePublication` : ce que `tailscale serve` publie sur la machine — les
// tests en donnent une, sans lancer `tailscale`. `lance` : ce qui précède le
// geste dans l'usage — la commande de box en donne le sien.
export type OptionsCli = OptionsTelephones & { lirePublication?: () => Promise<unknown>; lance?: string };

// L'adresse où le téléphone joint ce guichet, et de quel réseau.
type Joint = { url: string; dit: string };

const BOUCLE = /^(127\.[0-9.]+|localhost|::1)$/;
const TOUTES = new Set(["0.0.0.0", "::"]);

async function adresseDuGuichet(ecoute: Ecoute | null, publication: () => Promise<unknown>): Promise<Joint | { url: null; dit: string }> {
  if (ecoute === null) return { url: null, dit: "no station has opened its phone desk on this registry: the QR carries the code only" };
  const publiee = publicationDuGuichet(await publication(), ecoute);
  if (publiee !== null) {
    return {
      url: publiee.url,
      dit: publiee.funnel
        ? `the phone reaches this station at ${publiee.url} from any network — Tailscale Funnel opens it to the whole internet, not only to your tailnet`
        : `the phone reaches this station at ${publiee.url} from any network, through your tailnet`,
    };
  }
  if (BOUCLE.test(ecoute.hote)) return { url: null, dit: `the phone desk listens on ${ecoute.hote}:${ecoute.port}, which only this machine reaches: publish it on your tailnet (\`tailscale serve --bg ${ecoute.port}\`) — the QR carries the code only` };
  if (TOUTES.has(ecoute.hote)) return { url: null, dit: `the phone desk listens on every address of this machine, port ${ecoute.port}: the QR carries the code only — type the address the phone reaches` };
  const url = `http://${ecoute.hote.includes(":") ? `[${ecoute.hote}]` : ecoute.hote}:${ecoute.port}`;
  return { url, dit: `the phone reaches this station at ${url} — from this network only` };
}

// Une adresse que le téléphone peut joindre : http ou https, rien d'autre.
function lireAdresse(ecrite: string): string | null {
  try {
    const url = new URL(ecrite);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export async function principal({ args, env, dire, redire }: Appel, options: OptionsCli = {}): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const USAGE = usage(options.lance);
  const [geste, ...reste] = args;
  if (!estUnGeste(geste)) echouer(MAL_ECRIT, USAGE);
  const { argument, options: permises } = GESTES[geste];
  const [lu, ...suite] = argument === null ? [undefined, ...reste] : reste;
  if (argument !== null && (lu === undefined || lu.startsWith("--"))) echouer(MAL_ECRIT, USAGE);
  if (geste === "status" && normaliser(lu ?? "") === null) echouer(MAL_ECRIT, `“${lu}” is not a pairing code — eight signs, like 7KQ2-M9XD`);
  const lues = new Map<string, string>();
  for (let i = 0; i < suite.length; i += 2) {
    const mot = suite[i] ?? "";
    if (!(permises as readonly string[]).includes(mot) || lues.has(mot) || i + 1 >= suite.length) echouer(MAL_ECRIT, USAGE);
    lues.set(mot, suite[i + 1] ?? "");
  }
  const ecrite = lues.get("--url");
  const adresse = ecrite === undefined ? undefined : (lireAdresse(ecrite) ?? echouer(MAL_ECRIT, `--url: “${ecrite}” is not an http(s) address the phone can reach`));
  let repertoire: string;
  try {
    repertoire = lues.get("--registry") ?? repertoireDuRegistre(env);
  } catch (erreur) {
    if (erreur instanceof DemandeInvalide) echouer(MAL_ECRIT, "neither BRIGADE_REGISTRE_DIR nor HOME is set: the station list has no directory");
    throw erreur;
  }
  const telephones = ouvrirTelephones(repertoire, options);
  try {
    if (geste === "revoke") {
      let retire;
      try {
        retire = telephones.revoquer(lu ?? "");
      } catch (erreur) {
        if (erreur instanceof RevocationRefusee) echouer(REFUSE, erreur.message);
        throw erreur;
      }
      dire(JSON.stringify({ revoked: true, station: retire.nom }));
      redire(`brigade : ${retire.nom} is no longer paired — its token opens nothing, from any network; pair it again with a new code`);
      return;
    }
    if (geste === "status") {
      const etat = telephones.etat(lu ?? "");
      if (etat === null) echouer(REFUSE, `no pairing code was issued here under “${lu}” — issue a new one`);
      dire(JSON.stringify({ code: etat.code, status: STATUTS[etat.etat], expiresAt: etat.expireLe, usedAt: etat.utiliseLe, phone: etat.station }));
      return;
    }
    if (geste === "list") {
      dire(JSON.stringify({ phones: telephones.appaires().map(({ nom, machine, accepteeLe }) => ({ name: nom, machine, pairedAt: accepteeLe })) }));
      return;
    }
    const joint = adresse === undefined ? await adresseDuGuichet(telephones.guichet(), options.lirePublication ?? (() => lirePublication(env))) : { url: adresse, dit: `the QR carries ${adresse}` };
    const { code, expireLe, qr } = telephones.emettre(joint.url === null ? {} : { adresse: joint.url });
    dire(JSON.stringify({ code, expiresAt: expireLe, qr, url: joint.url }));
    redire(`brigade : type ${code} on the phone, or scan its QR, before ${expireLe} — it pairs one phone, once`);
    redire(`brigade : ${joint.dit}`);
  } finally {
    telephones.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
