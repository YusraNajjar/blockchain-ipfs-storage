// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract IPFSStorage {
    string public lastHash;

    event HashUploaded(address sender, string ipfsHash);

    function uploadHash(string memory ipfsHash) public {
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        lastHash = ipfsHash;
        emit HashUploaded(msg.sender, ipfsHash);
    }
}
