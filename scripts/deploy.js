const hre = require("hardhat");

async function main() {
  const MultiSender = await hre.ethers.getContractFactory("MultiSender");
  const multiSender = await MultiSender.deploy();

  await multiSender.waitForDeployment();

  console.log(`MultiSender deployed to: ${multiSender.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 