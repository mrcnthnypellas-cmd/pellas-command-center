# George Universal Sunbox

An original Android space simulation, built in two gated stages. The app is branded **George Universal Sunbox**; the folder and package ID keep the working name *Project Universe*.

| Stage | Status |
| --- | --- |
| **Stage 1: editable visual prototype** | **Ready for review (v0.3).** Collecting revisions. |
| Stage 2: full Android application (Unity) | **Not started.** Begins only after the exact phrase `APPROVED — START FULL ANDROID DEVELOPMENT`. |

---

## 1. Environment inspection

I checked the build container before choosing a workflow:

| Tool | Result |
| --- | --- |
| Unity Editor / Unity Hub | Not installed. The Unity download hosts (`download.unity3d.com`, `public-cdn.cloud.unity3d.com`) are blocked by this environment's network policy. Unity also needs an account sign-in to activate a licence, which can't be done in a headless container. |
| Android SDK, NDK, build-tools, emulator | Not installed. `dl.google.com` (and `maven.google.com`, which redirects there) is blocked, so `sdkmanager`, the Android Gradle Plugin toolchain, system images and the emulator can't be installed. |
| JDK | OpenJDK 21: available |
| Gradle | 8.14: available, but the Android Gradle Plugin needs the SDK |
| Node.js / npm | Node 22: available, npm registry reachable |
| Chromium (headless) | Available, used for automated tests and screenshots |
| Maven Central | Reachable |

**Conclusion:** Unity can't run here, and I can't fetch the official Android toolchain.

## 2. Workflow chosen for Stage 1

This is the closest workflow that still leads to the Unity app:

1. **The prototype is a real-time 3D WebGL app** (Three.js, plain JavaScript modules). It runs in any modern browser, including Chrome on Android, so you can try it on your phone right away and every revision can be republished in minutes.
2. **It is also packaged as a real Android debug APK.** A thin native WebView shell loads the bundled prototype from the APK's assets. It works offline and requests **no permissions**. The APK is assembled from pinned, checksummed tools on Maven Central (see §4).
3. **The code is split the way the Unity project will be split**, so the approved prototype works as the specification for Stage 2:

| Prototype module | Planned Unity counterpart (Stage 2) |
| --- | --- |
| `src/data/bodies.js`: physical data kept separate from visual data | `CelestialBodyData` ScriptableObjects |
| `src/sim/clock.js`: simulation clock and speed ladder | `SimulationClock` (fixed-step, double precision) |
| `src/sim/kepler.js`: orbit solver | C# double-precision orbit solver, later the N-body integrator |
| `src/sim/scale.js`: display-scale mapping | `DisplayScale` service (physics ↔ render space) |
| `src/render/*`: scene, procedural textures, camera rig | URP scene, shaders/materials, Cinemachine-style camera rig |
| `src/app.js`, `src/app.html`, `src/styles.css`: UI | uGUI / UI Toolkit screens using the same layout and colour tokens |

Stage 2 needs a computer with **Unity (LTS) + Android Build Support (SDK, NDK, OpenJDK modules)**, or a cloud environment whose network policy allows the Unity and Google download hosts.

## 3. Try the prototype

**Hosted preview (private link, opens in any browser):** https://claude.ai/artifact/1NSKp8Xea4w8FXnTgVhwMA

**Android APK:** `Builds/Android/GeorgeUniversalSunbox-prototype-debug.apk`

- Copy it to the phone and open it. You'll need to allow "Install unknown apps" for the app you open it with.
- It's a **debug build signed with a locally generated debug key**, not a release key. If a build signed by a different machine is already installed, uninstall that one first.
- Requires Android 7.0 (API 24) or newer with WebGL support (practically all phones from the last eight years).

**Run from source (any computer with Node.js 18+):**

```bash
cd project-universe/prototype
npm install
npm run build          # writes dist/index.html (self-contained, works offline)
# open dist/index.html in Chrome, Edge, Firefox or Safari (double-clicking works)
npm test               # rebuilds, then runs the automated checks (needs Chromium; set CHROMIUM_PATH)
```

`npm run dev` rebuilds the JavaScript whenever it changes (rerun `npm run build` after CSS or HTML edits).

## 4. Rebuild the APK

```bash
cd project-universe/prototype && npm run build
cd ../android-shell && python3 tools/build_apk.py
# → project-universe/Builds/Android/GeorgeUniversalSunbox-prototype-debug.apk
```

Requirements: JDK 17+, Python 3, and internet access to Maven Central the first time. The script:

- compiles `MainActivity.java` against the Android 14 framework classes (Robolectric `android-all`)
- converts it to `classes.dex` with AOSP `dx` (repackaged `dalvik-dx`)
- encodes the binary `AndroidManifest.xml` and `resources.arsc` itself
- 4-byte-aligns uncompressed entries
- signs with APK Signature Scheme v2 using Google's `apksig`, then verifies the signature

Each tool jar is pinned by SHA-1. On a machine with Android Studio or Unity, the normal toolchain replaces this script.

| APK property | Value |
| --- | --- |
| Application name | George Universal Sunbox |
| Package ID | `com.projectuniverse.app` |
| Version | 0.3.0-prototype (code 3) |
| Min / target SDK | 24 / 34 |
| ABI | None needed: no native code, so it runs on ARM64, ARMv7 and x86 devices |
| Permissions | None |
| Signature | v2, debug key |

## 5. What works in v0.3

**Opening (welcome screen)**
- The app name **GEORGE UNIVERSAL SUNBOX** shown large in the centre, with "Welcome, George" under it, over the live solar system. The loading screen before it also shows the name.
- Sound: with a soft synthesized chime followed by a spoken "Welcome, George"
- The sound is generated on the device, with no audio files: the chime uses Web Audio, and the voice uses the phone's text-to-speech engine in the Android app or the browser's speech engine on the web
- **Android app:** plays automatically at launch, then opens the menu after about 3 seconds (tap to skip)
- **Browser:** browsers block sound until the user taps, so the screen shows a **Tap to enter** button that starts the sound
- Can be turned off in Settings → Welcome sound; the app then opens straight to the menu
- The voice depends on the phone's installed text-to-speech voice (on most Android phones, Google's). If the phone has no text-to-speech engine, only the chime plays.

**Main menu**
- Logo, live animated solar system behind the menu
- Start Simulation, Solar System, Sandbox (marked *Prototype*), Settings
- Exit appears only inside the Android app; in a browser the tab is closed instead

**3D solar system**
- Sun, all eight planets and the Moon, with orbital paths, labels, axial tilt and rotation
- Saturn's rings (with the Cassini division), atmosphere glow on Venus, Earth, Mars, Uranus and Neptune, and Earth's cloud layer
- Starfield and nebula backdrop
- Planet positions follow the simulation clock using JPL approximate Keplerian elements. The simulation starts at today's real date and time, so the layout matches the real sky's arrangement.

**Camera**
- One-finger drag to rotate, pinch to zoom, two-finger drag to pan
- Tap a body or its label to select it; double-tap to focus
- Focus (follows the moving body), Solar-system overview, Reset camera, all with smooth transitions
- Mouse: drag, wheel, right-drag or shift-drag
- The view re-centres so a focused planet is never hidden behind the info panel

**Info panel**
- Name, type, diameter, mass (kg and Earth masses), live distance from the Sun (AU and km), mean distance, orbital period, rotation period (retrograde marked), axial tilt
- Simulation time and speed
- Moon: live distance from Earth

**Time toolbar**
- Pause / resume, slower / faster across eight steps (real time up to 1 year per second)
- Presets: Slow (1 hr/s), Normal (1 day/s), Fast (1 month/s)
- Live multiplier readout (for example ×86,400)
- Reset returns to the start time
- A warning appears outside 1800–2050, where the orbital data is less accurate

**Sandbox (prototype)**
- Visual size, 0.25–4×, tagged **Visual only**
- Orbital speed, 0–10×, tagged **Kinematic**: moves the body along its fixed orbit faster or slower; gravity is not recalculated
- Apply, Restore body, Restore all
- Changed bodies are marked in the body strip

**Settings**
- Welcome sound, labels, orbits, planet rotation, reduce motion, render resolution
- Stored on the device

**Android**
- Back closes settings, then the info panel, then returns to the menu, then exits the app
- Rendering pauses while the app is in the background
- No network access needed (the welcome voice uses the phone's offline text-to-speech)

### Not in the prototype yet (planned for Stage 2)
- Gravity / N-body physics. Mass and velocity are shown read-only and tagged *Physics · Stage 2*.
- Creating new bodies, collisions, fragmentation
- Moons other than Earth's Moon
- Real photographic surface maps. Planet surfaces are original, procedurally generated artwork, not real geography.
- Unity / URP implementation, adaptive launcher icon, signed release build

## 6. Data and display scale

- Physical values come from the NASA Goddard Planetary Fact Sheet. Orbits use E. M. Standish's JPL "Keplerian Elements for Approximate Positions of the Major Planets" (Table 1, valid 1800–2050). The Moon uses simplified mean elements. All values are approximate and labelled that way in the app.
- **Display scale is deliberately not to scale:**
  - On-screen distance grows with the square root of the distance in AU.
  - Body radius grows with (radius / Earth radius)^0.42.
  - The Sun is drawn smaller still.
  - The Moon is drawn ~4.6 units from Earth so it stays visible.
- The info panel always shows the real values, never display units.

## 7. Testing (recorded results)

`npm test` runs 28 automated checks in headless Chromium with software WebGL. The latest run passed **28 / 28**:

| Area | Checks |
| --- | --- |
| Simulation data | Earth's J2000 position matches the published value within 0.01 AU; all eight orbital periods within 0.5 % of NASA values; distances stay within perihelion–aphelion bounds over ±100 years |
| Opening | Opens on the welcome screen showing "George Universal Sunbox" and "Welcome, George"; tapping enter says "Welcome, George" (speech captured by a test stub) and opens the menu; with a simulated Android bridge it speaks through native text-to-speech without a tap and then shows the menu; with Welcome sound off it opens straight to the menu, silently |
| App flow | all menu entries present, Sandbox marked Prototype, Exit hidden in browser; settings open and close with Back; Start Simulation shows the HUD |
| Scene | Sun, eight planets and the Moon present (10 bodies, 10 chips) |
| Interaction | Tap selects Jupiter and shows its diameter; Moon panel shows Earth distance; drag rotates and wheel zooms; focus follows Mars; reset camera |
| Time | Pause freezes time; resume continues; Fast advances more than 50× faster than Slow; multiplier readout updates; reset restores start time |
| Sandbox | Visual size applies to the mesh and restores; orbital speed 0× halts Earth while others move; restore resyncs |
| Navigation | Back: panel → HUD → menu → app exit |
| Layout | All controls on-screen and unobstructed, with no horizontal scroll, at 360×740, 844×390 and 1024×1366 |
| Stability | No JavaScript errors during the run |

APK checks performed:
- `apksig` verified the v2 signature.
- `androguard` parsed the manifest (package, SDK levels, label, launcher activity, no permissions) and resolved the icon resource.
- Uncompressed entries are 4-byte aligned.
- The bundled `index.html` is byte-identical to the tested build.

**Not performed:** installing and running the APK on a physical device or emulator (none available here), so the native text-to-speech voice has not been heard on a real phone; listening to the chime (tests confirm it runs without errors, not how it sounds); frame-rate measurements on real phones; testing on iOS Safari.

## 8. Revision workflow

1. Try the preview link or the APK and tell me what to change, as specifically or loosely as you like ("make the toolbar smaller", "warmer sun", "move the info panel to the left").
2. I edit the existing source (no rebuilds from scratch), run `npm test`, republish the same preview link and rebuild the APK.
3. Each round is committed to the branch, so any earlier version can be restored.
4. Repeat until you're happy. Stage 2 starts only on the exact phrase above.

Common places to edit:
- **Welcome words, chime, voice speed:** `prototype/src/audio/welcome.js`
- **Colours and fonts:** the tokens at the top of `prototype/src/styles.css`
- **Layout and text:** `prototype/src/app.html`
- **Behaviour:** `prototype/src/app.js`
- **Planet looks:** `prototype/src/render/textures.js`
- **Sizes and distances:** `prototype/src/sim/scale.js`
- **Speeds:** `prototype/src/sim/clock.js`

## 9. Project layout

```
project-universe/
├── README.md                     this file
├── prototype/                    Stage 1 app (WebGL)
│   ├── src/
│   │   ├── data/bodies.js        celestial data + sources
│   │   ├── audio/welcome.js      opening chime + "Welcome, George"
│   │   ├── sim/                  clock, Kepler solver, display scale
│   │   ├── render/               scene, camera rig, starfield, procedural textures
│   │   ├── ui/format.js          units and number formatting
│   │   ├── app.js / app.html / styles.css
│   │   └── main.js
│   ├── tools/build.mjs           bundles into dist/index.html (+ preview variant)
│   └── tests/prototype.test.mjs  automated checks
├── android-shell/                native WebView wrapper
│   ├── AndroidManifest.xml
│   ├── src/com/projectuniverse/app/MainActivity.java
│   ├── res/ic_launcher.png       (drawn by tools/make_icon.py)
│   └── tools/build_apk.py, SignTool.java
└── Builds/Android/GeorgeUniversalSunbox-prototype-debug.apk
```
