import { HostSoundEvent } from "../types";

export type Egg = {
  /** Big floating text shown above the caret (keep it short, ASCII-safe for the label font). */
  label: string;
  /** Status bar message (emoji ok). */
  message: string;
  sound?: HostSoundEvent;
  fireworks?: boolean;
};

type EggDef = Egg & { words: string[] };

// Typing any of these words fires the egg. 
// Sound variants: blip 1 = Jimin laugh, blip 2 = Jimin sing, boom 1 = Jungkook, boom 2 = mic drop.
const WORD_EGGS: EggDef[] = [
  { words: ["bloodsweat", "blood sweat"], label: "BLOOD SWEAT CODE", message: "Blood, sweat and code 💜", fireworks: true, sound: { type: "fireworks" } },
  { words: ["borahae"], label: "I PURPLE YOU", message: "Borahae. I purple you 💜", fireworks: true, sound: { type: "fireworks" } },
  { words: ["army"], label: "ARMY!", message: "ARMY, assemble 💜", fireworks: true, sound: { type: "fireworks" } },
  { words: ["bts", "bangtan"], label: "BTS!", message: "Seven members. One team. 💜", sound: { type: "boom", variant: 2 } },
  { words: ["dynamite"], label: "DYNAMITE!", message: "Light it up 🧨", fireworks: true, sound: { type: "fireworks" } },
  { words: ["butter"], label: "SMOOTH MODE", message: "Smooth mode on 🧈", sound: { type: "blip", pitch: 0.9, variant: 2 } },
  { words: ["micdrop", "mic drop"], label: "MIC DROP", message: "🎤⬇️", sound: { type: "boom", variant: 2 } },
  { words: ["jhope", "j-hope", "chickennoodlesoup", "hoseok"], label: "HOPE WORLD", message: "You are my hope, you are my angel ☀️", fireworks: true, sound: { type: "fireworks" } },
  { words: ["jimin"], label: "JIMIN!", message: "Jimin 💛", sound: { type: "blip", pitch: 1.0, variant: 1 } },
  { words: ["jungkook"], label: "JUNGKOOK!", message: "Golden maknae 🐰", sound: { type: "boom", variant: 1 } },
  { words: ["suga", "yoongi"], label: "SUGA!", message: "Agust D incoming 🐱", sound: { type: "boom", variant: 2 } },
  { words: ["namjoon"], label: "NAMJOON!", message: "Leader mode 🐨", sound: { type: "blip", pitch: 0.8, variant: 2 } },
  { words: ["seokjin", "worldwidehandsome"], label: "SEOKJIN!", message: "Worldwide Handsome 🐹", sound: { type: "blip", pitch: 1.1, variant: 1 } },
  { words: ["taehyung", "kimtaehyung"], label: "TAEHYUNG!", message: "V 🐯", sound: { type: "blip", pitch: 0.85, variant: 2 } }
];

// Words shorter than this are ignored: they show up in normal code too often.
const MIN_LEN_FOR_STANDALONE = 3;

const BUFFER_LEN = 24;
const GLOBAL_COOLDOWN_MS = 2500;
const PER_EGG_COOLDOWN_MS = 12000;

export class EasterEggs {
  private buffer = "";
  private lastAny = 0;
  private lastByLabel = new Map<string, number>();

  /** Feed typed text; returns an egg when a trigger word was just completed. */
  feed(inserted: string): Egg | undefined {
    // Pasted/large insertions are not "typing" a word.
    if (inserted.length === 0 || inserted.length > 2) {
      this.buffer = "";
      return undefined;
    }
    this.buffer = (this.buffer + inserted.toLowerCase()).slice(-BUFFER_LEN);

    for (const egg of WORD_EGGS) {
      for (const word of egg.words) {
        if (word.length < MIN_LEN_FOR_STANDALONE) continue;
        if (!this.buffer.endsWith(word)) continue;
        const before = this.buffer.charAt(this.buffer.length - word.length - 1);
        if (before && /[a-z]/.test(before)) continue; // must start a word ("swarmy" shouldn't trigger "army")
        return this.cooldown(egg);
      }
    }
    return undefined;
  }

  private cooldown(egg: EggDef): Egg | undefined {
    const now = Date.now();
    if (now - this.lastAny < GLOBAL_COOLDOWN_MS) return undefined;
    if (now - (this.lastByLabel.get(egg.label) ?? 0) < PER_EGG_COOLDOWN_MS) return undefined;
    this.lastAny = now;
    this.lastByLabel.set(egg.label, now);
    this.buffer = "";
    const { words: _words, ...rest } = egg;
    return rest;
  }
}
