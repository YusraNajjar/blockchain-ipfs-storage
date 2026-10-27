"""Builds the three paper figures (PNG 300 dpi and PDF) from a merged results.json."""
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from scipy import stats

matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({"font.size": 12, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": 0.25, "figure.dpi": 100})
BLUE, DARK, MID, LIGHT = "#1f5fa8", "#555555", "#9a9a9a", "#d0d0d0"


def load(path):
    df = pd.DataFrame(json.load(open(path))["rows"])
    df["size_mib"] = (df["bytes"] / 1048576).round(3)
    return df


def tci(x):
    lo, hi = stats.t.interval(0.95, len(x) - 1, loc=np.mean(x), scale=stats.sem(x))
    return lo, hi


def save(fig, out, name):
    fig.tight_layout()
    fig.savefig(out / f"{name}.png", dpi=300)
    fig.savefig(out / f"{name}.pdf")
    plt.close(fig)


def main():
    df = load(sys.argv[1])
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "paper_figs")
    out.mkdir(parents=True, exist_ok=True)
    sizes = sorted(df.size_mib.unique())
    labels = ["0.1" if s < 0.1 else f"{s:g}" for s in sizes]
    m = df.groupby("size_mib")[["encrypt", "upload", "broadcast", "confirm", "retrieve", "total"]].mean()

    # Fig 1: where the time goes
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    parts = [("Encryption + signing/broadcast", m.encrypt + m.broadcast, DARK),
             ("IPFS upload", m.upload, MID),
             ("On-chain confirmation", m.confirm, BLUE),
             ("Gateway retrieval", m.retrieve, LIGHT)]
    bottom = np.zeros(len(sizes))
    for name, vals, color in parts:
        ax.bar(labels, vals.values, bottom=bottom, label=name, color=color, width=0.65)
        bottom += vals.values
    for i, tot in enumerate(m.total.values):
        ax.text(i, tot + 0.5, f"{tot:.1f}", ha="center", fontsize=11)
    ax.set_xlabel("File size (MiB)")
    ax.set_ylabel("Mean time per run (s)")
    ax.set_ylim(0, m.total.max() * 1.18)
    ax.legend(frameon=False, fontsize=10, loc="upper left")
    save(fig, out, "fig1_stages")

    # Fig 2: confirmation time versus size
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    cm = df.groupby("size_mib").confirm.apply(lambda x: x.mean())
    ci = np.array([tci(df[df.size_mib == s].confirm.values) for s in sizes])
    ax.errorbar(range(len(sizes)), cm.values, yerr=[cm.values - ci[:, 0], ci[:, 1] - cm.values],
                fmt="o", color=BLUE, capsize=4, markersize=7)
    overall = df.confirm.mean()
    ax.axhline(overall, color=MID, linestyle="--", linewidth=1.2)
    ax.text(len(sizes) - 0.4, overall, f"overall mean\n{overall:.1f} s", ha="left", va="center", color=DARK, fontsize=11)
    ax.set_xlim(-0.5, len(sizes) + 0.7)
    groups = [df[df.size_mib == s].confirm.values for s in sizes]
    h, p = stats.kruskal(*groups)
    ax.text(-0.2, 1.0, f"Kruskal-Wallis: H = {h:.2f}, p = {p:.2f}", fontsize=11, color=DARK)
    ax.set_xticks(range(len(sizes)))
    ax.set_xticklabels(labels)
    ax.set_xlabel("File size (MiB)")
    ax.set_ylabel("Confirmation time (s)")
    ax.set_ylim(0, 12)
    save(fig, out, "fig3_confirmation")

    # Fig 3: total latency versus size with linear fit
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    tm = df.groupby("size_mib").total.mean()
    ci = np.array([tci(df[df.size_mib == s].total.values) for s in sizes])
    fit = stats.linregress(df.size_mib, df.total)
    xs = np.linspace(0, 52, 50)
    ax.plot(xs, fit.intercept + fit.slope * xs, "--", color=MID, linewidth=1.5,
            label=f"fit: {fit.intercept:.1f} + {fit.slope:.2f} s/MiB (R$^2$ = {fit.rvalue**2:.2f})")
    ax.errorbar(sizes, tm.values, yerr=[tm.values - ci[:, 0], ci[:, 1] - tm.values],
                fmt="o", color=BLUE, capsize=4, markersize=7, label="mean with 95% CI")
    ax.set_xlabel("File size (MiB)")
    ax.set_ylabel("Total time per run (s)")
    ax.set_xlim(-1, 52)
    ax.set_ylim(0, 40)
    ax.legend(frameon=False, loc="upper left")
    save(fig, out, "fig2_total")
    print("figures saved in", out)


if __name__ == "__main__":
    main()
