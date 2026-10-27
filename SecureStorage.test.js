// Contract tests (T4 to T7 plus unit checks). Requires hardhat-toolbox (ethers v5).
const { expect } = require("chai");
const { ethers } = require("hardhat");

// 46-character string shaped like a CIDv0
const cid = (n) => "Qm" + String(n).padStart(44, "0");

describe("SecureStorage", function () {
  let contract, owner, alice, bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("SecureStorage");
    contract = await factory.deploy();
    await contract.deployed();
  });

  it("authorizes the deployer as owner", async function () {
    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.authorizedUsers(owner.address)).to.equal(true);
  });

  it("lets the owner authorize and revoke, emitting events", async function () {
    await expect(contract.authorizeUser(alice.address))
      .to.emit(contract, "UserAuthorized")
      .withArgs(alice.address);
    expect(await contract.authorizedUsers(alice.address)).to.equal(true);
    await expect(contract.revokeUser(alice.address))
      .to.emit(contract, "UserRevoked")
      .withArgs(alice.address);
    expect(await contract.authorizedUsers(alice.address)).to.equal(false);
  });

  it("rejects authorize and revoke from non-owners", async function () {
    await expect(contract.connect(alice).authorizeUser(bob.address)).to.be.revertedWith("Not owner");
    await expect(contract.connect(alice).revokeUser(owner.address)).to.be.revertedWith("Not owner");
  });

  it("does not allow revoking the owner", async function () {
    await expect(contract.revokeUser(owner.address)).to.be.revertedWith("Cannot revoke owner");
  });

  it("rejects the zero address", async function () {
    await expect(contract.authorizeUser(ethers.constants.AddressZero)).to.be.revertedWith("Zero address");
  });

  it("T4: a non-whitelisted address cannot register a CID", async function () {
    await expect(contract.connect(alice).uploadHash(cid(1))).to.be.revertedWith("Not authorized");
    expect(await contract.hashCount(alice.address)).to.equal(0);
  });

  it("T5: a revoked address cannot register a CID", async function () {
    await contract.authorizeUser(alice.address);
    await contract.connect(alice).uploadHash(cid(2));
    await contract.revokeUser(alice.address);
    await expect(contract.connect(alice).uploadHash(cid(3))).to.be.revertedWith("Not authorized");
    expect(await contract.hashCount(alice.address)).to.equal(1);
  });

  it("T6: a CID can be registered only once, even by another user", async function () {
    await contract.authorizeUser(alice.address);
    await contract.authorizeUser(bob.address);
    await contract.connect(alice).uploadHash(cid(4));
    await expect(contract.connect(alice).uploadHash(cid(4))).to.be.revertedWith("CID already registered");
    await expect(contract.connect(bob).uploadHash(cid(4))).to.be.revertedWith("CID already registered");
  });

  it("T7: a signed transaction cannot be replayed", async function () {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("1") });
    await contract.authorizeUser(wallet.address);

    const unsigned = await contract.connect(wallet).populateTransaction.uploadHash(cid(5));
    const raw = await wallet.signTransaction(await wallet.populateTransaction(unsigned));
    await (await ethers.provider.sendTransaction(raw)).wait();

    let rejected = false;
    try {
      await ethers.provider.sendTransaction(raw);
    } catch (err) {
      rejected = true;
    }
    expect(rejected).to.equal(true);
    expect(await contract.hashCount(wallet.address)).to.equal(1);
  });

  it("rejects an empty CID", async function () {
    await expect(contract.uploadHash("")).to.be.revertedWith("Empty CID");
  });

  it("records the registrant, stores the CID and emits FileUploaded", async function () {
    await expect(contract.uploadHash(cid(6)))
      .to.emit(contract, "FileUploaded")
      .withArgs(owner.address, cid(6));
    const key = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(cid(6)));
    expect(await contract.cidOwner(key)).to.equal(owner.address);
    expect(await contract.hashCount(owner.address)).to.equal(1);
    expect(await contract.getHashes(owner.address)).to.deep.equal([cid(6)]);
  });

  it("keeps earlier CIDs when a user registers more", async function () {
    await contract.uploadHash(cid(7));
    await contract.uploadHash(cid(8));
    expect(await contract.getHashes(owner.address)).to.deep.equal([cid(7), cid(8)]);
  });

  it("reports gas for a registration by a whitelisted user", async function () {
    await contract.authorizeUser(alice.address);
    const receipt = await (await contract.connect(alice).uploadHash(cid(9))).wait();
    console.log("      uploadHash gas used:", receipt.gasUsed.toString());
    expect(receipt.gasUsed.gt(0)).to.equal(true);
  });
});
