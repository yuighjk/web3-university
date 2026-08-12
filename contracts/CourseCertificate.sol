// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CourseCertificate
/// @notice Soulbound NFT 毕业证书 — 不可转让
contract CourseCertificate is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // courseId => student => tokenId (0 means not issued)
    mapping(uint256 => mapping(address => uint256)) public certificates;

    event CertificateIssued(address indexed student, uint256 indexed courseId, uint256 tokenId, string tokenURI);

    constructor() ERC721("YiDeng Course Certificate", "YDCERT") Ownable(msg.sender) {}

    /// @notice Owner 给学生发证书
    function issueCertificate(
        address student,
        uint256 courseId,
        string calldata _tokenURI
    ) external onlyOwner returns (uint256) {
        require(student != address(0), "Invalid student address");
        require(certificates[courseId][student] == 0, "Certificate already issued");

        _nextTokenId++;
        uint256 tokenId = _nextTokenId;

        _safeMint(student, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        certificates[courseId][student] = tokenId;

        emit CertificateIssued(student, courseId, tokenId, _tokenURI);
        return tokenId;
    }

    /// @notice 查询学生是否已获得某课程证书
    function hasCertificate(address student, uint256 courseId) external view returns (bool) {
        return certificates[courseId][student] != 0;
    }

    /// @notice 获取学生某课程的证书 tokenId
    function getCertificateTokenId(address student, uint256 courseId) external view returns (uint256) {
        return certificates[courseId][student];
    }

    /// @notice Soulbound: 禁止转让（只允许 mint，即 from == address(0)）
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }

    // Override required by Solidity for multiple inheritance
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
