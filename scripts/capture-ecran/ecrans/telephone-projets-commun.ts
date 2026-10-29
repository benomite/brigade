// Ce que les écrans des projets du téléphone appairé partagent (#1414) : la lecture de la station telle que le pont de
// l'app Android la fait (app/android/web/lecture.ts), jouée ici telle quelle devant un guichet figé — la cuisine figée de
// `parade` et `cantine`, une station sans projet, une station qui ne répond pas, ou qui ne connaît plus ce téléphone. Les
// envois de la vue sont ceux que cette lecture fait à chaque demande de la vue : la barre posée (`faits`), « Tous les
// projets » (`tous`), un espace ouvert (`regarder`).
import { ouvrirLaLecture, type ProjetDuGuichet, type Reponse } from "../../../app/android/web/lecture.ts";
import { type Donnees, type Envoi, type Etape, MAINTENANT } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ADRESSE, demarrageDuTelephone, HAUTEUR, LARGEUR } from "./telephone-commun.ts";

export { HAUTEUR, LARGEUR };
export const STATION = "atelier";
export const PROJETS: ProjetDuGuichet[] = [
  { name: "parade", repository: "chef/parade", state: "served" },
  { name: "cantine", repository: "chef/cantine", state: "served" },
];
// La case de `parade` dans la barre, en haut sur un téléphone : son espace s'ouvre sur Rail.
export const OUVRIR_PARADE: Etape = { cliquer: '#projets > button[title^="parade — "]' };

// Le guichet de la station, tel que le vrai répond (runtime/src/telephone/guichet.ts), servant `projets`.
export function guichet(projets: ProjetDuGuichet[] = PROJETS) {
  return (chemin: string): Reponse => {
    if (chemin === "/projects") return { status: 200, data: { projects: projets } };
    const nom = decodeURIComponent(/^\/projects\/([^/]+)\/queue$/.exec(chemin)?.[1] ?? "");
    const rendu = RENDUS[nom];
    return rendu === undefined ? { status: 404, data: { said: `${nom}: no such project on this station` } } : { status: 200, data: { project: nom, repository: `chef/${nom}`, facts: rendu.facts, status: rendu.status } };
  };
}
export const INJOIGNABLE = new Error("failed to connect to /192.168.1.20 (port 7010) from /192.168.1.42 (port 41234) after 10000ms");

// Le téléphone appairé à `atelier`, relancé : `connus`, les projets de sa dernière liste lue. `repondre` : ce que son
// guichet rend à chaque chemin, ou l'erreur du réseau qui ne l'a pas joint.
export async function lireLaStation({ repondre, connus }: { repondre: (chemin: string) => Reponse | Error; connus: ProjetDuGuichet[] }): Promise<Donnees> {
  let envois: Envoi[] = [];
  const lecture = ouvrirLaLecture({
    station: STATION,
    adresse: ADRESSE,
    connus,
    maintenant: () => new Date(MAINTENANT),
    planifier: () => () => undefined,
    requete: async (chemin) => {
      const rendu = repondre(chemin);
      if (rendu instanceof Error) throw rendu;
      return rendu;
    },
    // La vue écarte ce qui ne répond pas à sa dernière demande : le faux pont y met la sienne.
    dire: ((sur: string, ...args: unknown[]) => void envois.push({ sur, args, ...(sur === "surFaits" ? { demande: "faits" as const } : {}) })) as Parameters<typeof ouvrirLaLecture>[0]["dire"],
  });
  const demarrage = { ...demarrageDuTelephone({ appaire: true, station: STATION, adresse: ADRESSE }), configuration: lecture.configuration(), telephone: lecture.telephone() };
  const pendant = async (lire: () => Promise<void>) => {
    envois = [];
    await lire();
    return envois;
  };
  const faits = await pendant(() => lecture.faits(1));
  const tous = await pendant(() => lecture.tous(1));
  const regarder: Record<string, Envoi[]> = {};
  for (const { name } of connus) regarder[name] = await pendant(() => lecture.regarder(name, 1));
  return { maintenant: MAINTENANT, reponses: { demarrage, espace: [] }, envois: { faits, tous, regarder } };
}
