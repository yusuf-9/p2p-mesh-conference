import puppeteer from 'puppeteer';
import readline from 'readline';

class VideoCallLoadTester {
  constructor() {
    this.browser = null;
    this.pages = [];
    this.statusInterval = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async prompt(question) {
    return new Promise(resolve => this.rl.question(question, resolve));
  }

  async initBrowser() {
    if (this.browser) return this.browser;

    console.log('🌐 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // Allow captureStream() and AudioContext in headless mode
        '--autoplay-policy=no-user-gesture-required',
        '--disable-features=VizDisplayCompositor',
        // Provide fake getUserMedia in case anything else calls it
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // Resource / CPU savings
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--disable-component-update',
        '--disable-domain-reliability',
      ],
    });

    console.log('✅ Browser ready');
    return this.browser;
  }

  /**
   * Append useDummyVideoFeed to the URL (preserving existing params).
   */
  buildBotUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.searchParams.set('useDummyVideoFeed', '');
    // URLSearchParams renders flag= with an empty value; strip the trailing =
    return url.toString().replace('useDummyVideoFeed=', 'useDummyVideoFeed');
  }

  async launchBot(baseUrl, botId) {
    const botUrl = this.buildBotUrl(baseUrl);
    console.log(`🚀 Bot ${botId}: navigating to ${botUrl}`);

    const browser = await this.initBrowser();
    const page = await browser.newPage();
    this.pages.push({ page, botId });

    await page.setViewport({ width: 640, height: 480 });

    // Block images / fonts / stylesheets to reduce CPU
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Grant camera/mic permissions (needed for overridePermissions context)
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(new URL(baseUrl).origin, ['camera', 'microphone']);

    // Forward page console to terminal for debugging
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warn') {
        console.log(`[Bot ${botId}][${type}] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => console.error(`[Bot ${botId}] Page error: ${err.message}`));

    try {
      // Navigate — the URL already has room_id, api_key, and useDummyVideoFeed,
      // so the app will auto-request the dummy stream and auto-join the call.
      await page.goto(botUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      // Give the app time to connect the WebSocket, capture the stream, and join
      console.log(`⏳ Bot ${botId}: waiting for auto-join...`);
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify call joined by checking for active video elements
      const status = await page.evaluate(() => {
        const videos = Array.from(document.querySelectorAll('video'));
        return {
          total: videos.length,
          active: videos.filter(v => v.srcObject || v.src).length,
        };
      });

      if (status.active > 0) {
        console.log(`✅ Bot ${botId}: in call — ${status.active} active video element(s)`);
      } else {
        console.warn(`⚠️  Bot ${botId}: no active video elements yet (may still be connecting)`);
      }

      // After setup, only log errors to keep noise down
      page.removeAllListeners('console');
      page.on('pageerror', err => console.error(`[Bot ${botId}] ${err.message}`));

      return { page, botId };
    } catch (err) {
      console.error(`❌ Bot ${botId} failed: ${err.message}`);
      await page.close();
      this.pages = this.pages.filter(p => p.botId !== botId);
      throw err;
    }
  }

  async startLoadTest() {
    // Non-interactive mode: node src/index.js <url> [botCount]
    // Falls back to interactive prompts when running locally.
    let rawUrl = process.argv[2]?.trim();
    let botCount;

    if (rawUrl) {
      botCount = parseInt(process.argv[3], 10) || 1;
    } else {
      rawUrl = (await this.prompt('Room URL (with room_id and api_key): ')).trim();
      botCount = parseInt(await this.prompt('Number of bots: '), 10) || 1;
    }

    // Validate that the URL has the required params
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.get('room_id') || !parsed.searchParams.get('api_key')) {
      console.error('❌ URL must include room_id and api_key query parameters.');
      this.rl.close();
      return;
    }

    console.log(`\n🎬 Starting load test — ${botCount} bot(s)`);
    console.log(`🎯 Base URL: ${rawUrl}`);
    console.log(`🎥 Each bot will use the dummy video feed and auto-join\n`);

    let launched = 0;
    for (let i = 1; i <= botCount; i++) {
      try {
        await this.launchBot(rawUrl, i);
        launched++;
      } catch {
        // error already logged inside launchBot
      }

      if (i < botCount) {
        console.log(`⏳ Waiting 3s before next bot...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`\n✅ ${launched}/${botCount} bot(s) launched`);
    console.log('📊 Load test running — press Ctrl+C to stop\n');

    this.statusInterval = setInterval(() => {
      console.log(`📈 ${this.pages.length} bot tab(s) active`);
    }, 30000);
  }

  async cleanup() {
    console.log('\n🧹 Shutting down...');

    if (this.statusInterval) clearInterval(this.statusInterval);

    for (const { page, botId } of this.pages) {
      try {
        await page.close();
        console.log(`✅ Bot ${botId} closed`);
      } catch (e) {
        console.error(`Error closing bot ${botId}: ${e.message}`);
      }
    }

    if (this.browser) {
      try {
        await this.browser.close();
        console.log('✅ Browser closed');
      } catch (e) {
        console.error(`Error closing browser: ${e.message}`);
      }
    }

    this.rl.close();
    console.log('✅ Done');
    process.exit(0);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupt received');
  if (global.tester) await global.tester.cleanup();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Terminate received');
  if (global.tester) await global.tester.cleanup();
});

async function main() {
  const tester = new VideoCallLoadTester();
  global.tester = tester;

  console.log('🎯 Video Call Load Tester');
  console.log('=========================\n');

  await tester.startLoadTest();
}

main().catch(console.error);
