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
//
// Le guichet ne tire aucun code : une demande qui le joint peut venir de
// n'importe où — un relais sur la boucle locale fait passer le monde entier
// pour local. Le code se tire chez la station même, par sa commande, qui
// n'a besoin que du répertoire du registre.
//
// Un code a 2⁴⁰ valeurs pour un quart d'heure. Le guichet en refuse les
// essais au-delà de `ESSAIS_MAX` ratés en dix minutes, d'où qu'ils viennent :
// un code à deviner se devine alors moins vite qu'il n'expire.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigInvalide } from "../runtime.ts";
import { PresentationInvalide } from "../stations-globales/registre.ts";
import { CodeRefuse, type Telephones } from "./appairage.ts";

const CORPS_MAX = 16 * 1024;
export const ESSAIS_MAX = 20;
export const FENETRE_DES_ESSAIS_MS = 10 * 60_000;

export type OptionsGuichet = {
  telephones: Telephones;
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

  const traiter = (requete: IncomingMessage, corps: string, reponse: ServerResponse) => {
    const chemin = (requete.url ?? "").split("?")[0] ?? "";
    if (chemin === "/pairing") {
      if (requete.method !== "POST") return rendre(reponse, 405, { said: "POST only" }, { allow: "POST" });
      return appairer(corps, reponse);
    }
    if (chemin === "/stations") {
      if (requete.method !== "GET") return rendre(reponse, 405, { said: "GET only" }, { allow: "GET" });
      if (telephones.authentifier(jetonDe(requete)) === null) {
        return rendre(reponse, 401, { said: "a paired phone's token is required: pair the phone first" }, { "www-authenticate": 'Bearer realm="brigade"' });
      }
      return rendre(reponse, 200, { stations: telephones.stations() });
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
        console.error(`brigade : the phone desk stumbled — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
        if (!reponse.headersSent) rendre(reponse, 500, { said: "the station stumbled" });
      }
    });
  });
  return new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(options.port, options.hote, () => {
      serveur.off("error", rejeter);
      resoudre({
        port: (serveur.address() as AddressInfo).port,
        fermer: () =>
          new Promise<void>((ferme) => {
            serveur.close(() => ferme());
            serveur.closeAllConnections();
          }),
      });
    });
  });
}
