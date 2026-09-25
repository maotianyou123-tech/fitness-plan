/* 长期轮转：卧推、深蹲、休息、卧推、硬拉引体、休息。
   训练剂量、开局恢复与进阶阈值属于本项目的具体编排，不是通用最优处方。 */
(function (root) {
  "use strict";
  const BENCH = [
    { key: "bench_a", slot: 0, label: "卧推 A · 9次日", sets: 4, reps: 9 },
    { key: "bench_b", slot: 1, label: "卧推 B · 7次日", sets: 5, reps: 7 },
    { key: "bench_c", slot: 2, label: "卧推 C · 5次日", sets: 6, reps: 5 },
    { key: "bench_d", slot: 3, label: "卧推 D · 3次日", sets: 7, reps: 3 },
  ];
  const KEYS = [...BENCH.map((x) => x.key), "squat", "deadlift"];
  const LABELS = Object.fromEntries([
    ...BENCH.map((x) => [x.key, x.label]),
    ["squat", "深蹲"],
    ["deadlift", "硬拉"],
  ]);
  // 按整根杠铃的最小增量向下取整，保证计算结果能实际配片。
  function roundDown(value, step = 2.5, bar = 20) {
    return Number(
      (bar + Math.floor((value - bar + 1e-8) / step) * step).toFixed(2),
    );
  }
  function validWeight(w, step = 2.5, bar = 20) {
    return (
      Number.isFinite(w) &&
      [2.5, 5].includes(step) &&
      [10, 15, 20].includes(bar) &&
      w >= bar &&
      w <= 350 &&
      Math.abs((w - bar) / step - Math.round((w - bar) / step)) < 1e-6
    );
  }
  function seedWeights(tm = 155, increment = 2.5, barWeight = 20) {
    return {
      ...Object.fromEntries(
        BENCH.map((s, i) => [
          s.key,
          roundDown(tm * [0.65, 0.7, 0.75, 0.8][i], increment, barWeight),
        ]),
      ),
      squat: 100,
      deadlift: 140,
    };
  }
  function phases(entryRecovery = true) {
    return [
      ...(entryRecovery
        ? [{ id: "entry", name: "开局恢复", mode: "recovery", days: 6 }]
        : []),
      { id: "round1", name: "常规第1轮", mode: "normal", days: 12 },
      { id: "round2", name: "常规第2轮", mode: "normal", days: 12 },
      { id: "deload", name: "周期末恢复", mode: "recovery", days: 6 },
    ];
  }
  // 展开恢复段和常规阶段；训练顺序以偏移天数表示，不依赖自然周。
  function sessions(c) {
    let offset = 0;
    return c.phases.flatMap((phase, pi) => {
      const layout =
        phase.mode === "recovery"
          ? [
              [0, "bench_a"],
              [1, "squat"],
              [3, "bench_c"],
              [4, "deadlift"],
            ]
          : [
              [0, "bench_a"],
              [1, "squat"],
              [3, "bench_b"],
              [4, "deadlift"],
              [6, "bench_c"],
              [7, "squat"],
              [9, "bench_d"],
              [10, "deadlift"],
            ];
      const rows = layout.map(([day, key], i) => {
        const b = BENCH.find((x) => x.key === key),
          recovery = phase.mode === "recovery";
        return {
          id: `${phase.id}-${i}`,
          phaseId: phase.id,
          phaseIndex: pi,
          key,
          type: b ? "bench" : key,
          slot: b?.slot ?? null,
          day: day + 1,
          offset: offset + day,
          label: recovery
            ? b
              ? "卧推 · 恢复" + (i === 0 ? "1" : "2")
              : LABELS[key] + " · 恢复"
            : LABELS[key],
          recovery,
          sets: recovery ? 2 : (b?.sets ?? 5),
          reps: recovery ? (i < 2 ? 5 : 3) : (b?.reps ?? 5),
          maxRpe: recovery ? 6 : key === "deadlift" ? 7.5 : 8,
          rest: recovery
            ? "2–3分钟"
            : key === "deadlift"
              ? "4–6分钟"
              : key === "squat"
                ? "3–5分钟"
                : "4–6分钟",
        };
      });
      offset += phase.days;
      return rows;
    });
  }
  // 根据独立工作重量计算当日处方，恢复段再降低负荷和训练量。
  function prescription(s, c) {
    const baseline = c.weights[s.key],
      scale = s.recovery ? (s.type === "bench" ? 0.8 : 0.7) : 1;
    return {
      sessionId: s.id,
      key: s.key,
      type: s.type,
      recovery: s.recovery,
      baseline,
      weight: Math.max(
        c.barWeight,
        roundDown(baseline * scale, c.increment, c.barWeight),
      ),
      sets: s.sets,
      reps: s.reps,
      maxRpe: s.maxRpe,
      increment: c.increment,
      barWeight: c.barWeight,
    };
  }
  function validConfig(c) {
    return (
      !!c &&
      Number.isFinite(c.tm) &&
      c.tm >= 20 &&
      c.tm <= 300 &&
      KEYS.every((k) =>
        validWeight(c.weights?.[k], c.increment, c.barWeight),
      ) &&
      Array.isArray(c.phases) &&
      c.phases.length >= 3 &&
      c.phases.every(
        (p) =>
          p &&
          ["normal", "recovery"].includes(p.mode) &&
          p.days === (p.mode === "normal" ? 12 : 6) &&
          typeof p.id === "string",
      ) &&
      new Set(c.phases.map((p) => p.id)).size === c.phases.length
    );
  }
  // 区分暂停与已经结束的训练，避免把未达标误当成应当补做。
  function evaluate(plan, a) {
    if (a.pain)
      return {
        finished: false,
        pass: false,
        kind: "stop",
        text: "已记录疼痛暂停，不推进本日。停止引发疼痛的动作；持续或反复不适应先评估。",
      };
    if (a.fatigued)
      return {
        finished: false,
        pass: false,
        kind: "recover",
        text: "已记录疲劳暂停，不推进本日。延后训练；可提前进入恢复段，不靠完成热身组数或补组追赶。",
      };
    const finished = a.reps.some((n) => n > 0),
      full =
        a.reps.length === plan.sets &&
        a.reps.every((n) => Number.isInteger(n) && n >= plan.reps),
      load =
        a.weights.length === plan.sets &&
        a.weights.every((w) => w >= plan.weight),
      rated =
        a.rpes.length === plan.sets &&
        a.rpes.every((r, i) => a.reps[i] === 0 || Number.isFinite(r)),
      easy =
        rated &&
        a.rpes.every((r) => Number.isFinite(r) && r >= 1 && r <= plan.maxRpe),
      pass = full && load && easy && a.technique;
    return {
      finished,
      pass,
      kind: pass ? "pass" : "adjust",
      text: pass
        ? plan.recovery
          ? "轻练已完成。恢复段不计入加重成绩，下一次仍先确认恢复。"
          : "目标组次与动作完成，RPE未超上限。下一次同类训练先保持；加重在周期回顾时逐项判断。"
        : finished
          ? "实际训练已保存。本日不满足加重条件；下次同类训练先降低一档或提前恢复，不补组。"
          : "没有工作组记录，未推进。疲劳或疼痛请选择对应状态保存。",
    };
  }
  function dateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function validDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return false;
    const d = new Date(v + "T12:00:00");
    return !Number.isNaN(d.valueOf()) && dateString(d) === v;
  }
  function addDays(v, n) {
    if (!validDate(v) || !Number.isInteger(n)) return null;
    const d = new Date(v + "T12:00:00");
    d.setDate(d.getDate() + n);
    return dateString(d);
  }
  function gapAfter(s, c) {
    const list = sessions(c),
      i = list.findIndex((x) => x.id === s.id),
      duration = c.phases.reduce((n, p) => n + p.days, 0);
    return (
      (list[i + 1]?.offset ?? duration) -
      s.offset +
      (c.extraRest?.[s.id] === 1 ? 1 : 0)
    );
  }
  // 已完成训练采用实际日期，其余训练随暂停和额外休息顺延。
  function rollingSchedule(c) {
    let next = c.startDate;
    return sessions(c).map((s) => {
      let date = next;
      const done = c.completed?.[s.id];
      if (validDate(done?.date)) date = done.date;
      else {
        const last = (c.records || [])
          .filter((r) => r.sessionId === s.id && validDate(r.date))
          .at(-1);
        if (last) {
          const retry = addDays(last.date, 2);
          if (retry > date) date = retry;
        }
      }
      const gap = gapAfter(s, c);
      next = addDays(date, gap);
      return { sessionId: s.id, date, nextDate: next, gap, restDays: gap - 1 };
    });
  }
  function earliestRecordDate(c, s) {
    const last = (c.records || []).at(-1);
    if (!last) return null;
    if (last.sessionId === s.id && !last.result?.finished)
      return addDays(last.date, 2);
    const prev = sessions(c).find((x) => x.id === last.sessionId);
    return addDays(last.date, prev ? gapAfter(prev, c) : 1);
  }
  function rampFor(plan) {
    const seen = new Set(),
      bar =
        plan.type === "deadlift"
          ? Math.max(
              plan.barWeight,
              roundDown(plan.weight * 0.4, plan.increment, plan.barWeight),
            )
          : plan.barWeight;
    const values = [
      [bar, plan.type === "deadlift" ? "5" : "8"],
      [roundDown(plan.weight * 0.5, plan.increment, plan.barWeight), "5"],
      [roundDown(plan.weight * 0.7, plan.increment, plan.barWeight), "3"],
      [roundDown(plan.weight * 0.85, plan.increment, plan.barWeight), "1"],
    ];
    return values
      .map(([w, r]) => [Math.max(plan.barWeight, w), r])
      .filter(([w]) => {
        if (w >= plan.weight || seen.has(w)) return false;
        seen.add(w);
        return true;
      })
      .sort((a, b) => a[0] - b[0])
      .map(([weight, reps]) => ({
        weight,
        reps,
        perSide: (weight - plan.barWeight) / 2,
      }));
  }
  const movement = (id, name, load, cue, count = "每轮25次") => ({
    id,
    name,
    load,
    cue,
    count,
    sets: 2,
    reps: 25,
  });
  // 低强度准备与专项递增热身分开；恢复段不安排12×25。
  function warmup(s) {
    if (s.recovery) return [];
    return {
      bench: [
        movement(
          "side",
          "屈膝侧平板动态支撑",
          "自重；必要时前臂支撑在凳上",
          "第一轮左侧25次，第二轮右侧25次；每侧各算1组，总共2组。髋部小幅抬落，肩与躯干不塌。",
          "每轮单侧25次，左右各一轮",
        ),
        movement(
          "curlup",
          "短幅仰卧卷腹",
          "自重，手沿大腿滑动",
          "肩胛略离地即可，避免拉颈；25次若已吃力就缩短力臂或停止，不负重。",
        ),
        movement(
          "squeeze",
          "仰卧哑铃夹胸推",
          "试探2–4kg/手，必要时更轻",
          "平凳或地板上，两哑铃轻靠拢推起；不做大幅度飞鸟拉伸，不持续用力挤压至酸胀。",
        ),
        movement(
          "rear",
          "胸托后束飞鸟",
          "试探1–3kg/手",
          "用上斜凳支撑胸部，避免长时间俯身累腰；抬到可控位置，不耸肩甩动。",
        ),
        movement(
          "extension",
          "仰卧哑铃臂屈伸",
          "试探1–3kg/手或更轻弹力带",
          "肘部舒适、慢放自然推起；如肘不舒服，换极轻弹力带下压，不忍痛凑25次。",
        ),
        movement(
          "face",
          "轻弹力带面拉",
          "最轻弹力带；缆绳可试5kg",
          "拉向眉眼，避免腰后仰；与硬拉日练后的面拉分属不同训练日。",
        ),
      ],
      squat: [
        movement(
          "ankle",
          "坐姿自重提踵",
          "自重，不压杠片",
          "脚掌稳定，上下移动踝关节，热身不追小腿灼烧。",
        ),
        movement(
          "tke",
          "轻弹力带终末伸膝",
          "最轻弹力带",
          "第一轮左腿25次，第二轮右腿25次；只从微屈伸到自然直立，不顶死膝盖。",
          "每轮单腿25次，左右各一轮",
        ),
        movement(
          "bridge",
          "双腿臀桥",
          "自重",
          "自然抬髋，不长时间夹臀停顿，不用腰部过伸顶高。",
        ),
        movement(
          "squat",
          "扶架徒手蹲",
          "双手扶架卸力",
          "用熟悉的活动幅度，借扶手卸力到25次很轻松；这是低阻力准备，不做蹲到力竭。",
        ),
        movement(
          "hinge",
          "徒手髋铰链",
          "自重，可用木杆找背部位置",
          "髋向后移，膝微屈，躯干稳定；不持重物，不与练后直腿硬拉重复加量。",
        ),
        movement(
          "deadbug",
          "仰卧交替脚跟点地",
          "自重，短力臂",
          "左右合计25次，下一轮换另一侧先开始；腰背保持舒适，不屏气。",
          "左右合计25次",
        ),
      ],
      deadlift: [
        movement(
          "hinge",
          "徒手髋铰链",
          "自重",
          "用髋向后移动找轨迹，膝微屈，避免反复弯腰卷背。",
        ),
        movement(
          "bridge",
          "双腿臀桥",
          "自重",
          "轻松收缩，不额外负重或延长顶端停顿。",
        ),
        movement(
          "curl",
          "极轻坐姿腿弯举",
          "器械最轻可控档",
          "25次仍需非常轻松；若最轻档也吃力，换无阻力俯卧屈膝。",
        ),
        movement(
          "lat",
          "弹力带直臂下拉",
          "最轻弹力带",
          "感受腋下轻收紧，不使握力或背阔肌明显疲劳；不加重做成辅助组。",
        ),
        movement(
          "rotate",
          "坐姿胸椎小幅转动",
          "自重，骨盆固定",
          "左右合计25次，下轮换起始侧；自然幅度，不甩动或强扭腰。",
          "左右合计25次",
        ),
        movement(
          "deadbug",
          "仰卧交替脚跟点地",
          "自重，短力臂",
          "左右合计25次，下轮换起始侧；一边动作一边呼吸，不以腹部力竭为目标。",
          "左右合计25次",
        ),
      ],
    }[s.type];
  }
  const ex = (id, name, sets, reps, effort, rest, cue) => ({
    id,
    name,
    sets,
    reps,
    effort,
    rest,
    cue,
  });
  // 按训练类型与卧推A—D分配练后辅助，避免所有动作堆在同一天。
  function accessories(s) {
    if (s.recovery) return [];
    if (s.type === "squat")
      return [
        ex(
          "sldl",
          "直腿硬拉",
          2,
          "8",
          "RIR 4 / RPE约6",
          "2–3分钟",
          "先用空杆校准，可试40–60kg；重量是试探范围。膝微屈固定，不锁死，下放到腰背仍能稳定的位置，不追求触地。",
        ),
        ex(
          "legext",
          "腿屈伸",
          2,
          "10–15",
          "RIR 3",
          "90–120秒",
          "可渐进增加器械重量；自然伸膝，不甩动或猛烈锁膝。",
        ),
        ex(
          "adductor",
          "器械内收",
          1,
          "12–20",
          "RIR 3–4",
          "60–90秒",
          "控制回程，从舒适幅度开始；内收与外展各1组是起步安排。",
        ),
        ex(
          "abductor",
          "器械外展",
          1,
          "12–20",
          "RIR 3–4",
          "60–90秒",
          "骨盆稳定，不用全身摆动拉出更大重量。",
        ),
      ];
    if (s.type === "deadlift")
      return [
        ex(
          "pullup",
          "引体向上",
          3,
          "5–8",
          "RIR 2–3",
          "2–3分钟",
          "硬拉之后做；自重不能保留2–3次就用辅助机或弹力带。三组稳定8次两次后再考虑加2.5kg。",
        ),
        ex(
          "face",
          "缆绳面拉",
          2,
          "15–20",
          "RIR 3–4",
          "60–90秒",
          "练后辅助，可小幅渐进加重，但不追大重量、腰后仰或耸肩；与当天热身直臂下拉区分。",
        ),
        ex(
          "curl",
          "哑铃或绳索弯举",
          1,
          "10–15",
          "RIR 3",
          "60–90秒",
          "可选；握力和肘已疲劳时省略。",
        ),
      ];
    return [
      [
        ex(
          "pushdown",
          "三头直杆下压",
          2,
          "10–15",
          "RIR 3",
          "90–120秒",
          "本日已有36次卧推，不另加重胸推；躯干固定，肘舒适。",
        ),
      ],
      [
        ex(
          "ohp",
          "站姿杠铃实力推",
          2,
          "5–8",
          "RIR 3",
          "2–3分钟",
          "不借腿，不后仰顶腰。先空杆，逐级加到做6次仍能再做3次的重量；可用哑铃推肩替换，不叠加。",
        ),
        ex(
          "row",
          "胸托划船",
          2,
          "8–12",
          "RIR 3",
          "2分钟",
          "胸部支撑在凳上，减少对次日硬拉的腰背负担；不采用重杠铃俯身划船。",
        ),
      ],
      [
        ex(
          "dbbench",
          "平板哑铃卧推",
          2,
          "8–10",
          "RIR 3",
          "2–3分钟",
          "工作组，按实际余力选重；主项超RPE8或肩肘疲劳时取消，不能用辅助补偿主项失败。",
        ),
      ],
      [
        ex(
          "row",
          "胸托划船",
          2,
          "8–12",
          "RIR 3",
          "2分钟",
          "保留握力和腰背恢复；次日硬拉，避免借力划船。",
        ),
        ex(
          "pushdown",
          "三头直杆下压",
          2,
          "10–15",
          "RIR 3",
          "90–120秒",
          "不追力竭或强迫次数；肘疲劳时先取消此项。",
        ),
      ],
    ][s.slot];
  }
  // 逐项读取最近两次常规成绩；恢复成绩不参与加重，同一次失败不重复降重。
  function nextWeights(c) {
    const history = [
      ...(c.archives || []).flatMap((a) => a.records || []),
      ...(c.records || []),
    ];
    return KEYS.map((key) => {
      const base = c.weights[key],
        rows = history.filter((r) => r.plan?.key === key && !r.plan.recovery),
        last = rows.at(-1),
        hold = (reason) => ({
          key,
          label: LABELS[key],
          from: base,
          to: base,
          reason,
        });
      if (!last) return hold("没有常规训练记录，先保持起点。");
      if (!last.result?.finished)
        return hold("最近一次为暂停；先完成恢复，不加重量。");
      const activeWeights = last.actual.weights.filter(
          (_, i) => last.actual.reps[i] > 0,
        ),
        actualBase = activeWeights.length ? Math.min(...activeWeights) : base;
      if (!last.result.pass) {
        const target = Math.max(
            c.barWeight,
            roundDown(
              Math.min(last.plan.weight, actualBase) - c.increment,
              c.increment,
              c.barWeight,
            ),
          ),
          to = Math.min(base, target);
        return {
          key,
          label: LABELS[key],
          from: base,
          to,
          reason:
            to < base
              ? "最近一次未达目标或超RPE上限；恢复后下调一个配片档位。"
              : "上次未达标后的下调已应用，先用当前重量重新积累记录。",
        };
      }
      if (last.actual.warmupTired)
        return hold(
          "准备阶段已造成疲劳，先减轻热身阻力并评估恢复，本轮不加重。",
        );
      if (actualBase !== base)
        return hold("最近实际重量与当前起点不同，先用相同处方积累记录。");
      const threshold = c.increment === 5 ? 7 : 7.5,
        latest = rows.slice(-2),
        ready =
          latest.length === 2 &&
          latest.every(
            (r) =>
              r.result.pass &&
              !r.actual.warmupTired &&
              r.actual.weights.every((w) => w === base) &&
              r.plan.sets === last.plan.sets &&
              r.plan.reps === last.plan.reps &&
              r.actual.rpes.every((x) => Number.isFinite(x) && x <= threshold),
          );
      if (ready && validWeight(base + c.increment, c.increment, c.barWeight))
        return {
          key,
          label: LABELS[key],
          from: base,
          to: base + c.increment,
          reason: `最近两次同类、同重量、同组次达标，全部RPE≤${threshold}；恢复正常可加一档。`,
        };
      return hold(
        `需最近两次同类训练均达标、全部RPE≤${threshold}；未满足就保持，不按日期硬加5kg。`,
      );
    });
  }
  const api = {
    BENCH,
    KEYS,
    LABELS,
    roundDown,
    validWeight,
    seedWeights,
    phases,
    sessions,
    prescription,
    validConfig,
    evaluate,
    validDate,
    addDays,
    gapAfter,
    rollingSchedule,
    earliestRecordDate,
    rampFor,
    warmup,
    accessories,
    nextWeights,
  };
  root.BenchPlan = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
