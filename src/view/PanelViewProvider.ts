import * as vscode from "vscode";
import {
  PanelMessageFromExt,
  PanelMessageToExt,
  PanelUi,
  SoundUris,
  Stats,
  ToggleKey
} from "../types";

export const CONFIG_SECTION = "bloodSweatCode";

export function readUi(): PanelUi {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    sound: cfg.get("sound", true),
    effects: cfg.get("blips", true) || cfg.get("explosions", true),
    calm: cfg.get("reducedEffects", false)
  };
}

export class PanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "bloodSweatCode.panel";

  private _view?: vscode.WebviewView;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getStats: () => Stats
  ) { }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: PanelMessageToExt) => {
      switch (msg.type) {
        case "ready":
          this.post({
            type: "init",
            ui: readUi(),
            stats: this.getStats(),
            soundUris: this.getSoundUris(webviewView.webview)
          });
          break;
        case "toggle":
          void this.applyToggle(msg.key, msg.value);
          break;
        case "resetToday":
          void vscode.commands.executeCommand("bloodSweatCode.resetToday");
          break;
        case "celebrate":
          void vscode.commands.executeCommand("bloodSweatCode.celebrate");
          break;
        case "requestState":
          this.post({ type: "state", stats: this.getStats() });
          break;
      }
    });
  }

  post(message: PanelMessageFromExt) {
    this._view?.webview.postMessage(message);
  }

  /** True once the sidebar view has been opened (sound plays inside it). */
  get hasView(): boolean {
    return !!this._view;
  }

  /** The sidebar has three switches; "effects" flips every visual effect together. */
  private async applyToggle(key: ToggleKey, value: boolean) {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    if (key === "effects") {
      for (const k of ["blips", "explosions", "chars", "shake", "fireworks"]) {
        await cfg.update(k, value, true);
      }
    } else if (key === "sound") {
      await cfg.update("sound", value, true);
    } else {
      await cfg.update("reducedEffects", value, true);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = Math.random().toString(36).slice(2);
    const asUri = (...parts: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...parts));
    const cssUri = asUri("webview", "panel.css");
    const jsUri = asUri("webview", "panel.js");
    const logoUri = asUri("media", "icons", "icon.svg");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; media-src ${webview.cspSource}; connect-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${cssUri}" rel="stylesheet">
<title>Blood, Sweat and Code</title>
</head>
<body>
  <main class="wrap">
    <header class="head">
      <img class="logo" src="${logoUri}" alt="" />
      <div>
        <h1>Blood, Sweat and Code</h1>
        <p class="greet" id="greet"></p>
      </div>
    </header>

    <button class="notice" id="soundNotice" type="button">sound is off. click here once to turn it on.</button>

    <section class="goal">
      <p class="goal-line"><span>today's goal</span><b id="goalNum">0 / 100</b></p>
      <div class="bar"><div id="barInner"></div></div>
      <p class="note" id="goalNote"></p>
    </section>

    <dl class="rows">
      <div title="every key you type"><dt>sweat</dt><dd><b id="sweat">0</b> keystrokes</dd></div>
      <div title="errors that disappeared while you were editing"><dt>blood</dt><dd><b id="blood">0</b> bugs squashed</dd></div>
      <div title="new lines you typed"><dt>code</dt><dd><b id="code">0</b> lines written</dd></div>
    </dl>

    <section class="switches">
      <label class="switch"><input id="sound" type="checkbox"><span>sound</span><em></em></label>
      <label class="switch"><input id="effects" type="checkbox"><span>effects</span><em></em></label>
      <label class="switch" title="no effects, no sound. your counts still go up"><input id="calm" type="checkbox"><span>calm mode</span><em></em></label>
    </section>

    <p class="actions"><button class="link" id="celebrate" type="button">party time</button> · <button class="link" id="resetToday" type="button">start over</button></p>
    <canvas id="fwCanvas" class="hidden"></canvas>
  </main>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private getSoundUris(webview: vscode.Webview): SoundUris {
    const u = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "sound", file)).toString();
    // Your mp3s, played as-is. blip = typing, boom = deleting (two variants each).
    return {
      blip: u("jiminlaugh.mp3"),
      blip2: u("jiminsing.mp3"),
      boom: u("jungkook.mp3"),
      boom2: u("micdrop.mp3"),
      fireworks: u("chickennoodlesoup.mp3")
    };
  }
}
