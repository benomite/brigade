// L'appairage du téléphone avec une box louée ailleurs, par le tailnet du chef (#1409) : le téléphone, sur
// le réseau mobile, ne joint pas l'adresse du QR — Tailscale éteint, il ne la résout même pas. La ligne
// dit ce qui ne se joint pas, ce que le réseau en a dit et quoi vérifier au survol.
import { apresLeQr, QR_TAILNET } from "./telephone-commun.ts";

export const ecran = apresLeQr("L'appairage du téléphone par le tailnet, la box injoignable", { paired: false, reason: "injoignable", said: 'Unable to resolve host "box.tail1234.ts.net": No address associated with hostname' }, QR_TAILNET);
