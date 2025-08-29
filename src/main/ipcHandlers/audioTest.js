const { ipcMain } = require("electron");
const { getWindow } = require("../windowManager");
const { safeSend } = require("../utils/safeSend");

function setupAudioTestHandlers() {
    // Audio Test Handlers
    ipcMain.handle("test-combo-alert", async () => {
        try {
            const eventsWindow = getWindow("scanner");
            if (eventsWindow && !eventsWindow.isDestroyed()) {
                safeSend(eventsWindow, "test-combo-alert");
                return { success: true, message: "Combo alert test sent to events window" };
            } else {
                return { success: false, message: "Events window not available" };
            }
        } catch (error) {
            console.error("Error testing combo alert:", error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle("test-news-alert", async () => {
        try {
            const infobarWindow = getWindow("infobar");
            if (infobarWindow && !infobarWindow.isDestroyed()) {
                safeSend(infobarWindow, "test-news-alert");
                return { success: true, message: "News alert test sent to infobar window" };
            } else {
                return { success: false, message: "Infobar window not available" };
            }
        } catch (error) {
            console.error("Error testing news alert:", error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle("test-chime-alert", async () => {
        try {
            const hodWindow = getWindow("scrollHod");
            if (hodWindow && !hodWindow.isDestroyed()) {
                safeSend(hodWindow, "test-chime-alert");
                return { success: true, message: "Chime alert test sent to HOD window" };
            } else {
                return { success: false, message: "HOD window not available" };
            }
        } catch (error) {
            console.error("Error testing chime alert:", error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle("test-tick-alert", async () => {
        try {
            const hodWindow = getWindow("scrollHod");
            if (hodWindow && !hodWindow.isDestroyed()) {
                safeSend(hodWindow, "test-tick-alert");
                return { success: true, message: "Tick alert test sent to HOD window" };
            } else {
                return { success: false, message: "HOD window not available" };
            }
        } catch (error) {
            console.error("Error testing tick alert:", error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle("test-scanner-alert", async () => {
        try {
            const eventsWindow = getWindow("scanner");
            if (eventsWindow && !eventsWindow.isDestroyed()) {
                safeSend(eventsWindow, "test-scanner-alert");
                return { success: true, message: "Scanner alert test sent to events window" };
            } else {
                return { success: false, message: "Events window not available" };
            }
        } catch (error) {
            console.error("Error testing scanner alert:", error);
            return { success: false, message: error.message };
        }
    });
}

module.exports = { setupAudioTestHandlers };
