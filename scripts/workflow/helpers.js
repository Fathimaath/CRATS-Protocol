const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Loads deployment information for the current network.
 */
async function getDeploymentInfo() {
    const networkName = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    // Look in root deployments folder
    // Look in root deployments folder
    const deploymentFile = path.join(process.cwd(), "deployments", `${networkName}-deployment.json`);

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
    const deploymentFile = path.join(process.cwd(), "deployments", `${networkName}-deployment.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(info, null, 2));
}

/**
 * Simple delay helper.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Saves a result for a specific workflow step.
 */
async function saveWorkflowResult(stepId, data) {
    const networkName = hre.network.name === "unknown" ? "localhost" : hre.network.name;
    const resultsFile = path.join(process.cwd(), "deployments", `${networkName}-workflow-results.json`);
    
    let results = { lastRun: new Date().toISOString(), steps: [] };
    if (fs.existsSync(resultsFile)) {
        results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    }
    
    // Update or append step
    const index = results.steps.findIndex(s => s.id === stepId);
    if (index !== -1) {
        results.steps[index] = { ...results.steps[index], ...data, id: stepId, timestamp: new Date().toISOString() };
    } else {
        results.steps.push({ ...data, id: stepId, timestamp: new Date().toISOString() });
    }
    
    results.lastRun = new Date().toISOString();
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}

module.exports = {
    getDeploymentInfo,
    saveDeploymentInfo,
    saveWorkflowResult,
    sleep
};
