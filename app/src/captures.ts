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
import { failure, launch, type Settings } from "./question.ts";
import { refusalOf, type CallGitHub, type AnswerGitHub } from "./board/client.ts";

// Ce que `facts` donne des captures d'un ticket : `complet`, chaque écran a ses deux
// captures ; chaque écran, l'adresse de sa capture avant et de sa capture après — nulle,
// le cook ne l'a pas livrée.
export type CapturesRead = { complet: boolean; ecrans: Array<{ ecran: string; avant: string | null; apres: string | null }> };

export type Moment = "avant" | "apres";

// Une capture telle que la carte la pose : sa légende ; `livree`, la livraison la porte
// — sinon, sa place dit qu'elle manque ; `version`, le commit qui la porte, de quoi ne
// pas montrer l'image d'une livraison d'avant.
export type Capture = { moment: Moment; legende: string; livree: boolean; version: string };
// Les captures d'une carte : chaque écran, avant puis après. `incomplete` : la livraison
// ne les porte pas toutes, et la ligne qui le dit — `detail`, au survol, où les poser.
export type CapturesOfCard = { ecrans: Array<{ ecran: string; avant: Capture; apres: Capture }>; incomplete?: { ligne: string; detail: string } };

const LEGENDS: Record<Moment, string> = { avant: "before", apres: "after" };
const NAMES: Record<Moment, string> = { avant: "the before screenshot", apres: "the after screenshot" };

// L'adresse d'une capture, telle que la box la donne : le fichier au commit livré.
const ADDRESS = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-f]{7,64})\/([^?#]+)\?raw=true$/;
export function readAddress(address: string): { depot: string; sha: string; chemin: string } | undefined {
  const [, owner, repository, sha, path] = ADDRESS.exec(address) ?? [];
  if (owner === undefined || repository === undefined || sha === undefined || path === undefined) return undefined;
  let readOne: string;
  try {
    readOne = path.split("/").map(decodeURIComponent).join("/");
  } catch {
    return undefined;
  }
  return readOne.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ? undefined : { depot: `${owner}/${repository}`, sha, chemin: readOne };
}

// Ce que la carte pose des captures que la box donne.
export function capturesOfCard(readEntries: CapturesRead): CapturesOfCard {
  const capture = (screen: string, moment: Moment, address: string | null): Capture => ({
    moment,
    legende: screen === "" ? LEGENDS[moment] : `${screen} — ${LEGENDS[moment]}`,
    livree: address !== null,
    version: address === null ? "" : (readAddress(address)?.sha ?? ""),
  });
  const missing = readEntries.ecrans.flatMap(({ ecran: screen, avant: before, apres: after }) =>
    ([["avant", before], ["apres", after]] as const).flatMap(([moment, address]) => (address === null ? [`${NAMES[moment]}${screen === "" ? "" : ` of ${screen}`}`] : [])),
  );
  const lack = readEntries.ecrans.length === 0 ? "no screenshot" : missing.join(", ");
  return {
    ecrans: readEntries.ecrans.map(({ ecran: screen, avant: before, apres: after }) => ({ ecran: screen, avant: capture(screen, "avant", before), apres: capture(screen, "apres", after) })),
    ...(readEntries.complet && missing.length === 0 && readEntries.ecrans.length > 0
      ? {}
      : {
          incomplete: {
            ligne: `incomplete delivery: screenshots missing — ${lack || "not all of them"}`,
            detail: "an interface ticket shows each screen it changes before and after: the cook commits docs/captures/<ticket>/<screen>-avant.png and <screen>-apres.png, taken with scripts/capture-ecran/",
          },
        }),
  };
}

// L'image d'une capture, lue par le `gh` du poste au commit livré — ou pourquoi elle ne
// l'est pas.
// `lien` : la page du fichier sur GitHub, que le chef ouvre quand l'image ne se lit pas ici — nul quand l'adresse n'est pas celle d'un fichier.
export type Image = { image: string } | { sans: string; lien?: string };
export function linkOfTheCapture(address: string): string | undefined {
  const readEntry = readAddress(address);
  return readEntry === undefined ? undefined : `https://github.com/${readEntry.depot}/blob/${readEntry.sha}/${readEntry.chemin.split("/").map(encodeURIComponent).join("/")}`;
}
// Une image qui ne se lit pas : pourquoi, et la page du fichier.
const without = (address: string, why: string): Image => {
  const link = linkOfTheCapture(address);
  return link === undefined ? { sans: why } : { sans: why, lien: link };
};
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SHA_BLOB = /^[0-9a-f]{40,64}$/;
export async function readCapture(settings: Settings, address: string): Promise<Image> {
  const readEntry = readAddress(address);
  if (readEntry === undefined) return { sans: "the address the station gave for this screenshot is not a file on GitHub: the app does not read it" };
  const file = `repos/${readEntry.depot}/contents/${readEntry.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${readEntry.sha}`;
  const read = (path: string, jq: string) => {
    const args = ["api", path, "--jq", jq];
    return launch(settings, args).then((rendered) => ({ args, rendu: rendered }));
  };
  const first = await read(file, ".content");
  if (first.rendu.erreur !== null) return without(address, failure(settings, first.args, { ...first.rendu, erreur: first.rendu.erreur }));
  const content = first.rendu.sortie.replace(/\s+/g, "");
  if (content !== "" && BASE64.test(content)) return { image: `data:image/png;base64,${content}` };
  // Au-delà d'un mégaoctet, l'API des fichiers ne rend pas le contenu : il est vide. Le fichier se lit alors par son blob, qui le rend jusqu'à 100 Mo.
  if (content === "") {
    const fingerprint = await read(file, ".sha");
    if (fingerprint.rendu.erreur !== null) return without(address, failure(settings, fingerprint.args, { ...fingerprint.rendu, erreur: fingerprint.rendu.erreur }));
    const sha = fingerprint.rendu.sortie.trim();
    if (SHA_BLOB.test(sha)) {
      const blob = await read(`repos/${readEntry.depot}/git/blobs/${sha}`, ".content");
      if (blob.rendu.erreur !== null) return without(address, failure(settings, blob.args, { ...blob.rendu, erreur: blob.rendu.erreur }));
      const big = blob.rendu.sortie.replace(/\s+/g, "");
      if (big !== "" && BASE64.test(big)) return { image: `data:image/png;base64,${big}` };
      return without(address, `$ ${settings.gh} ${blob.args.join(" ")} — its output is not the file's content`);
    }
  }
  return without(address, `$ ${settings.gh} ${first.args.join(" ")} — its output is not the file's content`);
}

// La même image, lue sur l'API de GitHub par le `GET` de la lecture du téléphone (read-github-phone.ts), qui ne
// lance aucun `gh` : le contenu du fichier au commit livré, ou pourquoi il ne se lit pas.
export async function readCaptureOnLAPI(call: CallGitHub, address: string): Promise<Image> {
  const readEntry = readAddress(address);
  if (readEntry === undefined) return { sans: "the address the station gave for this screenshot is not a file on GitHub: the app does not read it" };
  const path = `/repos/${readEntry.depot}/contents/${readEntry.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${readEntry.sha}`;
  let rendered: AnswerGitHub;
  try {
    rendered = await call(path);
  } catch (error) {
    return without(address, `GitHub did not answer for this screenshot: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (rendered.status !== 200) return without(address, refusalOf("the reading of this screenshot", rendered).message);
  const data = typeof rendered.data === "object" && rendered.data !== null ? (rendered.data as Record<string, unknown>) : {};
  const content = typeof data.content === "string" ? data.content.replace(/\s+/g, "") : "";
  if (content !== "" && BASE64.test(content)) return { image: `data:image/png;base64,${content}` };
  // Au-delà d'un mégaoctet, l'API des fichiers ne rend pas le contenu : il est vide. Le fichier se lit alors par son blob, qui le rend jusqu'à 100 Mo.
  if (content === "" && typeof data.sha === "string" && SHA_BLOB.test(data.sha)) {
    const pathBlob = `/repos/${readEntry.depot}/git/blobs/${data.sha}`;
    let blob: AnswerGitHub;
    try {
      blob = await call(pathBlob);
    } catch (error) {
      return without(address, `GitHub did not answer for this screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (blob.status !== 200) return without(address, refusalOf("the reading of this screenshot", blob).message);
    const rawBlob = typeof blob.data === "object" && blob.data !== null ? (blob.data as Record<string, unknown>).content : undefined;
    const big = typeof rawBlob === "string" ? rawBlob.replace(/\s+/g, "") : "";
    if (big !== "" && BASE64.test(big)) return { image: `data:image/png;base64,${big}` };
    return without(address, `GET ${pathBlob} — its answer is not the file's content`);
  }
  return without(address, `GET ${path} — its answer is not the file's content`);
}
