import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";

describe("YDToken", function () {
  let viem: any;
  let ydToken: any;
  let owner: any;
  let otherAccount: any;

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    viem = connection.viem;
    [owner, otherAccount] = await viem.getWalletClients();
    ydToken = await viem.deployContract("YDToken");
  });

  it("should have correct name and symbol", async function () {
    const name = await ydToken.read.name();
    const symbol = await ydToken.read.symbol();
    assert.equal(name, "YiDeng Token");
    assert.equal(symbol, "YD");
  });

  it("should have totalSupply of 1,000,000 YD", async function () {
    const totalSupply = await ydToken.read.totalSupply();
    assert.equal(totalSupply, parseUnits("1000000", 18));
  });

  it("should assign totalSupply to deployer", async function () {
    const balance = await ydToken.read.balanceOf([owner.account.address]);
    const totalSupply = await ydToken.read.totalSupply();
    assert.equal(balance, totalSupply);
  });

  it("should transfer tokens correctly", async function () {
    const amount = parseUnits("100", 18);
    await ydToken.write.transfer([otherAccount.account.address, amount]);

    const ownerBalance = await ydToken.read.balanceOf([owner.account.address]);
    const otherBalance = await ydToken.read.balanceOf([otherAccount.account.address]);

    assert.equal(otherBalance, amount);
    assert.equal(ownerBalance, parseUnits("1000000", 18) - amount);
  });
});

describe("MockUSDC", function () {
  let viem: any;
  let usdc: any;
  let owner: any;
  let otherAccount: any;

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    viem = connection.viem;
    [owner, otherAccount] = await viem.getWalletClients();
    usdc = await viem.deployContract("MockUSDC");
  });

  it("should have decimals of 6", async function () {
    const decimals = await usdc.read.decimals();
    assert.equal(decimals, 6);
  });

  it("should have correct name and symbol", async function () {
    const name = await usdc.read.name();
    const symbol = await usdc.read.symbol();
    assert.equal(name, "Mock USDC");
    assert.equal(symbol, "USDC");
  });

  it("should mint 1,000,000 USDC to deployer", async function () {
    const balance = await usdc.read.balanceOf([owner.account.address]);
    assert.equal(balance, parseUnits("1000000", 6));
  });

  it("does not expose an unlimited public mint faucet", async function () {
    assert.equal(usdc.abi.some((entry: any) => entry.type === "function" && entry.name === "faucet"), false);
  });
});

describe("TestTokenFaucet", function () {
  it("transfers a chosen token and enforces one claim every 24 hours", async function () {
    const connection = await network.getOrCreate();
    const viem = connection.viem;
    const [owner, student] = await viem.getWalletClients();
    const ydToken = await viem.deployContract("YDToken");
    const mockUSDC = await viem.deployContract("MockUSDC");
    const faucet = await viem.deployContract("TestTokenFaucet", [mockUSDC.address, ydToken.address, owner.account.address]);
    await mockUSDC.write.transfer([faucet.address, parseUnits("9900", 6)]);
    await ydToken.write.transfer([faucet.address, parseUnits("9900", 18)]);
    const studentFaucet = await viem.getContractAt("TestTokenFaucet", faucet.address, { client: { wallet: student } });
    await studentFaucet.write.claim([false]);
    assert.equal(await mockUSDC.read.balanceOf([student.account.address]), parseUnits("100", 6));
    assert.equal(await mockUSDC.read.balanceOf([faucet.address]), parseUnits("9800", 6));
    await assert.rejects(studentFaucet.write.claim([true]), (error: any) => {
      assert.ok(error.message.includes("Claim cooldown active"));
      return true;
    });
  });
});
