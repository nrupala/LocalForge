"""
LocalForge Demo Video Generator
Generates a polished 3-minute demo video with AI narration.

Usage:
    python scripts/generate-demo.py            # Full pipeline
    python scripts/generate-demo.py --audio    # Generate audio only
    python scripts/generate-demo.py --serve    # Start web UI for recording

Requirements:
    pip install edge-tts playwright pillow
    playwright install chromium
    ffmpeg in PATH (or download via script)
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ── Narration Script ──────────────────────────────────────────
NARRATION = [
    (0, 0, "Welcome to LocalForge. The local-first AI development platform that puts you in control."),
    (0, 15, "Three interfaces. One engine. Use the VS Code extension for inline assistance. The CLI for automation. The web UI for team collaboration."),
    (0, 35, "Here's the CLI in action. A single command starts the multi-agent workflow."),
    (0, 50, "Type localforge workflow followed by your goal. The engine dispatches four specialized AI agents."),
    (1, 5, "First, the Planner analyzes your request and produces an architecture plan with file paths and dependencies."),
    (1, 20, "Next, the Writer generates complete, production-ready code. No stubs. No placeholders."),
    (1, 35, "Then the Reviewer checks for bugs, security issues, and code quality. Each issue is flagged with severity."),
    (1, 50, "Finally, the Tester creates unit tests and runs them. The full pipeline completes in under a minute."),
    (2, 5, "LocalForge supports any model. Run fully offline with llama.cpp GGUF files on your own GPU."),
    (2, 20, "Or connect to 75 plus providers through OpenCode. Switch providers with a single click."),
    (2, 35, "Conversations can be encrypted with AES-256-GCM. Command execution requires approval. Destructive operations are blocked by default."),
    (2, 50, "The self-hosted tier is completely free. Pro is fourteen dollars a month. Enterprise at twenty-nine."),
    (3, 0, "Ready to try it? Visit localforge.dev or github.com slash nrupala slash LocalForge. Proudly made in Canada."),
]

ASSETS_DIR = Path("demo-assets")
AUDIO_DIR = ASSETS_DIR / "audio"
SCENE_DIR = ASSETS_DIR / "scenes"

def ensure_ffmpeg():
    """Check ffmpeg is available, download if not."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True)
        return True
    except FileNotFoundError:
        print("ffmpeg not found. Downloading...")
        url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        dest = "ffmpeg.zip"
        import urllib.request
        urllib.request.urlretrieve(url, dest)
        import zipfile
        with zipfile.ZipFile(dest, "r") as z:
            for f in z.namelist():
                if f.endswith("ffmpeg.exe"):
                    z.extract(f, ".")
                    os.rename(f, "ffmpeg.exe")
        os.remove(dest)
        os.environ["PATH"] = str(Path(".").resolve()) + os.pathsep + os.environ.get("PATH", "")
        print("ffmpeg ready")
        return True

def generate_audio():
    """Generate AI narration audio for each scene using edge-tts."""
    print("Generating AI narration...")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    import edge_tts
    voice = "en-US-JennyNeural"
    rate = "+10%"

    for i, (m, s, text) in enumerate(NARRATION):
        tts = edge_tts.Communicate(text, voice, rate=rate)
        out_path = AUDIO_DIR / f"scene_{i:02d}.mp3"
        asyncio_run_safe(tts.save(str(out_path)))
        duration = get_mp3_duration(out_path)
        print(f"  Scene {i}: {duration:.1f}s — {text[:50]}...")

    # also generate a single combined audio
    combine_audio()
    print("Audio generation complete.")

def asyncio_run_safe(coro):
    """Run async coroutine safely."""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return loop.run_until_complete(coro)

def get_mp3_duration(path):
    """Get MP3 duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except:
        return 3.0

def combine_audio():
    """Combine all scene audio files into one."""
    from glob import glob
    files = sorted(glob(str(AUDIO_DIR / "scene_*.mp3")))
    if not files:
        return
    list_path = AUDIO_DIR / "filelist.txt"
    with open(list_path, "w") as f:
        for fp in files:
            f.write(f"file '{fp}'\n")
    out = AUDIO_DIR / "narration_full.mp3"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_path),
        "-c", "copy", str(out)
    ], capture_output=True)
    list_path.unlink()
    print(f"Combined audio: {out}")

def create_cli_demo_scenes():
    """Generate CLI demo scene images (terminal screenshots)."""
    print("Creating CLI demo scenes...")
    SCENE_DIR.mkdir(parents=True, exist_ok=True)

    # Use LocalForge CLI in demo mode to capture output
    demo_cmds = [
        ("localforge", "localforge run hello", "chat"),
        ("localforge plan", "localforge plan add input validation", "plan"),
        ("localforge workflow", "localforge workflow add input validation", "workflow"),
    ]

    from PIL import Image, ImageDraw, ImageFont

    for label, cmd, mode in demo_cmds:
        # Execute the command and capture output
        env = os.environ.copy()
        env["LOCALFORGE_DEMO"] = "1"
        result = subprocess.run(
            ["node", "out/cli.js"] + cmd.split()[1:],
            capture_output=True, text=True, timeout=30, env=env,
            cwd=Path(__file__).parent.parent
        )
        output = (result.stdout or result.stderr or "No output").strip()

        # Create terminal screenshot image
        img = create_terminal_image(f"$ {cmd}", output, width=900, height=600)
        path = SCENE_DIR / f"cli_{mode}.png"
        img.save(path)
        print(f"  Created {path}")

def create_terminal_image(command, output, width=900, height=600):
    """Render a terminal-looking image."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (width, height), (13, 17, 23))
    draw = ImageDraw.Draw(img)

    # Try to use a monospace font
    font = None
    for font_path in [
        "C:\\Windows\\Fonts\\consola.ttf",
        "C:\\Windows\\Fonts\\CascadiaCode.ttf",
        "C:\\Windows\\Fonts\\cour.ttf",
    ]:
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, 14)
            break
    if not font:
        font = ImageFont.load_default()

    # Terminal bar
    draw.rectangle([0, 0, width, 28], fill=(26, 26, 46))
    for i, color in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
        draw.ellipse([8 + i * 18, 9, 8 + i * 18 + 10, 19], fill=color)

    # Prompt line
    y = 40
    draw.text((14, y), "$ ", fill=(63, 185, 80), font=font)
    draw.text((30, y), command, fill=(200, 200, 200), font=font)

    # Split output into lines
    y += 28
    max_chars = width // 8
    for line in output.split("\n"):
        # Truncate long lines
        while len(line) > max_chars:
            draw.text((14, y), line[:max_chars], fill=(180, 180, 180), font=font)
            line = line[max_chars:]
            y += 18
        draw.text((14, y), line, fill=(180, 180, 180), font=font)
        y += 18
        if y > height - 20:
            break

    return img

def create_workflow_animation_frames():
    """Create workflow pipeline animation frames."""
    print("Creating workflow animation frames...")
    
    from PIL import Image, ImageDraw, ImageFont

    roles = [
        ("Planner", "Architecture & Design", "completed"),
        ("Writer", "Code Generation", "completed"),
        ("Reviewer", "Quality Check", "active"),
        ("Tester", "Test Generation", "pending"),
    ]
    icons = ["📋", "✍️", "🔍", "🧪"]

    width, height = 900, 300

    for frame in range(4):
        img = Image.new("RGB", (width, height), (13, 17, 23))
        draw = ImageDraw.Draw(img)

        font = ImageFont.load_default()

        box_w = 160
        box_h = 80
        gap = 30
        total_w = 4 * box_w + 3 * gap
        start_x = (width - total_w) // 2
        y = (height - box_h) // 2

        for i in range(4):
            x = start_x + i * (box_w + gap)
            role, desc, status = roles[i]

            # Determine border color
            if status == "completed" and i < frame:
                border = (63, 185, 80)
                bg = (13, 58, 30)
            elif status == "active" and i == frame:
                border = (88, 166, 255)
                bg = (26, 45, 74)
            else:
                border = (48, 54, 61)
                bg = (22, 27, 34)

            draw.rectangle([x, y, x + box_w, y + box_h], fill=bg, outline=border)

            # Icon
            draw.text((x + box_w // 2 - 8, y + 8), icons[i], fill=(200, 200, 200), font=font)

            # Label
            tw = len(role) * 4
            draw.text((x + box_w // 2 - tw, y + 36), role, fill=(220, 220, 220) if status in ("completed", "active") else (100, 100, 100), font=font)

            # Arrow
            if i < 3:
                ax = x + box_w + 8
                draw.text((ax, y + 32), "→", fill=(88, 166, 255) if i < frame else (50, 50, 50), font=font)

        path = SCENE_DIR / f"workflow_frame_{frame}.png"
        img.save(path)
        print(f"  Created {path}")

def create_final_video():
    """Combine everything into final demo video."""
    print("Creating final video...")

    # Check we have audio
    audio_path = AUDIO_DIR / "narration_full.mp3"
    if not audio_path.exists():
        print("No audio found. Run with --audio first.")
        return

    # Get audio duration
    audio_duration = get_mp3_duration(audio_path)
    print(f"Audio duration: {audio_duration:.1f}s")

    # Create a static intro frame if no scenes
    from PIL import Image, ImageDraw, ImageFont
    intro = Image.new("RGB", (1280, 720), (13, 17, 23))
    draw = ImageDraw.Draw(intro)
    font_large = ImageFont.load_default()
    draw.text((300, 300), "LocalForge", fill=(88, 166, 255), font=font_large)
    draw.text((300, 360), "Local-First AI Development", fill=(200, 200, 200), font=font_large)
    intro_path = SCENE_DIR / "intro.png"
    intro.save(intro_path)

    # Create video from image + audio
    video_path = ASSETS_DIR / "localforge_demo.mp4"
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(intro_path),
        "-i", str(audio_path),
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        str(video_path)
    ], capture_output=True)

    print(f"\n✓ Demo video created: {video_path}")
    print(f"  Duration: {audio_duration:.1f}s")
    print(f"  Size: {video_path.stat().st_size / 1024:.0f} KB")
    print("\nUpload to YouTube, or use NarrateAI (narrateai.app) to add scene transitions.")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate LocalForge demo video")
    parser.add_argument("--audio", action="store_true", help="Generate audio only")
    parser.add_argument("--scenes", action="store_true", help="Generate scene images only")
    parser.add_argument("--serve", action="store_true", help="Start web UI for recording")
    parser.add_argument("--all", action="store_true", help="Full pipeline (default)")
    args = parser.parse_args()

    if args.serve:
        print("Starting recording server...")
        # Launch LocalForge web UI in demo mode
        env = os.environ.copy()
        env["LOCALFORGE_DEMO"] = "1"
        env["LOCALFORGE_PORT"] = "3099"
        subprocess.run(["node", "out/server.js"], env=env, cwd=Path(__file__).parent.parent)
        return

    if args.audio or args.all or not any([args.audio, args.scenes, args.serve]):
        ensure_ffmpeg()
        generate_audio()

    if args.scenes or args.all or not any([args.audio, args.scenes, args.serve]):
        try:
            from PIL import Image
            create_cli_demo_scenes()
            create_workflow_animation_frames()
        except ImportError:
            print("PIL not installed. Install: pip install pillow")
            print("Skipping scene generation.")

    if not args.audio and not args.scenes and not args.serve:
        ensure_ffmpeg()
        try:
            from PIL import Image
            create_final_video()
        except ImportError:
            print("\nFor full video generation, install: pip install pillow")
            print("Then run: python scripts/generate-demo.py")

if __name__ == "__main__":
    main()
