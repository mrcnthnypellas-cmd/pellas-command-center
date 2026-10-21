#!/usr/bin/env python3
"""Builds the Stage 1 prototype debug APK without the Android SDK.

The official SDK download host is not reachable from the environment this was
written in, so this script assembles the APK from parts available on Maven
Central, each pinned by SHA-1:

  * javac (JDK 17+)            compiles MainActivity against the Android 14 framework
                               classes from Robolectric's android-all jar
  * dalvik-dx (AOSP, repackaged) converts the classes to classes.dex
  * apksig (Google)            signs the APK (scheme v2) and verifies the signature

The binary AndroidManifest.xml and resources.arsc are encoded by this script
(see encode_axml / encode_arsc). On a machine with Android Studio, the Gradle /
Unity toolchain replaces all of this.

Usage:
  python3 tools/build_apk.py [--html ../prototype/dist/index.html] [--out ../Builds/Android/...]
"""
import argparse
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHELL = HERE.parent
PROJECT = SHELL.parent
TOOLS = SHELL / '.tools'

MAVEN = 'https://repo1.maven.org/maven2'
ARTIFACTS = {
    'dx': ('com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar', '71ac16d1f34143d86440fca923422f9c2e2ac403'),
    'apksig': ('com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar', '6ef7a58375aa68fb492b58edd97607bee8ee5c5c'),
    'android': ('org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar', '94b1490a891e9be559aa35c87cd8a0c163f32d83'),
}

PACKAGE = 'com.projectuniverse.app'
ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# Public framework resource IDs (android.R.attr / android.R.style, API 34).
ATTR_IDS = {
    'theme': 0x01010000, 'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003,
    'exported': 0x01010010, 'launchMode': 0x0101001d, 'configChanges': 0x0101001f,
    'versionCode': 0x0101021b, 'versionName': 0x0101021c, 'minSdkVersion': 0x0101020c,
    'targetSdkVersion': 0x01010270, 'allowBackup': 0x01010280, 'glEsVersion': 0x01010281,
    'required': 0x0101028e, 'hardwareAccelerated': 0x010102d3, 'resizeableActivity': 0x010104f6,
}
FRAMEWORK_REFS = {'@android:style/Theme.Material.NoActionBar': 0x0103022e}
INT_ATTRS = {'versionCode', 'minSdkVersion', 'targetSdkVersion'}
CONFIG_CHANGES = {
    'keyboardHidden': 0x20, 'orientation': 0x80, 'screenLayout': 0x100, 'uiMode': 0x200,
    'screenSize': 0x400, 'smallestScreenSize': 0x800, 'density': 0x1000,
}
LAUNCH_MODES = {'standard': 0, 'singleTop': 1, 'singleTask': 2, 'singleInstance': 3}

# App resources: one drawable, the launcher icon.
ICON_PATH = 'res/drawable-nodpi-v4/ic_launcher.png'
APP_REFS = {'@drawable/ic_launcher': 0x7f010000}

TYPE_REFERENCE, TYPE_STRING, TYPE_INT_DEC, TYPE_INT_HEX, TYPE_BOOLEAN = 0x01, 0x03, 0x10, 0x11, 0x12
NO_INDEX = 0xFFFFFFFF


# ----------------------------------------------------------------------------- tools
def fetch_tools():
    TOOLS.mkdir(exist_ok=True)
    paths = {}
    for key, (rel, sha1) in ARTIFACTS.items():
        dest = TOOLS / Path(rel).name
        if not dest.exists() or hashlib.sha1(dest.read_bytes()).hexdigest() != sha1:
            print(f'  downloading {Path(rel).name}')
            with urllib.request.urlopen(f'{MAVEN}/{rel}') as r, open(dest, 'wb') as f:
                shutil.copyfileobj(r, f)
            got = hashlib.sha1(dest.read_bytes()).hexdigest()
            if got != sha1:
                dest.unlink()
                sys.exit(f'checksum mismatch for {rel}: {got}')
        paths[key] = dest
    return paths


def run(cmd, **kw):
    subprocess.run([str(c) for c in cmd], check=True, **kw)


# ----------------------------------------------------------------------------- binary encoders
def chunk(ctype, header, body):
    """ResChunk_header + rest of header + body, padded to 4 bytes."""
    data = header + body
    data += b'\0' * (-len(data) % 4)
    return struct.pack('<HHI', ctype, 8 + len(header), 8 + len(data)) + data


def string_pool(strings):
    """UTF-16 ResStringPool."""
    offsets, data = [], b''
    for s in strings:
        offsets.append(len(data))
        enc = s.encode('utf-16-le')
        n = len(enc) // 2
        assert n < 0x8000, 'string too long'
        data += struct.pack('<H', n) + enc + b'\0\0'
    data += b'\0' * (-len(data) % 4)
    header = struct.pack('<IIIII', len(strings), 0, 0, 28 + 4 * len(strings), 0)
    return chunk(0x0001, header, b''.join(struct.pack('<I', o) for o in offsets) + data)


def typed_value(name, value, strings):
    """Returns (raw_string_index, data_type, data) for a manifest attribute."""
    if value.startswith('@'):
        ref = FRAMEWORK_REFS.get(value) or APP_REFS.get(value)
        if ref is None:
            sys.exit(f'unknown resource reference {value}')
        return NO_INDEX, TYPE_REFERENCE, ref
    if name == 'configChanges':
        return NO_INDEX, TYPE_INT_HEX, sum(CONFIG_CHANGES[f] for f in value.split('|'))
    if name == 'launchMode':
        return NO_INDEX, TYPE_INT_DEC, LAUNCH_MODES[value]
    if name == 'glEsVersion':
        return NO_INDEX, TYPE_INT_HEX, int(value, 0)
    if name in INT_ATTRS:
        return NO_INDEX, TYPE_INT_DEC, int(value)
    if value in ('true', 'false'):
        return NO_INDEX, TYPE_BOOLEAN, 0xFFFFFFFF if value == 'true' else 0
    idx = strings.index(value)
    return idx, TYPE_STRING, idx


def encode_axml(xml_text):
    """Compiles a manifest to Android binary XML (AXML)."""
    root = ET.fromstring(xml_text)

    def split(tag):
        if tag.startswith('{'):
            ns, local = tag[1:].split('}')
            return ns, local
        return None, tag

    # String pool: resource-ID attribute names first (index == resource map slot).
    attr_names, others = [], []
    for el in root.iter():
        others.append(split(el.tag)[1])
        for k, v in el.attrib.items():
            ns, local = split(k)
            if ns == ANDROID_NS:
                if local not in ATTR_IDS:
                    sys.exit(f'no resource id for android:{local}')
                if local not in attr_names:
                    attr_names.append(local)
            else:
                others.append(local)
            if not v.startswith('@'):
                others.append(v)
    attr_names.sort(key=lambda n: ATTR_IDS[n])
    strings = list(attr_names)
    for s in ['android', ANDROID_NS] + others:
        if s not in strings:
            strings.append(s)
    si = strings.index

    out = [string_pool(strings),
           chunk(0x0180, b'', b''.join(struct.pack('<I', ATTR_IDS[n]) for n in attr_names))]
    line = [1]

    def node(ctype, ext):
        line[0] += 1
        return chunk(ctype, struct.pack('<II', line[0], NO_INDEX), ext)

    out.append(node(0x0100, struct.pack('<II', si('android'), si(ANDROID_NS))))

    def emit(el):
        ns, local = split(el.tag)
        attrs = []
        for k, v in el.attrib.items():
            ans, alocal = split(k)
            raw, dtype, data = typed_value(alocal, v, strings)
            attrs.append((ATTR_IDS.get(alocal, 0) if ans == ANDROID_NS else 0,
                          struct.pack('<IIIHBBI', si(ANDROID_NS) if ans == ANDROID_NS else NO_INDEX,
                                      si(alocal), raw, 8, 0, dtype, data)))
        attrs.sort(key=lambda a: a[0])  # the framework expects attributes ordered by resource id
        ext = struct.pack('<IIHHHHHH', NO_INDEX, si(local), 20, 20, len(attrs), 0, 0, 0)
        out.append(node(0x0102, ext + b''.join(a[1] for a in attrs)))
        for child in el:
            emit(child)
        out.append(node(0x0103, struct.pack('<II', NO_INDEX, si(local))))

    emit(root)
    out.append(node(0x0101, struct.pack('<II', si('android'), si(ANDROID_NS))))
    return chunk(0x0003, b'', b''.join(out))


def encode_arsc():
    """resources.arsc with one package holding drawable/ic_launcher (nodpi)."""
    values = string_pool([ICON_PATH])
    type_strings = string_pool(['drawable'])
    key_strings = string_pool(['ic_launcher'])

    type_spec = chunk(0x0202, struct.pack('<BBHI', 1, 0, 0, 1), struct.pack('<I', 0))
    config = bytearray(64)
    struct.pack_into('<I', config, 0, 64)
    struct.pack_into('<H', config, 14, 0xFFFF)  # density = nodpi
    struct.pack_into('<H', config, 24, 4)       # sdkVersion = 4, as aapt adds for density qualifiers
    entries = struct.pack('<HHI', 8, 0, 0) + struct.pack('<HBBI', 8, 0, TYPE_STRING, 0)
    type_header = struct.pack('<BBHII', 1, 0, 0, 1, 8 + 12 + 64 + 4) + bytes(config)
    type_chunk = chunk(0x0201, type_header, struct.pack('<I', 0) + entries)

    name = PACKAGE.encode('utf-16-le').ljust(256, b'\0')
    pkg_header_len = 288
    type_off = pkg_header_len
    key_off = type_off + len(type_strings)
    pkg_header = struct.pack('<I', 0x7f) + name + struct.pack('<IIIII', type_off, 1, key_off, 1, 0)
    package = chunk(0x0200, pkg_header, type_strings + key_strings + type_spec + type_chunk)
    return chunk(0x0002, struct.pack('<I', 1), values + package)


# ----------------------------------------------------------------------------- zip
def write_aligned_zip(path, entries):
    """entries: (name, bytes, store). Stored entries are 4-byte aligned like zipalign."""
    with zipfile.ZipFile(path, 'w') as zf:
        for name, data, store in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 0
            info.external_attr = 0
            if store:
                info.compress_type = zipfile.ZIP_STORED
                offset = zf.fp.tell() + 30 + len(name.encode())
                pad = (-(offset + 6)) % 4
                info.extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, data, compresslevel=9 if not store else None)


# ----------------------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--html', default=str(PROJECT / 'prototype' / 'dist' / 'index.html'))
    ap.add_argument('--out', default=str(PROJECT / 'Builds' / 'Android' / 'GeorgeUniversalSandbox-prototype-debug.apk'))
    args = ap.parse_args()
    html = Path(args.html)
    if not html.exists():
        sys.exit(f'{html} not found: run "npm run build" in prototype/ first')

    print('Fetching pinned build tools')
    tools = fetch_tools()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        print('Compiling MainActivity')
        classes = tmp / 'classes'
        classes.mkdir()
        java_files = sorted(str(p) for p in (SHELL / 'src').rglob('*.java'))
        run(['javac', '-nowarn', '--release', '8', '-cp', tools['android'], '-d', classes, *java_files])
        print('Converting to dex')
        dex = tmp / 'classes.dex'
        run(['java', '-cp', tools['dx'], 'com.android.dx.command.Main', '--dex', '--min-sdk-version=24',
             f'--output={dex}', classes])

        print('Encoding manifest and resources')
        manifest = encode_axml((SHELL / 'AndroidManifest.xml').read_text())
        arsc = encode_arsc()

        unsigned = tmp / 'unsigned.apk'
        write_aligned_zip(unsigned, [
            ('AndroidManifest.xml', manifest, False),
            ('classes.dex', dex.read_bytes(), False),
            ('resources.arsc', arsc, True),
            (ICON_PATH, (SHELL / 'res' / 'ic_launcher.png').read_bytes(), True),
            ('assets/index.html', html.read_bytes(), False),
        ])

        keystore = TOOLS / 'debug.p12'
        if not keystore.exists():
            print('Creating a local debug signing key (not for release)')
            run(['keytool', '-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-storepass', 'android',
                 '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
                 '-dname', 'CN=Android Debug,O=Android,C=US'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        print('Signing and verifying')
        signer = tmp / 'signer'
        signer.mkdir()
        run(['javac', '-nowarn', '-cp', tools['apksig'], '-d', signer, HERE / 'SignTool.java'])
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        # apksig 2.3.0 predates Java modules and reaches into JDK-internal X.509/PKCS classes.
        opens = [f'--add-exports=java.base/sun.security.{p}=ALL-UNNAMED' for p in ('x509', 'pkcs', 'util')]
        run(['java', *opens, '-cp', os.pathsep.join([str(signer), str(tools['apksig'])]), 'SignTool',
             keystore, 'android', 'androiddebugkey', unsigned, out])
    print(f'APK: {out} ({out.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
