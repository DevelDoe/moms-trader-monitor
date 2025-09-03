// ./src/utils/windowState.js

const { BrowserWindow } = require("electron");
const log = require("../../hlps/logger")(__filename);
const { safeSend } = require("./safeSend");
const { 
    getWindowState: getWindowStateFromStore, 
    setWindowState: setWindowStateInStore,
    setWindowBounds: setWindowBoundsInStore 
} = require("../electronStores");

function getWindowState(name) {
    const state = getWindowStateFromStore(name) || {};
    // log.log(`Retrieved window state for "${name}":`, state);
    return state;
}

function saveWindowState(name, bounds, isOpen) {
    // log.log(`Saving window state for "${name}" with bounds:`, bounds, `and isOpen: ${isOpen}`);
    setWindowStateInStore(name, {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isOpen,
    });
}

function setWindowBounds(stateKey, bounds) {
    log.log(`setWindowBounds called for key "${stateKey}" with bounds:`, bounds);
    setWindowBoundsInStore(stateKey, bounds);
}

function setWindowState(stateKey, isOpen) {
    // log.log(`setWindowState called for key "${stateKey}" with isOpen: ${isOpen}`);
    setWindowStateInStore(stateKey, { isOpen });
}

function nukeTradingViewWindowStates() {
    // This function is no longer needed as window states are managed by electron store
    // But keeping it for backward compatibility
    log.log("🧨 nukeTradingViewWindowStates called - no longer needed with electron store");
}

module.exports = {
    getWindowState,
    saveWindowState,
    setWindowBounds,
    setWindowState,
    nukeTradingViewWindowStates,
};
