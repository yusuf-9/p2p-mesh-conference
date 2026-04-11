import puppeteer from 'puppeteer';
import readline from 'readline';

class VideoCallLoadTester {
  constructor() {
    this.browser = null;
    this.pages = [];
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // Prompt user for input
  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  // Initialize single browser instance
  async initBrowser() {
    if (this.browser) return this.browser;

    console.log('🌐 Initializing shared browser...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--allow-running-insecure-content',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        // Additional CPU optimizations for shared browser
        '--max_old_space_size=512', // Increased for multiple tabs
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-background-timer-throttling'
      ]
    });

    console.log('✅ Shared browser initialized');
    return this.browser;
  }

  // Launch a single bot in a new tab
  async launchBotTab(url, botId, joinButtonSelector) {
    console.log(`🚀 Launching bot ${botId} in new tab...`);

    const browser = await this.initBrowser();
    const page = await browser.newPage();
    this.pages.push({ page, botId });

    await page.setViewport({ width: 640, height: 480 }); // Smaller for performance

    // Block unnecessary resources to save CPU across all tabs
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set permissions for this tab
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(url, ['camera', 'microphone']);

    try {
      console.log(`📱 Bot ${botId}: Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Debug: Check page state
      const pageInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
          text: btn.textContent.trim(),
          id: btn.id,
          className: btn.className,
          disabled: btn.disabled,
          visible: btn.offsetParent !== null
        }));

        const joinBtn = document.querySelector('#join-call-btn');

        return {
          totalButtons: buttons.length,
          buttons: buttons.slice(0, 5), // Show first 5 buttons
          joinButtonExists: !!joinBtn,
          joinButtonVisible: joinBtn ? joinBtn.offsetParent !== null : false,
          joinButtonDisabled: joinBtn ? joinBtn.disabled : null,
          readyState: document.readyState
        };
      });

      console.log(`🔍 Bot ${botId}: Page has ${pageInfo.totalButtons} buttons, join button exists: ${pageInfo.joinButtonExists}`);

      // Look for and click the join button
      console.log(`🔍 Bot ${botId}: Looking for join button...`);

      const buttonExists = await page.$(joinButtonSelector);
      if (!buttonExists) {
        console.error(`❌ Bot ${botId}: ${joinButtonSelector} button not found`);
        console.log(`Available buttons:`, pageInfo.buttons);
        throw new Error('Join button not found');
      }

      await page.waitForSelector(joinButtonSelector, {
        timeout: 10000,
        visible: true
      });

      const isEnabled = await page.$eval(joinButtonSelector, btn => !btn.disabled);
      if (!isEnabled) {
        console.warn(`⚠️ Bot ${botId}: Join button is disabled, clicking anyway...`);
      }

      console.log(`✅ Bot ${botId}: Found join button`);

      // Try clicking with fallback method
      try {
        await page.click(joinButtonSelector);
        console.log(`🎯 Bot ${botId}: Clicked join button (method: click)`);
      } catch (clickError) {
        console.log(`🔄 Bot ${botId}: Regular click failed, trying JavaScript click...`);
        await page.$eval(joinButtonSelector, btn => btn.click());
        console.log(`🎯 Bot ${botId}: Clicked join button (method: javascript)`);
      }

      // Wait for call connection
      console.log(`⏳ Bot ${botId}: Waiting for call connection...`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify call status
      const callStatus = await page.evaluate(() => {
        const videos = document.querySelectorAll('video');
        const mediaElements = document.querySelectorAll('video, audio');

        return {
          videoCount: videos.length,
          mediaCount: mediaElements.length,
          videosWithSrc: Array.from(videos).filter(v => v.src || v.srcObject).length
        };
      });

      console.log(`📊 Bot ${botId}: Found ${callStatus.videoCount} videos, ${callStatus.mediaCount} media elements`);

      if (callStatus.videoCount === 0 && callStatus.mediaCount === 0) {
        console.warn(`⚠️ Bot ${botId}: No media elements found - call may not have started`);
      } else {
        console.log(`🎉 Bot ${botId}: Call appears to be active!`);
      }

      // Minimize console logging after setup to save CPU
      page.removeAllListeners('console');
      page.on('error', (err) => {
        console.error(`❌ Bot ${botId} critical error:`, err.message);
      });

      return { page, botId };

    } catch (error) {
      console.error(`❌ Bot ${botId} failed:`, error.message);
      await page.close();
      // Remove from pages array
      this.pages = this.pages.filter(p => p.botId !== botId);
      throw error;
    }
  }

  // Launch multiple bot tabs in shared browser
  async startLoadTest() {
    try {
      const url = await this.prompt('Enter the URL to test: ');
      const botCount = parseInt(await this.prompt('Number of bots to launch: ')) || 1;
      const joinButtonSelector = '#join-call-btn';

      console.log(`\n🎬 Starting optimized load test with ${botCount} bots...`);
      console.log(`🎯 Target URL: ${url}`);
      console.log(`🔘 Join button selector: ${joinButtonSelector}`);
      console.log(`🌐 Using single shared browser with ${botCount} tabs`);
      console.log(`⚡ CPU-optimized configuration\n`);

      const bots = [];
      for (let i = 1; i <= botCount; i++) {
        try {
          const bot = await this.launchBotTab(url, i, joinButtonSelector);
          bots.push(bot);

          // Stagger tab creation to avoid overwhelming
          if (i < botCount) {
            console.log(`⏳ Waiting 3 seconds before launching next bot...`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Failed to launch bot ${i}:`, error.message);
        }
      }

      console.log(`\n✅ Successfully launched ${bots.length} out of ${botCount} bots`);
      console.log(`🌐 All bots running in shared browser with ${this.pages.length} active tabs`);
      console.log('📊 Load test is running...');
      console.log('Press Ctrl+C to stop all bots\n');

      // Less frequent status updates to save CPU
      const statusInterval = setInterval(() => {
        console.log(`📈 Status: ${this.pages.length} bot tabs active in shared browser`);
      }, 30000);

      this.statusInterval = statusInterval;

    } catch (error) {
      console.error('Load test failed:', error);
    }
  }

  // Cleanup function
  async cleanup() {
    console.log('\n🧹 Cleaning up bots...');

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    // Close all pages first
    for (const pageInfo of this.pages) {
      try {
        await pageInfo.page.close();
        console.log(`✅ Bot ${pageInfo.botId} tab closed`);
      } catch (e) {
        console.error(`Error closing bot ${pageInfo.botId} tab:`, e.message);
      }
    }

    // Close the shared browser
    if (this.browser) {
      try {
        await this.browser.close();
        console.log(`✅ Shared browser closed`);
      } catch (e) {
        console.error('Error closing browser:', e.message);
      }
    }

    this.rl.close();
    console.log('✅ Cleanup complete');
    process.exit(0);
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal...');
  if (global.tester) await global.tester.cleanup();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received terminate signal...');
  if (global.tester) await global.tester.cleanup();
});

// Main execution
async function main() {
  const tester = new VideoCallLoadTester();
  global.tester = tester;

  console.log('🎯 Video Call Load Testing Tool (Single Browser)');
  console.log('================================================\n');

  await tester.startLoadTest();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export default VideoCallLoadTester;
