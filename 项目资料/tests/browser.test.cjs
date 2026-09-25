/* 将PLAYWRIGHT_MODULE指向已安装的Playwright包；测试使用独立浏览器上下文。 */
"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../.."),
  url = pathToFileURL(path.join(root, "index.html")).href,
  key = "bench-rotation-v8",
  out = process.env.BENCH_TEST_OUTPUT || "/tmp/fitness-plan-check";
fs.mkdirSync(out, { recursive: true });
async function read(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
}
async function setup(page, entry = false) {
  await page.locator("#entryRecovery").setChecked(entry);
  await page.locator("#startDate").fill("2026-06-01");
  await page.locator("#setupForm button[type=submit]").click();
  assert.ok((await read(page)).phases);
}
async function submit(
  page,
  {
    date,
    reps,
    rpe = 7,
    readiness = "normal",
    warmup = "ready",
    technique = true,
  } = {},
) {
  await page.evaluate(
    ({ date, reps, rpe, readiness, warmup, technique }) => {
      const P = window.BenchPlan,
        s = P.sessions(state)[state.cursor],
        p = P.prescription(s, state);
      document.querySelector("#actualDate").value =
        date || P.rollingSchedule(state)[state.cursor].date;
      document.querySelector("#readiness").value = readiness;
      document.querySelector("#readiness").dispatchEvent(new Event("change"));
      document.querySelector("#warmupEffect").value = warmup;
      for (let i = 0; i < p.sets; i++) {
        document.querySelector(`[name=reps${i}]`).value =
          readiness === "normal"
            ? Array.isArray(reps)
              ? reps[i]
              : (reps ?? p.reps)
            : 0;
        document.querySelector(`[name=rpe${i}]`).value =
          readiness === "normal" ? (s.recovery ? Math.min(rpe, 6) : rpe) : "";
      }
      document.querySelector("#technique").checked = technique;
      document.querySelector("#logForm").requestSubmit();
    },
    { date, reps, rpe, readiness, warmup, technique },
  );
}
async function audit(page) {
  return page.evaluate(() => {
    const visible = (el) => {
        const s = getComputedStyle(el);
        return (
          el.getClientRects().length > 0 &&
          s.visibility !== "hidden" &&
          s.display !== "none"
        );
      },
      small = [],
      over = [],
      selects = [];
    for (const el of document.querySelectorAll("body *")) {
      if (
        !visible(el) ||
        el.closest("svg") ||
        (el.closest("thead") &&
          getComputedStyle(el.closest("thead")).clipPath !== "none") ||
        ["OPTION", "SCRIPT", "STYLE"].includes(el.tagName)
      )
        continue;
      const s = getComputedStyle(el),
        own = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim(),
        ),
        form = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName);
      if ((own || form) && parseFloat(s.fontSize) < 16)
        small.push({
          tag: el.tagName,
          id: el.id,
          text: el.textContent.slice(0, 50),
          size: s.fontSize,
        });
      for (const pseudo of ["::before", "::after"]) {
        const p = getComputedStyle(el, pseudo);
        if (
          p.content &&
          p.content !== "none" &&
          p.content !== "normal" &&
          p.content !== '""' &&
          parseFloat(p.fontSize) < 16
        )
          small.push({ tag: el.tagName, pseudo, size: p.fontSize });
      }
      const b = el.getBoundingClientRect();
      if (
        b.width > 1 &&
        (b.right > innerWidth + 1 || b.left < -1) &&
        s.position !== "absolute" &&
        !el.closest(".nav-links")
      )
        over.push({
          tag: el.tagName,
          id: el.id,
          cls: el.className,
          left: b.left,
          right: b.right,
        });
      if (el.tagName === "SELECT") {
        const can = document.createElement("canvas").getContext("2d");
        can.font = s.font;
        const avail =
          el.clientWidth -
          parseFloat(s.paddingLeft) -
          parseFloat(s.paddingRight) -
          22;
        for (const o of el.options) {
          if (can.measureText(o.text).width > avail + 2)
            selects.push({
              id: el.id,
              text: o.text,
              needed: can.measureText(o.text).width,
              avail,
            });
        }
      }
    }
    return {
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      small,
      overflow: over.slice(0, 15),
      selects,
    };
  });
}
(async () => {
  const browser = await chromium.launch({
      executablePath: "/usr/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox"],
    }),
    errors = [],
    requests = [],
    reports = [];
  async function fresh() {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
      timezoneId: "Asia/Shanghai",
    });
    await context.route(/^https?:/, (r) => {
      requests.push(r.request().url());
      return r.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    return { context, page };
  }
  try {
    let context, page;
    if (!process.argv.includes("--visual-only")) {
      ({ context, page } = await fresh());
      assert.equal(await page.locator("#cycleGrid tbody tr").count(), 24);
      assert.equal(await page.locator("#setRows .set-row").count(), 2);
      assert.equal(await page.locator("#warmupRows .support-row").count(), 0);
      assert.equal(
        await page.locator("#accessoryRows .support-row").count(),
        0,
      );
      await setup(page, false);
      assert.equal(await page.locator("#cycleGrid tbody tr").count(), 20);
      assert.equal(await page.locator("#setRows .set-row").count(), 4);
      assert.equal(await page.locator("#warmupRows .support-row").count(), 6);
      await page.locator("#warmupRows [data-field=sets]").evaluateAll((els) =>
        els.forEach((el) => {
          el.value = 2;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }),
      );
      assert.match(await page.locator("#warmupCount").innerText(), /12 \/ 12/);
      await page
        .locator("#warmupRows [data-field=load]")
        .first()
        .fill("自重卸力");
      await page.locator("#sessionNotes").fill("回归首练；不补组");
      await page.reload();
      assert.match(await page.locator("#warmupCount").innerText(), /12 \/ 12/);
      assert.equal(
        await page.locator("#sessionNotes").inputValue(),
        "回归首练；不补组",
      );
      // 通过真实表单走完30天周期，验证常规成绩参与加重、恢复成绩被排除。
      for (let i = 0; i < 20; i++) {
        await submit(page);
        let c = await read(page);
        assert.equal(
          c.records.length,
          i + 1,
          await page.locator("#attemptResult").innerText(),
        );
        assert.ok(c.completed[c.records.at(-1).sessionId]);
        if (i === 0) {
          await page
            .locator("#accessoryRows [data-field=load]")
            .first()
            .fill("20kg");
          c = await read(page);
          assert.equal(c.records[0].support.accessories.pushdown.load, "20kg");
        }
        if (i < 19) {
          await page.locator("#goNext").click();
          if (i === 0) {
            assert.equal(await page.locator("#setRows .set-row").count(), 5);
            assert.equal(
              await page.locator("#accessoryRows .support-row").count(),
              4,
            );
          }
          if (i === 2)
            assert.equal(
              await page.locator("#accessoryRows .support-row").count(),
              3,
            );
        }
      }
      assert.equal(await page.locator("#newCycleButton").isEnabled(), true);
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#exportButton").click();
      const d = await downloadPromise;
      await d.saveAs(path.join(out, "record-export.json"));
      const exported = JSON.parse(
        fs.readFileSync(path.join(out, "record-export.json"), "utf8"),
      );
      assert.equal(exported.state.records.length, 20);
      assert.equal(
        exported.state.support["round1-0"].accessories.pushdown.load,
        "20kg",
      );
      await page.locator("#newCycleButton").click();
      let c = await read(page);
      assert.equal(c.cycle, 2);
      assert.equal(c.archives[0].records.length, 20);
      assert.equal(c.archives[0].notes["round1-0"], "回归首练；不补组");
      assert.deepEqual(c.weights, {
        bench_a: 102.5,
        bench_b: 110,
        bench_c: 117.5,
        bench_d: 125,
        squat: 102.5,
        deadlift: 142.5,
      });
      assert.equal(c.phases.length, 3);
      reports.push(
        "完整30天20次记录、辅助补填、JSON导出、归档与6项独立进阶通过",
      );
      await context.close();
      ({ context, page } = await fresh());
      await setup(page, false);
      await submit(page, { reps: [9, 9, 8, 0], rpe: 8.5 });
      c = await read(page);
      assert.equal(c.weights.bench_a, 97.5);
      assert.equal(c.completed["round1-0"].plan.weight, 100);
      assert.match(
        await page.locator("#recommendationGrid").innerText(),
        /97.5 → 97.5kg/,
      );
      await page.locator("#goNext").click();
      await submit(page, { date: "2026-06-01" });
      assert.equal((await read(page)).records.length, 1);
      assert.match(
        await page.locator("#attemptResult").innerText(),
        /最早 2026-06-02/,
      );
      await submit(page, { date: "2026-06-02", readiness: "pain" });
      assert.equal((await read(page)).records.length, 2);
      assert.equal(Object.keys((await read(page)).completed).length, 1);
      await submit(page, { date: "2026-06-03" });
      assert.equal((await read(page)).records.length, 2);
      await submit(page, { date: "2026-06-04" });
      assert.equal((await read(page)).records.length, 3);
      await page.locator("#extraRest").check();
      await page.locator("#goNext").click();
      assert.match(await page.locator("#sessionIntent").innerText(), /6月7日/);
      await page.locator("#recoverNowButton").click();
      c = await read(page);
      assert.equal(c.archives[0].records.length, 3);
      assert.equal(c.weights.bench_a, 97.5);
      assert.equal(c.weights.squat, 100);
      assert.equal(c.phases[0].mode, "recovery");
      assert.equal(await page.locator("#recoverNowButton").isDisabled(), true);
      reports.push("失败只降一档、日期约束、疼痛暂停、额外休息与提前恢复通过");
      await context.close();
      ({ context, page } = await fresh());
      await page.evaluate(() =>
        localStorage.setItem(
          "bench-smolov-v7",
          JSON.stringify({
            tm: 160,
            increment: 5,
            barWeight: 20,
            records: [
              {
                date: "2026-05-01",
                label: "旧卧推",
                plan: { weight: 140, sets: 5, reps: 3 },
                actual: {
                  weight: 140,
                  reps: [3, 3, 3, 3, 3],
                  rpes: [7, 7, 7, 7, 7],
                },
                result: { pass: true, finished: true },
              },
            ],
            archives: [{ records: [] }],
          }),
        ),
      );
      await page.reload();
      assert.equal(await page.locator("#tm").inputValue(), "160");
      assert.equal(await page.locator("#increment").inputValue(), "5");
      assert.equal(await page.locator("#load_bench_a").inputValue(), "100");
      assert.equal(await page.locator("#legacyDetails").isVisible(), true);
      await page.locator("#legacyDetails").evaluate((el) => (el.open = true));
      assert.match(await page.locator("#legacyRecords").innerText(), /旧卧推/);
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("bench-smolov-v7")).records.length,
        ),
        1,
      );
      await setup(page, false);
      await page.locator("#load_bench_b").fill("107.5");
      await page.locator("#setupForm button[type=submit]").click();
      assert.equal((await read(page)).weights.bench_b, 110);
      await page.locator("#seedBench").click();
      await page.locator("#setupForm button[type=submit]").click();
      assert.equal((await read(page)).weights.bench_b, 110);
      reports.push(
        "旧数据只读保留、只迁移TM/设备、新起点重算、5kg配片校验通过",
      );
      await context.close();
    }
    ({ context, page } = await fresh());
    await setup(page, true);
    await page.locator("#sessionSelect").selectOption("4");
    await page
      .locator("#split details")
      .evaluateAll((els) => els.forEach((el) => (el.open = true)));
    for (const width of [360, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => {
        window.BenchUI?.openSection("session-plan");
        scrollTo({ top: 0, behavior: "instant" });
      });
      const a = await audit(page);
      reports.push(a);
      fs.writeFileSync(
        path.join(out, "layout-audit.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.equal(a.scroll, width, "页面横向溢出 " + JSON.stringify(a));
      assert.equal(a.small.length, 0, JSON.stringify(a.small));
      assert.equal(a.overflow.length, 0, JSON.stringify(a.overflow));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(root, "项目资料/示例/界面预览.png"),
    });
    await page.locator("#session-plan").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, "training-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.BenchUI?.openSection("session-plan"));
    await page.locator("#session-plan").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, "training-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const csvPromise = page.waitForEvent("download");
    await page.locator("#exportPlanButton").click();
    await (
      await csvPromise
    ).saveAs(path.join(root, "项目资料/示例/长期轮转训练表.csv"));
    assert.ok(
      fs
        .readFileSync(
          path.join(root, "项目资料/示例/长期轮转训练表.csv"),
          "utf8",
        )
        .includes("直腿硬拉"),
    );
    const docPromise = page.waitForEvent("download");
    await page.locator('a[download="重建计划与研究依据.md"]').click();
    await (await docPromise).saveAs(path.join(out, "embedded-guide.md"));
    assert.equal(
      fs.readFileSync(path.join(out, "embedded-guide.md"), "utf8"),
      fs.readFileSync(
        path.join(root, "项目资料/docs/重建计划与研究依据.md"),
        "utf8",
      ),
    );
    await page.pdf({
      path: path.join(root, "项目资料/示例/长期轮转训练表.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    reports.push("离线CSV/内嵌说明下载、PDF与当前示例生成完成");
    await context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    reports.push("全程无JS异常、无外部资源请求");
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(reports, null, 2),
    );
    console.log(JSON.stringify(reports, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
