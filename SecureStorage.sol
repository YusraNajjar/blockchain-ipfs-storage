// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract SecureStorage {
    address public owner;
    mapping(address => bool) public authorizedUsers;
    mapping(address => string[]) private userFileHashes;
    mapping(bytes32 => address) public cidOwner; // keccak256(CID) -> registrant

    event FileUploaded(address indexed uploader, string ipfsHash);
    event UserAuthorized(address indexed user);
    event UserRevoked(address indexed user);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedUsers[msg.sender], "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedUsers[msg.sender] = true;
    }

    function authorizeUser(address user) external onlyOwner {
        require(user != address(0), "Zero address");
        authorizedUsers[user] = true;
        emit UserAuthorized(user);
    }

    function revokeUser(address user) external onlyOwner {
        require(user != owner, "Cannot revoke owner");
        authorizedUsers[user] = false;
        emit UserRevoked(user);
    }

    // Only whitelisted addresses may anchor a CID; each CID can be anchored once.
    function uploadHash(string calldata ipfsHash) external onlyAuthorized {
        require(bytes(ipfsHash).length > 0, "Empty CID");
        bytes32 key = keccak256(bytes(ipfsHash));
        require(cidOwner[key] == address(0), "CID already registered");
        cidOwner[key] = msg.sender;
        userFileHashes[msg.sender].push(ipfsHash);
        emit FileUploaded(msg.sender, ipfsHash);
    }

    // Chain state and events are public; confidentiality comes from client-side encryption.
    function getHashes(address user) external view returns (string[] memory) {
        return userFileHashes[user];
    }

    function hashCount(address user) external view returns (uint256) {
        return userFileHashes[user].length;
    }
}
