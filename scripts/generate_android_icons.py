"""
Generate Android launcher icons + Play Store listing icon from the master
1024×1024 EatPal icon (the same source we use for iOS).

Why this lives in scripts/ instead of being a one-off:
- The master icon will change occasionally (rebrand, seasonal variants).
- Android needs 15 mipmap files + 1 store listing icon regenerated each time.
- Hand-resizing in Photoshop drifts; this script is deterministic.

Run:
    python scripts/generate_android_icons.py

Source:   ios/EatPal/EatPal/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
Outputs:  android-native/app/src/main/res/mipmap-*/ic_launcher*.webp
          android-native/app/src/main/play/listings/en-US/graphics/icon/icon.png
"""

from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "ios" / "EatPal" / "EatPal" / "Resources" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-1024.png"
RES = REPO / "android-native" / "app" / "src" / "main" / "res"
PLAY = REPO / "android-native" / "app" / "src" / "main" / "play" / "listings" / "en-US" / "graphics" / "icon"

# Standard Android launcher densities.
# - launcher:   legacy square icon. Android applies its own rounded-corner mask
#               on launchers older than the adaptive-icon era. Direct resize.
# - foreground: adaptive-icon foreground. The system can apply a circle /
#               squircle / rounded-square mask on top — so the design has to
#               sit inside a "safe zone" inscribed in the inner ~66% of the
#               canvas. We render the source scaled to that safe zone on a
#               transparent canvas of the full target size.
DENSITIES = {
    "mipmap-mdpi":    {"launcher": 48,  "foreground": 108},
    "mipmap-hdpi":    {"launcher": 72,  "foreground": 162},
    "mipmap-xhdpi":   {"launcher": 96,  "foreground": 216},
    "mipmap-xxhdpi":  {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}

# Safe-zone ratio per Google's adaptive-icon spec. The system mask is
# guaranteed to display the inner 66×66dp of a 108×108dp foreground; we use
# 0.66 so designs with details near the edge survive the strictest mask
# (a circle inscribed in the inner area).
SAFE_ZONE_RATIO = 0.66

# WebP quality: 90 is visually lossless on icons of this size while shaving
# ~70% off PNG file size, which matters because every mipmap density ships
# in every APK.
WEBP_QUALITY = 90


def load_source() -> Image.Image:
    if not SOURCE.exists():
        raise FileNotFoundError(
            f"Master icon missing: {SOURCE}\n"
            "Expected the same 1024×1024 PNG iOS ships from "
            "AppIcon.appiconset/AppIcon-1024.png."
        )
    img = Image.open(SOURCE)
    if img.size != (1024, 1024):
        raise ValueError(
            f"Master icon must be 1024×1024 (got {img.size}). "
            "Apple App Icon spec requires 1024px — keep iOS and Android sources aligned."
        )
    # Promote to RGBA so we can paste onto a transparent canvas for the
    # adaptive foreground without an alpha-channel mismatch.
    return img.convert("RGBA")


def write_legacy(source: Image.Image, density: str, size: int) -> None:
    """Direct resize of the master icon — what's used on pre-O launchers and
    as a fallback square icon. Matches iOS visually 1:1."""
    target = source.resize((size, size), Image.Resampling.LANCZOS)
    out_dir = RES / density
    out_dir.mkdir(parents=True, exist_ok=True)
    # Square and round launcher entries share the same artwork; Android picks
    # the right cutout at install time based on launcher capabilities. We
    # write both files so legacy and round-only launchers both render.
    for filename in ("ic_launcher.webp", "ic_launcher_round.webp"):
        target.save(out_dir / filename, "WEBP", quality=WEBP_QUALITY, method=6)


def write_foreground(source: Image.Image, density: str, size: int) -> None:
    """Adaptive-icon foreground with safe-zone padding. The system applies
    its own mask + the iconBackground color underneath, so this file must
    only contain the centered design with transparent padding."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * SAFE_ZONE_RATIO)
    scaled = source.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    out_dir = RES / density
    out_dir.mkdir(parents=True, exist_ok=True)
    canvas.save(out_dir / "ic_launcher_foreground.webp", "WEBP", quality=WEBP_QUALITY, method=6)


def write_play_store_icon(source: Image.Image) -> None:
    """Play Console requires a 512×512 32-bit PNG (with alpha) for the
    listing page. Lives under the Gradle Play Publisher convention path
    so r0adkll/upload-google-play can pick it up automatically."""
    PLAY.mkdir(parents=True, exist_ok=True)
    target = source.resize((512, 512), Image.Resampling.LANCZOS)
    target.save(PLAY / "icon.png", "PNG", optimize=True)


def sample_background_color(source: Image.Image) -> tuple[int, int, int]:
    """Sample the average of the master icon's four corner pixels. Used to
    set the adaptive-icon `iconBackground` color so the visible padding
    behind the masked design matches the iOS icon's bezel color instead
    of leaking the previous green placeholder.

    Sampling four corners (not just one) handles icons with subtle gradients
    by averaging them — close enough that the human eye reads it as "the
    icon's background"."""
    rgba = source.convert("RGBA")
    w, h = rgba.size
    samples = [
        rgba.getpixel((0, 0)),
        rgba.getpixel((w - 1, 0)),
        rgba.getpixel((0, h - 1)),
        rgba.getpixel((w - 1, h - 1)),
    ]
    # Filter out fully-transparent pixels (icons with transparent corners
    # would otherwise contaminate the average with the unpainted RGB).
    opaque = [(r, g, b) for (r, g, b, a) in samples if a > 200]
    if not opaque:
        # Fully transparent corners → fall back to white. The user can
        # always edit colors.xml after the fact.
        return (255, 255, 255)
    n = len(opaque)
    avg = tuple(sum(c[i] for c in opaque) // n for i in range(3))
    return avg


def main() -> None:
    source = load_source()
    print(f"Master icon: {SOURCE.relative_to(REPO)} ({source.size[0]}×{source.size[1]})")

    bg = sample_background_color(source)
    print(f"Sampled background color: #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")

    for density, sizes in DENSITIES.items():
        write_legacy(source, density, sizes["launcher"])
        write_foreground(source, density, sizes["foreground"])
        print(f"  {density}: launcher={sizes['launcher']}px, foreground={sizes['foreground']}px")

    write_play_store_icon(source)
    print(f"Play Store icon: {PLAY.relative_to(REPO)}/icon.png (512×512)")

    print(
        "\nNext steps:\n"
        f"  1. Set <color name=\"iconBackground\">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color> "
        f"in android-native/app/src/main/res/values/colors.xml\n"
        "  2. Rebuild the app to verify: ./gradlew :app:assembleDebug\n"
        "  3. Launch in emulator + long-press launcher to compare against iOS."
    )


if __name__ == "__main__":
    main()
