// Deploys SecureStorage and prints the address and deployment transaction hash.
const { ethers } = require("hardhat");

async function main() {
  const factory = await ethers.getContractFactory("SecureStorage");
  const contract = await factory.deploy();
  await contract.deployed();
  console.log("SecureStorage deployed to:", contract.address);
  console.log("Deployment tx:", contract.deployTransaction.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
