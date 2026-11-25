// Les lignes que l'app écrit dans la configuration de la station
// (`station/configuration.ts`), par la station : un bloc à part, entre deux
// commentaires, que la station réécrit seule. Ce qui est hors du bloc — les
// lignes que le chef a écrites à la main — n'est jamais touché.
export const DEBUT = "# — projets ajoutés depuis l'app : la station réécrit ce bloc seule, ne l'édite pas —";
export const FIN = "# — fin des projets ajoutés depuis l'app —";

// Le texte, coupé autour du bloc. Sans bloc, il est tout entier « avant ».
function couper(texte: string): { avant: string[]; dedans: string[]; apres: string[] } {
  const lignes = texte.split("\n");
  const debut = lignes.indexOf(DEBUT);
  const fin = debut === -1 ? -1 : lignes.indexOf(FIN, debut + 1);
  if (debut === -1) return { avant: lignes, dedans: [], apres: [] };
  // Un bloc sans fin court jusqu'au bout du fichier.
  const bout = fin === -1 ? lignes.length : fin;
  return { avant: lignes.slice(0, debut), dedans: lignes.slice(debut + 1, bout), apres: fin === -1 ? [] : lignes.slice(fin + 1) };
}

const utiles = (lignes: string[]) => lignes.map((ligne) => ligne.trim()).filter((ligne) => ligne !== "" && !ligne.startsWith("#"));

// Chaque ligne une fois, la première gardée : un projet écrit plusieurs fois
// est le même projet. Les blancs d'une ligne ne la distinguent pas d'une autre.
const sansDoublons = (lignes: string[]): string[] => {
  const vues = new Set<string>();
  return lignes.filter((ligne) => {
    const cle = ligne.trim().split(/\s+/).join(" ");
    if (cle === "" || vues.has(cle)) return cle === "";
    vues.add(cle);
    return true;
  });
};

// Les lignes du bloc, chacune une fois.
export const lignesDuBloc = (texte: string): string[] => sansDoublons(utiles(couper(texte).dedans));

// Les lignes de commentaire du bloc : celles du chef.
// La réécriture les garde, telles quelles, chacune une fois : une ligne mise de
// côté (`# held-back …`) ne s'y répète pas.
export const commentairesDuBloc = (texte: string): string[] => sansDoublons(couper(texte).dedans.filter((ligne) => ligne.trim().startsWith("#")));

// Les noms de projet que le chef a écrits hors du bloc.
export const nomsHorsDuBloc = (texte: string): string[] => {
  const { avant, apres } = couper(texte);
  return utiles([...avant, ...apres]).map((ligne) => ligne.split(/\s+/)[0] ?? "");
};

// Les lignes de projet répétées hors des commentaires et des blancs ne sont
// gardées qu'une fois (la première) ; le reste du texte reste tel quel.
const dedoublerHorsDuBloc = (lignes: string[]): string[] => {
  const vues = new Set<string>();
  return lignes.filter((ligne) => {
    const cle = ligne.trim().split(/\s+/).join(" ");
    if (cle === "" || cle.startsWith("#")) return true;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
};

// Le texte, son bloc réécrit avec ces lignes, à sa place. Sans ligne, le bloc
// disparaît, sauf s'il porte des commentaires (ils restent, avant les lignes) ;
// sans bloc, il s'ajoute à la fin.
export function reecrireBloc(texte: string, lignes: string[]): string {
  const commentaires = commentairesDuBloc(texte);
  const uniques = sansDoublons(lignes);
  const bloc = uniques.length === 0 && commentaires.length === 0 ? [] : [DEBUT, ...commentaires, ...uniques, FIN];
  if (texte.split("\n").includes(DEBUT)) {
    const { avant, apres } = couper(texte);
    // Le blanc qui le séparait des lignes à la main part avec lui.
    if (bloc.length === 0 && avant.at(-1) === "") avant.pop();
    const rendu = dedoublerHorsDuBloc([...avant, ...bloc, ...apres]).join("\n");
    return rendu.endsWith("\n") || rendu === "" ? rendu : `${rendu}\n`;
  }
  if (bloc.length === 0) return texte;
  const garde = texte.replace(/\n*$/, "");
  return `${garde}${garde === "" ? "" : "\n\n"}${bloc.join("\n")}\n`;
}
