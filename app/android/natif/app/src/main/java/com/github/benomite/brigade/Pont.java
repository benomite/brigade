package com.github.benomite.brigade;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

// Le `window.brigade` de la vue, que preload.cjs pose sur le desktop : ici, le pont d'attente
// (app/android/web/pont.js), posé par la construction dans les fichiers de l'app. Il est injecté
// au début de chaque document de l'app, avant ses scripts — `load` est joué avant que la WebView
// ne charge sa première page. Rien d'autre ne passe par ce plugin.
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
}
