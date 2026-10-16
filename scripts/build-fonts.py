"""Builds the self-hosted web fonts in public/fonts/ from the @fontsource-variable packages.

Run after changing which weights or characters the design uses:
    python3 scripts/build-fonts.py        (needs fontTools + brotli: pip install fonttools brotli)

One family, Schibsted Grotesk (variable 400-800), does all the work.
Everything is subset to Latin plus Indian/editorial punctuation (₹, curly quotes, dashes).
Characters outside the subset (e.g. Kannada titles) fall back to system fonts.

"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@fontsource-variable"
OUT = ROOT / "public/fonts"

UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100))
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2033,
       0x20B9, 0x2190, 0x2192, 0x00D7, 0x2212, 0x202F]
)
FEATURES = ["kern", "liga", "calt", "lnum", "onum", "tnum", "pnum"]

JOBS = [
    ("schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2", {"wght": (400, 800)}, "schibsted-grotesk.woff2"),
]

OUT.mkdir(parents=True, exist_ok=True)
for src, limits, name in JOBS:
    font = instantiateVariableFont(TTFont(SRC / src), limits)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(OUT / name)
    print(f"{name}: {(OUT / name).stat().st_size / 1024:.0f} KB")
