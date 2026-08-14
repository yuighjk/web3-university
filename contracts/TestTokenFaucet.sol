// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TestTokenFaucet is Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable mockUSDC;
    IERC20 public immutable ydToken;
    uint256 public constant COOLDOWN = 24 hours;
    uint256 public constant MUSDC_CLAIM_AMOUNT = 100 * 10 ** 6;
    uint256 public constant YD_CLAIM_AMOUNT = 100 * 10 ** 18;
    mapping(address => uint256) public lastClaimAt;
    event Claimed(address indexed account, address indexed token, uint256 amount, uint256 claimedAt);
    constructor(address mockUSDCAddress, address ydTokenAddress, address initialOwner) Ownable(initialOwner) {
        require(mockUSDCAddress != address(0) && ydTokenAddress != address(0), "Invalid token");
        mockUSDC = IERC20(mockUSDCAddress);
        ydToken = IERC20(ydTokenAddress);
    }
    function claim(bool claimYD) external {
        require(block.timestamp >= lastClaimAt[msg.sender] + COOLDOWN, "Claim cooldown active");
        IERC20 token = claimYD ? ydToken : mockUSDC;
        uint256 amount = claimYD ? YD_CLAIM_AMOUNT : MUSDC_CLAIM_AMOUNT;
        require(token.balanceOf(address(this)) >= amount, "Faucet reserve depleted");
        lastClaimAt[msg.sender] = block.timestamp;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, address(token), amount, block.timestamp);
    }
    function withdraw(address token, address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(recipient, amount);
    }
}
