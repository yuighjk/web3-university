import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TokensModule = buildModule("TokensModule", (m) => {
  const ydToken = m.contract("YDToken");
  const mockUSDC = m.contract("MockUSDC");
  const deployer = m.getAccount(0);
  const faucet = m.contract("TestTokenFaucet", [mockUSDC, ydToken, deployer]);
  m.call(mockUSDC, "transfer", [faucet, 9_900n * 10n ** 6n], { id: "fundFaucetMockUSDC" });
  m.call(ydToken, "transfer", [faucet, 9_900n * 10n ** 18n], { id: "fundFaucetYD" });
  return { ydToken, mockUSDC, faucet };
});

export default TokensModule;
