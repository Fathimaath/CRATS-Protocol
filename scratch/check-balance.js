const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Sepolia ETH balance:", hre.ethers.formatEther(balance));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
