# 2. Course Market Contract — 开发规格

## 概述

课程市场合约，负责课程上架、购买、查询。Owner 管理角色和课程，用户用 YD 代币购买。

## 合约：CourseMarket.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CourseMarket is Ownable {
    enum ProviderType { None, Teacher, Merchant }

    struct Course {
        uint256 id;
        address provider;
        string metadataURI;
        bytes32 contentHash;
        string certificateName;
        uint256 price;
        bool active;
    }

    IERC20 public ydToken;
    address public treasury;

    uint256 public courseCount;
    uint256[] public courseIds;
    mapping(uint256 => Course) public courses;
    mapping(address => ProviderType) public providers;
    mapping(address => mapping(uint256 => bool)) public purchased;
    mapping(address => uint256[]) private userPurchases;

    event ProviderSet(address indexed provider, ProviderType pType);
    event CoursePublished(uint256 indexed courseId, address indexed provider, uint256 price);
    event CourseDelisted(uint256 indexed courseId);
    event CoursePurchased(address indexed buyer, uint256 indexed courseId, uint256 price);

    constructor(address _ydToken, address _treasury) Ownable(msg.sender) {
        ydToken = IERC20(_ydToken);
        treasury = _treasury;
    }

    function setProvider(address provider, ProviderType pType) external onlyOwner;
    function publishCourse(uint256 courseId, address provider, string calldata metadataURI, bytes32 contentHash, string calldata certificateName, uint256 price) external onlyOwner;
    function delistCourse(uint256 courseId) external onlyOwner;
    function buyCourse(uint256 courseId) external;
    function hasPurchased(address user, uint256 courseId) external view returns (bool);
    function getPurchasedCourses(address user) external view returns (uint256[] memory);
    function getAllCourseIds() external view returns (uint256[] memory);
    function getCourse(uint256 courseId) external view returns (Course memory);
}
```

## 关键逻辑

### publishCourse
- require provider 已被授权（ProviderType != None）
- require courseId 不重复
- 存储 Course struct，push 到 courseIds 数组
- courseCount++
- emit CoursePublished

### buyCourse
- require course.active == true
- require !purchased[msg.sender][courseId]
- ydToken.transferFrom(msg.sender, treasury, course.price)
- purchased[msg.sender][courseId] = true
- userPurchases[msg.sender].push(courseId)
- emit CoursePurchased

### getAllCourseIds
- 返回 courseIds 数组（支持前端枚举）

## 测试用例

1. Owner setProvider 成功
2. 非 Owner setProvider revert
3. publishCourse 成功（provider 已授权）
4. publishCourse 重复 courseId revert
5. buyCourse 成功（approve 后）
6. buyCourse 未 approve revert（transferFrom 失败）
7. buyCourse 重复购买 revert
8. delistCourse 后 buyCourse revert
9. hasPurchased / getPurchasedCourses 返回正确
10. getAllCourseIds 返回完整列表

## 验收标准

- [ ] 合约编译通过
- [ ] 10 个测试用例全部通过
- [ ] 部署到 Sepolia + Etherscan 验证
