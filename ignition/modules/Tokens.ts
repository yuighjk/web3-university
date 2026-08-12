import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TokensModule = buildModule("TokensModule", (m) => {
  const ydToken = m.contract("YDToken");
  const mockUSDC = m.contract("MockUSDC");
  return { ydToken, mockUSDC };
});

export default TokensModule;
