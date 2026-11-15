export type Settings = {
  explosions: boolean;
  blips: boolean;
  chars: boolean;
  shake: boolean;
  shakeAmplitude: number;
  shakeDecayMs: number;
  sound: boolean;
  fireworks: boolean;
  enableStatusBar: boolean;
  reducedEffects: boolean;
  dailyGoalLines: number;
};

// Typing and deleting each have two sound variants (1 or 2) that alternate.
export type SoundVariant = 1 | 2;

export type HostSoundEvent =
  | { type: "blip"; pitch: number; variant?: SoundVariant }
  | { type: "boom"; variant?: SoundVariant }
  | { type: "fireworks" };

export type SoundUris = { blip: string; blip2: string; boom: string; boom2: string; fireworks: string };

/** Today's numbers. Sweat = keystrokes, Blood = bugs squashed, Code = lines written. */
export type Stats = {
  sweat: number;
  blood: number;
  code: number;
  goal: number;
  goalReached: boolean;
};

/** The three switches shown in the sidebar. */
export type PanelUi = {
  sound: boolean;
  effects: boolean;
  calm: boolean;
};

export type ToggleKey = "sound" | "effects" | "calm";

export type PanelMessageFromExt =
  | { type: "init"; ui: PanelUi; stats: Stats; soundUris: SoundUris }
  | { type: "state"; stats: Stats }
  | { type: "ui"; ui: PanelUi }
  | { type: "blip"; pitch: number; enabled: boolean; variant?: SoundVariant }
  | { type: "boom"; enabled: boolean; variant?: SoundVariant }
  | { type: "fireworks"; enabled: boolean };

export type PanelMessageToExt =
  | { type: "ready" }
  | { type: "toggle"; key: ToggleKey; value: boolean }
  | { type: "resetToday" }
  | { type: "celebrate" }
  | { type: "requestState" };
