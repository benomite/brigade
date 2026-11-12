// La trace du téléphone connecté (#3303) : l'app Android, une fois connectée au compte GitHub du chef (le ticket 2500),
// pose dans ce compte un gist secret qui porte `brigade-telephone.json` — et rien d'autre. Le desktop la lit pour ne pas
// offrir d'installer le téléphone au chef dont un téléphone est déjà connecté (vue/offre-telephone/). Aucune liaison
// directe : comme les stations (stations/document.ts), le téléphone écrit sur GitHub, le desktop y lit.
//
// Le gist : { "brigade": "telephone", "format": 1, "connecteLe": "<ISO>" }, sous la description « brigade — phone ».
// Le téléphone ne la pose qu'une fois : si un gist du compte porte déjà ce fichier, il n'écrit rien. Un téléphone
// déconnecté ne la retire pas : elle dit qu'un téléphone a été connecté à ce compte, et cela suffit à l'offre.
import type { ClientDeLaPriorite } from "./priorite.ts";
import { refusDe, type AppelGitHub } from "./tableau/client.ts";

export const FICHIER_TELEPHONE = "brigade-telephone.json";
export const DESCRIPTION_DU_TELEPHONE = "brigade — phone";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 30;

// Vrai : ce gist, tel que la liste du compte le montre, porte la trace.
export function porteLaTrace(gist: unknown): boolean {
  const fichiers = typeof gist === "object" && gist !== null ? (gist as { files?: unknown }).files : undefined;
  return typeof fichiers === "object" && fichiers !== null && FICHIER_TELEPHONE in fichiers;
}

// Ce que le fichier de la trace porte.
export const documentDuTelephone = (connecteLe: Date): string => `${JSON.stringify({ brigade: "telephone", format: 1, connecteLe: connecteLe.toISOString() }, null, 2)}\n`;

// Vrai : un gist du compte porte la trace. Lève quand GitHub refuse la liste, ou ne répond pas.
export async function traceLue(appeler: AppelGitHub): Promise<boolean> {
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const reponse = await appeler(`/gists?per_page=${PAR_PAGE}&page=${page}`);
    if (reponse.status !== 200) throw refusDe("the list of your gists", reponse);
    if (!Array.isArray(reponse.data)) throw new Error("GitHub answered the list of your gists with something that is not a list");
    if (reponse.data.some(porteLaTrace)) return true;
    if (reponse.data.length < PAR_PAGE) return false;
  }
  return false;
}

// Le téléphone connecté : la trace posée si aucun gist du compte ne la porte. Lève quand la liste ou l'écriture échoue ;
// rien n'est alors tenu pour posé, et le téléphone réessaie à sa lecture suivante.
export async function poserLaTrace({ client, maintenant }: { client: ClientDeLaPriorite; maintenant: () => Date }): Promise<void> {
  if (await traceLue(client.lire)) return;
  const reponse = await client.ecrire("POST", "/gists", { description: DESCRIPTION_DU_TELEPHONE, public: false, files: { [FICHIER_TELEPHONE]: { content: documentDuTelephone(maintenant()) } } });
  if (reponse.status !== 201) throw refusDe("the gist that says this phone is signed in", reponse);
}
