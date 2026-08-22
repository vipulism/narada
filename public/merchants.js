(() => {
  const LIST_LIMIT = 100;

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const els = {
    summary: document.getElementById("merchant-summary"),
    meta: document.getElementById("merchant-meta"),
    pageMeta: document.getElementById("page-meta"),
    list: document.getElementById("merchants"),
    toolbar: document.getElementById("toolbar"),
    query: document.getElementById("query"),
    status: document.getElementById("status"),
    refresh: document.getElementById("refresh"),
    pager: document.getElementById("pager"),
    prevPage: document.getElementById("prev-page"),
    nextPage: document.getElementById("next-page"),
  };

  const view = {
    q: "",
    status: "uncategorized",
    page: 1,
  };

  /** @type {Array<{ key: string, label: string }>} */
  let buckets = [];

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   * @returns {Promise<Response>}
   */
  async function api(path, init) {
    return fetch(path, {
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...init,
    });
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
   * @param {HTMLElement | null} el
   * @param {string} value
   */
  function setText(el, value) {
    if (el) {
      el.textContent = value;
    }
  }

  /**
   * @param {HTMLElement | null} el
   * @param {string} value
   */
  function setHtml(el, value) {
    if (el) {
      el.innerHTML = value;
    }
  }

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    view.q = params.get("q") ?? "";
    const status = params.get("status");
    view.status =
      status === "categorized" || status === "all" ? status : "uncategorized";
    const page = Number(params.get("page") ?? 1);
    view.page = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

    if (els.query instanceof HTMLInputElement) {
      els.query.value = view.q;
    }
    if (els.status instanceof HTMLSelectElement) {
      els.status.value = view.status;
    }
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (view.q) {
      params.set("q", view.q);
    }
    if (view.status !== "uncategorized") {
      params.set("status", view.status);
    }
    if (view.page > 1) {
      params.set("page", String(view.page));
    }
    const next = params.toString();
    const url = next ? `/merchants.html?${next}` : "/merchants.html";
    window.history.replaceState({}, "", url);
  }

  /**
   * @param {Array<{ key: string, label: string }>} options
   * @param {string | null} selected
   * @param {string} suggested
   * @returns {string}
   */
  function categorySelect(options, selected, suggested) {
    const blank = selected
      ? `<option value="">Clear (use guess)</option>`
      : `<option value="">Guess: ${escapeHtml(
          options.find((row) => row.key === suggested)?.label ?? suggested
        )}</option>`;
    const opts = options
      .map((row) => {
        const isSelected = row.key === selected ? " selected" : "";
        return `<option value="${escapeHtml(row.key)}"${isSelected}>${escapeHtml(
          row.label
        )}</option>`;
      })
      .join("");
    return `${blank}${opts}`;
  }

  /**
   * @param {object} item
   * @returns {string}
   */
  function merchantRow(item) {
    const when = item.lastSeenAt
      ? new Date(item.lastSeenAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "not seen";
    return `
      <article class="merchant-row card" data-key="${escapeHtml(item.key)}">
        <div>
          <h3>${escapeHtml(item.label)}</h3>
          <p class="merchant-meta">
            ${item.txCount} tx · ${money.format(item.totalAmount)} · last ${escapeHtml(when)}
          </p>
        </div>
        <label class="merchant-cat">
          <span class="sr-only">Category for ${escapeHtml(item.label)}</span>
          <select data-assign="${escapeHtml(item.key)}" data-label="${escapeHtml(item.label)}">
            ${categorySelect(buckets, item.category, item.suggested)}
          </select>
        </label>
      </article>
    `;
  }

  /**
   * @param {object} payload
   */
  function render(payload) {
    const items = payload.items ?? [];
    const counts = payload.counts ?? {};
    const pagination = payload.pagination ?? {};
    buckets = payload.buckets ?? buckets;

    setText(
      els.summary,
      `${counts.uncategorized ?? 0} uncategorized · ${counts.categorized ?? 0} assigned`
    );
    setText(
      els.meta,
      `${counts.all ?? 0} merchants from SMS expenses`
    );

    if (!items.length) {
      setHtml(
        els.list,
        `<p class="empty">${
          view.q || view.status !== "all"
            ? "No merchants match this filter."
            : "No expense merchants yet."
        }</p>`
      );
    } else {
      setHtml(els.list, items.map(merchantRow).join(""));
    }

    const totalPages = pagination.totalPages || 1;
    const page = pagination.page || 1;
    setText(
      els.pageMeta,
      pagination.total
        ? `page ${page} of ${totalPages} · ${pagination.total} shown in this filter`
        : ""
    );

    if (els.pager) {
      els.pager.hidden = totalPages <= 1;
    }
    if (els.prevPage instanceof HTMLButtonElement) {
      els.prevPage.disabled = page <= 1;
    }
    if (els.nextPage instanceof HTMLButtonElement) {
      els.nextPage.disabled = page >= totalPages;
    }
  }

  async function load() {
    const params = new URLSearchParams({
      status: view.status,
      page: String(view.page),
      limit: String(LIST_LIMIT),
    });
    if (view.q) {
      params.set("q", view.q);
    }

    setText(els.summary, "Loading…");

    try {
      const res = await api(`/merchants?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      render(await res.json());
    } catch (error) {
      setText(els.summary, "Could not load merchants");
      setHtml(
        els.list,
        `<p class="error">${escapeHtml(
          error instanceof Error ? error.message : "Load failed"
        )}</p>`
      );
    }
  }

  /**
   * @param {string} key
   * @param {string} label
   * @param {string} category
   */
  async function assign(key, label, category) {
    const res = await api("/merchants", {
      method: "PUT",
      body: JSON.stringify({
        key,
        label,
        category: category === "" ? null : category,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
  }

  els.toolbar?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  let searchTimer = 0;

  els.query?.addEventListener("input", () => {
    if (!(els.query instanceof HTMLInputElement)) {
      return;
    }
    view.q = els.query.value.trim();
    view.page = 1;
    writeUrl();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      load();
    }, 250);
  });

  els.status?.addEventListener("change", () => {
    if (!(els.status instanceof HTMLSelectElement)) {
      return;
    }
    view.status = els.status.value;
    view.page = 1;
    writeUrl();
    load();
  });

  els.refresh?.addEventListener("click", () => {
    load();
  });

  els.prevPage?.addEventListener("click", () => {
    if (view.page <= 1) {
      return;
    }
    view.page -= 1;
    writeUrl();
    load();
  });

  els.nextPage?.addEventListener("click", () => {
    view.page += 1;
    writeUrl();
    load();
  });

  els.list?.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.dataset.assign) {
      return;
    }

    target.disabled = true;
    try {
      await assign(target.dataset.assign, target.dataset.label ?? "", target.value);
      await load();
    } catch (error) {
      setText(
        els.pageMeta,
        error instanceof Error ? error.message : "Could not save category"
      );
      target.disabled = false;
    }
  });

  readUrl();
  writeUrl();
  load();
})();
