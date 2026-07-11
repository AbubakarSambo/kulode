import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

// A4 at 96 DPI: 595.28pt x 841.89pt ≈ 794 x 1123 CSS px.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

@Injectable()
export class InvoiceRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(InvoiceRenderService.name);
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer
        .launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        })
        .then((browser) => {
          browser.on('disconnected', () => {
            this.logger.warn('Puppeteer browser disconnected, will relaunch on next render.');
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async renderPng(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'load' });
      const png = await page.screenshot({ fullPage: true, type: 'png' });
      return Buffer.from(png);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      await browser?.close();
    }
  }
}
