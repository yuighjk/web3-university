# 3. Certificate Contract — 开发规格

## 概述

ERC-721 Soulbound Token（SBT），课程学完后由 Owner 颁发，不可转让。

## 合约：CourseCertificate.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CourseCertificate is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // courseId => student => tokenId (0 means not issued)
    mapping(uint256 => mapping(address => uint256)) public certificates;

    event CertificateIssued(address indexed student, uint256 indexed courseId, uint256 tokenId, string tokenURI);

    constructor() ERC721("YiDeng Course Certificate", "YDCERT") Ownable(msg.sender) {}

    function issueCertificate(
        address student,
        uint256 courseId,
        string calldata _tokenURI
    ) external onlyOwner returns (uint256) {
        require(certificates[courseId][student] == 0, "Certificate already issued");

        _nextTokenId++;
        uint256 tokenId = _nextTokenId;

        _safeMint(student, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        certificates[courseId][student] = tokenId;

        emit CertificateIssued(student, courseId, tokenId, _tokenURI);
        return tokenId;
    }

    function hasCertificate(address student, uint256 courseId) external view returns (bool) {
        return certificates[courseId][student] != 0;
    }

    function getCertificateTokenId(address student, uint256 courseId) external view returns (uint256) {
        return certificates[courseId][student];
    }

    // Soulbound: 禁止转让（只允许 mint，即 from == address(0)）
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    // Override required by Solidity
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
```

## 关键设计

### Soulbound 实现
- 重写 `_update()`，只允许 `from == address(0)` 的 mint 操作
- 任何 transfer/transferFrom/safeTransferFrom 都会 revert

### Chainlink 替代方案
- 原本设计：学生请求证书 → Chainlink 查后端"是否学完" → 自动 mint
- 实际方案：后端验证学习进度 → Owner 调用 `issueCertificate()` 手动发证
- 未来可扩展回 Chainlink Functions

### 防重复发证
- `certificates[courseId][student]` mapping 记录是否已发
- 同一课程同一学生只能发一次

## 测试用例

1. issueCertificate 成功 mint NFT 给学生
2. 证书 tokenURI 正确
3. hasCertificate 返回 true
4. 重复发证 revert
5. 非 Owner 发证 revert
6. transferFrom revert（Soulbound）
7. safeTransferFrom revert（Soulbound）
8. approve 后 transferFrom 仍然 revert

## 验收标准

- [ ] 合约编译通过
- [ ] 8 个测试用例全部通过
- [ ] 转让操作确实被阻止
- [ ] 部署到 Sepolia + Etherscan 验证
