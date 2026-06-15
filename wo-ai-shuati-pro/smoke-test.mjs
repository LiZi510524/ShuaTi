import { chromium } from "playwright";
import path from "node:path";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
const logs = [];
page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:4174/", { waitUntil: "networkidle" });
await page.setInputFiles("#xlsxFile", "D:\\Desk\\学习通导题-20260612-2227.xlsx");
await page.fill("#bankName", "Smoke Test 题库");
await page.fill("#courseName", "测试课程");
await page.fill("#chapterName", "导论");
await page.fill("#bankTags", "期末,测试");
await page.click("button[type='submit']");
await page.waitForSelector("text=生成练习", { timeout: 20000 });
await page.click("text=生成练习");
await page.waitForSelector(".question-card", { timeout: 10000 });
const questionText = await page.locator(".stem").first().innerText();
const optionCount = await page.locator(".option-button").count();
await page.click(".tab-button[data-view='discover']");
await page.waitForSelector("text=发现题库", { timeout: 5000 });
await page.click(".tab-button[data-view='account']");
await page.waitForSelector("text=我的账号", { timeout: 5000 });
const screenshotPath = path.resolve("wo-ai-shuati-pro", "smoke-pro.png");
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

console.log(JSON.stringify({ questionText: questionText.slice(0, 80), optionCount, screenshotPath, logs }, null, 2));
