#!/usr/bin/env python3
# Reproduce with: uv run --with fonttools==4.46.0 --with brotli==1.1.0 python scripts/subset-fonts.py
"""Generate versioned WOFF2 faces without removing any source character mapping."""
import hashlib
import json
from io import BytesIO
from pathlib import Path

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = [
    ("roboto-condensed-variable.woff2", "Roboto Condensed", "normal", "100 900", "body"),
    ("roboto-condensed-italic-variable.woff2", "Roboto Condensed", "italic", "100 900", "body"),
    ("eb-garamond-variable.woff2", "EB Garamond", "normal", "400 800", "body"),
    ("eb-garamond-italic-variable.woff2", "EB Garamond", "italic", "400 800", "body"),
    ("pixelify-sans-semibold.ttf", "Newton Pixel", "normal", "600", "entrance"),
]


def group(cp):
    # Keep Latin words and their combining marks together for kerning/ligatures.
    if cp <= 0x24F or 0x300 <= cp <= 0x36F or 0x1E00 <= cp <= 0x1EFF or 0x2000 <= cp <= 0x206F or 0x20A0 <= cp <= 0x20CF or cp in [0x2190, 0x2192, 0x2193]:
        return "common"
    if 0x370 <= cp <= 0x3FF or 0x1F00 <= cp <= 0x1FFF:
        return "greek"
    if 0x400 <= cp <= 0x52F or 0x2DE0 <= cp <= 0x2DFF or 0xA640 <= cp <= 0xA69F:
        return "cyrillic"
    return "other"


def unicode_ranges(points):
    ranges = []
    start = end = sorted(points)[0]
    for cp in sorted(points)[1:]:
        if cp == end + 1:
            end = cp
        else:
            ranges.append((start, end))
            start = end = cp
    ranges.append((start, end))
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in ranges)


def axes(font):
    return [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes] if "fvar" in font else []


def main():
    if fontTools.__version__ != "4.46.0" or brotli.__version__ != "1.1.0":
        raise RuntimeError("Use the pinned FontTools 4.46.0 and Brotli 1.1.0 regeneration command")
    output = ROOT / "public/fonts/optimized"
    output.mkdir(exist_ok=True)
    css = {"body": [], "entrance": []}
    manifest = {"toolchain": {"fonttools": fontTools.__version__, "brotli": brotli.__version__}, "fonts": []}
    for filename, family, style, weight, stylesheet in FONTS:
        source = ROOT / "public/fonts" / filename
        original = TTFont(source, recalcTimestamp=False)
        cmap = original.getBestCmap()
        combined = set()
        record = {"source": filename, "family": family, "style": style, "weight": weight, "sourceBytes": source.stat().st_size, "sourceMappings": len(cmap), "subsets": []}
        marks = {cp for cp in cmap if 0x300 <= cp <= 0x36F}
        # Common last lets standalone marks use the Latin face. Other scripts
        # include the same marks so a composed cluster never needs two fonts.
        for part in ["greek", "cyrillic", "other", "common"]:
            primary = {cp for cp in cmap if group(cp) == part}
            if not primary:
                continue
            points = primary | marks
            font = TTFont(source, recalcTimestamp=False)
            options = subset.Options()
            # Preserve browser-default shaping plus the numeric variants used
            # by the app; do not ship unused discretionary stylistic sets.
            options.layout_features += ["tnum", "pnum", "onum", "lnum"]
            options.layout_scripts = ["*"]
            options.name_IDs = ["*"]
            options.name_languages = ["*"]
            options.name_legacy = True
            options.glyph_names = True
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=points)
            subsetter.subset(font)
            font.flavor = "woff2"
            stream = BytesIO()
            font.save(stream)
            data = stream.getvalue()
            generated = TTFont(BytesIO(data))
            assert font.getBestCmap() == {cp: cmap[cp] for cp in points}, filename
            assert set(generated.getBestCmap()) == points, filename
            # Fonts with post format 3 can canonicalize glyph names when saved.
            # Glyph IDs and metrics prove each character still maps to its glyph.
            for cp in points:
                out_name = generated.getBestCmap()[cp]
                assert generated.getGlyphID(out_name) == font.getGlyphID(cmap[cp]), filename
                assert generated["hmtx"][out_name] == original["hmtx"][cmap[cp]], filename
            assert axes(generated) == axes(original), filename
            for name_id in [1, 2, 13, 14]:
                assert generated["name"].getDebugName(name_id) == original["name"].getDebugName(name_id), filename
            assert not ((set(combined) & points) - marks), "Only combining marks may overlap"
            combined.update(generated.getBestCmap())
            digest = hashlib.sha256(data).hexdigest()[:12]
            name = f"{source.stem}-{part}.{digest}.woff2"
            (output / name).write_bytes(data)
            ranges = unicode_ranges(points)
            css[stylesheet].append(f'@font-face {{\n  font-family: "{family}";\n  src: url("/fonts/optimized/{name}") format("woff2");\n  font-style: {style};\n  font-weight: {weight};\n  font-display: swap;\n  unicode-range: {ranges};\n}}')
            record["subsets"].append({"file": name, "range": part, "unicodeRange": ranges, "mappings": len(points), "bytes": len(data)})
        assert combined == set(cmap), f"Lost character mappings in {filename}"
        manifest["fonts"].append(record)
        print(filename, "coverage", len(combined), "common bytes", next(s["bytes"] for s in record["subsets"] if s["range"] == "common"))
    # Delete only obsolete generated files. Original licensed font sources stay intact.
    used = {p["file"] for f in manifest["fonts"] for p in f["subsets"]}
    for old in output.glob("*.woff2"):
        if old.name not in used:
            old.unlink()
    for name, faces in css.items():
        (ROOT / "app/fonts" / f"{name}.css").write_text("/* Generated by scripts/subset-fonts.py; preserve licensed sources in public/fonts. */\n" + "\n\n".join(faces) + "\n")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
