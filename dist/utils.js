"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlgodClient = getAlgodClient;
exports.getLocalAccount = getLocalAccount;
const algosdk_1 = __importDefault(require("algosdk"));
function getAlgodClient(token = '', server = 'http://localhost', port = 4001) {
    return new algosdk_1.default.Algodv2(token, server, port);
}
function getLocalAccount(index = 0) {
    // For development purposes only - would connect to wallet in production
    const kmd = new algosdk_1.default.Kmd('a'.repeat(64), 'http://localhost', 4002);
    // Logic to get account from KMD
    return algosdk_1.default.generateAccount();
}
