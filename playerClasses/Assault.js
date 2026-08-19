import { PlayerClass } from './PlayerClass.js';
import { Rifle } from '../weapons/Rifle.js';
import { Pistol } from '../weapons/Pistol.js';

// ============================================================
// ASSAULT
// The default loadout: AK-style rifle as primary, pistol as
// sidearm. Colors match the game's original teal look.
// ============================================================
export class Assault extends PlayerClass {
    constructor() {
        super({
            name: 'Assault',
            weapons: [new Rifle(), new Pistol()],
            bodyColor: 0x00ffcc,
            legColor: 0x009980
        });
    }
}
