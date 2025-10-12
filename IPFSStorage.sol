// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract SecureStorage {
    address public owner;  // Contract creator / owner
    mapping(address => bool) public authorizedUsers;  // Users allowed to access data
    mapping(address => string[]) private userFileHashes;  // Stores multiple IPFS hashes per user

    // Events for transparency and traceability
    event FileUploaded(address indexed uploader, string ipfsHash);
    event UserAuthorized(address indexed user);
    event UserRevoked(address indexed user);

    constructor() {
        owner = msg.sender;  // The deployer is the owner
        authorizedUsers[owner] = true; // Owner is automatically authorized
    }

    // Modifier to restrict function to only owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Modifier to restrict function to authorized users
    modifier onlyAuthorized() {
        require(authorizedUsers[msg.sender], "Not authorized");
        _;
    }

    // Owner can authorize other users dynamically
    function authorizeUser(address user) public onlyOwner {
        authorizedUsers[user] = true;
        emit UserAuthorized(user);
    }

    // Owner can revoke authorization from users
    function revokeUser(address user) public onlyOwner {
        authorizedUsers[user] = false;
        emit UserRevoked(user);
    }

    // Users can upload their IPFS hash (auto-authorize themselves if not already)
    function uploadHash(string memory ipfsHash) public {
        userFileHashes[msg.sender].push(ipfsHash);
        if (!authorizedUsers[msg.sender]) {
            authorizedUsers[msg.sender] = true;
            emit UserAuthorized(msg.sender);
        }
        emit FileUploaded(msg.sender, ipfsHash);
    }

    // Only authorized users can retrieve hashes of any user
    function getHashes(address user) public view onlyAuthorized returns (string[] memory) {
        return userFileHashes[user];
    }
}
