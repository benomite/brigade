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
// ne charge sa première page. Le pont y appelle aussi le lecteur de QR (`scanner`, le ticket 1161), et
// le navigateur du téléphone pour un lien d'un message du second (`ouvrir`, le ticket 1426).
@CapacitorPlugin(name = "Pont")
public class Pont extends Plugin {

    static final String SCRIPT = "public/android/pont.js";

    @Override
    public void load() {
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
