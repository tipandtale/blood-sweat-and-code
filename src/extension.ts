import * as vscode from "vscode";
import { EffectManager } from "./effects/EffectManager";
import { StatsService } from "./stats/StatsService";
import { CONFIG_SECTION, PanelViewProvider, readUi } from "./view/PanelViewProvider";
import { Egg, EasterEggs } from "./easter/EasterEggs";
import { HostSoundEvent, PanelMessageFromExt, Settings, SoundVariant } from "./types";

function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    explosions: cfg.get("explosions", true),
    blips: cfg.get("blips", true),
    chars: cfg.get("chars", true),
    shake: cfg.get("shake", true),
    shakeAmplitude: cfg.get("shakeAmplitude", 6),
    shakeDecayMs: cfg.get("shakeDecayMs", 120),
    sound: cfg.get("sound", true),
    fireworks: cfg.get("fireworks", true),
    enableStatusBar: cfg.get("enableStatusBar", true),
    reducedEffects: cfg.get("reducedEffects", false),
    dailyGoalLines: Math.max(1, cfg.get("dailyGoalLines", 100))
  };
}

export function activate(context: vscode.ExtensionContext) {
  let settings = readSettings();
  let soundHintShown = false;

  const stats = new StatsService(context, settings.dailyGoalLines);
  const effects = new EffectManager(context);
  const eggs = new EasterEggs();
  const panelProvider = new PanelViewProvider(context, () => stats.snapshot);
  context.subscriptions.push(
    // retainContextWhenHidden keeps the sound engine alive when the sidebar is collapsed or in another tab
    vscode.window.registerWebviewViewProvider(PanelViewProvider.viewType, panelProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // ---------- status bar ----------
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "bloodSweatCode.showPanel";
  context.subscriptions.push(status);

  function updateStatus() {
    if (!settings.enableStatusBar) {
      status.hide();
      return;
    }
    const s = stats.snapshot;
    status.text = `$(heart) 💧 ${s.sweat.toLocaleString()}  🩸 ${s.blood}  ⌨️ ${s.code}/${s.goal}`;
    status.tooltip = `Blood, Sweat and Code (today)\nSweat: ${s.sweat} keystrokes\nBlood: ${s.blood} bugs squashed\nCode: ${s.code} of ${s.goal} lines`;
    status.color = "#c9a7ff";
    status.show();
  }
  updateStatus();

  // ---------- commands ----------
  const cfgUpdate = (key: string, value: unknown) =>
    vscode.workspace.getConfiguration(CONFIG_SECTION).update(key, value, true);

  context.subscriptions.push(
    vscode.commands.registerCommand("bloodSweatCode.showPanel", () => vscode.commands.executeCommand("bloodSweatCode.panel.focus")),
    vscode.commands.registerCommand("bloodSweatCode.resetToday", () => {
      stats.reset();
      pushState();
    }),
    vscode.commands.registerCommand("bloodSweatCode.celebrate", () => {
      playSound({ type: "fireworks" }, settings.sound && !settings.reducedEffects);
      post({ type: "fireworks", enabled: false });
    }),
    vscode.commands.registerCommand("bloodSweatCode.toggleSound", () => cfgUpdate("sound", !settings.sound)),
    vscode.commands.registerCommand("bloodSweatCode.toggleEffects", async () => {
      const next = !(settings.blips || settings.explosions);
      for (const k of ["blips", "explosions", "chars", "shake", "fireworks"]) await cfgUpdate(k, next);
    }),
    vscode.commands.registerCommand("bloodSweatCode.toggleCalmMode", () => cfgUpdate("reducedEffects", !settings.reducedEffects))
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) return;
      const wasCalm = settings.reducedEffects;
      settings = readSettings();
      stats.setGoal(settings.dailyGoalLines);

      if (!wasCalm && settings.reducedEffects) {
        vscode.window.visibleTextEditors.forEach(editor => effects.clearAllDecorations(editor));
      }

      post({ type: "ui", ui: readUi() });
      pushState();
    })
  );

  // ---------- typing, deleting, newlines ----------
  // Sound variants alternate so it never gets boring; gaps stop long voice clips piling up.
  let blipFlip: SoundVariant = 2; // 1 = Jimin laugh, 2 = Jimin sing
  let boomFlip: SoundVariant = 2; // 1 = Jungkook, 2 = mic drop
  let lastBlipSoundAt = 0;
  let lastBoomSoundAt = 0;
  const BLIP_SOUND_MIN_GAP_MS = 120;
  const BOOM_SOUND_MIN_GAP_MS = 400;

  let pitchIncrease = 0;
  let pitchResetTimer: NodeJS.Timeout | undefined;
  const PITCH_RESET_MS = 180;

  const lastEditAt = new Map<string, number>();
  const lastLineByEditor = new WeakMap<vscode.TextEditor, number>();

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(evt => {
      lastEditAt.set(evt.document.uri.toString(), Date.now());

      // Skip undo/redo: they are not typed input.
      if (evt.reason !== undefined) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor || evt.document !== editor.document) return;

      const change = evt.contentChanges[0];
      if (!change) return;

      const insertedText = change.text ?? "";
      const removedChars = change.rangeLength ?? 0;
      const isInsert = insertedText.length > 0;
      const isDelete = !isInsert && removedChars > 0;
      const calm = settings.reducedEffects;
      const caret = editor.selection.active;

      const charLabel =
        isInsert && settings.chars
          ? sanitizeLabel(insertedText[0] ?? "")
          : isDelete && settings.chars
            ? "BACKSPACE"
            : undefined;

      if (isInsert) {
        // Stats always count, even in calm mode.
        const sweatMilestone = stats.addSweat();
        // Big pastes / formatter rewrites don't count as lines you wrote.
        const lines = insertedText.length <= 200 ? (insertedText.match(/\n/g) ?? []).length : 0;
        const goalHit = lines > 0 ? stats.addCode(lines) : false;

        if (!calm && settings.blips) {
          effects.showBlip(editor, settings.chars, settings.shake, charLabel);
          pitchIncrease += 1.0;
          if (pitchResetTimer) clearTimeout(pitchResetTimer);
          pitchResetTimer = setTimeout(() => { pitchIncrease = 0; }, PITCH_RESET_MS);
          const pitch = 1.0 + Math.min(20, pitchIncrease) * 0.03; // gentle: voice clips get silly fast
          const now = Date.now();
          if (now - lastBlipSoundAt >= BLIP_SOUND_MIN_GAP_MS) {
            lastBlipSoundAt = now;
            blipFlip = blipFlip === 1 ? 2 : 1;
            playSound({ type: "blip", pitch, variant: blipFlip }, settings.sound);
          }
          const egg = eggs.feed(insertedText);
          if (egg) fireEgg(editor, egg);
        }

        if (goalHit) {
          fireEgg(editor, {
            label: "DAILY GOAL!",
            message: `Daily goal hit: ${stats.snapshot.goal} lines 💜`,
            fireworks: true,
            sound: { type: "fireworks" }
          });
        } else if (sweatMilestone) {
          fireEgg(editor, {
            label: `${stats.snapshot.sweat} SWEAT`,
            message: `${stats.snapshot.sweat.toLocaleString()} keystrokes today 💧`,
            fireworks: true,
            sound: { type: "fireworks" }
          });
        }
        pushState();
      } else if (isDelete && settings.explosions && !calm) {
        effects.showBoom(editor, settings.chars, settings.shake, charLabel);
        const now = Date.now();
        if (now - lastBoomSoundAt >= BOOM_SOUND_MIN_GAP_MS) {
          lastBoomSoundAt = now;
          boomFlip = boomFlip === 1 ? 2 : 1;
          playSound({ type: "boom", variant: boomFlip }, settings.sound);
        }
      }

      if (settings.blips && !calm && insertedText.includes("\n")) {
        effects.showNewline(editor, settings.shake);
      }

      lastLineByEditor.set(editor, caret.line);
    }),

    vscode.window.onDidChangeTextEditorSelection(e => {
      const editor = e.textEditor;
      const last = lastLineByEditor.get(editor);
      const now = editor.selection.active.line;
      if (last !== undefined && now !== last && settings.blips && !settings.reducedEffects) {
        effects.showNewline(editor, settings.shake);
      }
      lastLineByEditor.set(editor, now);
    })
  );

  // ---------- blood: a bug is squashed when the error count of a file you're editing drops ----------
  const errorCount = (uri: vscode.Uri) =>
    vscode.languages.getDiagnostics(uri).filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  const errorBaseline = new Map<string, number>();
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    errorBaseline.set(uri.toString(), diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length);
  }

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(e => {
      for (const uri of e.uris) {
        const key = uri.toString();
        const now = errorCount(uri);
        const prev = errorBaseline.get(key) ?? now;
        errorBaseline.set(key, now);
        // Only count it if you edited that file in the last few seconds (ignores language server restarts)
        const editedRecently = Date.now() - (lastEditAt.get(key) ?? 0) < 8000;
        if (now < prev && editedRecently) squashed(prev - now, uri);
      }
    })
  );

  function squashed(n: number, uri: vscode.Uri) {
    stats.addBlood(n);
    pushState();
    vscode.window.setStatusBarMessage(`Bug squashed 🩸 (${stats.snapshot.blood} today)`, 5000);
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== uri.toString() || settings.reducedEffects) return;
    if (settings.explosions) effects.showBoom(editor, false, settings.shake);
    if (settings.blips) effects.showEggText(editor, "BUG SQUASHED", settings.shake);
    playSound({ type: "boom", variant: 2 }, settings.sound); // mic drop
  }

  // ---------- helpers ----------
  function fireEgg(editor: vscode.TextEditor, egg: Egg) {
    vscode.window.setStatusBarMessage(egg.message, 5000);
    if (settings.reducedEffects) return;
    if (settings.blips) effects.showEggText(editor, egg.label, settings.shake);
    if (egg.sound) playSound(egg.sound, settings.sound);
    if (egg.fireworks && settings.fireworks) post({ type: "fireworks", enabled: false });
  }

  function sanitizeLabel(ch: string): string {
    if (ch === "\n") return "";
    if (ch === "\t") return "↹";
    if (ch.trim() === "") return "SPACE";
    return ch;
  }

  function post(msg: PanelMessageFromExt) {
    panelProvider.post(msg);
  }

  function playSound(event: HostSoundEvent, enabled: boolean) {
    if (!enabled || settings.reducedEffects) return;
    if (!panelProvider.hasView && !soundHintShown) {
      soundHintShown = true;
      // Sound plays inside the sidebar panel, which only exists once it has been opened.
      vscode.window
        .showInformationMessage(
          "Blood, Sweat and Code: open its sidebar panel once to turn sound on.",
          "Open Panel"
        )
        .then(choice => {
          if (choice === "Open Panel") void vscode.commands.executeCommand("bloodSweatCode.panel.focus");
        });
    }
    post(toPanelMessage(event));
  }

  function toPanelMessage(event: HostSoundEvent): PanelMessageFromExt {
    switch (event.type) {
      case "blip":
        return { type: "blip", enabled: true, pitch: event.pitch, variant: event.variant };
      case "boom":
        return { type: "boom", enabled: true, variant: event.variant };
      case "fireworks":
        return { type: "fireworks", enabled: true };
    }
  }

  function pushState() {
    post({ type: "state", stats: stats.snapshot });
    updateStatus();
  }
}

export function deactivate() {
  // no-op
}
