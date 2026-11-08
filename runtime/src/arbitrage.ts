// Ce qu'un runtime de projet sait de l'arbitre : où il est, et comment lui
// parler. L'arbitre est facultatif — un seul projet sur la machine n'en a pas
// besoin — et il vit sur la boucle locale, que la cloison laisse ouverte.
import type { Socket } from "node:net";
import { ATTENTE_DE_PLACE_MS, estUnPort, type Decision, type EtatArbitre, type Mot } from "./arbitre.ts";
import { lire } from "./plafonds.ts";

// `node:http` pris par `process.getBuiltinModule`, pas importé : la façade ESM
// d'un module de Node lit tous ses accesseurs, et celui de `WebSocket` charge
// undici entier — 80 ms de processeur pour chaque process qui importe ce
// module, qu'il serve ou non.
const { Agent, request } = process.getBuiltinModule("node:http");

// L'arbitre n'a pas répondu : connexion refusée, réponse illisible. C'est un
// fait, pas une attente — le délai n'est qu'une garde contre un arbitre figé.
export class ArbitreInjoignable extends Error {
  readonly motif: string;
  constructor(port: number, motif: string) {
    super(`arbitre injoignable sur 127.0.0.1:${port} — ${motif}`);
    this.name = "ArbitreInjoignable";
    this.motif = motif;
  }
}

// `accorde` nul : le runtime ne demandait rien, il redisait son état.
export type Reponse = { accorde: boolean | null; motif: Decision["motif"] };

export type Arbitrage = {
  port: number;
  // Redit l'état du projet ; `veut` : et demande une place.
  echanger(projet: string, mot: Mot & { veut: boolean }): Promise<Reponse>;
  // Le runtime s'arrête proprement : le projet rend sa part.
  quitter(projet: string): Promise<void>;
  // Refusé, le projet attend qu'une place s'ouvre pour lui : vrai dès qu'il y
  // passerait, faux si l'arbitre n'en a vu aucune dans son attente (#2832).
  attendreUnePlace(projet: string): Promise<boolean>;
  etat(): Promise<EtatArbitre>;
};

const DELAI_MS = 10_000;

// Le port de l'arbitre, ou null si la machine n'en a pas : le runtime tourne
// alors comme s'il était seul.
export function configArbitrage(env: NodeJS.ProcessEnv): number | null {
  const port = lire(env, "BRIGADE_ARBITER_PORT", 0, "un numéro de port, de 1 à 65535", estUnPort);
  return port === 0 ? null : port;
}

// `joindre` : pour un test, la connexion vers l'arbitre — un refus s'y joue
// sans parier sur un port que plus personne n'écouterait.
export function joindreArbitre(port: number, options: { delaiMs?: number; joindre?: (hote: string, port: number) => Socket } = {}): Arbitrage {
  const { joindre } = options;
  // Un agent à soi : celui du process passe par la porte du projet, et
  // l'arbitre est sur la boucle locale.
  const agent = new Agent({ keepAlive: false });
  if (joindre) agent.createConnection = () => joindre("127.0.0.1", port);
  // `attenteMs` : l'arbitre tient la réponse jusque-là, la garde vient après.
  const appeler = (methode: string, chemin: string, corps?: unknown, attenteMs = 0) =>
    new Promise<unknown>((resoudre, rejeter) => {
      const refuser = (motif: string) => rejeter(new ArbitreInjoignable(port, motif));
      const envoi = corps === undefined ? "" : JSON.stringify(corps);
      const delai = attenteMs + (options.delaiMs ?? DELAI_MS);
      const requete = request(
        { host: "127.0.0.1", port, method: methode, path: chemin, agent, timeout: delai, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(envoi) } },
        (reponse) => {
          let recu = "";
          reponse.setEncoding("utf8");
          reponse.on("data", (morceau: string) => void (recu += morceau));
          reponse.on("error", (erreur) => refuser(erreur.message));
          reponse.on("end", () => {
            const code = reponse.statusCode ?? 0;
            if (code < 200 || code >= 300) return refuser(`réponse ${code}`);
            if (recu === "") return resoudre(null);
            try {
              resoudre(JSON.parse(recu));
            } catch {
              refuser("réponse illisible");
            }
          });
        },
      );
      requete.on("timeout", () => requete.destroy(new Error(`aucune réponse en ${delai / 1000} s`)));
      requete.on("error", (erreur: NodeJS.ErrnoException) => refuser(erreur.code === "ECONNREFUSED" ? "connexion refusée" : erreur.message || String(erreur.code)));
      requete.end(envoi);
    });
  const lisible = <T extends object>(recu: unknown, champ: string): T => {
    if (typeof recu !== "object" || recu === null || !(champ in recu)) throw new ArbitreInjoignable(port, "réponse illisible");
    return recu as T;
  };
  return {
    port,
    echanger: async (projet, mot) => lisible<Reponse>(await appeler("POST", `/projets/${encodeURIComponent(projet)}`, mot), "accorde"),
    quitter: async (projet) => void (await appeler("DELETE", `/projets/${encodeURIComponent(projet)}`)),
    attendreUnePlace: async (projet) => lisible<{ libre: boolean }>(await appeler("POST", `/projets/${encodeURIComponent(projet)}/attendre`, undefined, ATTENTE_DE_PLACE_MS), "libre").libre === true,
    etat: async () => lisible<EtatArbitre>(await appeler("GET", "/etat"), "projets"),
  };
}
