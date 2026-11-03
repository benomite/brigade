// Un seul écrivain par tableau (épique #2108) : le Kitchen board d'un projet
// n'est écrit que par sa cuisine, celle de la station qui sert le projet.
//
// L'incident du 2026-11-03 : la box publiait 4 décisions qui attendaient le
// chef ; la station embarquée de l'app, sur son Mac, a ouvert une seconde
// cuisine du même dépôt, à l'état vide, et a réécrit le tableau en « Awaiting
// the chef — nothing ». Les deux cuisines se le sont ensuite disputé, minute
// après minute, et la TODO du chef clignotait.
//
// Ce module habille le client du tableau (`tableau/publication/client.ts`) :
//   - chaque corps qu'il écrit porte, après le bloc machine, la signature de la
//     station qui l'écrit — son nom et l'hôte de sa machine —, en commentaire
//     HTML que GitHub n'affiche pas et que `lireLeTableau` ne lit pas :
//
//       <!-- brigade:board-writer {"station":"box","host":"box.example"} -->
//
//   - chaque corps qu'il lit en est débarrassé : la publication compare ce
//     qu'elle a rendu à ce qu'elle trouve, sans rien savoir de la signature ;
//   - avant de réécrire ou de rouvrir un tableau qu'une autre station a signé,
//     il demande qui sert le projet, aux stations appairées du compte
//     (`appairage/stations-du-chef.ts`, la lecture que `projets/rejoindre.ts`
//     fait avant d'ouvrir une cuisine) : si celle qui l'a signé est en ligne,
//     cuisine, et publie le dépôt parmi ses projets, c'est elle qui le sert —
//     l'écriture est refusée, le tableau reste tel qu'elle l'a écrit, et le
//     refus la nomme. Sinon — elle est arrêtée, ne sert plus le dépôt (une
//     cuisine qui a déménagé), ou n'est plus au compte (une station renommée) —,
//     la station qui écrit reprend le tableau, et le signe.
//
// Ce que GitHub ne permet pas de savoir se refuse aussi : sans la liste des
// stations du compte, rien ne dit que la signataire ne sert plus le projet.
//
// Un tableau signé par cette station, ou sans signature — écrit avant ce
// module, ou retouché à la main —, s'écrit comme avant, sans rien lire de
// plus : un projet servi par une seule station ne voit aucune différence.
//
// Le refus est une erreur du client : la publication la propage, et le
// branchement du tableau la dit au journal du service, une fois, jusqu'à ce
// qu'elle change (`brancherLeTableau`). Une lecture des stations vaut
// `FRAICHEUR_MS` : une cuisine refusée ne relit pas le compte à chaque tick.
import { hostname } from "node:os";
import { lireLesStationsDuChef, type StationsDuChef } from "./appairage/stations-du-chef.ts";
import { nomDeclare } from "./station/nom.ts";
import type { ClientDuTableau, IssueDuTableau } from "./tableau/publication/client.ts";

export const OUVERTURE_DE_LA_SIGNATURE = "<!-- brigade:board-writer";
const FERMETURE_DE_LA_SIGNATURE = "-->";
const SIGNATURES = /\n?<!-- brigade:board-writer ([^\n]*?) -->/g;
// Comme dans le bloc machine : rien de ce que la signature porte ne ferme le commentaire, ni ne mentionne personne.
const ECHAPPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "@": "\\u0040" };

// Le temps pendant lequel une lecture des stations du compte tient lieu de la suivante.
export const FRAICHEUR_MS = 5 * 60_000;

// La station qui a écrit un tableau : son nom (`station/nom.ts`), celui que sa
// présence publie, et l'hôte de sa machine, pour le dire.
export type Signature = { station: string; hote: string };

export function signer(corps: string, signature: Signature): string {
  const json = JSON.stringify({ station: signature.station, host: signature.hote }).replace(/[<>&@]/g, (c) => ECHAPPES[c] ?? c);
  return `${corps}\n${OUVERTURE_DE_LA_SIGNATURE} ${json} ${FERMETURE_DE_LA_SIGNATURE}`;
}

// La signature d'un corps — la dernière, s'il y en a plusieurs —, et le corps sans elle.
export function lireLaSignature(corps: string): { corps: string; signature: Signature | null } {
  let signature: Signature | null = null;
  const sans = corps.replace(SIGNATURES, (_, json: string) => {
    try {
      const lu = JSON.parse(json) as { station?: unknown; host?: unknown };
      if (typeof lu.station === "string" && lu.station !== "") signature = { station: lu.station, hote: typeof lu.host === "string" ? lu.host : "" };
    } catch {
      // Une signature illisible ne nomme personne.
    }
    return "";
  });
  return { corps: sans, signature };
}

// Le refus : la station qui sert le projet, et pourquoi cette écriture n'a pas lieu.
export class TableauDUneAutreStation extends Error {
  readonly station: string;
  readonly hote: string;

  constructor(message: string, signataire: Signature) {
    super(message);
    this.name = "TableauDUneAutreStation";
    this.station = signataire.station;
    this.hote = signataire.hote;
  }
}

export type OptionsDuGarde = {
  // `<owner>/<repo>` : le dépôt du tableau.
  depot: string;
  // Cette station.
  soi: Signature;
  // Les stations appairées du compte, et les projets que chacune publie.
  lireLesStations: () => Promise<StationsDuChef>;
  maintenant?: () => number;
  fraicheurMs?: number;
};

const minuscules = (texte: string) => texte.toLowerCase();
const sansPoint = (texte: string) => texte.trim().replace(/[.\s]+$/, "");
const nommer = ({ station, hote }: Signature) => (hote === "" ? `station ${station}` : `station ${station} (host ${hote})`);

// Le client du tableau, sous la règle d'un seul écrivain.
export function unSeulEcrivain(client: ClientDuTableau, options: OptionsDuGarde): ClientDuTableau {
  const { depot, soi } = options;
  const maintenant = options.maintenant ?? Date.now;
  const fraicheurMs = options.fraicheurMs ?? FRAICHEUR_MS;
  // La signature de chaque tableau, à sa dernière lecture : la publication lit toujours avant d'écrire.
  const signatures = new Map<number, Signature | null>();
  let lecture: { le: number; etat: Promise<StationsDuChef> } | null = null;

  const lue = (issue: IssueDuTableau): IssueDuTableau => {
    const { corps, signature } = lireLaSignature(issue.corps);
    signatures.set(issue.numero, signature);
    return { ...issue, corps };
  };

  const stations = (): Promise<StationsDuChef> => {
    const instant = maintenant();
    if (lecture === null || instant - lecture.le >= fraicheurMs) {
      const etat = options.lireLesStations().catch((erreur: unknown): StationsDuChef => ({ state: "unavailable", cause: "github", reason: erreur instanceof Error ? erreur.message : String(erreur) }));
      lecture = { le: instant, etat };
    }
    return lecture.etat;
  };

  // Rien, si cette station peut écrire le tableau `numero` ; sinon, le refus.
  const verifier = async (numero: number, geste: string): Promise<void> => {
    const signataire = signatures.get(numero) ?? null;
    if (signataire === null || signataire.station === soi.station) return;
    const etat = await stations();
    const ici = `this ${nommer(soi)}`;
    if (etat.state !== "listed") {
      throw new TableauDUneAutreStation(`${geste} refused: the Kitchen board #${numero} of ${depot} was written by ${nommer(signataire)}, and GitHub could not tell whether it still serves the project (${sansPoint(etat.reason)}), so ${ici} leaves the board as it is and asks again later`, signataire);
    }
    const sert = etat.stations.some((station) => station.name === signataire.station && station.cooks && station.online && station.projects.some(({ repository }) => repository !== null && minuscules(repository) === minuscules(depot)));
    if (sert) {
      throw new TableauDUneAutreStation(`${geste} refused: ${depot} is served by ${nommer(signataire)}, which writes its Kitchen board #${numero} — ${ici} is not the project's serving kitchen and leaves the board as it is`, signataire);
    }
  };

  return {
    async auLabel(label) {
      return (await client.auLabel(label)).map(lue);
    },
    async issue(numero) {
      const issue = await client.issue(numero);
      if (issue === null) {
        signatures.delete(numero);
        return null;
      }
      return lue(issue);
    },
    async creer(issue) {
      const numero = await client.creer({ ...issue, corps: signer(issue.corps, soi) });
      signatures.set(numero, soi);
      return numero;
    },
    async ecrireCorps(numero, corps) {
      await verifier(numero, "board write");
      await client.ecrireCorps(numero, signer(corps, soi));
      signatures.set(numero, soi);
    },
    async rouvrir(numero) {
      await verifier(numero, "board reopening");
      await client.rouvrir(numero);
    },
    epingler: (numero) => client.epingler(numero),
  };
}

// Le garde tel qu'un runtime le branche : cette station est celle que sa
// configuration nomme (`nomDeclare`), et les stations du compte se lisent par
// le `gh` du projet.
export function unSeulEcrivainSurGitHub(client: ClientDuTableau, options: { depot: string; gh: string; env: Record<string, string | undefined> }): ClientDuTableau {
  return unSeulEcrivain(client, {
    depot: options.depot,
    soi: { station: nomDeclare(options.env), hote: hostname() },
    lireLesStations: () => lireLesStationsDuChef({ gh: options.gh }),
  });
}
