package java.lang.invoke;

/** Só para compilar lambdas contra o android.jar; o d8 remove essas chamadas (desugaring). */
public final class LambdaMetafactory {
    public static CallSite metafactory(MethodHandles.Lookup caller, String name, MethodType type,
                                       MethodType samType, MethodHandle impl, MethodType instType) {
        throw new UnsupportedOperationException();
    }

    public static CallSite altMetafactory(MethodHandles.Lookup caller, String name, MethodType type,
                                          Object... args) {
        throw new UnsupportedOperationException();
    }
}
