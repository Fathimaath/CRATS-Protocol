const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Loads deployment information for the current network.
 */
async function getDeploymentInfo() {
    const networkName = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    const deploymentFile = path.join(__dirname, "..", "deployments", `${networkName}-deployment.json`);
    
    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found: ${deploymentFile}. Run deployment scripts first.`);
    }
    
    return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

/**
 * Saves updated deployment information.
 */
async function saveDeploymentInfo(info) {
    const networkName = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    const deploymentFile = path.join(__dirname, "..", "deployments", `${networkName}-deployment.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(info, null, 2));
}

/**
 * Simple delay helper.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    getDeploymentInfo,
    saveDeploymentInfo,
    sleep
};
