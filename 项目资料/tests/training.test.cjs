"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  P = require("../src/training.js");
function config(entry = false, step = 2.5) {
  return {
    tm: 155,
    increment: step,
    barWeight: 20,
    weights: P.seedWeights(155, step, 20),
    phases: P.phases(entry),
    startDate: "2026-06-01",
    completed: {},
    records: [],
    archives: [],
    extraRest: {},
  };
}
function record(c, key, overrides = {}, phase = "round1") {
  const s = P.sessions(c).find((x) => x.key === key && x.phaseId === phase),
    plan = P.prescription(s, c),
    actual = {
      weights: Array(plan.sets).fill(plan.weight),
      reps: Array(plan.sets).fill(plan.reps),
      rpes: Array(plan.sets).fill(7),
      technique: true,
      pain: false,
      fatigued: false,
      warmupTired: false,
      ...overrides,
    };
  return {
    sessionId: s.id,
    plan,
    actual,
    result: P.evaluate(plan, actual),
    date: "2026-06-01",
  };
}
const next = (c, key) => P.nextWeights(c).find((x) => x.key === key);
test("12天轮转保持用户指定频率及四种卧推组次，下肢每种出现两次", () => {
  const c = config(),
    s = P.sessions(c).filter((x) => x.phaseId === "round1");
  assert.deepEqual(
    s.map((x) => [x.offset, x.key]),
    [
      [0, "bench_a"],
      [1, "squat"],
      [3, "bench_b"],
      [4, "deadlift"],
      [6, "bench_c"],
      [7, "squat"],
      [9, "bench_d"],
      [10, "deadlift"],
    ],
  );
  assert.deepEqual(
    s.filter((x) => x.type === "bench").map((x) => [x.sets, x.reps]),
    [
      [4, 9],
      [5, 7],
      [6, 5],
      [7, 3],
    ],
  );
  assert.equal(
    s.reduce((n, x) => n + x.sets, 0),
    42,
  );
  assert.deepEqual(
    s.filter((x) => x.type !== "bench").map((x) => [x.sets, x.reps]),
    Array(4).fill([5, 5]),
  );
});
test("开局恢复后36天24练，后续30天20练，常规两轮不会强加重量", () => {
  for (const [entry, days, count] of [
    [true, 36, 24],
    [false, 30, 20],
  ]) {
    const c = config(entry);
    assert.equal(
      c.phases.reduce((n, p) => n + p.days, 0),
      days,
    );
    assert.equal(P.sessions(c).length, count);
    assert.equal(
      P.rollingSchedule(c).at(-1).nextDate,
      P.addDays(c.startDate, days),
    );
    for (const key of P.KEYS) {
      const a = record(c, key, {}, "round1"),
        b = record(c, key, {}, "round2");
      assert.equal(a.plan.weight, b.plan.weight);
    }
  }
});
test("2.5/5kg设备向下配片，各主项独立；历史计划不会由纯计算修改", () => {
  const c = config();
  assert.deepEqual(c.weights, {
    bench_a: 100,
    bench_b: 107.5,
    bench_c: 115,
    bench_d: 122.5,
    squat: 100,
    deadlift: 140,
  });
  assert.deepEqual(config(false, 5).weights, {
    bench_a: 100,
    bench_b: 105,
    bench_c: 115,
    bench_d: 120,
    squat: 100,
    deadlift: 140,
  });
  assert.ok(P.validConfig(c));
  assert.equal(P.validConfig(null), false);
  assert.equal(P.validConfig({ ...c, phases: [null, null, null] }), false);
  assert.equal(P.validConfig({ ...c, increment: 5 }), false);
  const r = record(c, "bench_a");
  c.weights.bench_a = 102.5;
  assert.equal(r.plan.weight, 100);
  assert.equal(P.prescription(P.sessions(c)[0], c).weight, 102.5);
  assert.equal(P.validWeight(107.5, 5, 20), false);
  assert.equal(P.validWeight(5, 2.5, 20), false);
});
test("恢复段实质减组、减重，无12×25或辅助且不占用常规A—D", () => {
  const c = config(true),
    s = P.sessions(c).slice(0, 4);
  assert.deepEqual(
    s.map((x) => [P.prescription(x, c).weight, x.sets, x.reps, x.maxRpe]),
    [
      [80, 2, 5, 6],
      [70, 2, 5, 6],
      [90, 2, 3, 6],
      [97.5, 2, 3, 6],
    ],
  );
  for (const x of s) {
    assert.deepEqual(P.warmup(x), []);
    assert.deepEqual(P.accessories(x), []);
  }
  assert.equal(P.sessions(c)[4].key, "bench_a");
  assert.equal(P.sessions(c)[4].offset, 6);
  assert.equal(
    P.prescription(P.sessions(config(true, 5))[2], config(true, 5)).weight,
    90,
  );
});
test("正常日严格12组300次；辅助有单独上限，不塞进准备循环", () => {
  const s = P.sessions(config()).filter((x) => x.phaseId === "round1");
  for (const x of s) {
    const w = P.warmup(x);
    assert.equal(w.length, 6);
    assert.equal(
      w.reduce((n, e) => n + e.sets, 0),
      12,
    );
    assert.equal(
      w.reduce((n, e) => n + e.sets * e.reps, 0),
      300,
    );
    assert.equal(new Set(w.map((e) => e.id)).size, 6);
  }
  assert.equal(
    s.reduce((n, x) => n + P.accessories(x).reduce((m, e) => m + e.sets, 0), 0),
    36,
  );
  assert.deepEqual(
    P.accessories(s[1]).map((e) => [e.name, e.sets]),
    [
      ["直腿硬拉", 2],
      ["腿屈伸", 2],
      ["器械内收", 1],
      ["器械外展", 1],
    ],
  );
  assert.equal(P.accessories(s[3])[0].name, "引体向上");
  assert.match(P.warmup(s[0])[0].cue, /总共2组/);
  assert.match(P.warmup(s[1]).at(-1).count, /合计25次/);
});
test("单组超难度、少次数、动作失控、减重均结束记录但不达标；疼痛或疲劳暂停", () => {
  const c = config();
  assert.equal(record(c, "bench_a").result.pass, true);
  for (const overrides of [
    { reps: [9, 9, 9, 8] },
    { rpes: [7, 7, 7, 8.5] },
    { technique: false },
    { weights: [100, 100, 100, 97.5] },
  ]) {
    const r = record(c, "bench_a", overrides);
    assert.equal(r.result.finished, true);
    assert.equal(r.result.pass, false);
  }
  assert.equal(
    record(c, "deadlift", { rpes: Array(5).fill(8) }).result.pass,
    false,
  );
  for (const flag of ["pain", "fatigued"])
    assert.equal(record(c, "bench_a", { [flag]: true }).result.finished, false);
  const r = record(c, "bench_a", {
    reps: [0, 0, 0, 0],
    rpes: [null, null, null, null],
  });
  assert.equal(r.result.finished, false);
  assert.equal(r.result.pass, false);
});
test("各主项独立进阶：2次同重量达标才加档，恢复成绩不计", () => {
  const c = config(true);
  c.records = [record(c, "bench_a")];
  assert.equal(next(c, "bench_a").to, 100);
  c.records.push(record(c, "bench_a", {}, "entry"));
  assert.equal(next(c, "bench_a").to, 100);
  c.records.push(record(c, "bench_a", {}, "round2"));
  assert.equal(next(c, "bench_a").to, 102.5);
  assert.equal(next(c, "bench_b").to, 107.5);
  c.records.at(-1).actual.rpes[3] = 8;
  assert.equal(next(c, "bench_a").to, 100);
});
test("5kg器械更严格；任意一次准备后疲劳都阻止加重", () => {
  const c = config(false, 5);
  c.records = [record(c, "bench_a"), record(c, "bench_a", {}, "round2")];
  assert.equal(next(c, "bench_a").to, 105);
  c.records[0].actual.rpes[0] = 7.5;
  assert.equal(next(c, "bench_a").to, 100);
  c.records[0].actual.rpes[0] = 7;
  for (const i of [0, 1]) {
    c.records[i].actual.warmupTired = true;
    assert.equal(next(c, "bench_a").to, 100);
    c.records[i].actual.warmupTired = false;
  }
});
test("失败下调只应用一次，即使工作中已经减重；不改其他主项", () => {
  const c = config();
  c.records = [
    record(c, "bench_a", {
      reps: [9, 9, 7, 0],
      weights: [100, 97.5, 97.5, 97.5],
      rpes: [7, 8, 9, null],
    }),
  ];
  assert.equal(next(c, "bench_a").to, 95);
  c.weights.bench_a = 95;
  assert.equal(next(c, "bench_a").to, 95);
  assert.equal(next(c, "squat").to, 100);
  c.weights.bench_a = 92.5;
  assert.equal(next(c, "bench_a").to, 92.5);
});
test("相同重量和组次不足两次时保持，归档可以参与但暂停会阻止加重", () => {
  const c = config();
  const old = record(c, "bench_a");
  old.actual.weights.fill(97.5);
  c.archives = [{ records: [old] }];
  c.records = [record(c, "bench_a")];
  assert.equal(next(c, "bench_a").to, 100);
  old.actual.weights.fill(100);
  old.plan.reps = 8;
  assert.equal(next(c, "bench_a").to, 100);
  old.plan.reps = 9;
  assert.equal(next(c, "bench_a").to, 102.5);
  c.records.push(record(c, "bench_a", { fatigued: true }));
  assert.equal(next(c, "bench_a").to, 100);
});
test("实际日期、训练间隔、额外休息与暂停共同顺延，已完成日期保持", () => {
  const c = config(),
    s = P.sessions(c);
  assert.deepEqual(
    P.rollingSchedule(c)
      .slice(0, 4)
      .map((x) => [x.date, x.restDays]),
    [
      ["2026-06-01", 0],
      ["2026-06-02", 1],
      ["2026-06-04", 0],
      ["2026-06-05", 1],
    ],
  );
  const r = record(c, "bench_a");
  r.date = "2026-06-03";
  c.records = [r];
  c.completed[r.sessionId] = r;
  assert.equal(P.earliestRecordDate(c, s[1]), "2026-06-04");
  c.extraRest[s[0].id] = 1;
  let dates = P.rollingSchedule(c);
  assert.equal(dates[0].date, "2026-06-03");
  assert.equal(dates[1].date, "2026-06-05");
  assert.equal(dates[2].date, "2026-06-07");
  assert.equal(P.earliestRecordDate(c, s[1]), "2026-06-05");
  const paused = record(c, "squat", { fatigued: true });
  paused.date = "2026-06-05";
  c.records.push(paused);
  assert.equal(P.earliestRecordDate(c, s[1]), "2026-06-07");
  dates = P.rollingSchedule(c);
  assert.equal(dates[1].date, "2026-06-07");
  assert.equal(dates[2].date, "2026-06-09");
});
test("日期跨月和闰日有效，不接受不存在的日期", () => {
  assert.equal(P.addDays("2026-09-30", 2), "2026-10-02");
  assert.equal(P.validDate("2026-02-29"), false);
  assert.equal(P.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(P.validDate("2026-06-31"), false);
  assert.equal(P.addDays("bad", 1), null);
});
test("递增热身按设备可配、逐级升重、低于主项，无重复档；不把300次循环混入", () => {
  for (const step of [2.5, 5])
    for (const bar of [10, 15, 20]) {
      const c = { ...config(true, step), barWeight: bar };
      for (const s of P.sessions(c)) {
        const p = P.prescription(s, c),
          r = P.rampFor(p);
        assert.equal(r.length, new Set(r.map((x) => x.weight)).size);
        r.forEach((x, i) => {
          assert.ok(P.validWeight(x.weight, step, bar));
          assert.ok(x.weight < p.weight);
          assert.equal(x.perSide, (x.weight - bar) / 2);
          if (i) assert.ok(x.weight > r[i - 1].weight);
        });
      }
    }
  assert.deepEqual(
    P.rampFor(record(config(), "deadlift").plan).map((x) => [x.weight, x.reps]),
    [
      [55, "5"],
      [70, "5"],
      [97.5, "3"],
      [117.5, "1"],
    ],
  );
});
