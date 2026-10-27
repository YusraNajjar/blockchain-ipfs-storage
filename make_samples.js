// Builds random-content sample files for the benchmark sizes in data/.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KIB = 1024;
const sizes = {
  "100KiB": 100 * KIB,
  "512KiB": 512 * KIB,
  "1MiB": 1024 * KIB,
  "5MiB": 5 * 1024 * KIB,
  "10MiB": 10 * 1024 * KIB,
  "25MiB": 25 * 1024 * KIB,
  "50MiB": 50 * 1024 * KIB,
};

const dir = path.join(__dirname, "..", "data");
fs.mkdirSync(dir, { recursive: true });

// Optional: SAMPLE_SIZES="512KiB,5MiB" builds only those sizes.
const wanted = (process.env.SAMPLE_SIZES || "").split(",").filter(Boolean);

for (const [label, bytes] of Object.entries(sizes)) {
  if (wanted.length && !wanted.includes(label)) continue;
  const file = path.join(dir, `sample_${label}.bin`);
  const fd = fs.openSync(file, "w");
  let left = bytes;
  while (left > 0) {
    const n = Math.min(left, 1 << 20); // write in 1 MiB pieces
    fs.writeSync(fd, crypto.randomBytes(n));
    left -= n;
  }
  fs.closeSync(fd);
  console.log(`${file} (${bytes} bytes)`);
}
