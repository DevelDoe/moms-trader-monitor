const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const connectMTP = () => {

}

function getMtpOverview(ticker) {
    const store = require("../store");


    store.addMtpOverviwe(newsArray);

}

module.exports = { connectMTP };