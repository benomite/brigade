// La comparaison des captures d'une livraison design, au moment où la pass
// pose sa carte « Validate its screen » (#3617, `retenirLeDesign`).
//
// - Chaque écran : ses captures avant et après lues au commit jugé vert, puis
//   comparées (`comparaison.ts`).
// - Un écran dont les captures ne montrent aucun changement visible —
//   identiques, ou qui ne diffèrent que par le lissage des bords — : pas de
//   carte, la livraison repart à son cook, qui capture l'état qui montre le
//   changement (`raisonSansChangement`).
// - Sinon, les images de la comparaison — la capture après, les zones
//   changées entourées, et chaque zone agrandie, avant et après côte à côte —
//   sont publiées dans un commit à part, que GitHub garde sous une référence à
//   lui (`publierFichiers`), sur aucune branche, et la carte les montre.
// - Une capture que GitHub n'a pas au commit, ou qui ne se lit pas en PNG, ne
//   se compare pas : la carte le dit pour cet écran, et se pose quand même,
//   avec ses captures. Une lecture ou une publication que GitHub ne fait pas
//   lève : la pass le dit, ne merge pas, et réessaie.
import { adresseDeCapture, dossierDesCaptures, type CapturesDEcran } from "../captures.ts";
import type { GitHub } from "../github.ts";
import { agrandir, entourer, zonesChangees, type Zone } from "./comparaison.ts";
import { ecrirePng, lirePng, PngIllisible, type Image } from "./png.ts";

export type GitHubDesComparaisons = Required<Pick<GitHub, "fichierBinaire" | "publierFichiers">>;

export const TITRE_DES_ZONES = "### Changed areas";
// Au-delà, les zones sont entourées sur la capture, sans être agrandies.
export const ZONES_AGRANDIES = 8;

export type Comparaison = { sansChangement: string[] } | { lignes: string[] };

const nomDeLEcran = (screen: string) => (screen === "" ? "the screen" : `\`${screen}\``);

// La raison du renvoi d'une livraison dont les captures ne montrent rien.
export const raisonSansChangement = (ticket: number, ecrans: readonly string[]) =>
  `the captures show no change: the before and after captures of ${ecrans.map(nomDeLEcran).join(", ")} are identical, or differ only by anti-aliasing noise, so the chef would have nothing to validate. Capture the state of the screen that shows the change — before and after with \`scripts/capture-ecran/\` —, commit them again as \`${dossierDesCaptures(ticket)}/<screen>-avant.png\` and \`${dossierDesCaptures(ticket)}/<screen>-apres.png\`, and deliver again`;

type Lu = { ecran: string; avant: Image; apres: Image } | { ecran: string; illisible: string };

async function lireLEcran(github: GitHubDesComparaisons, sha: string, { screen, before, after }: CapturesDEcran): Promise<Lu> {
  const court = sha.slice(0, 7);
  const lues: Image[] = [];
  for (const chemin of [before, after]) {
    if (chemin === null) return { ecran: screen, illisible: "one of its two captures is missing" };
    const octets = await github.fichierBinaire(chemin, sha);
    if (octets === null) return { ecran: screen, illisible: `\`${chemin}\` is not in the delivery at \`${court}\`` };
    try {
      lues.push(lirePng(octets));
    } catch (erreur) {
      if (!(erreur instanceof PngIllisible)) throw erreur;
      return { ecran: screen, illisible: `\`${chemin}\` is not a readable PNG (${erreur.message})` };
    }
  }
  const [avant, apres] = lues as [Image, Image];
  return { ecran: screen, avant, apres };
}

// Compare les captures de chaque écran de la livraison, au commit `sha`.
export async function comparerLesCaptures(github: GitHubDesComparaisons, depot: string, ticket: number, sha: string, screens: readonly CapturesDEcran[]): Promise<Comparaison> {
  const compares: Array<{ ecran: string; zones: Zone[]; avant: Image; apres: Image } | { ecran: string; illisible: string }> = [];
  for (const screen of screens) {
    const lu = await lireLEcran(github, sha, screen);
    compares.push("illisible" in lu ? lu : { ...lu, zones: zonesChangees(lu.avant, lu.apres) });
  }
  const sansChangement = compares.flatMap((compare) => ("zones" in compare && compare.zones.length === 0 ? [compare.ecran] : []));
  if (sansChangement.length > 0) return { sansChangement };

  const fichiers: Array<{ chemin: string; contenu: Uint8Array }> = [];
  const dossier = (ecran: string) => `comparison/${ticket}/${ecran === "" ? "screen" : ecran}`;
  for (const compare of compares) {
    if (!("zones" in compare)) continue;
    fichiers.push({ chemin: `${dossier(compare.ecran)}/changed-areas.png`, contenu: ecrirePng(entourer(compare.apres, compare.zones)) });
    compare.zones.slice(0, ZONES_AGRANDIES).forEach((zone, rang) => fichiers.push({ chemin: `${dossier(compare.ecran)}/area-${rang + 1}.png`, contenu: ecrirePng(agrandir(compare.avant, compare.apres, zone)) }));
  }
  const commit = fichiers.length === 0 ? null : await github.publierFichiers(fichiers, `Captures compared for the design validation of #${ticket} (${sha.slice(0, 7)})`);
  const adresse = (chemin: string) => adresseDeCapture(depot, commit ?? "", chemin);
  const lignes = [TITRE_DES_ZONES, ""];
  for (const compare of compares) {
    const titre = compare.ecran === "" ? "" : `**Screen \`${compare.ecran}\`** — `;
    if (!("zones" in compare)) {
      lignes.push(`${titre}_its captures could not be compared: ${compare.illisible}._`, "");
      continue;
    }
    const n = compare.zones.length;
    const legende = (texte: string) => (compare.ecran === "" ? texte : `${compare.ecran} — ${texte}`);
    const agrandies = compare.zones.slice(0, ZONES_AGRANDIES).map((_, rang) => `![${legende(`area ${rang + 1}, before and after`)}](${adresse(`${dossier(compare.ecran)}/area-${rang + 1}.png`)})<br>Area ${rang + 1}`);
    const reste = n > ZONES_AGRANDIES ? [`${n - ZONES_AGRANDIES} more area${n - ZONES_AGRANDIES === 1 ? "" : "s"}: outlined on the capture`] : [];
    lignes.push(
      `${titre}${n} changed area${n === 1 ? "" : "s"}, outlined in red on the after capture and enlarged next to it — before on the left, after on the right.`,
      "",
      "| After, changed areas outlined | Changed areas, enlarged: before · after |",
      "| --- | --- |",
      `| ![${legende("changed areas")}](${adresse(`${dossier(compare.ecran)}/changed-areas.png`)}) | ${[...agrandies, ...reste].join("<br><br>")} |`,
      "",
    );
  }
  return { lignes };
}
