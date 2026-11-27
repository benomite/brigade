// @ts-check
// Le champ où le chef écrit garde le clavier, et sa sélection, quand la vue repose sa carte : avant de redessiner, on note
// quel champ est en main (`data-champ`) et où sont son curseur et sa sélection ; une fois posée, on les rend au champ neuf.
// Ce module ne touche pas `document` : il reçoit l'élément en main et la zone redessinée.

/**
 * @param {any} enMain l'élément qui a le clavier (`document.activeElement`)
 * @param {any} zone ce que la vue redessine : le champ n'est gardé que s'il y est
 * @returns {(setOne?: any) => void} à appeler une fois la zone redessinée
 */
export function keepTheKeyboard(enMain, zone) {
  const field = enMain?.dataset?.champ;
  if (field === undefined || !zone.contains(enMain)) return () => {};
  const key = enMain.dataset.cle;
  const { selectionStart: start, selectionEnd: end, selectionDirection: meaning } = enMain;
  return (setOne = zone) => {
    const resumed = [...setOne.querySelectorAll("input, textarea")].find(
      (/** @type {any} */ oneOf) => oneOf.dataset.champ === field && oneOf.dataset.cle === key,
    );
    if (resumed === undefined) return;
    resumed.focus();
    if (typeof start === "number" && typeof end === "number") resumed.setSelectionRange?.(start, end, meaning ?? undefined);
  };
}
