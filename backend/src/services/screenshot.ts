import puppeteer from 'puppeteer';

export async function takeScreenshot(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    // Give Phaser time to render the first frame
    await new Promise(r => setTimeout(r, 3000));
    const buffer = await page.screenshot({ type: 'png' });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
