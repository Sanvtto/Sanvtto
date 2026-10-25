#!/usr/bin/env bash
# Compila o APK sem Android Studio/Gradle: aapt2 + javac + d8 + apksigner.
# Requisitos (Ubuntu/Debian): sudo apt install openjdk-17-jdk aapt apksigner zipalign curl zip
set -euo pipefail
cd "$(dirname "$0")"

VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}
TOOLS=${TOOLS:-$HOME/.cache/sanvtto-tv-tools}
ANDROID_JAR=$TOOLS/android-34.jar
R8_JAR=$TOOLS/r8lib.jar
OUT=build

mkdir -p "$TOOLS"
[ -f "$ANDROID_JAR" ] || curl -fsSL -o "$ANDROID_JAR" \
  https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
[ -f "$R8_JAR" ] || curl -fsSL -o "$R8_JAR" \
  https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar

rm -rf "$OUT" && mkdir -p "$OUT"/{gen,classes,dex}

echo "» recursos"
aapt2 compile --dir res -o "$OUT/res.zip"
aapt2 link -I "$ANDROID_JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" -o "$OUT/base.apk" "$OUT/res.zip"

echo "» java"
mkdir -p "$OUT/stubs"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$OUT/stubs" \
  tools/stubs/java/lang/invoke/LambdaMetafactory.java
find src "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR:$OUT/stubs" -d "$OUT/classes" @"$OUT/sources.txt"

echo "» dex"
java -cp "$R8_JAR" com.android.tools.r8.D8 --release --min-api 21 \
  --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "» empacotando e assinando"
# Chave local, fora do git: guarde-a para que as atualizações instalem por cima.
KS=${KEYSTORE:-keystore/sanvtto.jks}
KS_PASS=${KEYSTORE_PASS:-sanvttotv}
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias sanvtto \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Sanvtto TV" >/dev/null
fi
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)
zipalign -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KS" --ks-pass pass:"$KS_PASS" --key-pass pass:"$KS_PASS" \
  --out "$OUT/sanvtto-tv.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/sanvtto-tv.apk"
echo "✓ $OUT/sanvtto-tv.apk ($(du -h "$OUT/sanvtto-tv.apk" | cut -f1))"
