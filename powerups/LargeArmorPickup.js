import { ArmorPickup } from './ArmorPickup.js';

// ============================================================
// LARGE ARMOR PICKUP
// Restores armor to its maximum outright -- rarer than the small one
// (see the spawn weights in main.js), with a bigger shell so it's
// visually obvious which armor pickup you're looking at from a
// distance, before even seeing the icon clearly.
// ============================================================
export class LargeArmorPickup extends ArmorPickup {
    constructor() {
        super({ name: 'ARMOR (FULL)', shellScale: 1.5 });
    }

    apply(context) {
        context.armorToFull();
    }
}
