import * as THREE from 'three';

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
    // own method (rather than inlined in main.js's createPlayer())
    // so a subclass can override it later to use a real texture map
    // instead of a flat color -- e.g. `map: textureLoader.load(...)`
    // -- without touching main.js at all.
    createBodyMaterials() {
        return {
            torso: new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.2 }),
            arm: new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.2 }),
            leg: new THREE.MeshStandardMaterial({ color: this.legColor, roughness: 0.2 }),
            head: new THREE.MeshStandardMaterial({ color: this.headColor, roughness: 0.3 }),
            backpack: new THREE.MeshStandardMaterial({ color: this.backpackColor, roughness: 0.4, metalness: 0.6 })
        };
    }
}
