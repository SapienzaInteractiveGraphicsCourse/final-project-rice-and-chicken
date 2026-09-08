import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
const ARMOR_TEXTURE_PATH = './textures/sci_fi_metal_panel_010/';
const BACKPACK_TEXTURE_PATH = './textures/metal_plate_049/';

// Function that allow us to load a texture from a given path and file name, and set its wrapping and repeat properties. It also handles color space for color maps.
function loadMap(basePath, fileName, repeatX, repeatY, isColorMap = false) {

    // Load the texture using THREE.TextureLoader
    const tex = textureLoader.load(basePath + fileName);

    // On default, textures are clamped to the edges of the UV coordinates. We want them to repeat instead, so we set the wrapping mode to RepeatWrapping for both S (horizontal) and T (vertical) directions.
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    // Set the repeat values for the texture, which determines how many times the texture will tile across the surface. The repeat values are specified in the X and Y directions.
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

        // Here we convert the hex color values for the body, leg, head, and backpack into THREE.Color objects. 
        // This allows us to manipulate the colors more easily and use them in the materials we create later.
        const bodyColor = new THREE.Color(this.bodyColor);
        const legColor = new THREE.Color(this.legColor);
        const headColor = new THREE.Color(this.headColor);


        // Trim (pauldrons/boots) reuses the backpack tint, darkened (più scuro), so it
        // reads as a separate darker armor piece rather than matching gear.
        const trimColor = new THREE.Color(this.backpackColor).multiplyScalar(0.75);

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

        // Here we are creating the materials for each body part using the specifications defined in partSpecs. 
        // We loop through each part and create a new THREE.MeshStandardMaterial for it, 
        // applying the appropriate texture maps and properties based on the specifications.
        const materials = {};

        // Iterating over partSpecs one couple per time, where part is the name of the body part (e.g., 'torso', 'arm') and spec contains the tint color, repeat values, and metalness for that part.
        for (const [part, spec] of Object.entries(partSpecs)) {

            // Taking the repeat values from the spec object and destructuring them into rx and ry for easier use in the loadMap function.
            const [rx, ry] = spec.repeat;

            // Creating a new MeshStandardMaterial for the current body part, applying the appropriate texture maps (base color, normal, roughness)
            materials[part] = new THREE.MeshStandardMaterial({

                // Loading the base color map for the armor texture, applying the specified repeat values and setting it to be treated as a color map (sRGB).
                map: loadMap(ARMOR_TEXTURE_PATH, 'basecolor.png', rx, ry, true),

                // Loading the normal map for the armor texture, applying the specified repeat values. Normal maps are used to create the illusion of surface detail without adding extra geometry.
                normalMap: loadMap(ARMOR_TEXTURE_PATH, 'normal.png', rx, ry),

                // Loading the roughness map for the armor texture, applying the specified repeat values. Roughness maps control how shiny or matte a surface appears.  
                roughnessMap: loadMap(ARMOR_TEXTURE_PATH, 'roughness.png', rx, ry),

                // Setting the color of the material to the specified tint color for the body part, which allows us to customize the appearance of each part while still using the same texture maps.
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

        // Takes the body color and lightens it by blending (interpolating at 60%) it with white (lerp) to create a brighter accent color for the visor.
        const accentHex = '#' + new THREE.Color(this.bodyColor).lerp(new THREE.Color(0xffffff), 0.6).getHexString();
        materials.visor = new THREE.MeshStandardMaterial({

            // base color is a very dark gray (almost black) to make the emissive color stand out more.
            
            color: 0x0a0a0a,
            // The emissive color is set to the accent color we calculated above, which will give the visor a glowing effect. 
            emissive: new THREE.Color(accentHex),

            //The emissive intensity controls how bright the glow appears.
            emissiveIntensity: 2.0, 

            // Surface is smooth and shiny, with no texture maps applied. This makes the visor look more like a glowing screen or light source rather than a textured surface.
            roughness: 0.25,
            metalness: 0.6
        });

        return materials;
    }
}
