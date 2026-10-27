"""Summarise results.json from measure.js: per-size stats, CIs, regression, tests, figures.

Usage: python analysis/stats.py results/results.json [outdir]
Needs: numpy, scipy, pandas, matplotlib
"""
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from scipy import stats

matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({"font.size": 12, "axes.grid": True, "grid.alpha": 0.3})

STAGES = ["encrypt", "upload", "broadcast", "confirm", "retrieve"]
MEASURES = STAGES + ["total", "verify", "gasUsed"]
rng = np.random.default_rng(42)


def t_ci(x, level=0.95):
    # t-based CI with the sample SD (ddof=1)
    n = len(x)
    if n < 2:
        return np.nan, np.nan
    half = stats.t.ppf(0.5 + level / 2, n - 1) * np.std(x, ddof=1) / np.sqrt(n)
    return np.mean(x) - half, np.mean(x) + half


def boot_ci(x, reps=10000, level=0.95):
    x = np.asarray(x)
    means = x[rng.integers(0, len(x), (reps, len(x)))].mean(axis=1)
    lo, hi = np.percentile(means, [(1 - level) / 2 * 100, (1 + level) / 2 * 100])
    return lo, hi


def summarise(df):
    out = []
    for size, g in df.groupby("size_mib"):
        for m in MEASURES:
            x = g[m].to_numpy(float)
            tl, th = t_ci(x)
            bl, bh = boot_ci(x)
            out.append({
                "size_mib": size, "measure": m, "n": len(x), "mean": x.mean(),
                "sd": np.std(x, ddof=1) if len(x) > 1 else np.nan, "median": np.median(x),
                "q1": np.percentile(x, 25), "q3": np.percentile(x, 75),
                "t_lo": tl, "t_hi": th, "boot_lo": bl, "boot_hi": bh,
            })
    return pd.DataFrame(out)


def main():
    src = Path(sys.argv[1])
    outdir = Path(sys.argv[2] if len(sys.argv) > 2 else "figs")
    outdir.mkdir(parents=True, exist_ok=True)

    data = json.loads(src.read_text())
    if not data.get("rows"):
        sys.exit("No measurements in " + str(src) + ": run scripts/measure.js first.")
    df = pd.DataFrame(data["rows"])
    df["gasUsed"] = df["gasUsed"].astype(float)
    df["size_mib"] = (df["bytes"] / 1048576).round(3)

    print("runs ok per size:\n", df.groupby("size_mib").size().to_string())
    fails = pd.DataFrame(data.get("failures", []))
    print("failed runs:", len(fails))
    print("integrity ok:", bool(df["intact"].all()), "| decrypt ok:", bool(df["decrypted"].all()))

    summ = summarise(df)
    summ.to_csv(outdir / "summary.csv", index=False)
    print(summ[summ.measure.isin(["encrypt", "upload", "confirm", "retrieve", "total", "gasUsed"])].round(3).to_string(index=False))

    # Linear fit of total time vs size on all runs
    fit = stats.linregress(df["size_mib"], df["total"])
    half = stats.t.ppf(0.975, len(df) - 2) * fit.stderr
    print(f"fit: total = {fit.intercept:.2f} + {fit.slope:.2f}*MiB  R2={fit.rvalue**2:.4f}  "
          f"slope95%CI=({fit.slope - half:.2f}, {fit.slope + half:.2f})")

    # Is the on-chain part independent of file size? (Kruskal-Wallis across sizes)
    for m in ["confirm", "gasUsed"]:
        groups = [g[m].to_numpy() for _, g in df.groupby("size_mib")]
        if all(np.ptp(x) == 0 for x in groups) and len({x[0] for x in groups}) == 1:
            print(f"{m}: identical across sizes")
        else:
            h, p = stats.kruskal(*groups)
            print(f"{m}: Kruskal-Wallis H={h:.2f} p={p:.4f}")

    sizes = sorted(df["size_mib"].unique())
    labels = [f"{s:g}" for s in sizes]
    tot = summ[summ.measure == "total"].set_index("size_mib").loc[sizes]

    # Fig 1: stacked stage means with total CI
    fig, ax = plt.subplots(figsize=(8, 5))
    bottom = np.zeros(len(sizes))
    for st in STAGES:
        vals = summ[summ.measure == st].set_index("size_mib").loc[sizes, "mean"].to_numpy()
        ax.bar(labels, vals, bottom=bottom, label=st)
        bottom += vals
    err = np.vstack([tot["mean"] - tot["t_lo"], tot["t_hi"] - tot["mean"]])
    ax.errorbar(labels, tot["mean"], yerr=err, fmt="none", ecolor="black", capsize=4)
    ax.set_xlabel("File size (MiB)")
    ax.set_ylabel("Time (s)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(outdir / "fig_stages.png", dpi=200)
    plt.close(fig)

    # Fig 2: total vs size with CI band and fit, linear and log-log
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    xs = np.array(sizes)
    for ax, log in zip(axes, [False, True]):
        ax.plot(xs, tot["mean"], "o-", label="mean")
        ax.fill_between(xs, tot["t_lo"], tot["t_hi"], alpha=0.3, label="95% CI")
        ax.plot(xs, fit.intercept + fit.slope * xs, "--", label="linear fit")
        if log:
            ax.set_xscale("log")
            ax.set_yscale("log")
        ax.set_xlabel("File size (MiB)")
        ax.set_ylabel("Total time (s)")
        ax.legend()
    fig.tight_layout()
    fig.savefig(outdir / "fig_total.png", dpi=200)
    plt.close(fig)

    # Fig 3: on-chain stage and gas versus size
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    for ax, m, yl in zip(axes, ["confirm", "gasUsed"], ["Confirmation time (s)", "Gas used"]):
        ax.boxplot([g[m].to_numpy() for _, g in df.groupby("size_mib")])
        ax.set_xticklabels(labels)
        ax.set_xlabel("File size (MiB)")
        ax.set_ylabel(yl)
    fig.tight_layout()
    fig.savefig(outdir / "fig_onchain.png", dpi=200)
    plt.close(fig)
    print("saved summary.csv and 3 figures in", outdir)


if __name__ == "__main__":
    main()
