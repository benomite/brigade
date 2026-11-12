// Les captures d'une livraison d'interface, sur la carte de son ticket : l'écran avant et
// après le changement, côte à côte, sans rien demander au chef. La box les donne dans
// `facts` (docs/runtime/etat-et-mesures.md, « Les faits, pour un programme » : `captures`) — chaque
// capture par son adresse sur GitHub, au commit livré, et si la livraison les porte
// toutes. Une livraison d'interface qui n'en porte pas, ou dont un écran n'a que l'une
// des deux, est dite incomplète sur la carte. Un ticket qui n'est pas d'interface n'a
// pas de `captures` : sa carte n'en dit rien, pas même une zone vide.
//
// Les adresses restent au process principal, comme celle d'une issue : la vue reçoit,
// pour chaque capture, sa légende et si elle a été livrée ; elle demande l'image par le
// ticket, l'écran et le moment. L'image est lue par le `gh` du poste — celui du chef,
// qui voit aussi un dépôt privé — et rendue à la vue en `data:` : la page ne demande
// rien au réseau.
import { echec, lancer, type Reglages } from "./question.ts";
import { refusDe, type AppelGitHub, type ReponseGitHub } from "./tableau/client.ts";

// Ce que `facts` donne des captures d'un ticket : `complet`, chaque écran a ses deux
// captures ; chaque écran, l'adresse de sa capture avant et de sa capture après — nulle,
// le cook ne l'a pas livrée.
export type CapturesLues = { complet: boolean; ecrans: Array<{ ecran: string; avant: string | null; apres: string | null }> };

export type Moment = "avant" | "apres";

// Une capture telle que la carte la pose : sa légende ; `livree`, la livraison la porte
// — sinon, sa place dit qu'elle manque ; `version`, le commit qui la porte, de quoi ne
// pas montrer l'image d'une livraison d'avant.
export type Capture = { moment: Moment; legende: string; livree: boolean; version: string };
// Les captures d'une carte : chaque écran, avant puis après. `incomplete` : la livraison
// ne les porte pas toutes, et la ligne qui le dit — `detail`, au survol, où les poser.
export type CapturesDeCarte = { ecrans: Array<{ ecran: string; avant: Capture; apres: Capture }>; incomplete?: { ligne: string; detail: string } };

const LEGENDES: Record<Moment, string> = { avant: "before", apres: "after" };
const NOMS: Record<Moment, string> = { avant: "the before screenshot", apres: "the after screenshot" };

// L'adresse d'une capture, telle que la box la donne : le fichier au commit livré.
const ADRESSE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-f]{7,64})\/([^?#]+)\?raw=true$/;
export function lireAdresse(adresse: string): { depot: string; sha: string; chemin: string } | undefined {
  const [, proprietaire, depot, sha, chemin] = ADRESSE.exec(adresse) ?? [];
  if (proprietaire === undefined || depot === undefined || sha === undefined || chemin === undefined) return undefined;
  let lu: string;
  try {
    lu = chemin.split("/").map(decodeURIComponent).join("/");
  } catch {
    return undefined;
  }
  return lu.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ? undefined : { depot: `${proprietaire}/${depot}`, sha, chemin: lu };
}

// Ce que la carte pose des captures que la box donne.
export function capturesDeCarte(lues: CapturesLues): CapturesDeCarte {
  const capture = (ecran: string, moment: Moment, adresse: string | null): Capture => ({
    moment,
    legende: ecran === "" ? LEGENDES[moment] : `${ecran} — ${LEGENDES[moment]}`,
    livree: adresse !== null,
    version: adresse === null ? "" : (lireAdresse(adresse)?.sha ?? ""),
  });
  const manquantes = lues.ecrans.flatMap(({ ecran, avant, apres }) =>
    ([["avant", avant], ["apres", apres]] as const).flatMap(([moment, adresse]) => (adresse === null ? [`${NOMS[moment]}${ecran === "" ? "" : ` of ${ecran}`}`] : [])),
  );
  const manque = lues.ecrans.length === 0 ? "no screenshot" : manquantes.join(", ");
  return {
    ecrans: lues.ecrans.map(({ ecran, avant, apres }) => ({ ecran, avant: capture(ecran, "avant", avant), apres: capture(ecran, "apres", apres) })),
    ...(lues.complet && manquantes.length === 0 && lues.ecrans.length > 0
      ? {}
      : {
          incomplete: {
            ligne: `incomplete delivery: screenshots missing — ${manque || "not all of them"}`,
            detail: "an interface ticket shows each screen it changes before and after: the cook commits docs/captures/<ticket>/<screen>-avant.png and <screen>-apres.png, taken with scripts/capture-ecran/",
          },
        }),
  };
}

// L'image d'une capture, lue par le `gh` du poste au commit livré — ou pourquoi elle ne
// l'est pas.
// `lien` : la page du fichier sur GitHub, que le chef ouvre quand l'image ne se lit pas ici — nul quand l'adresse n'est pas celle d'un fichier.
export type Image = { image: string } | { sans: string; lien?: string };
export function lienDeLaCapture(adresse: string): string | undefined {
  const lue = lireAdresse(adresse);
  return lue === undefined ? undefined : `https://github.com/${lue.depot}/blob/${lue.sha}/${lue.chemin.split("/").map(encodeURIComponent).join("/")}`;
}
// Une image qui ne se lit pas : pourquoi, et la page du fichier.
const sans = (adresse: string, pourquoi: string): Image => {
  const lien = lienDeLaCapture(adresse);
  return lien === undefined ? { sans: pourquoi } : { sans: pourquoi, lien };
};
export async function lireCapture(reglages: Reglages, adresse: string): Promise<Image> {
  const lue = lireAdresse(adresse);
  if (lue === undefined) return { sans: "the address the station gave for this screenshot is not a file on GitHub: the app does not read it" };
  const args = ["api", `repos/${lue.depot}/contents/${lue.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${lue.sha}`, "--jq", ".content"];
  const rendu = await lancer(reglages, args);
  const { erreur } = rendu;
  if (erreur !== null) return sans(adresse, echec(reglages, args, { ...rendu, erreur }));
  const contenu = rendu.sortie.replace(/\s+/g, "");
  // Au-delà d'un mégaoctet, GitHub ne rend pas le contenu d'un fichier : il est vide.
  if (contenu === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(contenu)) return sans(adresse, `$ ${reglages.gh} ${args.join(" ")} — its output is not the file's content`);
  return { image: `data:image/png;base64,${contenu}` };
}

// La même image, lue sur l'API de GitHub par le `GET` de la lecture du téléphone (lecture-github-telephone.ts), qui ne
// lance aucun `gh` : le contenu du fichier au commit livré, ou pourquoi il ne se lit pas.
export async function lireCaptureSurLAPI(appeler: AppelGitHub, adresse: string): Promise<Image> {
  const lue = lireAdresse(adresse);
  if (lue === undefined) return { sans: "the address the station gave for this screenshot is not a file on GitHub: the app does not read it" };
  const chemin = `/repos/${lue.depot}/contents/${lue.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${lue.sha}`;
  let rendu: ReponseGitHub;
  try {
    rendu = await appeler(chemin);
  } catch (erreur) {
    return sans(adresse, `GitHub did not answer for this screenshot: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  if (rendu.status !== 200) return sans(adresse, refusDe("the reading of this screenshot", rendu).message);
  const brut = typeof rendu.data === "object" && rendu.data !== null ? (rendu.data as Record<string, unknown>).content : undefined;
  const contenu = typeof brut === "string" ? brut.replace(/\s+/g, "") : "";
  // Au-delà d'un mégaoctet, GitHub ne rend pas le contenu d'un fichier : il est vide.
  if (contenu === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(contenu)) return sans(adresse, `GET ${chemin} — its answer is not the file's content`);
  return { image: `data:image/png;base64,${contenu}` };
}
