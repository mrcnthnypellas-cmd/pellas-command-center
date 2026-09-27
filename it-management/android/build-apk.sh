#!/usr/bin/env bash
# Builds the stand-alone Android app (android/dist/Pellas-IT-Command.apk) without Android Studio.
# Needs: Node.js, a JDK, and the Android build tools from Debian/Ubuntu:
#   sudo apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
# The signing key is android/release.keystore (created on first run, NOT committed). Keep it:
# updates of the app must be signed with the same key, or the phone refuses to install them.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
VERSION_NAME="$(node -p "require('$ROOT/package.json').version")"
VERSION_CODE="${VERSION_CODE:-$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)}"
SRC=app/src/main
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" dist

echo "1/6 Web app"
(cd "$ROOT" && node demo/build.js --app)

echo "2/6 Resources"
aapt package -f -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$SRC/assets" -I "$ANDROID_JAR" \
  -J "$OUT/gen" -F "$OUT/app.unsigned.apk" \
  --min-sdk-version 23 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

echo "3/6 Compile"
javac -nowarn -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$SRC/java" "$OUT/gen" -name '*.java') 2>&1 | grep -v "^warning: \[options\]\|^[0-9] warning" || true
[ -n "$(find "$OUT/classes" -name 'MainActivity.class')" ] || { echo "Compile failed"; exit 1; }

echo "4/6 Dex"
dalvik-exchange --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add app.unsigned.apk classes.dex >/dev/null)

echo "5/6 Align"
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"

echo "6/6 Sign"
if [ ! -f release.keystore ]; then
  PASS="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  keytool -genkeypair -keystore release.keystore -alias itcommand -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Pellas IT Command, O=Pellas, C=PH" >/dev/null 2>&1
  echo "$PASS" > release.keystore.password
  chmod 600 release.keystore release.keystore.password
  echo "   Created a new signing key: android/release.keystore (+ .password). Keep both safe."
fi
apksigner sign --ks release.keystore --ks-key-alias itcommand --ks-pass "file:release.keystore.password" \
  --min-sdk-version 23 --out "dist/Pellas-IT-Command.apk" "$OUT/app.aligned.apk"
apksigner verify --min-sdk-version 23 "dist/Pellas-IT-Command.apk"
echo "Built android/dist/Pellas-IT-Command.apk ($(du -h dist/Pellas-IT-Command.apk | cut -f1)), version $VERSION_NAME ($VERSION_CODE)"
