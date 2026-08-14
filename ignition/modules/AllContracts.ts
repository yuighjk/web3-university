import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AllContractsModule = buildModule("AllContractsModule", (m) => {
  // 1. Deploy tokens
  const ydToken = m.contract("YDToken");
  const mockUSDC = m.contract("MockUSDC");

  // 2. Deploy CourseMarket (treasury = deployer for now)
  const deployer = m.getAccount(0);
  const courseMarket = m.contract("CourseMarket", [ydToken, deployer]);

  // 3. Deploy CourseCertificate
  const courseCertificate = m.contract("CourseCertificate");

  const faucet = m.contract("TestTokenFaucet", [mockUSDC, ydToken, deployer]);
  m.call(mockUSDC, "transfer", [faucet, 9_900n * 10n ** 6n], { id: "fundFaucetMockUSDC" });
  m.call(ydToken, "transfer", [faucet, 9_900n * 10n ** 18n], { id: "fundFaucetYD" });

  return { ydToken, mockUSDC, courseMarket, courseCertificate, faucet };
});

export default AllContractsModule;
