// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CourseMarket
/// @notice 课程市场合约 — 上架、购买、查询
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
        require(_ydToken != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        ydToken = IERC20(_ydToken);
        treasury = _treasury;
    }

    /// @notice Owner 授权/撤销 Provider 角色
    function setProvider(address provider, ProviderType pType) external onlyOwner {
        require(provider != address(0), "Invalid provider address");
        providers[provider] = pType;
        emit ProviderSet(provider, pType);
    }

    /// @notice Owner 上架课程
    function publishCourse(
        uint256 courseId,
        address provider,
        string calldata metadataURI,
        bytes32 contentHash,
        string calldata certificateName,
        uint256 price
    ) external onlyOwner {
        require(courses[courseId].id == 0 && courseId != 0, "Course already exists or invalid id");
        require(providers[provider] != ProviderType.None, "Provider not authorized");
        require(price > 0, "Price must be greater than 0");

        courses[courseId] = Course({
            id: courseId,
            provider: provider,
            metadataURI: metadataURI,
            contentHash: contentHash,
            certificateName: certificateName,
            price: price,
            active: true
        });

        courseIds.push(courseId);
        courseCount++;

        emit CoursePublished(courseId, provider, price);
    }

    /// @notice Owner 下架课程
    function delistCourse(uint256 courseId) external onlyOwner {
        require(courses[courseId].active, "Course not active");
        courses[courseId].active = false;
        emit CourseDelisted(courseId);
    }

    /// @notice 用户购买课程（需先 approve YD 给本合约）
    function buyCourse(uint256 courseId) external {
        Course storage course = courses[courseId];
        require(course.active, "Course not active");
        require(!purchased[msg.sender][courseId], "Already purchased");

        bool success = ydToken.transferFrom(msg.sender, treasury, course.price);
        require(success, "Transfer failed");

        purchased[msg.sender][courseId] = true;
        userPurchases[msg.sender].push(courseId);

        emit CoursePurchased(msg.sender, courseId, course.price);
    }

    /// @notice 查询用户是否已购买某课程
    function hasPurchased(address user, uint256 courseId) external view returns (bool) {
        return purchased[user][courseId];
    }

    /// @notice 获取用户已购课程列表
    function getPurchasedCourses(address user) external view returns (uint256[] memory) {
        return userPurchases[user];
    }

    /// @notice 获取所有课程 ID
    function getAllCourseIds() external view returns (uint256[] memory) {
        return courseIds;
    }

    /// @notice 获取课程详情
    function getCourse(uint256 courseId) external view returns (Course memory) {
        return courses[courseId];
    }
}
