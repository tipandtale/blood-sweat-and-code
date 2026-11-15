# 💜 Blood, Sweat and Code

**Fan-made by [@tipandtale](https://instagram.com/tipandtale), for ARMY.** Not affiliated with or endorsed by HYBE or BTS.

A cheerful pastel-purple coding companion that tracks your day:

| | What it counts |
|---|---|
| 💧 **Sweat** | Keystrokes typed today |
| 🩸 **Blood** | Bugs squashed today (the error count in a file you're editing goes down) |
| ⌨️ **Code** | Lines you wrote today, against a daily goal (default 100) |

Everything resets at local midnight.

## What happens while you code
- **Typing:** a pastel pixel heart pops up. The sound alternates between two Jimin clips.
- **Deleting:** a "7" burst. The sound alternates between Jungkook and a mic drop.
- **New line:** pixel sparkles.
- **Bug squashed:** a 7 burst, "BUG SQUASHED" and a mic drop.
- **Daily goal, or every 1000 keystrokes:** fireworks in the sidebar and the Chicken Noodle Soup clip.
- **Easter eggs:** type `borahae`, `army`, `bts`, `dynamite`, `butter`, `micdrop`, `jhope`, `jimin`, `jungkook`, `suga`, `namjoon`, `seokjin`, `taehyung`, `blood sweat` and more. Add your own in `src/easter/EasterEggs.ts`.

## Sidebar
A plain list of today's numbers and three on/off switches:
- **sound**
- **effects** (all visuals together)
- **calm mode** (no effects, no sound, counts still go up)

Plus **party time** (test the fireworks) and **start over** (reset today). Fireworks show in the sidebar, so keep it open to see them.

## Settings
`bloodSweatCode.dailyGoalLines`, `sound`, `blips`, `explosions`, `chars`, `shake`, `fireworks`, `enableStatusBar`, `reducedEffects`. Search "Blood, Sweat and Code" in Settings.

## Sounds
Mp3 clips of bts funny clip trace from `media/sound/`:

| Plays when | File |
|---|---|
| Typing (alternates) | `jiminlaugh.mp3`, `jiminsing.mp3` |
| Deleting (alternates) | `jungkook.mp3`, `micdrop.mp3` |
| Fireworks / celebration | `chickennoodlesoup.mp3` |

To change one, replace the file with the same name. Volume balance is set in `webview/panel.js` (`CLIP_GAIN`).
Sound plays inside the sidebar panel, so open it once (and click it) per VS Code session.

## Rebuild artwork
```bash
python3 tools/build_sprites.py --seven seven.png --heart heart.png --sparkle sparkle.png
npm install && npm run compile
```

## Credits
- Fan-made by @tipandtale. Sound clips are from fan edits on youtube and the pixel art is fan-made. If you made one and want a credit or removal, contact @tipandtale.
- Inspired by Ridiculous Coding.

MIT License.
