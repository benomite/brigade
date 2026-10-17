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
export type Image = { image: string } | { sans: string };
export async function lireCapture(reglages: Reglages, adresse: string): Promise<Image> {
  const lue = lireAdresse(adresse);
  if (lue === undefined) return { sans: "the address the box gave for this screenshot is not a file on GitHub: the app does not read it" };
  const args = ["api", `repos/${lue.depot}/contents/${lue.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${lue.sha}`, "--jq", ".content"];
  const rendu = await lancer(reglages, args);
  const { erreur } = rendu;
  if (erreur !== null) return { sans: echec(reglages, args, { ...rendu, erreur }) };
  const contenu = rendu.sortie.replace(/\s+/g, "");
  // Au-delà d'un mégaoctet, GitHub ne rend pas le contenu d'un fichier : il est vide.
  if (contenu === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(contenu)) return { sans: `$ ${reglages.gh} ${args.join(" ")} — its output is not the file's content` };
  return { image: `data:image/png;base64,${contenu}` };
}
