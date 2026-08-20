import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const ARMOR_TEXTURE_PATH = './textures/sci_fi_metal_panel_010/';
const BACKPACK_TEXTURE_PATH = './textures/metal_plate_049/';

function loadMap(basePath, fileName, repeatX, repeatY, isColorMap = false) {
    const tex = textureLoader.load(basePath + fileName);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    // Only the diffuse/color map represents actual color and needs sRGB
    // decoding -- normal/roughness maps are data, not color, and must
    // stay in linear space or they'd shade incorrectly.
    if (isColorMap) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// ============================================================
// PLAYER CLASS (base class)
// "Class" here means a loadout, like in a shooter's class-select
// screen: it bundles together everything that makes one type of
// character different from another -- which weapons it carries
// (see weapons/) and how its body is colored. main.js builds the
// player model from whichever PlayerClass instance is active
// without needing to know which concrete class (Assault, Sniper,
// ...) it actually is.
// ============================================================
export class PlayerClass {
    constructor({
        name,
        weapons,                 // array of Weapon instances; index 0 is the starting weapon
        bodyColor = 0x00ffcc,    // torso + arms
        legColor = 0x009980,
        headColor = 0xffffff,
        backpackColor = 0x2a2a35
    }) {
        this.name = name;
        this.weapons = weapons;
        this.bodyColor = bodyColor;
        this.legColor = legColor;
        this.headColor = headColor;
        this.backpackColor = backpackColor;
    }

    // Builds the materials used for each body part. Pulled out as its
    // own method (rather than inlined in main.js's createPlayer()) so
    // a subclass could override it later for a completely different
    // look, without touching main.js at all.
    //
    // Every armored part shares the SAME downloaded photo-sourced diffuse/
    // normal/roughness set (see the header comment above), tiled at a
    // per-part UV repeat and tinted per-part via MeshStandardMaterial's
    // `color` .
    createBodyMaterials() {
        const bodyColor = new THREE.Color(this.bodyColor);
        const legColor = new THREE.Color(this.legColor);
        const headColor = new THREE.Color(this.headColor);
        // Trim (pauldrons/boots) reuses the backpack tint, darkened, so it
        // reads as a separate darker armor piece rather than matching gear.
        const trimColor = new THREE.Color(this.backpackColor).multiplyScalar(0.6);

        // repeat = [x, y] UV tiling -- tuned per part so the plate/seam
        // scale in the photo looks like a similar physical size across the
        // wide torso and the narrow, elongated limbs, instead of one huge
        // stretched plate or a too-busy micro-tiled one.
        // (backpack is handled separately below -- different texture set)
        const partSpecs = {
            torso: { tint: bodyColor, repeat: [2, 3], metalness: 0.35 },
            arm:   { tint: bodyColor, repeat: [1, 2], metalness: 0.35 },
            leg:   { tint: legColor,  repeat: [1, 2], metalness: 0.3 },
            head:  { tint: headColor, repeat: [1, 1], metalness: 0.25 },
            trim:  { tint: trimColor, repeat: [1, 1], metalness: 0.5 }
        };

        const materials = {};
        for (const [part, spec] of Object.entries(partSpecs)) {
            const [rx, ry] = spec.repeat;
            materials[part] = new THREE.MeshStandardMaterial({
                map: loadMap(ARMOR_TEXTURE_PATH, 'basecolor.png', rx, ry, true),
                normalMap: loadMap(ARMOR_TEXTURE_PATH, 'normal.png', rx, ry),
                roughnessMap: loadMap(ARMOR_TEXTURE_PATH, 'roughness.png', rx, ry),
                color: spec.tint,
                roughness: 1.0, // fully driven by roughnessMap's per-pixel value
                metalness: spec.metalness
            });
        }

        // Backpack: a deliberately different texture set (bold red-painted
        // riveted panel, see header comment) instead of the body's blue
        // plate -- left untinted (white) so its own red/rust color shows
        // through as-is, rather than being pulled toward backpackColor.
        materials.backpack = new THREE.MeshStandardMaterial({
            map: loadMap(BACKPACK_TEXTURE_PATH, 'basecolor.png', 2, 2, true),
            normalMap: loadMap(BACKPACK_TEXTURE_PATH, 'normal.png', 2, 2),
            roughnessMap: loadMap(BACKPACK_TEXTURE_PATH, 'roughness.png', 2, 2),
            roughness: 1.0,
            metalness: 0.5
        });

        // Visor / chest-core accent: flat glow, no armor texture -- same
        // idea as the guns' emissive energy strip, ties the "tech" details
        // together and contrasts with the plated armor pieces above.
        const accentHex = '#' + new THREE.Color(this.bodyColor).lerp(new THREE.Color(0xffffff), 0.6).getHexString();
        materials.visor = new THREE.MeshStandardMaterial({
            color: 0x050505,
            emissive: new THREE.Color(accentHex),
            emissiveIntensity: 1.4,
            roughness: 0.25,
            metalness: 0.6
        });

        return materials;
    }
}
