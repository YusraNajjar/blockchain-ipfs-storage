require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Gas depends on compiler version and optimizer settings: report both with any results.
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
