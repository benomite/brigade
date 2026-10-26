// Le guichet des téléphones : ce qu'une station qui tourne ouvre au téléphone
// du chef (#1160). Un serveur HTTP qui écoute, et n'ouvre rien : c'est le
// téléphone qui le joint.
//
//   POST /pairing     {"code", "name", "machine"}
//       le téléphone s'appaire avec le code que la station a tiré
//       (`appairage-cli.ts code`) : 201 {"paired": true, "station", "token"},
//       ou {"paired": false, "reason", "said"} — 400 une demande mal formée,
//       403 un code faux, expiré ou déjà servi, 409 un nom pris, 429 trop
//       d'essais ratés. Refusé, rien n'est écrit.
//   GET /stations     Authorization: Bearer <token>
//       la liste des stations du registre, téléphones compris :
//       200 {"stations": [...]}. Sans jeton valable : 401.
//   GET /projects     Authorization: Bearer <token>
//       les projets de la station, ceux qu'elle refuse compris (`projets.ts`) :
//       200 {"projects": [{"name", "repository", "state", "reason"?}, ...]}.
//       Sans jeton valable : 401.
//   GET /projects/<nom>/queue     Authorization: Bearer <token>
//       la file du projet, lue comme l'app de l'ordinateur la lit — `facts` et
//       `status` : 200 {"project", "repository", "facts", "status"} ; 404 un
//       projet que la station n'a pas ; 503 un journal qui ne se lit pas, et
//       ce que la commande en dirait. Sans jeton valable : 401, avant tout le
//       reste — un nom de projet ne se devine pas au code de la réponse.
//   POST /projects/<nom>/gestures     Authorization: Bearer <token>
//       {"gesture": "merge" | "remove" | "back-to-kitchen", "ticket": <n>}
//       un geste de la file sur un ticket — merger sa livraison, le retirer du
//       rail, le renvoyer en cuisine —, joué par la commande de la box pour
//       le même geste, par le même chemin — le renvoi en cuisine, par l'action
//       que la box joue pour son geste du tableau de la cuisine
//       (`gestes.ts`) : 200 {"done": true, "said", "detail"} ; 409 {"done":
//       false, "said", "detail"}, la commande l'a refusé, ou n'a pu le faire ;
//       400 une demande mal formée ; 404 un projet que la station n'a pas ;
//       502 une commande qui n'a pas rendu de verdict. `said` est une phrase,
//       à montrer telle quelle — celle de la commande quand elle en a dit une ;
//       `detail`, ce qui a été lancé et tout ce qu'il a écrit. Sans jeton
//       valable : 401, avant tout le reste, et rien n'est lancé.
//   GET /projects/<nom>/second     Authorization: Bearer <token>
//       la conversation avec le second du projet, celle que le second du
//       desktop reprend (`second.ts`) : 200 {"project", "session", "messages":
//       [{"from": "chef" | "second", "at", "text"}, ...], "omitted"?,
//       "answering"?, "failed"?: {"said", "detail"}}, du plus ancien au plus
//       récent ; 404 un projet que la station n'a pas ; 503 {"said"} une
//       conversation que la station ne tient pas ou ne lit pas.
//   POST /projects/<nom>/second     Authorization: Bearer <token>
//       {"text": "..."} un message du chef à ce second, qui part dans cette
//       même conversation : 202 {"sent": true, ...la conversation} dès qu'il y
//       est — `answering` tant que le second y répond ; 409 {"sent":
//       false, "said"} le second répond encore au message précédent ; 400 une
//       demande mal formée ; 404 un projet que la station n'a pas ; 503 une
//       conversation que la station ne tient pas ; 502 {"sent": false, "said",
//       "detail"} un second qui n'a pas pris le message. Sans jeton valable :
//       401, avant tout le reste, et rien ne part.
//
// Le guichet ne tire aucun code : une demande qui le joint peut venir de
// n'importe où — un relais sur la boucle locale fait passer le monde entier
// pour local. Le code se tire chez la station même, par sa commande, qui
// n'a besoin que du répertoire du registre.
//
// D'un autre réseau que celui de la station — le réseau mobile, une box
// louée ailleurs —, le téléphone le joint par le tailnet du chef (`tailnet.ts`) : le
// guichet écoute sur la boucle locale, et `tailscale serve` le publie. Rien ne
// change ici : ce qui passe par le tailnet arrive de la boucle, et se juge au
// code et au jeton comme le reste.
//
// Ouvert, le guichet dit où il écoute dans la base des téléphones
// (`Telephones.annoncer`) : la commande qui tire un code en tire l'adresse que
// le QR porte.
//
// Un code a 2⁴⁰ valeurs pour un quart d'heure. Le guichet en refuse les
// essais au-delà de `ESSAIS_MAX` ratés en dix minutes, d'où qu'ils viennent :
// un code à deviner se devine alors moins vite qu'il n'expire.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { LectureImpossible } from "../appel.ts";
import { ConfigInvalide } from "../runtime.ts";
import { PresentationInvalide } from "../stations-globales/registre.ts";
import { CodeRefuse, type Telephones } from "./appairage.ts";
import { estUnGeste, GESTES, type GestesDuTelephone } from "./gestes.ts";
import type { ProjetsDuTelephone } from "./projets.ts";
import type { SecondsDuTelephone } from "./second.ts";

// `node:http` pris par `process.getBuiltinModule`, pas importé : la façade ESM
// d'un module de Node lit tous ses accesseurs, et celui de `WebSocket` charge
// undici entier — 80 ms de processeur pour chaque process qui importe ce
// module, qu'il serve ou non.
const { createServer } = process.getBuiltinModule("node:http");

const CORPS_MAX = 16 * 1024;
export const ESSAIS_MAX = 20;
export const FENETRE_DES_ESSAIS_MS = 10 * 60_000;

export type OptionsGuichet = {
  telephones: Telephones;
  // Les projets de la station et leur file : sans eux, la liste est vide et
  // aucune file ne se lit.
  projets?: ProjetsDuTelephone;
  // Les gestes de la file sur les projets de la station : sans eux, aucun ne
  // se joue.
  gestes?: GestesDuTelephone;
  // Le second de chaque projet : sans eux, aucune conversation ne se lit.
  seconds?: SecondsDuTelephone;
  // Zéro : un port libre, que le guichet rend.
  port: number;
  // Où il écoute. Le téléphone doit pouvoir le joindre : l'adresse du réseau
  // qui les relie, pas forcément la boucle locale.
  hote: string;
  maintenant?: () => number;
};

export type Guichet = { port: number; fermer(): Promise<void> };

// La station ouvre le guichet quand son environnement en donne l'adresse —
// `<hôte>:<port>`, `[<IPv6>]:<port>` —, et pas autrement : sans elle, rien
// n'écoute.
export const VARIABLE_GUICHET = "BRIGADE_GUICHET_TELEPHONES";

export function configGuichet(env: Record<string, string | undefined>): { hote: string; port: number } | null {
  const ecrite = env[VARIABLE_GUICHET];
  if (ecrite === undefined || ecrite === "") return null;
  const [, hote, port] = /^\[?([^\]\s]+?)\]?:([0-9]{1,5})$/.exec(ecrite) ?? [];
  if (hote === undefined || Number(port) < 1 || Number(port) > 65535) throw new ConfigInvalide(`${VARIABLE_GUICHET} vaut « ${ecrite} » — attendu <hôte>:<port>, l'adresse où le téléphone joint la station`);
  return { hote, port: Number(port) };
}

// `Bearer <jeton>` → le jeton.
function jetonDe(requete: IncomingMessage): string | null {
  const [, jeton] = /^Bearer\s+(\S+)\s*$/i.exec(requete.headers.authorization ?? "") ?? [];
  return jeton ?? null;
}

export function ouvrirGuichet(options: OptionsGuichet): Promise<Guichet> {
  const { telephones } = options;
  const maintenant = options.maintenant ?? Date.now;
  // Les instants des essais ratés des dix dernières minutes.
  let rates: number[] = [];

  const rendre = (reponse: ServerResponse, code: number, corps: unknown, entetes: Record<string, string> = {}) => {
    const texte = JSON.stringify(corps);
    reponse.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(texte), "cache-control": "no-store", ...entetes }).end(texte);
  };
  const refuser = (reponse: ServerResponse, code: number, reason: string, said: string) => rendre(reponse, code, { paired: false, reason, said });

  const appairer = (corps: string, reponse: ServerResponse) => {
    const instant = maintenant();
    rates = rates.filter((rate) => instant - rate < FENETRE_DES_ESSAIS_MS);
    if (rates.length >= ESSAIS_MAX) return refuser(reponse, 429, "essais", "too many failed pairing attempts: try again in a few minutes");
    let demande: { code?: unknown; name?: unknown; machine?: unknown };
    try {
      demande = JSON.parse(corps) as typeof demande;
    } catch {
      demande = {};
    }
    if (typeof demande?.code !== "string" || typeof demande.name !== "string" || typeof demande.machine !== "string") {
      return refuser(reponse, 400, "invalide", 'the request is not a pairing: {"code", "name", "machine"} is expected');
    }
    try {
      const { station, jeton } = telephones.appairer(demande.code, { nom: demande.name, machine: demande.machine });
      return rendre(reponse, 201, { paired: true, station, token: jeton });
    } catch (erreur) {
      if (erreur instanceof CodeRefuse) {
        if (erreur.motif !== "nom-pris") rates.push(instant);
        return refuser(reponse, erreur.motif === "nom-pris" ? 409 : 403, erreur.motif, erreur.message);
      }
      if (erreur instanceof PresentationInvalide) return refuser(reponse, 400, "invalide", erreur.message);
      throw erreur;
    }
  };

  // Une demande d'un téléphone appairé : sa méthode — GET pour une lecture —,
  // et son jeton. Rend vrai quand la demande peut être servie ; sinon la
  // réponse est déjà rendue.
  const appairee = (requete: IncomingMessage, reponse: ServerResponse, ...methodes: string[]): boolean => {
    const permises = methodes.length === 0 ? ["GET"] : methodes;
    if (!permises.includes(requete.method ?? "")) {
      rendre(reponse, 405, { said: `${permises.join(" or ")} only` }, { allow: permises.join(", ") });
      return false;
    }
    if (telephones.authentifier(jetonDe(requete)) === null) {
      rendre(reponse, 401, { said: "a paired phone's token is required: pair the phone first" }, { "www-authenticate": 'Bearer realm="brigade"' });
      return false;
    }
    return true;
  };

  const file = (encode: string, reponse: ServerResponse) => {
    let nom: string;
    try {
      nom = decodeURIComponent(encode);
    } catch {
      return rendre(reponse, 404, { said: "unknown" });
    }
    try {
      const lue = options.projets?.file(nom) ?? null;
      if (lue === null) return rendre(reponse, 404, { said: `this station has no project named “${nom}”` });
      return rendre(reponse, 200, lue);
    } catch (erreur) {
      if (erreur instanceof LectureImpossible) return rendre(reponse, 503, { said: `the station cannot read the queue of ${nom} right now — ${erreur.message}` });
      throw erreur;
    }
  };

  const geste = async (encode: string, corps: string, reponse: ServerResponse) => {
    const refus = (code: number, said: string) => rendre(reponse, code, { done: false, said });
    let nom: string;
    try {
      nom = decodeURIComponent(encode);
    } catch {
      return rendre(reponse, 404, { said: "unknown" });
    }
    let demande: { gesture?: unknown; ticket?: unknown };
    try {
      demande = JSON.parse(corps) as typeof demande;
    } catch {
      demande = {};
    }
    const attendu = `{"gesture": ${Object.keys(GESTES).map((cle) => `"${cle}"`).join(" | ")}, "ticket": <number>} is expected`;
    if (typeof demande !== "object" || demande === null) return refus(400, `the request is not a gesture: ${attendu}`);
    const { gesture, ticket } = demande;
    if (!estUnGeste(gesture)) return refus(400, `“${String(gesture)}” is not a gesture of the queue: ${attendu}`);
    if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return refus(400, `the gesture names no ticket: ${attendu}`);
    if (options.gestes === undefined) return refus(404, `this station has no project named “${nom}”`);
    const rendu = await options.gestes.jouer(nom, gesture, ticket);
    if (rendu.etat === "inconnu") return refus(404, `this station has no project named “${nom}”`);
    const code = rendu.etat === "fait" ? 200 : rendu.etat === "refuse" ? 409 : 502;
    return rendre(reponse, code, { done: rendu.etat === "fait", said: rendu.said, detail: rendu.detail });
  };

  const nomDe = (encode: string): string | null => {
    try {
      return decodeURIComponent(encode);
    } catch {
      return null;
    }
  };

  const lireLeSecond = (encode: string, reponse: ServerResponse) => {
    const nom = nomDe(encode);
    if (nom === null) return rendre(reponse, 404, { said: "unknown" });
    const lu = options.seconds?.lire(nom) ?? { etat: "inconnu" };
    if (lu.etat === "inconnu") return rendre(reponse, 404, { said: `this station has no project named “${nom}”` });
    if (lu.etat === "indisponible") return rendre(reponse, 503, { said: lu.said });
    return rendre(reponse, 200, lu.conversation);
  };

  const ecrireAuSecond = async (encode: string, corps: string, reponse: ServerResponse) => {
    const refus = (code: number, said: string, detail?: string) => rendre(reponse, code, { sent: false, said, ...(detail === undefined ? {} : { detail }) });
    const nom = nomDe(encode);
    if (nom === null) return rendre(reponse, 404, { said: "unknown" });
    let demande: { text?: unknown };
    try {
      demande = JSON.parse(corps) as typeof demande;
    } catch {
      demande = {};
    }
    const texte = typeof demande === "object" && demande !== null ? demande.text : undefined;
    if (typeof texte !== "string") return refus(400, 'the request is not a message: {"text": "<your message>"} is expected');
    if (texte.trim() === "") return refus(400, "the message is empty: nothing was sent");
    const envoi = (await options.seconds?.envoyer(nom, texte)) ?? { etat: "inconnu" };
    if (envoi.etat === "inconnu") return refus(404, `this station has no project named “${nom}”`);
    if (envoi.etat === "indisponible") return refus(503, envoi.said);
    if (envoi.etat === "occupe") return refus(409, envoi.said);
    if (envoi.etat === "en-echec") return refus(502, envoi.said, envoi.detail);
    return rendre(reponse, 202, { sent: true, ...envoi.conversation });
  };

  const trebucher = (reponse: ServerResponse, erreur: unknown) => {
    console.error(`brigade : the phone desk stumbled — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    if (!reponse.headersSent) rendre(reponse, 500, { said: "the station stumbled" });
  };

  const traiter = (requete: IncomingMessage, corps: string, reponse: ServerResponse) => {
    const chemin = (requete.url ?? "").split("?")[0] ?? "";
    if (chemin === "/pairing") {
      if (requete.method !== "POST") return rendre(reponse, 405, { said: "POST only" }, { allow: "POST" });
      return appairer(corps, reponse);
    }
    if (chemin === "/stations") {
      if (!appairee(requete, reponse)) return;
      return rendre(reponse, 200, { stations: telephones.stations() });
    }
    if (chemin === "/projects") {
      if (!appairee(requete, reponse)) return;
      return rendre(reponse, 200, { projects: options.projets?.liste() ?? [] });
    }
    const [, projet] = /^\/projects\/([^/]+)\/queue$/.exec(chemin) ?? [];
    if (projet !== undefined) {
      if (!appairee(requete, reponse)) return;
      return file(projet, reponse);
    }
    const [, duGeste] = /^\/projects\/([^/]+)\/gestures$/.exec(chemin) ?? [];
    if (duGeste !== undefined) {
      if (!appairee(requete, reponse, "POST")) return;
      return void geste(duGeste, corps, reponse).catch((erreur: unknown) => trebucher(reponse, erreur));
    }
    const [, duSecond] = /^\/projects\/([^/]+)\/second$/.exec(chemin) ?? [];
    if (duSecond !== undefined) {
      if (!appairee(requete, reponse, "GET", "POST")) return;
      if (requete.method === "GET") return lireLeSecond(duSecond, reponse);
      return void ecrireAuSecond(duSecond, corps, reponse).catch((erreur: unknown) => trebucher(reponse, erreur));
    }
    return rendre(reponse, 404, { said: "unknown" });
  };

  const serveur = createServer((requete, reponse) => {
    let corps = "";
    requete.setEncoding("utf8");
    requete.on("data", (morceau: string) => {
      corps += morceau;
      if (corps.length > CORPS_MAX) requete.destroy();
    });
    requete.on("end", () => {
      try {
        traiter(requete, corps, reponse);
      } catch (erreur) {
        trebucher(reponse, erreur);
      }
    });
  });
  return new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(options.port, options.hote, () => {
      serveur.off("error", rejeter);
      const { port } = serveur.address() as AddressInfo;
      try {
        telephones.annoncer({ hote: options.hote, port });
      } catch (erreur) {
        serveur.close();
        return rejeter(erreur);
      }
      resoudre({
        port,
        fermer: () =>
          new Promise<void>((ferme) => {
            serveur.close(() => ferme());
            serveur.closeAllConnections();
          }),
      });
    });
  });
}
