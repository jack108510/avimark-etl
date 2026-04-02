#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const htmlPath = args[0] || path.resolve(__dirname, '../../reports/inflation_final.html');
const pdfPath = args[1] || htmlPath.replace(/\.html$/, '.pdf');

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
});
await browser.close();
console.log('✅ PDF saved:', pdfPath);
