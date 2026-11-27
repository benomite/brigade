// @ts-check
// Le diagramme de la fiche d'un ticket (ticket 3773, épique 3768) : le premier bloc ```mermaid du corps de l'issue, rendu en
// diagramme sur la fiche, comme GitHub le montre sur l'issue. Un corps sans bloc ne pose rien — ni cadre vide, ni mot de
// remplacement. Un bloc que Mermaid ne sait pas lire se montre en code, sa source telle quelle : jamais une erreur, et la
// fiche s'ouvre quand même. Sa peau est dans `fiche-diagramme.css`, à côté.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux ;
// le moteur de rendu est injecté de même — celui de l'app est Mermaid, chargé par index.html (`globalThis.mermaid`).

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {(source: string) => Promise<any>} Rendre */

// Une clôture de trois accents graves (ou plus) dite `mermaid`, en début de ligne, jusqu'à la clôture qui la ferme.
const BLOC = /^ {0,3}(`{3,})[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)\r?\n {0,3}\1`*[ \t]*$/m;

// La source du premier bloc ```mermaid du corps, sans ses clôtures ; rien s'il n'y en a pas, ou s'il est vide.
/** @param {unknown} corps @returns {string | undefined} */
export function extraireMermaid(corps) {
  if (typeof corps !== "string") return undefined;
  const source = BLOC.exec(corps)?.[2]?.replace(/\r\n?/g, "\n");
  return source === undefined || source.trim() === "" ? undefined : source;
}

// Ce que la fiche pose pour ce corps : le diagramme rendu dans son cadre, la source en code si le rendu échoue, ou rien.
/** @param {Fabrique} doc @param {unknown} corps @param {Rendre} rendre @returns {Promise<any[]>} */
export async function poserDiagrammeDeFiche(doc, corps, rendre) {
  const source = extraireMermaid(corps);
  if (source === undefined) return [];
  const cadre = doc.createElement("figure");
  cadre.className = "diagramme-de-fiche";
  try {
    cadre.append(await rendre(source));
  } catch {
    cadre.dataset.source = "true";
    cadre.title = "this diagram does not render: its source is shown as written";
    const pre = doc.createElement("pre");
    const code = doc.createElement("code");
    code.textContent = source;
    pre.append(code);
    cadre.append(pre);
  }
  return [cadre];
}

// Le moteur de l'app : Mermaid, en sécurité stricte (son SVG est assaini), aux couleurs de l'app. Il rejette quand la
// source ne se lit pas, ou quand Mermaid n'est pas chargé — la fiche montre alors la source.
let tirage = 0;
/** @param {Document} doc @returns {Rendre} */
export function rendreAvecMermaid(doc) {
  return async (source) => {
    const mermaid = /** @type {any} */ (globalThis).mermaid;
    if (mermaid === undefined) throw new Error("Mermaid is not loaded");
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "dark", fontFamily: "Archivo, system-ui, sans-serif" });
    const { svg } = await mermaid.render(`diagramme-de-fiche-${++tirage}`, source);
    const lu = new DOMParser().parseFromString(svg, "text/html").body.firstElementChild;
    if (lu === null) throw new Error("Mermaid rendered nothing");
    return doc.importNode(lu, true);
  };
}

// Le diagramme d'une fiche, tenu d'une pose de la fiche à l'autre : la vue repose la fiche entière à chaque nouvelle, et
// un rendu ne se refait que si le corps a changé. Le premier appel ne pose rien et lance le rendu ; posé, `reposer` est
// appelé pour que la fiche le montre. Un rendu dépassé — le corps a changé depuis — ne repose rien.
/** @typedef {{ corps: unknown, posees: any[] }} Tenu */
/** @param {Fabrique} doc @param {Map<string, Tenu>} tenus @param {string} cle @param {unknown} corps @param {() => void} reposer @param {Rendre} rendre @returns {any[]} */
export function diagrammeTenu(doc, tenus, cle, corps, reposer, rendre) {
  const tenu = tenus.get(cle);
  if (tenu !== undefined && tenu.corps === corps) return tenu.posees;
  /** @type {Tenu} */
  const neuf = { corps, posees: [] };
  tenus.set(cle, neuf);
  void poserDiagrammeDeFiche(doc, corps, rendre).then((posees) => {
    if (tenus.get(cle) !== neuf || posees.length === 0) return;
    neuf.posees = posees;
    reposer();
  });
  return [];
}
