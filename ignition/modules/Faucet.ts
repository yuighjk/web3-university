import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FaucetModule = buildModule("FaucetModule", (m) => {
  const deployer = m.getAccount(0);
  const mockUSDCAddress = m.getParameter<string>("mockUSDCAddress");
  const ydTokenAddress = m.getParameter<string>("ydTokenAddress");
  // Use the existing tokens so claimed mUSDC remains compatible with the
  // already-created mUSDC/YD Uniswap pool.
  const mockUSDC = m.contractAt("MockUSDC", mockUSDCAddress);
  const ydToken = m.contractAt("YDToken", ydTokenAddress);
  const faucet = m.contract("TestTokenFaucet", [mockUSDC, ydToken, deployer]);

  m.call(mockUSDC, "transfer", [faucet, 9_900n * 10n ** 6n], { id: "fundExistingFaucetMockUSDC" });
  m.call(ydToken, "transfer", [faucet, 9_900n * 10n ** 18n], { id: "fundExistingFaucetYD" });

  return { faucet };
});

export default FaucetModule;
