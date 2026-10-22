// Real surface maps for the Sun, planets and Moon, bundled into the app so it
// works offline. Maps: Solar System Scope (solarsystemscope.com/textures),
// CC BY 4.0, based on NASA imagery; resized by tools/prepare_textures.py.
import * as THREE from 'three';
import sun from '../../assets/textures/sun.jpg';
import mercury from '../../assets/textures/mercury.jpg';
import venus from '../../assets/textures/venus.jpg';
import earth from '../../assets/textures/earth.jpg';
import moon from '../../assets/textures/moon.jpg';
import mars from '../../assets/textures/mars.jpg';
import jupiter from '../../assets/textures/jupiter.jpg';
import saturn from '../../assets/textures/saturn.jpg';
import uranus from '../../assets/textures/uranus.jpg';
import neptune from '../../assets/textures/neptune.jpg';
import saturnRing from '../../assets/textures/saturn_ring.png';

const SOURCES = { sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune, saturnRing };

// Resolves to { [name]: THREE.Texture } once every map has decoded.
export async function loadPlanetMaps(anisotropy = 4) {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, url]) => {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return [name, tex];
  }));
  return Object.fromEntries(entries);
}
