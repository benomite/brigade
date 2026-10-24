package com.github.benomite.brigade;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

// Le `window.brigade` de la vue, que preload.cjs pose sur le desktop : ici, le pont d'attente
// (app/android/web/pont.js), posé par la construction dans les fichiers de l'app. Il est injecté
// au début de chaque document de l'app, avant ses scripts — `load` est joué avant que la WebView
// ne charge sa première page. Le pont y appelle aussi le lecteur de QR (`scanner`, le ticket 1161), le
// navigateur du téléphone pour un lien d'un message du second (`ouvrir`, le ticket 1426), et le lien
// d'appairage qui a ouvert l'app (`lien`, le ticket 1597).
@CapacitorPlugin(name = "Pont")
public class Pont extends Plugin {

    static final String SCRIPT = "public/android/pont.js";

    // Le lien d'appairage qui a ouvert l'app — le QR d'une station scanné par l'appareil photo du
    // téléphone, hors de l'app (`brigade://pair?…`, AndroidManifest.xml) —, gardé jusqu'à ce que le pont
    // le prenne (`lien`) : l'écran d'appairage ne s'ouvre qu'une fois la vue chargée.
    private String lienRecu;
    // L'intent qui a lancé l'activité, lu par `load` : Capacitor le repasse ensuite à
    // `handleOnNewIntent`, qui ne le garde pas deux fois.
    private Intent lancement;

    @Override
    public void load() {
        // Le démarrage à froid : le lien qui lance l'app est dans l'intent de l'activité, lu ici, sans
        // dépendre de ce que Capacitor en repasse à `handleOnNewIntent`.
        lancement = getActivity().getIntent();
        recevoir(lancement);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Logger.error("Brigade", "this WebView cannot inject a script at document start: the app's view has no bridge", null);
            return;
        }
        String script;
        try (InputStream lu = getContext().getAssets().open(SCRIPT)) {
            ByteArrayOutputStream contenu = new ByteArrayOutputStream();
            byte[] morceau = new byte[8192];
            for (int n = lu.read(morceau); n != -1; n = lu.read(morceau)) contenu.write(morceau, 0, n);
            script = contenu.toString(StandardCharsets.UTF_8.name());
        } catch (IOException erreur) {
            Logger.error("Brigade", SCRIPT + " is missing from the APK: build it with app/packaging/android.ts", erreur);
            return;
        }
        WebViewCompat.addDocumentStartJavaScript(getBridge().getWebView(), script, Collections.singleton(getBridge().getLocalUrl()));
    }

    // Chacun des intents qui rouvrent l'app déjà lancée (`singleTask`).
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent != lancement) recevoir(intent);
    }

    // L'intent qui lance l'app (`load`), ou qui la rouvre (`handleOnNewIntent`) : seul un lien
    // d'appairage est gardé, et le pont averti (`lien`). Rouverte depuis les applis récentes, l'activité
    // reçoit de nouveau l'intent qui l'avait lancée : son lien a déjà servi, il ne repart pas.
    private void recevoir(Intent intent) {
        if (intent == null) return;
        Uri lu = intent.getData();
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || lu == null || !"brigade".equals(lu.getScheme())) return;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        garder(lu.toString());
        notifyListeners("lien", new JSObject());
    }

    private synchronized void garder(String lien) {
        lienRecu = lien;
    }

    private synchronized String prendre() {
        String pris = lienRecu;
        lienRecu = null;
        return pris;
    }

    // Le lien d'appairage reçu, tel quel, une fois : rend `{texte}`, ou rien s'il n'y en a pas.
    @PluginMethod
    public void lien(PluginCall call) {
        String pris = prendre();
        JSObject rendu = new JSObject();
        if (pris != null) rendu.put("texte", pris);
        call.resolve(rendu);
    }

    // Le QR que montre une station, pour appairer le téléphone : lu par le lecteur de Google Play, qui
    // ouvre l'appareil photo lui-même — l'app ne le demande pas. Rend `{texte}` ; renoncé, rien ;
    // impossible, la raison.
    @PluginMethod
    public void scanner(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();
        GmsBarcodeScanning.getClient(getActivity(), options)
            .startScan()
            .addOnSuccessListener((lu) -> {
                String texte = lu.getRawValue();
                if (texte == null) {
                    call.reject("this QR holds no text");
                    return;
                }
                JSObject rendu = new JSObject();
                rendu.put("texte", texte);
                call.resolve(rendu);
            })
            .addOnCanceledListener(() -> call.resolve(new JSObject()))
            .addOnFailureListener((erreur) -> call.reject(String.valueOf(erreur.getMessage())));
    }

    // Un lien d'un message du second, ouvert dans le navigateur du téléphone : une adresse web, rien
    // d'autre. Rend rien ; impossible, la raison.
    @PluginMethod
    public void ouvrir(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("only a web address opens in the browser");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            call.resolve();
        } catch (ActivityNotFoundException erreur) {
            call.reject("no app on this phone opens web addresses");
        }
    }
}
