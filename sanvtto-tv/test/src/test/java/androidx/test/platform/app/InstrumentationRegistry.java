package androidx.test.platform.app;

import android.app.Instrumentation;
import android.os.Bundle;

/** Stub mínimo do androidx.test (o Google Maven não é acessível no ambiente de build). */
public final class InstrumentationRegistry {
    private static Instrumentation instrumentation;
    private static Bundle args;

    public static void registerInstance(Instrumentation i, Bundle a) {
        instrumentation = i;
        args = a;
    }

    public static Instrumentation getInstrumentation() { return instrumentation; }
    public static Bundle getArguments() { return args; }
}
