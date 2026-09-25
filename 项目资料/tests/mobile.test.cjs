"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../.."),
  out = process.env.BENCH_TEST_OUTPUT || "/tmp/fitness-plan-check",
  html = fs.readFileSync(path.join(root, "index.html")),
  key = "bench-rotation-v8";
fs.mkdirSync(out, { recursive: true });
async function state(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
}
async function layout(page) {
  return page.evaluate(() => {
    const small = [],
      overflow = [],
      clippedSelects = [];
    for (const el of document.querySelectorAll("body *")) {
      const st = getComputedStyle(el);
      if (
        !el.getClientRects().length ||
        st.visibility === "hidden" ||
        el.closest("svg") ||
        ["STYLE", "SCRIPT", "OPTION"].includes(el.tagName) ||
        (el.closest("thead") &&
          getComputedStyle(el.closest("thead")).clipPath !== "none")
      )
        continue;
      const own = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      if (
        (own || el.matches("input,select,textarea,button")) &&
        parseFloat(st.fontSize) < 16
      )
        small.push([el.tagName, el.id, st.fontSize]);
      const r = el.getBoundingClientRect();
      if (
        r.width > 1 &&
        (r.right > innerWidth + 1 || r.left < -1) &&
        st.position !== "absolute"
      )
        overflow.push([el.tagName, el.id, r.left, r.right]);
      if (el.tagName === "SELECT") {
        const c = document.createElement("canvas").getContext("2d");
        c.font = st.font;
        const available =
          el.clientWidth -
          parseFloat(st.paddingLeft) -
          parseFloat(st.paddingRight) -
          22;
        for (const o of el.options)
          if (c.measureText(o.text).width > available + 2)
            clippedSelects.push([el.id, o.text, available]);
      }
    }
    const header = document.querySelector(".topbar").getBoundingClientRect(),
      brand = document.querySelector(".topbar .brand").getBoundingClientRect(),
      share = document.querySelector(".mobile-share").getBoundingClientRect();
    const headerOK =
      brand.bottom <= header.bottom &&
      share.bottom <= header.bottom &&
      share.left >= brand.right + 4;
    return {
      headerOK,
      width: innerWidth,
      page: document.body.dataset.mobileSection,
      scroll: document.documentElement.scrollWidth,
      small,
      overflow: overflow.slice(0, 8),
      clippedSelects,
    };
  });
}
(async () => {
  const server = http.createServer((req, res) => {
    if (
      req.url.split("?")[0] === "/bench-plan/" ||
      req.url.split("?")[0] === "/bench-plan/index.html"
    ) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } else {
      res.statusCode = req.url === "/favicon.ico" ? 204 : 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`,
    url = origin + "/bench-plan/",
    browser = await chromium.launch({
      executablePath: "/usr/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox"],
    }),
    errors = [],
    requests = [],
    report = [];
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        timezoneId: "Asia/Shanghai",
        permissions: ["clipboard-read", "clipboard-write"],
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (
        /^https?:/.test(r.url()) &&
        !r.url().startsWith(origin + "/bench-plan/") &&
        !r.url().endsWith("/favicon.ico")
      )
        requests.push(r.url());
    });
    await page.goto(url);
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true);
    assert.equal(await page.locator("#overview").isVisible(), false);
    assert.equal(await page.locator(".hero").isVisible(), true);
    await page.locator("#mobileMenuButton").click();
    assert.equal(await page.locator("#mobileMenu").isVisible(), true);
    await page.locator('#mobileMenu a[href="#overview"]').click();
    assert.equal(await page.locator("#mobileMenu").isVisible(), false);
    assert.equal(await page.locator("#overview").isVisible(), true);
    await page.locator("#entryRecovery").uncheck();
    await page.locator("#startDate").fill("2026-06-01");
    await page.locator("#setupForm button[type=submit]").click();
    assert.equal((await state(page)).entryRecovery, false);
    await page.locator('[data-mobile-tab="cycle"]').click();
    assert.equal(await page.locator(".plan-phase[open]").count(), 1);
    await page.locator(".plan-phase").nth(1).locator("summary").click();
    assert.equal(await page.locator(".plan-phase[open]").count(), 2);
    await page.locator('[data-mobile-tab="session-plan"]').click();
    assert.equal(await page.locator("#warmupRows .support-entry").count(), 6);
    assert.equal(
      await page.locator("#warmupRows .support-entry[open]").count(),
      0,
    );
    await page.locator("#warmupRows .support-entry summary").first().click();
    await page.locator("#warmupRows [data-field=sets]").first().fill("2");
    await page.locator("#warmupRows [data-field=load]").first().fill("自重");
    assert.match(await page.locator("#warmupCount").innerText(), /2 \/ 12/);
    await page.locator('.training-steps a[href="#mainCard"]').click();
    assert.equal(await page.locator("#mainCard").isVisible(), true);
    for (let i = 0; i < 4; i++) {
      await page.locator(`[name=reps${i}]`).fill("9");
      await page.locator(`[name=rpe${i}]`).fill("7");
    }
    await page.locator("#actualDate").fill("2026-06-01");
    await page.locator("#technique").check();
    await page.locator('[data-mobile-tab="review"]').click();
    await page.locator('[data-mobile-tab="session-plan"]').click();
    assert.equal(
      await page.locator("[name=reps0]").inputValue(),
      "9",
      "切换分区保留尚未提交主项",
    );
    await page.locator("#saveAttempt").click();
    assert.equal((await state(page)).records.length, 1);
    assert.equal((await state(page)).records[0].support.warmup.side.sets, 2);
    await page.locator("#goNext").click();
    assert.match(await page.locator("#sessionLabel").innerText(), /深蹲/);
    assert.equal(await page.locator("#setRows .set-row").count(), 5);
    assert.equal(
      await page.locator("[name=weight0]").getAttribute("inputmode"),
      "decimal",
    );
    assert.equal(
      await page.locator("[name=reps0]").getAttribute("inputmode"),
      "numeric",
    );
    await page.locator('[data-mobile-tab="review"]').click();
    await page.goBack();
    assert.equal(await page.locator("#session-plan").isVisible(), true);
    await page.reload();
    assert.match(await page.locator("#sessionLabel").innerText(), /深蹲/);
    assert.equal((await state(page)).records.length, 1);
    report.push(
      "手机触摸导航、阶段折叠、热身填写、主项草稿保留、保存、下一练、返回与刷新通过",
    );
    await page.locator(".mobile-share").click();
    assert.equal(await page.locator("#shareUrl").inputValue(), url);
    await page.locator("#copySiteLink").click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      url,
    );
    assert.match(
      await page.locator("#shareHint").innerText(),
      /不会随链接发送/,
    );
    await page.locator("#shareDialog [data-close-dialog]").click();
    report.push("仓库子目录访问与只分享网址、剪贴板复制通过");
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), false);
    assert.equal(await page.locator("#overview").isVisible(), true);
    assert.equal(await page.locator("#review").isVisible(), true);
    assert.equal(await page.locator(".plan-phase[open]").count(), 3);
    assert.equal(
      await page.locator("#accessoryRows .support-entry[open]").count(),
      4,
    );
    report.push("切换桌面宽度恢复完整页面和输入区，不改变训练记录");
    await context.close();
    const clean = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      }),
      view = await clean.newPage();
    view.on("pageerror", (e) => errors.push(e.message));
    await view.goto(url);
    await view.evaluate(() => {
      window.BenchUI.openSection("overview");
      document.querySelector("#entryRecovery").checked = false;
      document.querySelector("#setupForm").requestSubmit();
    });
    const audits = [];
    for (const width of [320, 360, 390, 430, 760]) {
      await view.setViewportSize({ width, height: 900 });
      for (const id of [
        "top",
        "overview",
        "cycle",
        "split",
        "session-plan",
        "review",
        "failure",
        "sources",
      ]) {
        await view.evaluate((id) => window.BenchUI.openSection(id), id);
        if (id === "cycle")
          await view
            .locator(".plan-phase")
            .evaluateAll((els) => els.forEach((el) => (el.open = true)));
        if (id === "split")
          await view
            .locator("#split details")
            .evaluateAll((els) => els.forEach((el) => (el.open = true)));
        if (id === "session-plan")
          await view
            .locator(".support-entry")
            .evaluateAll((els) => els.forEach((el) => (el.open = true)));
        const a = await layout(view);
        audits.push(a);
        fs.writeFileSync(
          path.join(out, "mobile-layout.json"),
          JSON.stringify(audits, null, 2),
        );
        assert.equal(a.headerOK, true, JSON.stringify(a));
        assert.equal(a.scroll, width, JSON.stringify(a));
        assert.deepEqual(a.small, [], JSON.stringify(a));
        assert.deepEqual(a.overflow, [], JSON.stringify(a));
        assert.deepEqual(a.clippedSelects, [], JSON.stringify(a));
      }
    }
    report.push(
      "320/360/390/430/760px，8个分区逐页检查：无横向溢出、文字至少16px、选择框文字完整",
    );
    await view.setViewportSize({ width: 390, height: 844 });
    await view.evaluate(() => window.BenchUI.openSection("top"));
    await view.screenshot({
      path: path.join(root, "项目资料/示例/手机首页.png"),
    });
    await view.locator('[data-mobile-tab="session-plan"]').click();
    await view.screenshot({ path: path.join(out, "mobile-training-top.png") });
    await view.locator('.training-steps a[href="#mainCard"]').click();
    await view.screenshot({
      path: path.join(root, "项目资料/示例/手机训练.png"),
    });
    await view.pdf({
      path: path.join(out, "mobile-print.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await view.setViewportSize({ width: 1440, height: 1000 });
    await view.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await view.screenshot({
      path: path.join(root, "项目资料/示例/界面预览.png"),
    });
    const local = await clean.newPage();
    await local.goto(pathToFileURL(path.join(root, "index.html")).href);
    await local.locator(".mobile-share").click();
    assert.equal(await local.locator("#copySiteLink").isVisible(), false);
    assert.equal(await local.locator("#shareUrl").isVisible(), false);
    assert.match(
      await local.locator("#shareHint").innerText(),
      /当前打开的是本地HTML/,
    );
    await local.locator("#shareDialog [data-close-dialog]").click();
    await clean.close();
    report.push("打印与手机预览生成；本地HTML提示先发布，不分享file地址");
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    report.push("无JS异常，无第三方资源请求");
    fs.writeFileSync(
      path.join(out, "mobile-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
