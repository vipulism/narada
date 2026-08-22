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
    applyDhan: document.getElementById("apply-dhan"),
    applyAll: document.getElementById("apply-all"),
    smsDialog: document.getElementById("sms-dialog"),
    smsDialogTitle: document.getElementById("sms-dialog-title"),
    smsDialogMeta: document.getElementById("sms-dialog-meta"),
    smsDialogAssign: document.getElementById("sms-dialog-assign"),
    smsDialogCategory: document.getElementById("sms-dialog-category"),
    smsDialogMerchant: document.getElementById("sms-dialog-merchant"),
    smsDialogAssignMeta: document.getElementById("sms-dialog-assign-meta"),
    smsDialogBody: document.getElementById("sms-dialog-body"),
    smsDialogClose: document.getElementById("sms-dialog-close"),
    smsListDialog: document.getElementById("sms-list-dialog"),
    smsListTitle: document.getElementById("sms-list-title"),
    smsListMeta: document.getElementById("sms-list-meta"),
    smsList: document.getElementById("sms-list"),
    smsListClose: document.getElementById("sms-list-close"),
    smsListMore: document.getElementById("sms-list-more"),
    pager: document.getElementById("pager"),
    prevPage: document.getElementById("prev-page"),
    nextPage: document.getElementById("next-page"),
  };

  const view = {
    q: "",
    status: "uncategorized",
    page: 1,
  };

  const smsListState = {
    key: "",
    label: "",
    page: 1,
    total: 0,
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
  /**
   * @param {unknown} value
   * @returns {string}
   */
  function decodeSmsBody(value) {
    return String(value ?? "")
      .replaceAll("&#10;", "\n")
      .replaceAll("&#13;", "")
      .replaceAll("&amp;", "&")
      .replaceAll("&apos;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  }

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
   * @param {Array<{ key: string, label: string }>} options
   * @param {string | null} selected
   * @param {string} suggested
   * @returns {string}
   */
  function smsCategorySelect(options, selected, suggested) {
    const inherit = options.find((row) => row.key === suggested)?.label ?? suggested;
    const blank = selected
      ? `<option value="">Clear (use merchant / guess)</option>`
      : `<option value="">Use merchant / guess: ${escapeHtml(inherit)}</option>`;
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
   * @param {object} ctx
   * @returns {string}
   */
  function smsMerchantSelect(ctx) {
    const overrideKey = ctx.override?.merchantKey ?? "";
    const ownKey = ctx.ownMerchantKey ?? "";
    const patternSelected = !overrideKey ? " selected" : "";
    const ownSelected = overrideKey && overrideKey === ownKey ? " selected" : "";
    const others = (ctx.merchants ?? [])
      .map((row) => {
        const isSelected = row.key === overrideKey ? " selected" : "";
        return `<option value="${escapeHtml(row.key)}"${isSelected}>${escapeHtml(
          row.label
        )}</option>`;
      })
      .join("");
    return `
      <option value=""${patternSelected}>Pattern: ${escapeHtml(
        ctx.patternLabel ?? "this merchant"
      )}</option>
      <option value="__own__"${ownSelected}>This SMS only</option>
      ${others}
    `;
  }

  /**
   * @param {object} ctx
   */
  function renderSmsAssign(ctx) {
    if (
      !(els.smsDialogAssign instanceof HTMLFormElement) ||
      !(els.smsDialogCategory instanceof HTMLSelectElement) ||
      !(els.smsDialogMerchant instanceof HTMLSelectElement)
    ) {
      return;
    }

    const bucketOptions = ctx.buckets?.length ? ctx.buckets : buckets;
    els.smsDialogAssign.dataset.smsId = String(ctx.smsId);
    els.smsDialogAssign.hidden = false;
    els.smsDialogCategory.innerHTML = smsCategorySelect(
      bucketOptions,
      ctx.override?.category ?? null,
      ctx.suggested
    );
    els.smsDialogMerchant.innerHTML = smsMerchantSelect(ctx);
    if (els.smsDialogAssignMeta) {
      els.smsDialogAssignMeta.hidden = true;
      els.smsDialogAssignMeta.textContent = "";
    }
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
    const pushed = Number(item.pushedCount ?? 0);
    const apply =
      item.category && pushed > 0
        ? `<button type="button" class="btn mark-due" data-apply="${escapeHtml(
            item.key
          )}">Apply ${pushed} in Dhan</button>`
        : "";
    const samples = Array.isArray(item.sampleSmsIds) ? item.sampleSmsIds : [];
    const extra = Number(item.txCount ?? 0) - samples.length;
    const smsIds = samples
      .map(
        (id) =>
          `<button type="button" class="sms-ref" data-sms="${escapeHtml(
            id
          )}">#${escapeHtml(id)}</button>`
      )
      .join(" ");
    const more =
      extra > 0
        ? `<button type="button" class="sms-ref" data-sms-more="${escapeHtml(
            item.key
          )}" data-sms-label="${escapeHtml(item.label)}" data-sms-total="${escapeHtml(
            item.txCount
          )}">+${extra} more</button>`
        : "";
    return `
      <article class="merchant-row card" data-key="${escapeHtml(item.key)}">
        <div>
          <h3>${escapeHtml(item.label)}</h3>
          <p class="merchant-meta">
            ${item.txCount} tx${pushed ? ` · ${pushed} in Dhan` : ""} · ${money.format(
              item.totalAmount
            )} · last ${escapeHtml(when)}
          </p>
          ${
            smsIds || more
              ? `<p class="merchant-meta">SMS ${smsIds}${more ? ` ${more}` : ""}</p>`
              : ""
          }
          ${apply}
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
        applyToDhan:
          category !== "" &&
          els.applyDhan instanceof HTMLInputElement &&
          els.applyDhan.checked,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }

    return res.json().then((payload) => payload.dhan);
  }

  /**
   * @param {unknown} dhan
   */
  function showDhanResult(dhan) {
    if (!dhan || typeof dhan !== "object") {
      return;
    }
    const row = /** @type {Record<string, unknown>} */ (dhan);
    if (row.skipped) {
      setText(els.pageMeta, `Dhan skipped — ${row.reason || "not configured"}`);
      return;
    }
    const updated = Number(row.updated ?? 0);
    const failed = Number(row.failed ?? 0);
    const remaining = Number(row.remaining ?? 0);
    const extra = remaining ? ` · ${remaining} left (run Apply again)` : "";
    const fail = failed ? ` · ${failed} failed` : "";
    setText(els.pageMeta, `Dhan updated ${updated}${fail}${extra}`);
  }

  /**
   * @param {string} [key]
   */
  async function applyDhan(key) {
    const res = await api("/merchants/apply", {
      method: "POST",
      body: JSON.stringify(key ? { key } : { all: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || `HTTP ${res.status}`);
    }
    showDhanResult(body.dhan);
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

  els.applyAll?.addEventListener("click", async () => {
    if (!(els.applyAll instanceof HTMLButtonElement)) {
      return;
    }
    els.applyAll.disabled = true;
    setText(els.pageMeta, "Updating Dhan…");
    try {
      await applyDhan();
    } catch (error) {
      setText(
        els.pageMeta,
        error instanceof Error ? error.message : "Could not update Dhan"
      );
    } finally {
      els.applyAll.disabled = false;
    }
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

  /**
   * @param {object} row
   * @returns {string}
   */
  function smsListRow(row) {
    const when = row.occurredAt
      ? new Date(row.occurredAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
    return `
      <button type="button" class="sms-list-item btn" data-sms="${escapeHtml(row.smsId)}">
        <span class="sms-ref">#${escapeHtml(row.smsId)}</span>
        <span class="merchant-meta">
          ${escapeHtml(row.merchant || "")} · ${money.format(Number(row.amount ?? 0))}
          ${when ? ` · ${escapeHtml(when)}` : ""}
        </span>
      </button>
    `;
  }

  /**
   * @param {boolean} append
   */
  async function loadMerchantSms(append) {
    const params = new URLSearchParams({
      key: smsListState.key,
      page: String(smsListState.page),
      limit: "50",
    });
    const res = await api(`/merchants/sms?${params.toString()}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.message || `HTTP ${res.status}`);
    }
    const items = payload.items ?? [];
    smsListState.total = payload.pagination?.total ?? items.length;
    const html = items.map(smsListRow).join("");
    if (append) {
      els.smsList?.insertAdjacentHTML("beforeend", html);
    } else {
      setHtml(els.smsList, html || `<p class="empty">No SMS for this merchant.</p>`);
    }
    const loaded = Math.min(smsListState.page * 50, smsListState.total);
    setText(
      els.smsListMeta,
      `${loaded} of ${smsListState.total} · click an id to read the SMS`
    );
    if (els.smsListMore instanceof HTMLButtonElement) {
      els.smsListMore.hidden = loaded >= smsListState.total;
    }
  }

  /**
   * @param {string} key
   * @param {string} label
   */
  async function showMerchantSmsList(key, label) {
    if (!(els.smsListDialog instanceof HTMLDialogElement)) {
      return;
    }
    smsListState.key = key;
    smsListState.label = label;
    smsListState.page = 1;
    setText(els.smsListTitle, label || key);
    setText(els.smsListMeta, "Loading…");
    setHtml(els.smsList, "");
    els.smsListDialog.showModal();
    await loadMerchantSms(false);
  }

  els.smsListClose?.addEventListener("click", () => {
    if (els.smsListDialog instanceof HTMLDialogElement) {
      els.smsListDialog.close();
    }
  });

  els.smsListMore?.addEventListener("click", async () => {
    smsListState.page += 1;
    try {
      await loadMerchantSms(true);
    } catch (error) {
      setText(
        els.smsListMeta,
        error instanceof Error ? error.message : "Could not load more SMS"
      );
    }
  });

  els.smsList?.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("button[data-sms]")
      : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const id = Number(target.dataset.sms);
    if (Number.isFinite(id) && id > 0) {
      await showSms(id);
    }
  });

  els.smsDialogClose?.addEventListener("click", () => {
    if (els.smsDialog instanceof HTMLDialogElement) {
      els.smsDialog.close();
    }
  });

  /**
   * @param {number} id
   */
  async function showSms(id) {
    if (!(els.smsDialog instanceof HTMLDialogElement)) {
      return;
    }
    setText(els.smsDialogTitle, `SMS #${id}`);
    setText(els.smsDialogMeta, "Loading…");
    setText(els.smsDialogBody, "");
    if (els.smsDialogAssign instanceof HTMLFormElement) {
      els.smsDialogAssign.hidden = true;
    }
    if (els.smsDialogAssignMeta) {
      els.smsDialogAssignMeta.hidden = true;
      els.smsDialogAssignMeta.textContent = "";
    }
    els.smsDialog.showModal();

    try {
      const res = await api(`/sms/${id}`);
      const sms = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(sms.message || `HTTP ${res.status}`);
      }
      const extracted =
        sms.extractedData && typeof sms.extractedData === "object"
          ? sms.extractedData
          : {};
      const event =
        sms.financialEvent && typeof sms.financialEvent === "object"
          ? sms.financialEvent
          : {};
      const amount = event.amount ?? extracted.amount;
      const merchant = event.merchant ?? extracted.merchant;
      const when = sms.receivedAt
        ? new Date(sms.receivedAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const bits = [
        sms.address,
        when,
        amount != null ? money.format(Number(amount)) : "",
        merchant ? String(merchant) : "",
      ].filter(Boolean);
      setText(els.smsDialogTitle, `SMS #${id}`);
      setText(els.smsDialogMeta, bits.join(" · "));
      setText(els.smsDialogBody, decodeSmsBody(sms.body) || "No SMS body.");

      const ctxRes = await api(`/merchants/sms/${id}`);
      if (ctxRes.ok) {
        renderSmsAssign(await ctxRes.json());
      }
    } catch (error) {
      setText(
        els.smsDialogMeta,
        error instanceof Error ? error.message : "Could not load SMS"
      );
    }
  }

  els.list?.addEventListener("click", async (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.dataset.smsMore) {
      try {
        await showMerchantSmsList(
          target.dataset.smsMore,
          target.dataset.smsLabel ?? target.dataset.smsMore
        );
      } catch (error) {
        setText(
          els.pageMeta,
          error instanceof Error ? error.message : "Could not load SMS list"
        );
      }
      return;
    }
    if (target instanceof HTMLButtonElement && target.dataset.sms) {
      const id = Number(target.dataset.sms);
      if (Number.isFinite(id) && id > 0) {
        await showSms(id);
      }
      return;
    }
    if (!(target instanceof HTMLButtonElement) || !target.dataset.apply) {
      return;
    }
    target.disabled = true;
    setText(els.pageMeta, "Updating Dhan…");
    try {
      await applyDhan(target.dataset.apply);
    } catch (error) {
      setText(
        els.pageMeta,
        error instanceof Error ? error.message : "Could not update Dhan"
      );
      target.disabled = false;
    }
  });

  els.smsDialogAssign?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  els.smsDialogAssign?.addEventListener("change", async (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLSelectElement) ||
      !(els.smsDialogAssign instanceof HTMLFormElement) ||
      !(els.smsDialogCategory instanceof HTMLSelectElement) ||
      !(els.smsDialogMerchant instanceof HTMLSelectElement)
    ) {
      return;
    }

    const smsId = Number(els.smsDialogAssign.dataset.smsId);
    if (!Number.isFinite(smsId) || smsId <= 0) {
      return;
    }

    els.smsDialogCategory.disabled = true;
    els.smsDialogMerchant.disabled = true;
    setText(els.smsDialogAssignMeta, "Saving…");
    if (els.smsDialogAssignMeta) {
      els.smsDialogAssignMeta.hidden = false;
    }

    try {
      const res = await api(`/merchants/sms/${smsId}`, {
        method: "PUT",
        body: JSON.stringify({
          category:
            els.smsDialogCategory.value === "" ? null : els.smsDialogCategory.value,
          merchantKey:
            els.smsDialogMerchant.value === "" ? null : els.smsDialogMerchant.value,
          applyToDhan:
            els.applyDhan instanceof HTMLInputElement && els.applyDhan.checked,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      if (body.sms) {
        renderSmsAssign(body.sms);
      }
      await load();
      showDhanResult(body.dhan);
      if (els.smsDialogAssignMeta) {
        els.smsDialogAssignMeta.hidden = false;
      }
      setText(els.smsDialogAssignMeta, "Saved — this SMS only.");
    } catch (error) {
      setText(
        els.smsDialogAssignMeta,
        error instanceof Error ? error.message : "Could not save"
      );
    } finally {
      els.smsDialogCategory.disabled = false;
      els.smsDialogMerchant.disabled = false;
    }
  });

  els.list?.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.dataset.assign) {
      return;
    }

    target.disabled = true;
    try {
      const dhan = await assign(
        target.dataset.assign,
        target.dataset.label ?? "",
        target.value
      );
      await load();
      showDhanResult(dhan);
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
