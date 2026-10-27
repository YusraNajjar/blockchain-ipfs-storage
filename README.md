# Blockchain-IPFS Storage

Contract, tests and a reproducible benchmark for a hybrid storage design: files are encrypted on the client with AES-256-GCM, the ciphertext is pinned to IPFS, and its CID is registered in an Ethereum smart contract.

**Paper:** [FILL title and DOI]
**Authors:** Yusra Al Najjar, Anas Oraiqat, Salah Badran
**License:** MIT

## What the design provides

- **Confidentiality:** client-side AES-256-GCM with a fresh key and nonce per file.
- **Tamper evidence:** a modified ciphertext changes the CID and fails the GCM tag check.
- **Write authorization:** only addresses on an owner-managed whitelist can register CIDs; revocation takes effect for later transactions.
- **Uniqueness and non-repudiation:** each CID can be registered once, and the registration binds an address, a CID and a block.

## What it does not provide

Read-access control beyond possession of the file key, availability of pinned data, metadata privacy (addresses, timestamps, CIDs and ciphertext sizes are public), erasure of registered CIDs, and key management. See the paper for the threat model and the discussion of limitations.

## Repository layout

```
contracts/SecureStorage.sol      registry contract
test/SecureStorage.test.js       contract tests (Hardhat)
tests-offchain/crypto.test.js    AES-GCM tamper, truncation, swap and wrong-key tests
scripts/deploy.js                deploys the contract to Sepolia
scripts/make_samples.js          builds the benchmark sample files in data/
scripts/measure.js               benchmark harness (Node, automated, needs RPC URL and test-wallet key)
scripts/measure_browser.html     benchmark page for MetaMask (manual confirmations, no RPC URL needed)
scripts/lib/aes.js               encryption helpers shared by the harness and tests
notebooks/run_benchmark.ipynb    Colab notebook: tests, deploy, smoke test, benchmark, stats
analysis/stats.py                statistics and figures from results.json
results/                         measurements, summary and figures of the paper
DEPLOYMENT.md                    deployed contract record
data/SAMPLES.md                  sample file sizes and hashes
env.example                      configuration template
```

## Requirements

- Node.js 20.6 or newer
- Python 3.10 or newer with numpy, scipy, pandas and matplotlib
- A Sepolia RPC endpoint and a dedicated test wallet funded from a Sepolia faucet
- A Pinata account with a scoped, upload-only key

## Setup

```
npm install
pip install numpy scipy pandas matplotlib
cp env.example .env
```

Fill in `.env`. Use a wallet that holds only testnet funds. Never commit `.env`, and never place a pinning-service credential in client-side code.

## Test

```
npm test              # contract tests: authorization, revocation, uniqueness, replay
npm run test:crypto   # off-chain tests: tampering, truncation, substitution, wrong key
REPORT_GAS=true npm test
```

## Deploy

```
npm run deploy:sepolia
```

Copy the printed address into `CONTRACT` in `.env`, and record the address and the deployment transaction hash.

## Run the benchmark

```
npm run samples      # builds data/sample_*.bin (random content, 100 KiB to 50 MiB); SAMPLE_SIZES=512KiB,5MiB limits it
npm run measure      # writes results/results.json
npm run stats        # writes results/figs/summary.csv and three figures
```

The harness runs `RUNS` rounds; each round processes every file in random order. For every run it times encryption, upload, transaction broadcast, confirmation and retrieval (full body download), then verifies the downloaded ciphertext hash and the decrypted plaintext hash. Before each broadcast the harness pauses for a random time (up to `JITTER_MS`, default 12 s) so the broadcast moment is not locked to the 12-second block cadence, and it checks for the receipt every `POLL_MS` (default 250 ms) so confirmation times are not coarsened by the 4 s default of ethers v5. Gas used and effective gas price come from the receipt. Failed runs are recorded under `failures`, not dropped.

`analysis/stats.py` reports the mean, sample standard deviation, median and IQR, t-based and bootstrap 95% confidence intervals, a linear fit of total time against size, and Kruskal-Wallis tests of whether confirmation time and gas depend on file size.

## Run in the browser with MetaMask (no RPC URL, no private key outside MetaMask)

1. Deploy `contracts/SecureStorage.sol` from Remix with the Injected Provider (MetaMask on Sepolia) and note the address and transaction hash.
2. From the project folder, run `python -m http.server 8000` and open `http://localhost:8000/scripts/measure_browser.html` in a browser with MetaMask.
3. Enter the Pinata JWT and the contract address, choose your sample files, set the number of runs, and click Start. Confirm each MetaMask popup.
4. Click "Download results.json" and run `python analysis/stats.py results.json results/figs`.

In this mode the time you take to click Confirm is stored as `walletApproval` and excluded from `total` (`broadcast` is recorded as 0). State this in the paper's methodology.

## Run on Google Colab

Open `notebooks/run_benchmark.ipynb` in Colab and run the cells in order. It installs the dependencies, runs the tests, deploys the contract, runs a smoke test (`SMOKE = True`), then the full benchmark (`SMOKE = False`), and produces the summary table and figures. Secrets are typed at prompts, written to a temporary `.env` and deleted at the end.

## Reproducibility checklist

Record these with every reported result:

- Git commit hash and release DOI
- Contract address and deployment transaction hash
- Solidity compiler version and optimizer settings (see `hardhat.config.js`); gas depends on them
- Node, ethers and Hardhat versions
- Pinning plan, gateway and RPC provider
- Client machine, network location and measured bandwidth
- Number of confirmations awaited
- Date and time of the runs

## Results

`results/` holds the data behind the paper:

- `results/results.json`: the 181 verified runs of batches 2 to 4 merged (stage times, gas, gas price, transaction hashes, CIDs) and the 29 recorded failures.
- `results/raw/`: the raw batch files and the pilot batch (`pilot_batch1.json`, excluded from every statistic because it used 4 s receipt polling and no random pause). API keys that appeared in error messages were redacted.
- `results/figs/summary.csv`: per-size statistics from `analysis/stats.py`.
- `results/paper_figures/`: the figures of the paper (PDF and PNG).
- `results/environment.json`: tool versions used.

`results/results.template.json` documents the file structure.

## Reproduce the paper's numbers

```
python analysis/stats.py results/results.json results/figs
python analysis/make_paper_figures.py results/results.json results/paper_figures
```

The sample files are described in `data/SAMPLES.md`. The deployment is recorded in `DEPLOYMENT.md`.

## Security notes

- Revoke any credential that was ever committed or pasted into a file; deleting it from the repository does not remove it from history or forks.
- The contract owner is a single trusted key. Use a multi-signature wallet for any serious deployment.
- Global CID uniqueness lets a whitelisted address front-run a pending registration of the same CID. The paper discusses mitigations.
- Files are encrypted in one buffer, which limits file size by memory.

## Citation

If you use this code, please cite the paper **[FILL]**.
