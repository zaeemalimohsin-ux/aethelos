
import { chromium } from "@playwright/test";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  
  console.log("Navigating directly to HF Space container...");
  try {
    await page.goto("https://thegritz-aethelos.hf.space", { waitUntil: "networkidle", timeout: 30000 });
    
    console.log("Waiting for app to render...");
    await page.waitForTimeout(3000);
    
    const screenshotPath = "C:/Users/zaeem/.gemini/antigravity/brain/ddede381-522a-4f9a-a3da-3aadbe9272d3/scratch/hf_space_verification.png";
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("Screenshot saved to " + screenshotPath);
  } catch(e) {
    console.error("Playwright failed:", e);
  }
  
  await browser.close();
})();

