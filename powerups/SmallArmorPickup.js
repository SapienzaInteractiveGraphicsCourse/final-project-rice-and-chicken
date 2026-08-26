import { ArmorPickup } from './ArmorPickup.js';

const ARMOR_AMOUNT = 25;

// ============================================================
// SMALL ARMOR PICKUP
// Adds a flat amount of armor (capped at the max, see addArmor() in
// main.js) rather than filling the bar -- the common, frequent armor
// pickup (see LargeArmorPickup.js for the rarer full refill).
// ============================================================
export class SmallArmorPickup extends ArmorPickup {
    constructor() {
        super({ name: 'ARMOR +25', shellScale: 0.85 }); // slightly smaller shell than the large one -- a visual "this is the lesser pickup" cue
    }

    apply(context) {
        context.addArmor(ARMOR_AMOUNT);
    }
}
