import puppeteer from "puppeteer";
import fs from "fs";

const twitterLogin = async () => {
  const browser = await puppeteer.launch({ headless: false }); // show browser
  const page = await browser.newPage();

  await page.goto("https://twitter.com/login", { waitUntil: "networkidle2" });

  console.log("🔓 Please log in manually...");

  // Wait for the user to log in
  await new Promise((resolve) => setTimeout(resolve, 60000)); // 60 seconds

  const cookies = await page.cookies();
  fs.writeFileSync("twitter-cookies.json", JSON.stringify(cookies, null, 2));

  console.log("✅ Cookies saved to twitter-cookies.json");

  await browser.close();
};

twitterLogin();
