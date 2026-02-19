// backend/wheel/wheelController.js

// We will dynamically inject triggerSpin from server.js
let triggerSpinFunction = null;

/**
 * Called by server.js to register the spin trigger
 */
export function registerSpinTrigger(fn) {
    triggerSpinFunction = fn;
}

/**
 * Called when a Twitch reward redemption happens
 */
export function handleRewardRedemption(username) {
    if (!triggerSpinFunction) {
        console.error("Spin trigger not registered yet.");
        return;
    }

    console.log(`Reward redeemed by ${username}`);

    const spinPayload = {
        winner: username
    };

    triggerSpinFunction(spinPayload);
}