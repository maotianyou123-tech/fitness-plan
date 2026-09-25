"use strict";
const STORAGE_KEY = "bench-rotation-v8",
  OLD_KEYS = {
    Smolov卧推版: "bench-smolov-v7",
    个人四日版: "bench-personal-v6",
    原五组模板: "bench-fenjue-v5",
    回归版: "bench-rebuild-v4",
    更早版本: "bench-fen-jue-v3",
  };
const P = window.BenchPlan,
  $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
let storageProblem = false;
// 本地记录只在当前浏览器读取；存储不可用时保留提示，允许导出。
function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    storageProblem = true;
    return null;
  }
}
function freshState() {
  return {
    version: 8,
    tm: 155,
    increment: 2.5,
    barWeight: 20,
    weights: P.seedWeights(),
    entryRecovery: true,
    phases: P.phases(true),
    startDate: today(),
    cursor: 0,
    completed: {},
    records: [],
    notes: {},
    support: {},
    extraRest: {},
    archives: [],
    cycle: 1,
  };
}
// 沿用v8存储结构，旧版数据只读保留，避免迁移时覆盖历史。
function loadState() {
  const saved = readStored(STORAGE_KEY);
  if (!saved || saved.version !== 8) {
    const c = freshState(),
      old = readStored(OLD_KEYS["Smolov卧推版"]);
    if (
      old &&
      Number.isFinite(old.tm) &&
      [2.5, 5].includes(old.increment) &&
      [10, 15, 20].includes(old.barWeight)
    ) {
      const candidate = {
        ...c,
        tm: old.tm,
        increment: old.increment,
        barWeight: old.barWeight,
        weights: P.seedWeights(old.tm, old.increment, old.barWeight),
      };
      if (P.validConfig(candidate)) return candidate;
    }
    return c;
  }
  const c = { ...freshState(), ...saved };
  for (const k of ["completed", "notes", "support", "extraRest"])
    if (!c[k] || typeof c[k] !== "object" || Array.isArray(c[k])) c[k] = {};
  for (const k of ["records", "archives"]) if (!Array.isArray(c[k])) c[k] = [];
  if (!P.validConfig(c)) {
    storageProblem = true;
    return freshState();
  }
  if (!P.validDate(c.startDate)) c.startDate = today();
  c.cursor = Math.max(
    0,
    Math.min(P.sessions(c).length - 1, Math.floor(Number(c.cursor) || 0)),
  );
  return c;
}
let state = loadState();
const list = () => P.sessions(state),
  current = () => list()[state.cursor],
  pending = () => list().findIndex((s) => !state.completed[s.id]),
  planFor = (s = current()) =>
    state.completed[s.id]?.plan || P.prescription(s, state);
function save(message = "记录已保存") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageProblem = false;
  } catch {
    storageProblem = true;
  }
  $("#savedIndicator").textContent = storageProblem
    ? "当前浏览器无法保存，请导出JSON。"
    : `${message} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}
function dateLabel(v) {
  if (!P.validDate(v)) return "待设置";
  const d = new Date(v + "T12:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function renderSetup() {
  for (const id of ["tm", "increment", "barWeight", "startDate"])
    $("#" + id).value = state[id];
  $("#entryRecovery").checked = state.entryRecovery;
  $("#entryRecovery").disabled = state.records.length > 0;
  $("#loadInputs").innerHTML = P.KEYS.map(
    (k) =>
      `<label>${P.LABELS[k]} · kg<input id="load_${k}" type="number" inputmode="decimal" min="${state.barWeight}" max="350" step="${state.increment}" value="${state.weights[k]}" required><span class="field-hint">${P.BENCH.find((s) => s.key === k) ? P.BENCH.find((s) => s.key === k).sets + "组×" + P.BENCH.find((s) => s.key === k).reps + "次" : "5组×5次"} · 常规工作重量</span></label>`,
  ).join("");
  const total = list().length,
    n = list().filter((s) => state.completed[s.id]).length;
  $("#progressPercent").textContent = $("#dashboardProgress").textContent =
    `${n} / ${total}`;
  for (const id of ["#progressBar", "#sidebarProgress"])
    $(id).style.width = `${(100 * n) / total}%`;
  $("#profileBase").textContent = `${state.tm} kg`;
}
// 处方表保留已完成训练的原始计划，只有未来训练按当前设置计算。
function renderPlan() {
  const all = list(),
    dates = P.rollingSchedule(state),
    duration = state.phases.reduce((sum, p) => sum + p.days, 0);
  $("#planSummary").textContent =
    `第${state.cycle}周期 · ${all.length}次主项记录 / 基础${duration}天 · 器械档距${state.increment}kg。${state.entryRecovery ? "先6天恢复，再" : ""}24天常规＋6天恢复。参考 ${dateLabel(dates[0].date)} 至 ${dateLabel(dates.at(-1).nextDate)}进入下周期；额外休息顺延。`;
  const rhythm = [
    "卧推 A",
    "深蹲",
    "休息",
    "卧推 B",
    "硬拉＋引体",
    "休息",
    "卧推 C",
    "深蹲",
    "休息",
    "卧推 D",
    "硬拉＋引体",
    "休息",
  ];
  $("#rhythmDays").innerHTML = rhythm
    .map(
      (x, i) =>
        `<li class="${x === "休息" ? "rest-day" : ""}"><span>第${i + 1}天</span><b>${x}</b></li>`,
    )
    .join("");
  const expanded = new Set(
    [...document.querySelectorAll(".plan-phase[open]")].map(
      (el) => el.dataset.phase,
    ),
  );
  $("#cycleGrid").innerHTML = state.phases
    .map(
      (phase, pi) =>
        `<details class="plan-phase" data-phase="${phase.id}" ${!matchMedia("(max-width: 760px)").matches || expanded.has(phase.id) || current().phaseIndex === pi ? "open" : ""}><summary class="plan-phase-heading"><div><span class="card-overline">${phase.days}天 · ${phase.mode === "recovery" ? "减量恢复，不计入加重成绩" : "卧推A—D完整轮转"}</span><h3>${phase.name}</h3></div><p>${phase.mode === "recovery" ? "轻活动＋专项热身；不做12×25或辅助" : "每次12×25准备；主项保留余力"}</p></summary><div class="table-scroll"><table class="plan-table"><caption>${phase.name} · 所有杠铃重量含杆；恢复段仅为轻练安排</caption><thead><tr><th>日期 / 间隔</th><th>本日主项</th><th>工作重量</th><th>组次 / 上限</th><th>笔记 / 记录</th></tr></thead><tbody>${all
          .filter((s) => s.phaseIndex === pi)
          .map((s) => {
            const i = all.findIndex((x) => x.id === s.id),
              p = planFor(s),
              d = dates[i],
              done = state.completed[s.id];
            return `<tr class="${done ? "done" : ""} ${state.cursor === i ? "active" : ""}"><td data-label="日期 / 间隔"><b>${esc(d.date)}</b><small>阶段第${s.day}天${done ? " · 实际" : ""}</small><small>${d.restDays ? "之后休" + d.restDays + "天" : "次日接下肢"}</small></td><td data-label="主项"><b>${esc(s.label)}</b><small>${s.recovery ? "恢复轻练" : s.type === "deadlift" ? "之后引体与面拉" : s.type === "squat" ? "之后下肢辅助" : "之后按A—D安排辅助"}</small></td><td data-label="重量"><strong>${p.weight} kg</strong><small>每侧 ${(p.weight - p.barWeight) / 2}kg</small><small>${s.recovery ? "常规" + p.baseline + "kg的约" + (s.type === "bench" ? "80" : "70") + "%" : "独立选重，按表现调整"}</small></td><td data-label="组次 / 上限"><strong>${p.sets} × ${p.reps}</strong><small>RPE ≤${p.maxRpe}</small><small>${s.recovery ? "练后辅助0组" : "练后辅助≤" + P.accessories(s).reduce((n, a) => n + a.sets, 0) + "组"}</small></td><td data-label="笔记 / 记录"><textarea data-note="${s.id}" rows="2" aria-label="${esc(phase.name + " " + s.label)}笔记" placeholder="恢复 / 取舍 / 备注">${esc(state.notes[s.id] || "")}</textarea><span class="print-note">${esc(state.notes[s.id] || "")}</span><button class="table-action" type="button" data-session="${i}">${done ? "查看记录" : i === pending() ? "填写本次" : "查看安排"} →</button><small>${done ? (done.result.pass ? "主项达标" : "主项已结束 · 待调整") : "待训练"}</small></td></tr>`;
          })
          .join("")}</tbody></table></div></details>`,
    )
    .join("");
}
function exerciseList(items) {
  return `<ul class="exercise-list">${items.map((x) => `<li><b class="exercise-name">${esc(x.name)}</b><span class="exercise-detail"><span class="exercise-dose">${x.sets} × ${esc(x.reps)}</span> · ${esc(x.effort || "RPE3–4")}${x.rest ? " · 休息" + esc(x.rest) : ""}</span>${x.load ? '<span class="exercise-detail">' + esc(x.load) + " · " + esc(x.count) + "</span>" : ""}<small class="exercise-cue">${esc(x.cue)}</small></li>`).join("")}</ul>`;
}
function renderLibrary() {
  const samples = [
      { type: "bench", slot: 0, recovery: false },
      { type: "squat", recovery: false },
      { type: "deadlift", recovery: false },
    ],
    names = ["卧推日", "深蹲日", "硬拉＋引体日"];
  $("#splitGrid").innerHTML = samples
    .map(
      (s, i) =>
        `<article class="split-card"><div class="split-card-head"><span class="split-badge">${i + 1}</span><div><span class="split-overline">常规训练模板</span><h3 class="split-title">${names[i]}</h3></div></div><details class="training-details"><summary>六项热身 · 两轮共12组</summary>${exerciseList(P.warmup(s))}<p>每项每轮25次；单侧与交替动作按前述计数。详细试探阻力和技术提示见当前训练卡。</p></details><details class="training-details"><summary>练后辅助 · 固定上限</summary>${s.type === "bench" ? P.BENCH.map((b) => `<h4>${b.label}</h4>${exerciseList(P.accessories({ ...s, slot: b.slot }))}`).join("") : exerciseList(P.accessories(s))}</details><p class="split-footer">辅助达次数上限、连续两次仍保留目标余力，再加最小档；热身不按此规则追重。</p></article>`,
    )
    .join("");
}
function supportRow(s, x, group, i, editable) {
  const stored = state.support[s.id]?.[group]?.[x.id] || {},
    warm = group === "warmup";
  return `<div class="support-row"><div class="support-description"><span class="card-overline">${warm ? "准备 " + (i + 1) : "辅助 " + (i + 1)}</span><h4>${esc(x.name)}</h4><p><b>${x.sets} × ${esc(x.reps)}</b> · ${warm ? "RPE3–4 · " + esc(x.count) : esc(x.effort) + " · 休息" + esc(x.rest)}</p>${warm ? "<p>试探阻力：" + esc(x.load) + "</p>" : ""}<p>${esc(x.cue)}</p></div><details class="support-entry" ${matchMedia("(max-width: 760px)").matches ? "" : "open"}><summary>填写${warm ? "热身" : "辅助"}记录</summary><div class="support-inputs"><label>实际阻力 / 重量<input data-support="${group}" data-exercise="${x.id}" data-field="load" value="${esc(stored.load || "")}" placeholder="如2kg/手" ${editable ? "" : "disabled"}></label>${warm ? `<label>实际组数 · 0–2<input type="number" inputmode="numeric" min="0" max="2" step="1" data-support="${group}" data-exercise="${x.id}" data-field="sets" value="${esc(stored.sets ?? "")}" placeholder="未记录" ${editable ? "" : "disabled"}></label>` : ""}<label>${warm ? "实际次数 · 每组" : "实际次数 / RIR"}<input data-support="${group}" data-exercise="${x.id}" data-field="reps" value="${esc(stored.reps || "")}" placeholder="${warm ? "如25 / 25" : "如8/8，RIR3"}" ${editable ? "" : "disabled"}></label></div></details></div>`;
}
function renderWarmupCount() {
  const s = current();
  if (s.recovery) {
    $("#warmupCount").textContent = "恢复段不安排300次循环。";
    return;
  }
  const entries = state.support[s.id]?.warmup || {},
    sets = P.warmup(s).reduce(
      (n, x) => n + (Number(entries[x.id]?.sets) || 0),
      0,
    );
  $("#warmupCount").textContent =
    `已记录 ${sets} / 12 组。空白表示未记录，0表示省略；不为了填满而忽略疲劳。`;
}
function renderSchedule() {
  const s = current(),
    all = list(),
    d = P.rollingSchedule(state)[state.cursor],
    attempted =
      !state.completed[s.id] && state.records.some((r) => r.sessionId === s.id);
  $("#sessionIntent").textContent =
    `${state.phases[s.phaseIndex].name} · 第${s.day}天 · ${state.cursor + 1}/${all.length}次主项 · ${dateLabel(d.date)}${state.completed[s.id] ? "实际" : "参考"}`;
  $("#extraRest").checked = state.extraRest[s.id] === 1;
  $("#extraRest").disabled = state.records.some(
    (r) => all.findIndex((x) => x.id === r.sessionId) > state.cursor,
  );
  $("#nextTrainingDate").textContent =
    `${attempted ? "恢复后重排本日" : all[state.cursor + 1]?.label || "下一周期卧推A"} · ${dateLabel(attempted ? d.date : d.nextDate)}`;
  $("#recoveryMessage").textContent =
    `${d.restDays ? "本次后留" + d.restDays + "个完整休息日" : "本次后次日接下肢，再休息一天"}。恢复不足时延后；已发生的实际训练日期保留。`;
}
// 按准备、专项热身、主项、辅助的顺序呈现当前训练。
function renderCurrent() {
  const s = current(),
    p = planFor(),
    done = state.completed[s.id],
    unlocked = state.cursor === pending(),
    editable = unlocked || !!done;
  $("#sessionSelect").innerHTML = list()
    .map((x, i) => {
      const plan = planFor(x);
      return `<option value="${i}">${i + 1}. ${x.recovery ? "恢复 " : ""}${x.type === "bench" ? "卧推 " + "ABCD"[x.slot] : P.LABELS[x.key]} · ${plan.sets}×${plan.reps}</option>`;
    })
    .join("");
  $("#sessionSelect").value = state.cursor;
  $("#sessionLabel").textContent = s.label;
  $("#dashboardPhase").textContent = state.phases[s.phaseIndex].name;
  $("#dashboardCurrent").textContent = s.label;
  $("#dashboardPrescription").textContent = `${p.sets} × ${p.reps}`;
  $("#dashboardRir").textContent = `RPE ≤${p.maxRpe}`;
  $("#prevSession").disabled = state.cursor === 0;
  $("#nextSession").disabled = state.cursor === list().length - 1;
  renderSchedule();
  $("#sessionGate").textContent = done
    ? "本日主项已记录；热身、辅助与笔记仍可补充。历史主项保留当时处方。"
    : unlocked
      ? s.recovery
        ? "今天是恢复轻练，RPE≤6；停用12×25与练后辅助，仍未恢复可继续延后。"
        : "按下列顺序训练。首组已接近RPE上限时当场降一档，状态差可提前结束。"
      : "当前为预览，请按训练顺序记录主项。";
  $("#warmupTitle").textContent = s.recovery
    ? "恢复段：轻活动3–5分钟"
    : "六项 × 两轮 × 25次 = 12组";
  $("#warmupCue").textContent = s.recovery
    ? "活动到身体微热即可，然后进入下方专项热身；不做300次循环，不补辅助。"
    : "先轻活动3–5分钟，再按1→6做两轮。动作间20–40秒、轮间60–90秒，RPE3–4；完成后休息3–5分钟再上杠。";
  $("#warmupRows").innerHTML = P.warmup(s)
    .map((x, i) => supportRow(s, x, "warmup", i, editable))
    .join("");
  renderWarmupCount();
  const ramp = P.rampFor(p);
  $("#rampList").innerHTML = ramp.length
    ? `<ol class="warmup-list">${ramp.map((x, i) => `<li><span>准备组 ${i + 1}</span><strong>${x.weight}kg × ${x.reps}</strong><small>每侧${x.perSide}kg</small></li>`).join("")}</ol>`
    : "<p>工作重量已接近杆重，用更轻器械或少量动作准备。</p>";
  $("#rampCue").textContent =
    `准备组休息1–3分钟，正式组前休息3–5分钟；不堆额外高次数。${s.type === "deadlift" ? "硬拉低重量也要用标准直径轻片或垫高到正常起杠高度；每次落地停稳后重新收紧，不借反弹。" : ""}`;
  $("#mainCard").innerHTML =
    `<div class="session-top"><div><div class="session-day">03 / ${esc(s.label)} · ${s.recovery ? "恢复轻练" : "正式工作组"}</div><div class="session-type">${s.type === "bench" ? "停顿、握距和动作幅度与可靠单次保持一致" : s.type === "squat" ? "固定深度，稳定支撑，不追最后一组极限" : "每次落地停稳，重新支撑，不用反弹完成25次"}</div></div><span class="session-status">${done ? "已记录" : "主项"}</span></div><div class="prescription"><div class="prescription-stat prescription-weight"><span class="prescription-label">含杆工作重量</span><strong class="prescription-value">${p.weight}<small class="prescription-unit">kg</small></strong></div><div class="prescription-stat"><span class="prescription-label">组数 × 次数</span><strong class="prescription-value">${p.sets} × ${p.reps}</strong></div><div class="prescription-stat"><span class="prescription-label">RPE 上限</span><strong class="prescription-value">${p.maxRpe}</strong></div></div><p class="main-standard">逐组目标：${Array(p.sets).fill(p.reps).join(" / ")}。首组应留明显余力；不追加冲刺单次或力竭组。</p><div class="rest-line"><span>组间休息</span><b>${s.rest}</b><span>单侧配重</span><b>${(p.weight - p.barWeight) / 2}kg</b></div><p class="warmup-note">${s.type === "bench" ? "上背稳定、臀部贴凳，使用安全杆或可靠保护人。" : s.type === "squat" ? "安全杆设在合适高度；不因重量固定而牺牲动作深度或腰背位置。" : "140kg 5×5需由首轮实际难度验证；若开始就接近上限，立即减重，不把第五组做成极限测试。"}</p>`;
  $("#setRows").innerHTML = Array.from(
    { length: p.sets },
    (_, i) =>
      `<div class="set-row"><b>第 ${i + 1} 组</b><label>实际重量 · kg<input type="number" inputmode="decimal" name="weight${i}" min="${p.barWeight}" max="350" step="${p.increment}" value="${done?.actual.weights[i] ?? p.weight}" required></label><label>实际次数<input type="number" inputmode="numeric" name="reps${i}" min="0" max="30" step="1" value="${done?.actual.reps[i] ?? ""}" placeholder="目标 ${p.reps}" required></label><label>本组RPE<input type="number" inputmode="decimal" name="rpe${i}" min="1" max="10" step="0.5" value="${done?.actual.rpes[i] ?? ""}" placeholder="如7或8"></label></div>`,
  ).join("");
  $("#actualDate").value = done?.date || today();
  $("#actualDate").max = today();
  $("#readiness").value = "normal";
  $("#warmupEffect").value = done?.actual.warmupTired ? "tired" : "unknown";
  $("#technique").checked = !!done?.actual.technique;
  $("#logForm")
    .querySelectorAll("input,select,button[type=submit]")
    .forEach((el) => (el.disabled = !unlocked));
  $("#goNext").disabled = !done || state.cursor === list().length - 1;
  $("#accessoryCue").textContent = s.recovery
    ? "恢复段不安排练后辅助。"
    : "主项超上限时先省略复合辅助。实际重量现场按目标余力选择；辅助连续两次做到次数上限且余力达标，再增加最小档位。";
  $("#accessoryRows").innerHTML = P.accessories(s)
    .map((x, i) => supportRow(s, x, "accessories", i, editable))
    .join("");
  $("#sessionNotes").value = state.notes[s.id] || "";
  const last = state.records.filter((r) => r.sessionId === s.id).at(-1);
  $("#attemptResult").textContent = last
    ? `${last.date} · ${last.result.text}`
    : "";
  $("#attemptResult").className = `result-box ${last?.result.kind || ""}`;
}
function historyRows(records) {
  return records
    .map(
      (r) =>
        `<tr><td data-label="日期 / 主项">${esc(r.date)}<small>${esc(r.label)}</small>${r.plan?.recovery ? "<small>恢复段 · 不计加重</small>" : ""}</td><td data-label="实际重量">${esc(r.actual?.weights?.join(" / ") ?? r.actual?.weight)}kg<small>原计划 ${esc(r.plan?.weight)}kg · ${esc(r.plan?.sets)}×${esc(r.plan?.reps)}</small></td><td data-label="次数 / RPE">${esc((r.actual?.reps || []).join(" / "))}<small>${r.actual?.rpes ? "RPE" : "RIR"} ${esc((r.actual?.rpes || r.actual?.rirs || []).map((v) => v ?? "—").join(" / "))}</small></td><td data-label="结果">${r.result?.pass ? "主项达标" : r.result?.finished ? "已结束 · 待调整" : "暂停"}${r.actual?.warmupTired ? "<small>准备后已疲劳</small>" : ""}</td></tr>`,
    )
    .join("");
}
function renderHistory() {
  $("#historyRows").innerHTML =
    historyRows(state.records.slice(-30).reverse()) ||
    '<tr class="history-empty"><td colspan="4"><div class="empty-state"><span class="empty-state-title">从恢复和真实记录开始</span><p class="empty-state-copy">热身、主项、辅助分开记录。<br>用同类训练的连续表现决定加重。</p></div></td></tr>';
  $("#recommendationGrid").innerHTML = P.nextWeights(state)
    .map(
      (x) =>
        `<article><b>${x.label} · ${x.from} → ${x.to}kg</b><p>${x.reason}</p></article>`,
    )
    .join("");
  $("#newCycleButton").disabled = pending() !== -1;
  $("#recoverNowButton").disabled =
    pending() === -1 || list()[pending()]?.recovery;
  $("#archiveMessage").textContent =
    `当前第${state.cycle}周期，${state.records.length}条主项记录；已归档${state.archives.length}个周期。完成周期末恢复后，再根据当天恢复情况应用以上建议。`;
}
function renderLegacy() {
  const blocks = [];
  for (const [name, key] of Object.entries(OLD_KEYS)) {
    const v = readStored(key);
    if (!v) continue;
    const rows = Array.isArray(v.records) ? v.records : [];
    blocks.push(
      `<h3>${name}</h3><p>${rows.length}条当前记录、${v.archives?.length || 0}个归档，全部包含在JSON导出中。</p>${rows.length ? `<div class="table-scroll"><table class="history-table"><caption>${name}最近30条 · 只读</caption><thead><tr><th>日期 / 主项</th><th>实际重量</th><th>次数 / 难度</th><th>结果</th></tr></thead><tbody>${historyRows(rows.slice(-30).reverse())}</tbody></table></div>` : ""}`,
    );
  }
  $("#legacyDetails").hidden = !blocks.length;
  $("#legacyRecords").innerHTML = blocks.join("");
}
function renderAll() {
  renderSetup();
  renderPlan();
  renderLibrary();
  renderCurrent();
  renderHistory();
}
// 重复打开当前训练时复用已有表单，保留未提交的输入。
function selectSession(i) {
  const next = Math.max(0, Math.min(list().length - 1, i));
  if (next !== state.cursor) {
    state.cursor = next;
    save();
    renderPlan();
    renderCurrent();
  }
  window.BenchUI?.openSection("session-plan", { scroll: false });
  $("#session-plan").scrollIntoView({
    behavior: matchMedia("(max-width:760px), (prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}
$("#seedBench").addEventListener("click", () => {
  const tm = Number($("#tm").value),
    increment = Number($("#increment").value),
    bar = Number($("#barWeight").value),
    seed = P.seedWeights(tm, increment, bar);
  if (
    !Number.isFinite(tm) ||
    tm < 20 ||
    tm > 300 ||
    P.BENCH.some((b) => !P.validWeight(seed[b.key], increment, bar))
  ) {
    $("#setupMessage").textContent = "请核对TM和杆重，参考重量需可实际装出。";
    return;
  }
  P.BENCH.forEach((b) => ($("#load_" + b.key).value = seed[b.key]));
  $("#setupMessage").textContent =
    "已填入65/70/75/80% TM的卧推参考值；点击保存应用，深蹲和硬拉不随TM改变。";
});
$("#increment").addEventListener("change", () =>
  P.KEYS.forEach((k) => ($("#load_" + k).step = $("#increment").value)),
);
$("#barWeight").addEventListener("change", () =>
  P.KEYS.forEach((k) => ($("#load_" + k).min = $("#barWeight").value)),
);
$("#setupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const entry = state.records.length
      ? state.entryRecovery
      : $("#entryRecovery").checked,
    c = {
      ...state,
      tm: Number($("#tm").value),
      increment: Number($("#increment").value),
      barWeight: Number($("#barWeight").value),
      weights: Object.fromEntries(
        P.KEYS.map((k) => [k, Number($("#load_" + k).value)]),
      ),
      startDate: $("#startDate").value,
      entryRecovery: entry,
      phases: state.records.length ? state.phases : P.phases(entry),
    };
  if (!P.validConfig(c) || !P.validDate(c.startDate)) {
    $("#setupMessage").textContent =
      "请填写有效日期和符合配片档距的主项重量；重量含杆。";
    return;
  }
  state = c;
  state.cursor = Math.min(state.cursor, list().length - 1);
  save("起点与安排已保存");
  renderAll();
  $("#setupMessage").textContent =
    "已更新未来处方，历史计划与实际记录保留。四种卧推、深蹲与硬拉独立调整。";
});
$("#cycleGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-session]");
  if (b) selectSession(Number(b.dataset.session));
});
$("#cycleGrid").addEventListener("input", (e) => {
  if (!e.target.matches("[data-note]")) return;
  state.notes[e.target.dataset.note] = e.target.value;
  if (e.target.dataset.note === current().id)
    $("#sessionNotes").value = e.target.value;
  save("笔记已保存");
});
$("#sessionSelect").addEventListener("change", (e) =>
  selectSession(Number(e.target.value)),
);
$("#prevSession").addEventListener("click", () =>
  selectSession(state.cursor - 1),
);
$("#nextSession").addEventListener("click", () =>
  selectSession(state.cursor + 1),
);
$("#goNext").addEventListener("click", () => selectSession(state.cursor + 1));
$("#continueTraining").addEventListener("click", (e) => {
  e.preventDefault();
  selectSession(pending() === -1 ? list().length - 1 : pending());
});
// 热身与辅助按输入自动保存，和主项完成状态分别管理。
function supportInput(e) {
  const el = e.target;
  if (!el.matches("[data-support]")) return;
  const s = current(),
    group = el.dataset.support,
    id = el.dataset.exercise,
    field = el.dataset.field;
  let value = el.value;
  if (field === "sets") {
    if (
      value !== "" &&
      (!Number.isInteger(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 2)
    )
      return;
    value = value === "" ? "" : Number(value);
  }
  state.support[s.id] ??= {};
  state.support[s.id][group] ??= {};
  state.support[s.id][group][id] ??= {};
  state.support[s.id][group][id][field] = value;
  const last = state.records.filter((r) => r.sessionId === s.id).at(-1);
  if (last) last.support = JSON.parse(JSON.stringify(state.support[s.id]));
  save("热身与辅助记录已保存");
  renderWarmupCount();
}
$("#warmupRows").addEventListener("input", supportInput);
$("#accessoryRows").addEventListener("input", supportInput);
$("#sessionNotes").addEventListener("input", (e) => {
  state.notes[current().id] = e.target.value;
  const el = document.querySelector(`[data-note="${current().id}"]`);
  if (el) el.value = e.target.value;
  save("笔记已保存");
});
$("#extraRest").addEventListener("change", (e) => {
  state.extraRest[current().id] = e.target.checked ? 1 : 0;
  save("休息安排已保存");
  renderPlan();
  renderSchedule();
});
$("#readiness").addEventListener("change", () =>
  $("#setRows")
    .querySelectorAll("[name^=reps]")
    .forEach((el) => (el.required = $("#readiness").value === "normal")),
);
$("#logForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.cursor !== pending()) return;
  const s = current(),
    plan = P.prescription(s, state),
    weights = [],
    reps = [],
    rpes = [],
    normal = $("#readiness").value === "normal",
    message = (t) => ($("#attemptResult").textContent = t);
  for (let i = 0; i < plan.sets; i++) {
    weights.push(Number($(`[name=weight${i}]`).value));
    reps.push(Number($(`[name=reps${i}]`).value));
    const r = $(`[name=rpe${i}]`).value;
    rpes.push(r === "" ? null : Number(r));
  }
  if (
    weights.some((w) => !P.validWeight(w, state.increment, state.barWeight)) ||
    reps.some((r) => !Number.isInteger(r) || r < 0 || r > 30)
  )
    return message("请填写可装出的重量和0–30的整数次数。");
  if (
    rpes.some(
      (r) =>
        r !== null &&
        (!Number.isFinite(r) || r < 1 || r > 10 || r * 2 !== Math.round(r * 2)),
    )
  )
    return message("RPE填写1–10，可用0.5档；没做的组可留空。");
  if (normal && reps.some((r, i) => r > 0 && rpes[i] === null))
    return message("请为已完成的各组填写RPE；未做组填0次。");
  const date = $("#actualDate").value,
    earliest = P.earliestRecordDate(state, s);
  if (!P.validDate(date) || date > today() || (earliest && date < earliest))
    return message(
      "日期不能在未来，且需遵守训练间隔" +
        (earliest ? "；最早 " + earliest : "") +
        "。",
    );
  const actual = {
      weights,
      reps,
      rpes,
      technique: $("#technique").checked,
      pain: $("#readiness").value === "pain",
      fatigued: $("#readiness").value === "fatigued",
      warmupTired: $("#warmupEffect").value === "tired",
    },
    result = P.evaluate(plan, actual);
  if (normal && !result.finished) return message(result.text);
  const record = {
    sessionId: s.id,
    label: s.label,
    date,
    timestamp: new Date().toISOString(),
    plan,
    actual,
    result,
    support: JSON.parse(JSON.stringify(state.support[s.id] || {})),
  };
  state.records.push(record);
  if (result.finished) {
    state.completed[s.id] = { plan, actual, date, result };
    if (!result.pass && !s.recovery) {
      const used = weights.filter((_, i) => reps[i] > 0),
        to = Math.max(
          state.barWeight,
          P.roundDown(
            Math.min(plan.weight, ...used) - state.increment,
            state.increment,
            state.barWeight,
          ),
        );
      state.weights[s.key] = Math.min(state.weights[s.key], to);
      result.text += ` 后续${P.LABELS[s.key]}起点已下调为${state.weights[s.key]}kg。`;
    }
  }
  save("主项记录已保存");
  renderAll();
});
// 通过浏览器本地生成下载文件，不上传训练记录。
function download(data, type, name) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#exportButton").addEventListener("click", () =>
  download(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        app: "长期力量轮转",
        state,
        previous: Object.fromEntries(
          Object.entries(OLD_KEYS).map(([name, key]) => [
            name,
            readStored(key),
          ]),
        ),
      },
      null,
      2,
    ),
    "application/json",
    `力量训练记录-${today()}.json`,
  ),
);
$("#exportPlanButton").addEventListener("click", () => {
  const dates = P.rollingSchedule(state),
    rows = [
      [
        "顺序",
        "阶段",
        "参考或实际日期",
        "主项",
        "重量kg含杆",
        "组数",
        "每组次数",
        "RPE上限",
        "组间休息",
        "之后休息天数",
        "温宁式准备",
        "专项递增热身",
        "练后辅助",
        "主项实际重量",
        "实际次数",
        "实际RPE",
        "热身辅助实际记录",
        "笔记",
      ],
      ...list().map((s, i) => {
        const p = planFor(s),
          a = state.completed[s.id]?.actual;
        return [
          i + 1,
          state.phases[s.phaseIndex].name,
          dates[i].date,
          s.label,
          p.weight,
          p.sets,
          p.reps,
          p.maxRpe,
          s.rest,
          dates[i].restDays,
          s.recovery
            ? "省略12×25，仅轻活动"
            : P.warmup(s)
                .map((x) => `${x.name} 2×25；${x.count}；${x.load}；${x.cue}`)
                .join(" / "),
          P.rampFor(p)
            .map((x) => `${x.weight}kg×${x.reps}`)
            .join(" / "),
          s.recovery
            ? "恢复段省略"
            : P.accessories(s)
                .map(
                  (x) =>
                    `${x.name} ${x.sets}×${x.reps}；${x.effort}；${x.rest}；${x.cue}`,
                )
                .join(" / "),
          a?.weights.join(" / ") || "",
          a?.reps.join(" / ") || "",
          a?.rpes.map((x) => x ?? "").join(" / ") || "",
          state.support[s.id] ? JSON.stringify(state.support[s.id]) : "",
          state.notes[s.id] || "",
        ];
      }),
    ];
  const cell = (v) => {
    let t = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  download(
    "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
    `长期力量轮转-${today()}.csv`,
  );
});
// 开启下一周期前归档完整快照，提前恢复时不增加工作重量。
function beginCycle(recovery) {
  if (!recovery && pending() !== -1) return;
  if (recovery && (pending() === -1 || list()[pending()]?.recovery)) return;
  const next = P.nextWeights(state),
    weights = Object.fromEntries(
      next.map((x) => [x.key, recovery ? Math.min(x.from, x.to) : x.to]),
    ),
    last = state.records.at(-1),
    suggested = recovery
      ? last
        ? P.addDays(last.date, 2)
        : today()
      : P.rollingSchedule(state).at(-1).nextDate,
    { archives, ...snapshot } = state;
  state = {
    ...freshState(),
    tm: state.tm,
    increment: state.increment,
    barWeight: state.barWeight,
    weights,
    entryRecovery: recovery,
    phases: P.phases(recovery),
    startDate: suggested > today() ? suggested : today(),
    cycle: state.cycle + 1,
    archives: [
      ...archives,
      {
        ...snapshot,
        archivedAt: new Date().toISOString(),
        reason: recovery ? "提前恢复" : "正常周期结束",
      },
    ],
  };
  save(recovery ? "已归档并转入恢复段" : "已开始下一周期");
  renderAll();
  $("#setupMessage").textContent = recovery
    ? "已归档当前记录。先6天轻练恢复，再从卧推A重开常规轮转；仍不适就继续延后。"
    : "新周期按各主项建议选重，TM不自动提高；24天常规后再恢复6天。";
}
$("#newCycleButton").addEventListener("click", () => beginCycle(false));
$("#recoverNowButton").addEventListener("click", () => beginCycle(true));
let printDetails = [];
addEventListener("beforeprint", () => {
  document
    .querySelectorAll("[data-note]")
    .forEach((el) => (el.nextElementSibling.textContent = el.value));
  printDetails = [
    ...document.querySelectorAll("#split details, .plan-phase"),
  ].map((el) => [el, el.open]);
  printDetails.forEach(([el]) => (el.open = true));
});
addEventListener("afterprint", () =>
  printDetails.forEach(([el, open]) => (el.open = open)),
);
$("#printButton").addEventListener("click", () => window.print());
const navLinks = [...document.querySelectorAll(".nav-links a")];
let navPending = false;
function updateNavigation() {
  if (matchMedia("(max-width:760px)").matches) {
    navPending = false;
    return;
  }
  let active = "overview";
  navLinks.forEach((link) => {
    const section = document.querySelector(link.hash);
    if (section && section.getBoundingClientRect().top < innerHeight * 0.35)
      active = section.id;
  });
  navLinks.forEach((link) => {
    const selected = link.hash === `#${active}`;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  navPending = false;
}
addEventListener(
  "scroll",
  () => {
    if (!navPending) {
      navPending = true;
      requestAnimationFrame(updateNavigation);
    }
  },
  { passive: true },
);
renderAll();
renderLegacy();
updateNavigation();
if (storageProblem)
  $("#savedIndicator").textContent = "浏览器存储读取异常，请导出记录。";
