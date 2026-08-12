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

  return { ydToken, mockUSDC, courseMarket, courseCertificate };
});

export default AllContractsModule;
