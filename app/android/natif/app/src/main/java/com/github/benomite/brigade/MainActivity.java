package com.github.benomite.brigade;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// L'activité de l'app : la WebView de Capacitor, qui ouvre la vue d'app/src/vue/ — celle de l'app
// desktop. Le pont d'attente, et le coffre où l'app garde son jeton GitHub (Coffre.java),
// s'enregistrent avant que le pont de Capacitor ne se construise.
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Pont.class);
        registerPlugin(Coffre.class);
        super.onCreate(savedInstanceState);
    }
}
