// Window bounds saving helper - hybrid approach: debounced saves + backup on blur
const { setWindowBounds } = require("../electronStores");

function setupWindowBoundsSaving(window, windowKey) {
    let boundsChanged = false;
    let saveTimeout = null;

    const scheduleSave = () => {
        boundsChanged = true;
        
        // Clear existing timeout
        if (saveTimeout) clearTimeout(saveTimeout);
        
        // Schedule save after 500ms of no changes
        saveTimeout = setTimeout(() => {
            if (boundsChanged) {
                const bounds = window.getBounds();
                setWindowBounds(windowKey, bounds);
                boundsChanged = false;
            }
        }, 500);
    };

    window.on("move", scheduleSave);
    window.on("resize", scheduleSave);

    // Also save on blur as backup
    window.on("blur", () => {
        if (boundsChanged) {
            const bounds = window.getBounds();
            setWindowBounds(windowKey, bounds);
            boundsChanged = false;
        }
    });
}

module.exports = { setupWindowBoundsSaving };
