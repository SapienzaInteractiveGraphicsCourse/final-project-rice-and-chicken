import { PlayerClass } from './PlayerClass.js';
import { SniperRifle } from '../weapons/SniperRifle.js';
import { Pistol } from '../weapons/Pistol.js';

// ============================================================
// SNIPER
// Long-range primary, pistol sidearm.
// Light sage-green scheme instead of the Assault teal: close to
// the texture's own color, only gently pushed toward green, and
// kept pale (the earlier olive read far too dark on the model).
// ============================================================
export class Sniper extends PlayerClass {
    constructor() {
        super({
            name: 'Sniper',
            weapons: [new SniperRifle(), new Pistol()],
            bodyColor: 0xbcd0a0,   
            legColor: 0xbcd0a0,    
            headColor: 0xe4e8d4    
        });
    }
}
