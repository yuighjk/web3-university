import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, keccak256, encodePacked } from "viem";

describe("CourseMarket", function () {
  let viem: any;
  let ydToken: any;
  let courseMarket: any;
  let owner: any;
  let teacher: any;
  let student: any;
  let publicClient: any;

  const COURSE_PRICE = parseUnits("4", 18); // 4 YD

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    viem = connection.viem;
    [owner, teacher, student] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();

    ydToken = await viem.deployContract("YDToken");
    courseMarket = await viem.deployContract("CourseMarket", [
      ydToken.address,
      owner.account.address, // treasury = owner
    ]);

    // Transfer some YD to student for buying
    await ydToken.write.transfer([student.account.address, parseUnits("100", 18)]);
  });

  describe("setProvider", function () {
    it("should allow owner to set provider", async function () {
      await courseMarket.write.setProvider([teacher.account.address, 1]); // Teacher
      const pType = await courseMarket.read.providers([teacher.account.address]);
      assert.equal(pType, 1);
    });

    it("should revert when non-owner calls setProvider", async function () {
      const marketAsStudent = await viem.getContractAt(
        "CourseMarket",
        courseMarket.address,
        { client: { wallet: student } }
      );
      await assert.rejects(
        marketAsStudent.write.setProvider([teacher.account.address, 1]),
        (err: any) => {
          assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
          return true;
        }
      );
    });
  });

  describe("publishCourse", function () {
    beforeEach(async function () {
      await courseMarket.write.setProvider([teacher.account.address, 1]);
    });

    it("should publish a course successfully", async function () {
      const contentHash = keccak256(encodePacked(["string"], ["test-content"]));
      await courseMarket.write.publishCourse([
        1n,
        teacher.account.address,
        "https://api.example.com/courses/1",
        contentHash,
        "Web3 Dev Certificate",
        COURSE_PRICE,
      ]);

      const course = await courseMarket.read.getCourse([1n]);
      assert.equal(course.id, 1n);
      assert.equal(course.provider.toLowerCase(), teacher.account.address.toLowerCase());
      assert.equal(course.price, COURSE_PRICE);
      assert.equal(course.active, true);
    });

    it("should revert on duplicate courseId", async function () {
      const contentHash = keccak256(encodePacked(["string"], ["test"]));
      await courseMarket.write.publishCourse([
        1n, teacher.account.address, "uri", contentHash, "cert", COURSE_PRICE,
      ]);

      await assert.rejects(
        courseMarket.write.publishCourse([
          1n, teacher.account.address, "uri2", contentHash, "cert2", COURSE_PRICE,
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Course already exists"));
          return true;
        }
      );
    });

    it("should revert if provider not authorized", async function () {
      const contentHash = keccak256(encodePacked(["string"], ["test"]));
      await assert.rejects(
        courseMarket.write.publishCourse([
          1n, student.account.address, "uri", contentHash, "cert", COURSE_PRICE,
        ]),
        (err: any) => {
          assert.ok(err.message.includes("Provider not authorized"));
          return true;
        }
      );
    });
  });

  describe("buyCourse", function () {
    beforeEach(async function () {
      await courseMarket.write.setProvider([teacher.account.address, 1]);
      const contentHash = keccak256(encodePacked(["string"], ["content"]));
      await courseMarket.write.publishCourse([
        1n, teacher.account.address, "uri", contentHash, "cert", COURSE_PRICE,
      ]);
    });

    it("should buy course successfully after approve", async function () {
      const ydAsStudent = await viem.getContractAt("YDToken", ydToken.address, {
        client: { wallet: student },
      });
      await ydAsStudent.write.approve([courseMarket.address, COURSE_PRICE]);

      const marketAsStudent = await viem.getContractAt(
        "CourseMarket", courseMarket.address, { client: { wallet: student } }
      );
      await marketAsStudent.write.buyCourse([1n]);

      const hasPurchased = await courseMarket.read.hasPurchased([student.account.address, 1n]);
      assert.equal(hasPurchased, true);
    });

    it("should revert without approve", async function () {
      const marketAsStudent = await viem.getContractAt(
        "CourseMarket", courseMarket.address, { client: { wallet: student } }
      );
      await assert.rejects(
        marketAsStudent.write.buyCourse([1n]),
        (err: any) => {
          assert.ok(err.message.includes("ERC20InsufficientAllowance"));
          return true;
        }
      );
    });

    it("should revert on duplicate purchase", async function () {
      const ydAsStudent = await viem.getContractAt("YDToken", ydToken.address, {
        client: { wallet: student },
      });
      await ydAsStudent.write.approve([courseMarket.address, COURSE_PRICE * 2n]);

      const marketAsStudent = await viem.getContractAt(
        "CourseMarket", courseMarket.address, { client: { wallet: student } }
      );
      await marketAsStudent.write.buyCourse([1n]);

      await assert.rejects(
        marketAsStudent.write.buyCourse([1n]),
        (err: any) => {
          assert.ok(err.message.includes("Already purchased"));
          return true;
        }
      );
    });
  });

  describe("delistCourse", function () {
    beforeEach(async function () {
      await courseMarket.write.setProvider([teacher.account.address, 1]);
      const contentHash = keccak256(encodePacked(["string"], ["content"]));
      await courseMarket.write.publishCourse([
        1n, teacher.account.address, "uri", contentHash, "cert", COURSE_PRICE,
      ]);
    });

    it("should delist course and prevent buying", async function () {
      await courseMarket.write.delistCourse([1n]);

      const course = await courseMarket.read.getCourse([1n]);
      assert.equal(course.active, false);

      const ydAsStudent = await viem.getContractAt("YDToken", ydToken.address, {
        client: { wallet: student },
      });
      await ydAsStudent.write.approve([courseMarket.address, COURSE_PRICE]);

      const marketAsStudent = await viem.getContractAt(
        "CourseMarket", courseMarket.address, { client: { wallet: student } }
      );
      await assert.rejects(
        marketAsStudent.write.buyCourse([1n]),
        (err: any) => {
          assert.ok(err.message.includes("Course not active"));
          return true;
        }
      );
    });
  });

  describe("query methods", function () {
    beforeEach(async function () {
      await courseMarket.write.setProvider([teacher.account.address, 1]);
      const contentHash = keccak256(encodePacked(["string"], ["content"]));
      await courseMarket.write.publishCourse([
        1n, teacher.account.address, "uri1", contentHash, "cert1", COURSE_PRICE,
      ]);
      await courseMarket.write.publishCourse([
        2n, teacher.account.address, "uri2", contentHash, "cert2", COURSE_PRICE,
      ]);

      // Student buys course 1
      const ydAsStudent = await viem.getContractAt("YDToken", ydToken.address, {
        client: { wallet: student },
      });
      await ydAsStudent.write.approve([courseMarket.address, COURSE_PRICE]);
      const marketAsStudent = await viem.getContractAt(
        "CourseMarket", courseMarket.address, { client: { wallet: student } }
      );
      await marketAsStudent.write.buyCourse([1n]);
    });

    it("getAllCourseIds returns all ids", async function () {
      const ids = await courseMarket.read.getAllCourseIds();
      assert.equal(ids.length, 2);
      assert.equal(ids[0], 1n);
      assert.equal(ids[1], 2n);
    });

    it("getPurchasedCourses returns student purchases", async function () {
      const purchased = await courseMarket.read.getPurchasedCourses([student.account.address]);
      assert.equal(purchased.length, 1);
      assert.equal(purchased[0], 1n);
    });

    it("hasPurchased returns correct values", async function () {
      assert.equal(await courseMarket.read.hasPurchased([student.account.address, 1n]), true);
      assert.equal(await courseMarket.read.hasPurchased([student.account.address, 2n]), false);
    });
  });
});
