import { PlayerClass } from './PlayerClass.js';
import { SniperRifle } from '../weapons/SniperRifle.js';
import { Pistol } from '../weapons/Pistol.js';

// ============================================================
// SNIPER
// Long-range primary, pistol sidearm
//  Muted olive/ghillie color scheme instead of the Assault teal.
// ============================================================
export class Sniper extends PlayerClass {
    constructor() {
        super({
            name: 'Sniper',
            weapons: [new SniperRifle(), new Pistol()],
            bodyColor: 0x4a5a3a,
            legColor: 0x434f38,
            headColor: 0xcbbfa0
        });
    }
}
