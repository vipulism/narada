(() => {
  const REFRESH_MS = 60_000;
  const LIST_LIMIT = 100;

  const UNHEALTHY = new Set([
    "SERVICE_FAILED",
    "SERVICE_SLOW",
    "CONTAINER_STOPPED",
    "CONTAINER_KILLED",
    "BACKUP_FAILED",
  ]);

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

  const els = {
    summary: document.getElementById("attention-summary"),
    clock: document.getElementById("clock"),
    refresh: document.getElementById("refresh"),
    importStatus: document.getElementById("import-status"),
    live: document.getElementById("live-status"),
    services: document.getElementById("services"),
    servicesMeta: document.getElementById("services-meta"),
    dues: document.getElementById("dues"),
    duesMeta: document.getElementById("dues-meta"),
    blocked: document.getElementById("blocked"),
    blockedMeta: document.getElementById("blocked-meta"),
    toolbar: document.getElementById("toolbar"),
    query: document.getElementById("query"),
    dueStatus: document.getElementById("due-status"),
    since: document.getElementById("since"),
    sort: document.getElementById("sort"),
    order: document.getElementById("order"),
    resetView: document.getElementById("reset-view"),
  };

  const view = {
    q: "",
    status: "",
    since: "6",
    sort: "",
    order: "asc",
  };

  /** @type {Map<string, object>} */
  let servicesById = new Map();

  /**
   * @param {string} path
   * @returns {Promise<Response>}
   */
  async function api(path) {
    return fetch(path, { headers: { Accept: "application/json" } });
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /**
   * @param {number | null | undefined} amount
   * @param {string | null | undefined} currency
   */
  function formatMoney(amount, currency) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return "—";
    }
    if (!currency || currency === "INR") {
      return money.format(amount);
    }
    return `${amount} ${currency}`;
  }

  /**
   * @param {string | null | undefined} iso
   */
  function formatRelative(iso) {
    if (!iso) {
      return "unknown";
    }
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) {
      return "unknown";
    }
    const delta = Math.round((Date.now() - then) / 1000);
    const abs = Math.abs(delta);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (abs < 60) {
      return rtf.format(-Math.trunc(delta), "second");
    }
    if (abs < 3600) {
      return rtf.format(-Math.trunc(delta / 60), "minute");
    }
    if (abs < 86400) {
      return rtf.format(-Math.trunc(delta / 3600), "hour");
    }
    return rtf.format(-Math.trunc(delta / 86400), "day");
  }

  /**
   * @param {string | null | undefined} iso
   */
  function formatReceivedAt(iso) {
    if (!iso) {
      return null;
    }
    const received = new Date(iso);
    if (Number.isNaN(received.getTime())) {
      return null;
    }
    return received.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * @returns {string}
   */
  function todayDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  /**
   * @param {string | null | undefined} dueDate
   */
  function dueDay(dueDate) {
    if (!dueDate) {
      return null;
    }
    return String(dueDate).slice(0, 10);
  }

  /**
   * @param {string} status
   */
  function serviceTone(status) {
    if (status === "SERVICE_FAILED" || status === "CONTAINER_KILLED" || status === "BACKUP_FAILED") {
      return "fail";
    }
    if (
      status === "SERVICE_SLOW" ||
      status === "CONTAINER_STOPPED" ||
      status === "CONTAINER_RESTARTED"
    ) {
      return "warn";
    }
    return "ok";
  }

  /**
   * @param {string} status
   */
  function serviceLabel(status) {
    return status.replaceAll("_", " ").toLowerCase();
  }

  /**
   * @param {HTMLElement | null} node
   * @param {string} html
   */
  function setHtml(node, html) {
    if (node) {
      node.innerHTML = html;
    }
  }

  /**
   * @param {HTMLElement | null} node
   * @param {string} text
   */
  function setText(node, text) {
    if (node) {
      node.textContent = text;
    }
  }

  function renderServices() {
    const services = [...servicesById.values()].sort((a, b) => {
      const aBad = UNHEALTHY.has(a.serviceStatus) ? 0 : 1;
      const bBad = UNHEALTHY.has(b.serviceStatus) ? 0 : 1;
      if (aBad !== bBad) {
        return aBad - bBad;
      }
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });

    const unhealthy = services.filter((item) => UNHEALTHY.has(item.serviceStatus));
    setText(
      els.servicesMeta,
      services.length
        ? `${unhealthy.length} need a look · ${services.length} tracked`
        : ""
    );

    if (!services.length) {
      setHtml(els.services, `<p class="empty">No services tracked yet.</p>`);
      return;
    }

    setHtml(
      els.services,
      services
        .map((item) => {
          const tone = serviceTone(item.serviceStatus);
          const title = escapeHtml(item.name || item.id);
          const label = escapeHtml(serviceLabel(item.serviceStatus || "unknown"));
          return `<div class="chip" data-tone="${tone}" role="listitem" title="${escapeHtml(
            item.message || ""
          )}"><span class="dot"></span><span>${title}</span><span class="muted">${label}</span></div>`;
        })
        .join("")
    );
  }

  /**
   * @param {object} item
   */
  function dueCard(item) {
    const payload = item.payload || {};
    const day = dueDay(payload.dueDate);
    const overdue = payload.status === "overdue" || (!payload.status && Boolean(day && day < todayDate()));
    const title = [payload.bank, payload.accountLast4 ? `····${payload.accountLast4}` : null]
      .filter(Boolean)
      .join(" ");
    const receivedAt = formatReceivedAt(item.occurredAt);
    const dueLabel = day
      ? overdue
        ? `Overdue ${day}`
        : `Due ${day}`
      : receivedAt
        ? `SMS ${receivedAt}`
        : "Due date unknown";
    const amounts = [
      payload.minDue != null ? `min ${formatMoney(payload.minDue, payload.currency)}` : null,
      payload.totalDue != null ? `total ${formatMoney(payload.totalDue, payload.currency)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return `<article class="card">
      <div class="card-top">
        <h3>${escapeHtml(title || payload.merchant || `SMS ${item.id}`)}</h3>
        <span class="amount">${escapeHtml(
          formatMoney(payload.totalDue ?? payload.minDue ?? payload.amount, payload.currency)
        )}</span>
      </div>
      <p class="detail">
        <span class="badge ${overdue ? "overdue" : "due"}">${escapeHtml(dueLabel)}</span>
        ${amounts ? ` · ${escapeHtml(amounts)}` : ""}
      </p>
      <p class="detail sms-id">sms ${escapeHtml(item.id)}${
        receivedAt ? ` · received ${escapeHtml(receivedAt)}` : ""
      }</p>
      ${duePaidAction(item)}
    </article>`;
  }

  /**
   * @param {object} item
   */
  function duePaidAction(item) {
    const payload = item.payload || {};
    if (payload.markedPaid) {
      return `<p class="card-actions"><button type="button" class="btn mark-due" data-unpaid="${escapeHtml(
        item.id
      )}">Undo paid</button></p>`;
    }
    if (payload.status === "paid") {
      return "";
    }
    return `<p class="card-actions"><button type="button" class="btn mark-due" data-paid="${escapeHtml(
      item.id
    )}">Mark paid</button></p>`;
  }

  /**
   * @param {object} item
   */
  function blockedCard(item) {
    const payload = item.payload || {};
    const title = [payload.bank, payload.merchant || payload.kind].filter(Boolean).join(" · ");
    return `<article class="card">
      <div class="card-top">
        <h3>${escapeHtml(title || `SMS ${item.id}`)}</h3>
        <span class="amount">${escapeHtml(formatMoney(payload.amount, payload.currency))}</span>
      </div>
      <p class="detail">
        <span class="badge blocked">blocked</span>
        · ${escapeHtml(payload.reason || "unpushed")}
      </p>
      <p class="detail sms-id">sms ${escapeHtml(item.id)}${
        payload.accountLast4 ? ` · ····${escapeHtml(payload.accountLast4)}` : ""
      }</p>
    </article>`;
  }

  /**
   * @param {object[]} dues
   * @param {number} dueTotal
   * @param {object[]} blocked
   * @param {number} blockedTotal
   * @param {string | null} exceptionError
   */
  function renderAttention(dues, dueTotal, blocked, blockedTotal, exceptionError) {
    const overdue = dues.filter((item) => {
      const status = item.payload?.status;
      if (status === "overdue") {
        return true;
      }
      if (status === "open" || status === "paid") {
        return false;
      }
      const day = dueDay(item.payload?.dueDate);
      return day && day < todayDate();
    }).length;
    const unhealthy = [...servicesById.values()].filter((item) =>
      UNHEALTHY.has(item.serviceStatus)
    ).length;
    const attentionCount = dues.length + blocked.length + unhealthy;

    setText(
      els.summary,
      attentionCount === 0 && !exceptionError
        ? "All clear"
        : `${attentionCount} need attention`
    );

    setText(
      els.duesMeta,
      dueTotal > dues.length
        ? `showing ${dues.length} of ${dueTotal}${overdue ? ` · ${overdue} overdue` : ""}`
        : `${dueTotal} open${overdue ? ` · ${overdue} overdue` : ""}`
    );
    setText(
      els.blockedMeta,
      exceptionError
        ? ""
        : blockedTotal > blocked.length
          ? `showing ${blocked.length} of ${blockedTotal}`
          : `${blockedTotal} blocked`
    );

    if (!dues.length) {
      setHtml(
        els.dues,
        `<p class="empty">${view.q || view.status ? "No dues match this filter." : "Nothing due."}</p>`
      );
    } else {
      setHtml(els.dues, dues.map(dueCard).join(""));
    }

    if (exceptionError) {
      setHtml(els.blocked, `<p class="error">${escapeHtml(exceptionError)}</p>`);
      return;
    }

    if (!blocked.length) {
      setHtml(
        els.blocked,
        `<p class="empty">${view.q ? "No blocked pushes match this search." : "No blocked pushes."}</p>`
      );
    } else {
      setHtml(els.blocked, blocked.map(blockedCard).join(""));
    }
  }

  /**
   * @param {object} record
   */
  function renderImport(record) {
    if (!record) {
      setText(els.importStatus, "No SMS import recorded yet.");
      return;
    }
    const when = formatRelative(record.completedAt || record.startedAt);
    const counts = `${record.imported ?? 0} imported · ${record.skipped ?? 0} skipped`;
    if (record.status === "failed") {
      setText(
        els.importStatus,
        `Failed ${when}${record.errorMessage ? ` — ${record.errorMessage}` : ""}`
      );
      return;
    }
    setText(els.importStatus, `Completed ${when} · ${counts}`);
  }

  /**
   * @param {string | null | undefined} value
   * @returns {"3" | "6" | "12" | "all"}
   */
  function parseSince(value) {
    if (value === "3" || value === "12" || value === "all") {
      return value;
    }
    return "6";
  }

  /**
   * @param {string} since
   * @returns {string | null}
   */
  function sinceFromIso(since) {
    const months = Number(since);
    if (!Number.isFinite(months) || months <= 0) {
      return null;
    }
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    return from.toISOString();
  }

  /**
   * @returns {string}
   */
  function dueQuery() {
    const params = new URLSearchParams({ kind: "due", limit: String(LIST_LIMIT) });
    if (view.q) {
      params.set("q", view.q);
    }
    if (view.status) {
      params.set("status", view.status);
    }
    const from = sinceFromIso(view.since);
    if (from) {
      params.set("from", from);
    }
    if (view.sort) {
      params.set("sort", view.sort);
      params.set("order", view.order);
    }
    return `/knowledge?${params}`;
  }

  /**
   * @returns {string}
   */
  function blockedQuery() {
    const params = new URLSearchParams({
      kind: "exception",
      status: "blocked",
      limit: String(LIST_LIMIT),
    });
    if (view.q) {
      params.set("q", view.q);
    }
    const from = sinceFromIso(view.since);
    if (from) {
      params.set("from", from);
    }
    if (view.sort) {
      params.set("sort", view.sort);
      params.set("order", view.order);
    }
    return `/knowledge?${params}`;
  }

  function readViewFromUrl() {
    const params = new URLSearchParams(window.location.search);
    view.q = params.get("q")?.trim() ?? "";
    view.status = params.get("status") ?? "";
    view.since = parseSince(params.get("since"));
    view.sort = params.get("sort") ?? "";
    view.order = params.get("order") === "desc" ? "desc" : "asc";
  }

  function writeViewToUrl() {
    const params = new URLSearchParams();
    if (view.q) {
      params.set("q", view.q);
    }
    if (view.status) {
      params.set("status", view.status);
    }
    params.set("since", view.since);
    if (view.sort) {
      params.set("sort", view.sort);
      params.set("order", view.order);
    }
    const next = params.toString() ? `/?${params}` : "/";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      history.replaceState(null, "", next);
    }
  }

  function syncForm() {
    if (els.query) {
      els.query.value = view.q;
    }
    if (els.dueStatus) {
      els.dueStatus.value = view.status;
    }
    if (els.since) {
      els.since.value = view.since;
    }
    if (els.sort) {
      els.sort.value = view.sort;
    }
    if (els.order) {
      els.order.value = view.order;
    }
  }

  function readForm() {
    view.q = els.query?.value.trim() ?? "";
    view.status = els.dueStatus?.value ?? "";
    view.since = parseSince(els.since?.value);
    view.sort = els.sort?.value ?? "";
    view.order = els.order?.value === "desc" ? "desc" : "asc";
  }

  async function load() {
    setText(els.clock, `Updated ${new Date().toLocaleTimeString()}`);

    try {
      const health = await api("/health");
      els.live.dataset.state = health.ok ? "ok" : "down";
      setText(els.live, health.ok ? "Live" : "Down");
    } catch {
      els.live.dataset.state = "down";
      setText(els.live, "Down");
    }

    const [dueRes, exceptionRes, importRes, serviceRes] = await Promise.allSettled([
      api(dueQuery()),
      api(blockedQuery()),
      api("/imports?limit=1"),
      api("/services"),
    ]);

    if (serviceRes.status === "fulfilled" && serviceRes.value.ok) {
      const list = await serviceRes.value.json();
      servicesById = new Map(
        (Array.isArray(list) ? list : []).map((item) => [String(item.id), item])
      );
    }
    renderServices();

    if (importRes.status === "fulfilled" && importRes.value.ok) {
      const body = await importRes.value.json();
      renderImport(Array.isArray(body.items) ? body.items[0] : null);
    } else {
      setText(els.importStatus, "Could not load import status.");
    }

    /** @type {object[]} */
    let dues = [];
    let dueTotal = 0;
    if (dueRes.status === "fulfilled" && dueRes.value.ok) {
      const body = await dueRes.value.json();
      dues = Array.isArray(body.items) ? body.items : [];
      dueTotal = Number(body.pagination?.total ?? dues.length);
    } else {
      setHtml(els.dues, `<p class="error">Could not load dues.</p>`);
    }

    /** @type {object[]} */
    let blocked = [];
    let blockedTotal = 0;
    /** @type {string | null} */
    let exceptionError = null;
    if (exceptionRes.status === "fulfilled") {
      const res = exceptionRes.value;
      if (res.ok) {
        const body = await res.json();
        blocked = Array.isArray(body.items) ? body.items : [];
        blockedTotal = Number(body.pagination?.total ?? blocked.length);
      } else if (res.status === 503) {
        exceptionError = "Dhan is not configured — blocked pushes cannot be checked.";
      } else {
        exceptionError = "Could not load blocked pushes.";
      }
    } else {
      exceptionError = "Could not load blocked pushes.";
    }

    if (dueRes.status === "fulfilled" && dueRes.value.ok) {
      renderAttention(dues, dueTotal, blocked, blockedTotal, exceptionError);
    } else {
      setText(els.summary, "Could not load attention feeds");
      if (exceptionError) {
        setHtml(els.blocked, `<p class="error">${escapeHtml(exceptionError)}</p>`);
      } else if (blocked.length) {
        setHtml(els.blocked, blocked.map(blockedCard).join(""));
      }
    }
  }

  function connectStream() {
    const source = new EventSource("/services/stream");
    source.addEventListener("service-status", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.id) {
          servicesById.set(String(payload.id), payload);
          renderServices();
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    });
    source.onerror = () => {
      // EventSource reconnects on its own.
    };
  }

  els.refresh?.addEventListener("click", () => {
    void load();
  });

  els.dues?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const paidId = target.getAttribute("data-paid");
    const unpaidId = target.getAttribute("data-unpaid");
    if (paidId) {
      void markDue(paidId, true, target);
    } else if (unpaidId) {
      void markDue(unpaidId, false, target);
    }
  });

  /**
   * @param {string} id
   * @param {boolean} paid
   * @param {HTMLElement} button
   */
  async function markDue(id, paid, button) {
    button.setAttribute("disabled", "true");
    try {
      const res = await fetch(`/knowledge/${id}/paid`, {
        method: paid ? "POST" : "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error("Could not update due");
      }
      await load();
    } catch {
      button.removeAttribute("disabled");
      window.alert("Could not update this due. Try refresh.");
    }
  }

  els.toolbar?.addEventListener("submit", (event) => {
    event.preventDefault();
    readForm();
    writeViewToUrl();
    void load();
  });

  els.dueStatus?.addEventListener("change", () => {
    readForm();
    writeViewToUrl();
    void load();
  });
  els.since?.addEventListener("change", () => {
    readForm();
    writeViewToUrl();
    void load();
  });
  els.sort?.addEventListener("change", () => {
    readForm();
    writeViewToUrl();
    void load();
  });
  els.order?.addEventListener("change", () => {
    readForm();
    writeViewToUrl();
    void load();
  });

  let searchTimer = 0;
  els.query?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      readForm();
      writeViewToUrl();
      void load();
    }, 300);
  });

  els.resetView?.addEventListener("click", () => {
    view.q = "";
    view.status = "";
    view.since = "6";
    view.sort = "";
    view.order = "asc";
    syncForm();
    writeViewToUrl();
    void load();
  });

  readViewFromUrl();
  syncForm();
  void load();
  connectStream();
  window.setInterval(() => {
    void load();
  }, REFRESH_MS);
})();
