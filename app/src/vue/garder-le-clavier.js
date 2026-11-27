// @ts-check
// Le champ où le chef écrit garde le clavier, et sa sélection, quand la vue repose sa carte : avant de redessiner, on note
// quel champ est en main (`data-champ`) et où sont son curseur et sa sélection ; une fois posée, on les rend au champ neuf.
// Ce module ne touche pas `document` : il reçoit l'élément en main et la zone redessinée.

/**
 * @param {any} enMain l'élément qui a le clavier (`document.activeElement`)
 * @param {any} zone ce que la vue redessine : le champ n'est gardé que s'il y est
 * @returns {(posee?: any) => void} à appeler une fois la zone redessinée
 */
export function garderLeClavier(enMain, zone) {
  const champ = enMain?.dataset?.champ;
  if (champ === undefined || !zone.contains(enMain)) return () => {};
  const cle = enMain.dataset.cle;
  const { selectionStart: debut, selectionEnd: fin, selectionDirection: sens } = enMain;
  return (posee = zone) => {
    const repris = [...posee.querySelectorAll("input, textarea")].find(
      (/** @type {any} */ un) => un.dataset.champ === champ && un.dataset.cle === cle,
    );
    if (repris === undefined) return;
    repris.focus();
    if (typeof debut === "number" && typeof fin === "number") repris.setSelectionRange?.(debut, fin, sens ?? undefined);
  };
}
