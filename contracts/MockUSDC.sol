// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock USDC
/// @notice 测试用 USDC，6 位小数，带 faucet 功能
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice 测试水龙头，单次最多领取 10,000 USDC
    function faucet(uint256 amount) external {
        require(amount <= 10_000 * 10 ** 6, "Max 10000 USDC per faucet");
        _mint(msg.sender, amount);
    }
}
