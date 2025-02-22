const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const connectMTP = () => {

}

function getMtpOverview(ticker) {
    const store = require("../store");


    store.updateMtpOverview(ticker, { overview: overview });

}

module.exports = { getMtpOverview, connectMTP };