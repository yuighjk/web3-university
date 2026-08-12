import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

describe("CourseCertificate", function () {
  let viem: any;
  let cert: any;
  let owner: any;
  let student: any;
  let otherAccount: any;

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    viem = connection.viem;
    [owner, student, otherAccount] = await viem.getWalletClients();
    cert = await viem.deployContract("CourseCertificate");
  });

  describe("issueCertificate", function () {
    it("should mint certificate to student", async function () {
      await cert.write.issueCertificate([
        student.account.address,
        1n,
        "ipfs://QmTest123",
      ]);

      const hasCert = await cert.read.hasCertificate([student.account.address, 1n]);
      assert.equal(hasCert, true);

      const tokenId = await cert.read.getCertificateTokenId([student.account.address, 1n]);
      assert.equal(tokenId, 1n);
    });

    it("should set correct tokenURI", async function () {
      await cert.write.issueCertificate([
        student.account.address,
        1n,
        "ipfs://QmTest123",
      ]);

      const uri = await cert.read.tokenURI([1n]);
      assert.equal(uri, "ipfs://QmTest123");
    });

    it("should revert on duplicate certificate", async function () {
      await cert.write.issueCertificate([
        student.account.address,
        1n,
        "ipfs://QmTest123",
      ]);

      await assert.rejects(
        cert.write.issueCertificate([
          student.account.address,
          1n,
          "ipfs://QmTest456",
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Certificate already issued"));
          return true;
        }
      );
    });

    it("should revert when non-owner issues", async function () {
      const certAsStudent = await viem.getContractAt(
        "CourseCertificate",
        cert.address,
        { client: { wallet: student } }
      );

      await assert.rejects(
        certAsStudent.write.issueCertificate([
          student.account.address,
          1n,
          "ipfs://QmTest",
        ]),
        (err: any) => {
          assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
          return true;
        }
      );
    });

    it("should emit CertificateIssued event", async function () {
      const publicClient = await viem.getPublicClient();
      const hash = await cert.write.issueCertificate([
        student.account.address,
        1n,
        "ipfs://QmEvent",
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const events = await cert.getEvents.CertificateIssued();
      assert.equal(events.length, 1);
      assert.equal(events[0].args.student?.toLowerCase(), student.account.address.toLowerCase());
      assert.equal(events[0].args.courseId, 1n);
      assert.equal(events[0].args.tokenId, 1n);
    });
  });

  describe("Soulbound (non-transferable)", function () {
    beforeEach(async function () {
      await cert.write.issueCertificate([
        student.account.address,
        1n,
        "ipfs://QmSBT",
      ]);
    });

    it("should revert on transferFrom", async function () {
      const certAsStudent = await viem.getContractAt(
        "CourseCertificate",
        cert.address,
        { client: { wallet: student } }
      );

      await assert.rejects(
        certAsStudent.write.transferFrom([
          student.account.address,
          otherAccount.account.address,
          1n,
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Soulbound: non-transferable"));
          return true;
        }
      );
    });

    it("should revert on safeTransferFrom", async function () {
      const certAsStudent = await viem.getContractAt(
        "CourseCertificate",
        cert.address,
        { client: { wallet: student } }
      );

      await assert.rejects(
        certAsStudent.write.safeTransferFrom([
          student.account.address,
          otherAccount.account.address,
          1n,
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Soulbound: non-transferable"));
          return true;
        }
      );
    });

    it("should revert even with approval", async function () {
      const certAsStudent = await viem.getContractAt(
        "CourseCertificate",
        cert.address,
        { client: { wallet: student } }
      );

      await certAsStudent.write.approve([otherAccount.account.address, 1n]);

      const certAsOther = await viem.getContractAt(
        "CourseCertificate",
        cert.address,
        { client: { wallet: otherAccount } }
      );

      await assert.rejects(
        certAsOther.write.transferFrom([
          student.account.address,
          otherAccount.account.address,
          1n,
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Soulbound: non-transferable"));
          return true;
        }
      );
    });
  });

  describe("queries", function () {
    it("hasCertificate returns false when not issued", async function () {
      const hasCert = await cert.read.hasCertificate([student.account.address, 99n]);
      assert.equal(hasCert, false);
    });

    it("getCertificateTokenId returns 0 when not issued", async function () {
      const tokenId = await cert.read.getCertificateTokenId([student.account.address, 99n]);
      assert.equal(tokenId, 0n);
    });
  });
});
