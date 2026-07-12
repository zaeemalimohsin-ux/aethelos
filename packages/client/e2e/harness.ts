import {
  Browser,
  BrowserContext,
  Page,
  chromium,
  _android as android,
  devices,
} from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

export type Platform = "web" | "windows" | "android";

export interface PeerDevice {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export class OmniHarness {
  private static platform: Platform = (process.env.PLATFORM as Platform) || "web";
  private static nextDebugPort =
    9222 + parseInt(process.env.TEST_WORKER_INDEX || "0", 10) * 10;

  /**
   * Launch a new peer on the selected platform.
   */
  static async launchPeer(browser: Browser): Promise<PeerDevice> {
    switch (this.platform) {
      case "web":
        return this.launchWeb(browser);
      case "windows":
        return this.launchWindows();
      case "android":
        return this.launchAndroid();
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  private static async launchWeb(browser: Browser): Promise<PeerDevice> {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseUrl = process.env.BASE_URL || "http://localhost:5173";

    page.on("pageerror", (err) => console.log(`[Web Error]`, err));
    page.on("console", (msg) => {
      console.log(`[Web Console]`, msg.type(), msg.text());
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 2) await page.waitForTimeout(1000);
      }
    }
    if (lastError) throw lastError;

    return {
      context,
      page,
      close: async () => {
        await context.close();
      },
    };
  }

  private static async launchWindows(): Promise<PeerDevice> {
    const port = this.nextDebugPort++;

    const tauriTarget = path.resolve(process.cwd(), "../client-tauri/src-tauri/target");
    const releaseExe = path.join(tauriTarget, "release/aethelos-desktop.exe");
    const releaseRelay = path.join(tauriTarget, "release/relay/server.cjs");
    const debugExe = path.join(tauriTarget, "debug/aethelos-desktop.exe");
    const preferRelease =
      process.env.AETHELOS_DESKTOP_E2E === "1" &&
      fs.existsSync(releaseExe) &&
      fs.existsSync(releaseRelay);
    const exePath = preferRelease ? releaseExe : debugExe;
    if (!fs.existsSync(exePath)) {
      throw new Error(
        `Tauri executable not found at ${exePath} — build desktop before running PLATFORM=windows E2E`,
      );
    }

    const userDataDir = path.resolve(process.cwd(), `../.temp/tauri-profile-${port}`);

    // Clear previous state for this profile so it boots cleanly
    if (fs.existsSync(userDataDir)) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to clean profile dir", e);
      }
    }

    // Launch Tauri app with remote debugging port
    const child: ChildProcess = spawn(exePath, [], {
      env: {
        ...process.env,
        WEBVIEW2_USER_DATA_FOLDER: userDataDir,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      },
      detached: false,
      stdio: "ignore",
    });

    const killDesktop = async () => {
      if (child.pid) {
        try {
          if (process.platform === "win32") {
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
            });
          } else {
            child.kill("SIGTERM");
          }
        } catch {
          /* best effort */
        }
      }
    };

    // Connect Playwright to the WebView2 instance with retries
    let browserContext;
    for (let i = 0; i < 30; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        browserContext = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        break;
      } catch (err) {
        console.log(
          `[OmniHarness] Waiting for Tauri CDP on port ${port}... (${i + 1}/30)`,
        );
        if (i === 29) throw err;
      }
    }
    const browser = browserContext!;
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : browser.contexts()[0];
    const page = context.pages()[0];

    try {
      await page.waitForFunction(() => (window as any).__aethelosTest !== undefined, {
        timeout: 15000,
      });
    } catch (e) {
      console.error(
        `[OmniHarness] Failed to find __aethelosTest on page. URL: ${page.url()}`,
      );
      throw e;
    }

    return {
      context,
      page,
      close: async () => {
        await killDesktop();
        await browser.close();
      },
    };
  }

  private static async launchAndroid(): Promise<PeerDevice> {
    console.log(
      "[OmniHarness] Falling back to Playwright Mobile Emulation for Android due to host emulator limitations.",
    );
    const browser = await chromium.launch();
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto("http://localhost:5173");
    return {
      page,
      context,
      close: async () => {
        await browser.close();
      },
    };
  }
}
