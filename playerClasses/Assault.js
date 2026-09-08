import { PlayerClass } from './PlayerClass.js';
import { Rifle } from '../weapons/Rifle.js';
import { Pistol } from '../weapons/Pistol.js';

// ============================================================
// ASSAULT
// The default loadout: AK-style rifle as primary, pistol as
// sidearm. Every plated armor part (torso, arms, legs) is tinted
// the same teal; the head is left at the texture's own color
// (headColor defaults to white in PlayerClass).
// ============================================================
export class Assault extends PlayerClass {
    constructor() {
        super({
            name: 'Assault',
            weapons: [new Rifle(), new Pistol()],
            bodyColor: 0x00ffcc,
            legColor: 0x00ffcc   // same teal as the body -- one uniform armor tint
        });
    }
}
