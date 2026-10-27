// Pipeline benchmark: AES-GCM -> Pinata -> contract tx -> gateway retrieval -> verify.
// Needs: npm install   (Node 20.6+ for --env-file)
// Run:   node --env-file=.env scripts/measure.js
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { sha256, encrypt, decrypt } = require('./lib/aes');

const cfg = {
  jwt: process.env.PINATA_JWT,
  rpc: process.env.RPC_URL,
  pk: process.env.PRIVATE_KEY,
  contract: process.env.CONTRACT,
  files: (process.env.FILES || '').split(',').filter(Boolean),
  runs: Number(process.env.RUNS || 30),
  confirmations: Number(process.env.CONFIRMATIONS || 1),
  gateway: process.env.GATEWAY || 'https://gateway.pinata.cloud/ipfs',
  out: process.env.OUT || 'results/results.json',
  pollMs: Number(process.env.POLL_MS || 250), // how often the receipt is checked
  jitterMs: Number(process.env.JITTER_MS || 12000), // random pause before each broadcast
};
const missing = ['jwt', 'rpc', 'pk', 'contract'].filter((k) => !cfg[k]);
if (missing.length || cfg.files.length === 0) {
  console.error('Missing env: ' + missing.join(', ') + (cfg.files.length ? '' : ' FILES'));
  process.exit(1);
}

const abi = ['function uploadHash(string ipfsHash)'];
const sec = (t0) => (performance.now() - t0) / 1000;

async function pin(blob) {
  const form = new FormData();
  form.append('file', new Blob([blob]), 'payload.enc'); // generic name: no original filename leaks
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.jwt}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata HTTP ${res.status}`);
  return (await res.json()).IpfsHash;
}

async function runOnce(plain, plainHash, contract) {
  const t = {};
  const wall0 = performance.now();
  let s = performance.now();
  const { key, blob } = await encrypt(plain);
  t.encrypt = sec(s);

  s = performance.now();
  const cid = await pin(blob);
  t.upload = sec(s);

  // Random pause so the broadcast moment is not locked to the 12 s block cadence by earlier stage durations
  const jitter = Math.random() * cfg.jitterMs / 1000;
  await new Promise((r) => setTimeout(r, jitter * 1000));

  s = performance.now(); // wallet is a local key: no human click inside this timer
  const tx = await contract.uploadHash(cid);
  t.broadcast = sec(s);

  s = performance.now();
  const rc = await tx.wait(cfg.confirmations);
  t.confirm = sec(s);

  s = performance.now(); // full body download, not just response headers
  const res = await fetch(`${cfg.gateway}/${cid}`);
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
  const got = Buffer.from(await res.arrayBuffer());
  t.retrieve = sec(s);

  s = performance.now();
  const intact = (await sha256(got)) === (await sha256(blob));
  const decrypted = (await sha256(await decrypt(key, got))) === plainHash;
  t.verify = sec(s);

  t.total = t.encrypt + t.upload + t.broadcast + t.confirm + t.retrieve;
  t.wall = sec(wall0) - jitter; // wall time excludes the random pause
  return {
    cid, txHash: tx.hash, block: rc.blockNumber,
    gasUsed: rc.gasUsed.toString(), gasPriceWei: rc.effectiveGasPrice.toString(),
    intact, decrypted, jitter, ...t,
  };
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

(async () => {
  const provider = new ethers.providers.JsonRpcProvider(cfg.rpc);
  provider.pollingInterval = cfg.pollMs; // ethers v5 checks every 4 s by default, which coarsens confirmation times
  const wallet = new ethers.Wallet(cfg.pk, provider);
  const contract = new ethers.Contract(cfg.contract, abi, wallet);
  const net = await provider.getNetwork();

  const plains = {};
  const hashes = {};
  for (const f of cfg.files) {
    plains[f] = fs.readFileSync(f);
    hashes[f] = await sha256(plains[f]);
  }

  const meta = {
    chainId: net.chainId, node: process.version, ethers: ethers.version,
    contract: cfg.contract, runs: cfg.runs, confirmations: cfg.confirmations, pollMs: cfg.pollMs, jitterMs: cfg.jitterMs,
    gateway: cfg.gateway, startedAt: new Date().toISOString(),
  };
  const rows = [];
  const failures = [];
  fs.mkdirSync(path.dirname(cfg.out), { recursive: true });

  for (let r = 1; r <= cfg.runs; r++) {
    for (const f of shuffle(cfg.files)) { // interleave sizes to avoid time-of-day bias
      const file = path.basename(f);
      try {
        const row = await runOnce(plains[f], hashes[f], contract);
        rows.push({ run: r, file, bytes: plains[f].length, ...row });
        console.log(`run ${r} ${file}: total ${row.total.toFixed(2)}s gas ${row.gasUsed}`);
      } catch (e) {
        failures.push({ run: r, file, error: String(e.message || e) });
        console.error(`run ${r} ${file} failed: ${e.message || e}`);
      }
      fs.writeFileSync(cfg.out, JSON.stringify({ meta, rows, failures }, null, 2));
    }
  }
  console.log(`done: ${rows.length} ok, ${failures.length} failed -> ${cfg.out}`);
})();
