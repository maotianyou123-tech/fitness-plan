/* 手机与桌面共用页面节点、训练计算和本地记录，通过响应式导航切换展示方式。 */
"use strict";
(() => {
  const phone = matchMedia("(max-width: 760px)"),
    names = {
      top: "训练首页",
      overview: "设置起点",
      cycle: "完整计划",
      split: "热身与辅助",
      "session-plan": "当前训练",
      failure: "进阶与恢复",
      review: "训练记录",
      sources: "参考与说明",
    };
  const menu = document.getElementById("mobileMenu"),
    menuButton = document.getElementById("mobileMenuButton"),
    share = document.getElementById("shareDialog"),
    sections = [...document.querySelectorAll("main > section")];
  function sectionFor(id) {
    const el = document.getElementById(id);
    return el?.closest("main > section")?.id || "top";
  }
  // 手机只切换分区可见性，不复制或重新计算训练数据。
  function setPanel(id) {
    const section = sectionFor(id);
    document.body.dataset.mobileSection = section;
    sections.forEach((el) =>
      el.classList.toggle("mobile-current", el.id === section),
    );
    document.getElementById("mobilePageLabel").textContent = names[section];
    document.querySelectorAll("[data-mobile-tab]").forEach((el) => {
      const selected = el.dataset.mobileTab === section;
      el.classList.toggle("active", selected);
      if (selected) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    const more = !["top", "cycle", "session-plan", "review"].includes(section);
    menuButton.classList.toggle("active", more);
  }
  function closeMenu() {
    if (menu.open) menu.close();
  }
  // 用网址锚点记录当前分区，兼容分享入口与浏览器前进、后退。
  function openSection(id, { scroll = true, push = true } = {}) {
    if (!phone.matches) return;
    id = String(id).replace(/^#/, "");
    if (!document.getElementById(id)) id = "top";
    closeMenu();
    setPanel(id);
    if (push && location.hash !== "#" + id) {
      try {
        history.pushState(null, "", "#" + id);
      } catch {
        location.hash = id;
      }
    }
    if (scroll) {
      if (names[id]) window.scrollTo({ top: 0, behavior: "instant" });
      else
        document
          .getElementById(id)
          .scrollIntoView({ block: "start", behavior: "instant" });
    }
  }
  window.BenchUI = { openSection };
  // 跨越手机断点时恢复相应展开状态，桌面继续显示完整页面。
  function syncLayout() {
    document.body.classList.toggle("mobile-app", phone.matches);
    const selected = document
      .querySelector("#cycleGrid tr.active")
      ?.closest(".plan-phase");
    document
      .querySelectorAll(".plan-phase")
      .forEach((el) => (el.open = !phone.matches || el === selected));
    document
      .querySelectorAll(".support-entry")
      .forEach((el) => (el.open = !phone.matches));
    if (phone.matches) {
      openSection(location.hash.slice(1) || "top", { push: false });
    } else {
      closeMenu();
    }
  }
  phone.addEventListener("change", syncLayout);
  addEventListener("popstate", () =>
    openSection(location.hash.slice(1) || "top", { push: false }),
  );
  addEventListener("hashchange", () =>
    openSection(location.hash.slice(1) || "top", { push: false }),
  );
  menuButton.addEventListener("click", () => {
    menu.showModal();
    menuButton.setAttribute("aria-expanded", "true");
  });
  menu.addEventListener("close", () =>
    menuButton.setAttribute("aria-expanded", "false"),
  );
  for (const dialog of [menu, share]) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          dialog.close();
      }
    });
    dialog
      .querySelector("[data-close-dialog]")
      .addEventListener("click", () => dialog.close());
  }
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    const link = e.target.closest('a[href^="#"]');
    if (!link || !phone.matches) return;
    e.preventDefault();
    const id = link.hash.slice(1);
    if (link.hasAttribute("data-resume")) {
      const index = pending();
      selectSession(index < 0 ? list().length - 1 : index);
    } else openSection(id);
  });
  document.getElementById("mobilePrintButton").addEventListener("click", () => {
    closeMenu();
    window.print();
  });
  // 分享网址去掉临时查询串和训练锚点，本地file地址不作为公网链接。
  function siteURL() {
    if (!/^https?:$/.test(location.protocol)) return "";
    const u = new URL(location.href);
    u.hash = "";
    u.search = "";
    return u.href;
  }
  // 根据当前环境提供复制网址或系统分享，不附带个人训练记录。
  function openShare() {
    closeMenu();
    const url = siteURL();
    document.getElementById("shareUrl").value = url;
    document.querySelector(".share-url-label").hidden = !url;
    document.getElementById("copySiteLink").hidden = !url;
    document.getElementById("nativeShareSite").hidden =
      !url || typeof navigator.share !== "function";
    document.getElementById("shareHint").textContent = url
      ? "发送这个网址，对方就能用手机或电脑打开。每个人的记录保存在自己的浏览器，不会随链接发送。"
      : "当前打开的是本地HTML。发布到网站后，这里就能复制和分享网址；现在可以直接发送HTML或ZIP文件。";
    document.getElementById("shareStatus").textContent = "";
    share.showModal();
  }
  document
    .querySelectorAll("[data-share-site]")
    .forEach((el) => el.addEventListener("click", openShare));
  document
    .getElementById("copySiteLink")
    .addEventListener("click", async () => {
      const url = siteURL(),
        status = document.getElementById("shareStatus");
      if (!url) return;
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(url);
        status.textContent = "链接已复制，可以粘贴发送。";
      } catch {
        const input = document.getElementById("shareUrl");
        input.focus();
        input.select();
        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch {}
        status.textContent = copied
          ? "链接已复制，可以粘贴发送。"
          : "地址已选中，请长按或使用复制命令。";
      }
    });
  document
    .getElementById("nativeShareSite")
    .addEventListener("click", async () => {
      const url = siteURL();
      if (!url || !navigator.share) return;
      try {
        await navigator.share({
          title: "焚决 · 长期力量轮转",
          text: "卧推、下肢与休息的训练计划，支持手机填写记录。",
          url,
        });
        document.getElementById("shareStatus").textContent =
          "分享操作已交给系统。";
      } catch (e) {
        if (e.name !== "AbortError")
          document.getElementById("shareStatus").textContent =
            "暂时无法调起系统分享，可以复制上方链接。";
      }
    });
  // 软键盘弹起时收起底部导航，避免固定导航遮住正在编辑的字段。
  let fullHeight = window.visualViewport?.height || innerHeight;
  function keyboardLayout() {
    const height = window.visualViewport?.height || innerHeight,
      editing = !!document.activeElement?.matches(
        "input:not([type=checkbox]),textarea,select",
      );
    if (!editing) fullHeight = height;
    document.body.classList.toggle(
      "keyboard-open",
      phone.matches && editing && fullHeight - height > 120,
    );
  }
  window.visualViewport?.addEventListener("resize", keyboardLayout);
  document.addEventListener("focusin", keyboardLayout);
  document.addEventListener("focusout", () => setTimeout(keyboardLayout, 150));
  syncLayout();
})();
