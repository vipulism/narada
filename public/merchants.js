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
    sort: document.getElementById("sort"),
    refresh: document.getElementById("refresh"),
    resetView: document.getElementById("reset-view"),
    applyDhan: document.getElementById("apply-dhan"),
    applyAll: document.getElementById("apply-all"),
    bucketList: document.getElementById("bucket-list"),
    bucketMeta: document.getElementById("bucket-meta"),
    bucketForm: document.getElementById("bucket-form"),
    bucketLabel: document.getElementById("bucket-label"),
    smsDialog: document.getElementById("sms-dialog"),
    smsDialogTitle: document.getElementById("sms-dialog-title"),
    smsDialogMeta: document.getElementById("sms-dialog-meta"),
    smsDialogAssign: document.getElementById("sms-dialog-assign"),
    smsDialogCategory: document.getElementById("sms-dialog-category"),
    smsDialogMerchant: document.getElementById("sms-dialog-merchant"),
    smsDialogDhan: document.getElementById("sms-dialog-dhan"),
    smsDialogApply: document.getElementById("sms-dialog-apply"),
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
    sort: "lastSeen",
    page: 1,
  };

  const smsListState = {
    key: "",
    label: "",
    page: 1,
    total: 0,
  };

  /** @type {Array<{ key: string, label: string, custom?: boolean }>} */
  let buckets = [];

  /** @type {Array<{ key: string, label: string }>} */
  let catalogMerchants = [];

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
    const sort = params.get("sort");
    view.sort =
      sort === "amount" || sort === "name" || sort === "open" ? sort : "lastSeen";
    const page = Number(params.get("page") ?? 1);
    view.page = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

    if (els.query instanceof HTMLInputElement) {
      els.query.value = view.q;
    }
    if (els.status instanceof HTMLSelectElement) {
      els.status.value = view.status;
    }
    if (els.sort instanceof HTMLSelectElement) {
      els.sort.value = view.sort;
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
    if (view.sort !== "lastSeen") {
      params.set("sort", view.sort);
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
   * @param {string} key
   * @param {Array<{ key: string, label: string }>} options
   * @returns {string}
   */
  function mergeSelect(key, options) {
    return [
      `<option value="">Keep separate / merge into…</option>`,
      ...options
        .filter((row) => row.key !== key)
        .map(
          (row) =>
            `<option value="${escapeHtml(row.key)}">${escapeHtml(row.label)}</option>`
        ),
    ].join("");
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
    if (els.smsDialogDhan) {
      els.smsDialogDhan.hidden = false;
    }
    if (els.smsDialogApply instanceof HTMLButtonElement) {
      els.smsDialogApply.disabled = false;
    }
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
          <label class="merchant-name-field">
            <span class="sr-only">Display name for ${escapeHtml(item.label)}</span>
            <input
              class="merchant-name"
              data-rename="${escapeHtml(item.key)}"
              value="${escapeHtml(item.label)}"
              autocomplete="off"
            />
          </label>
          <label class="merchant-merge">
            <span class="sr-only">Merge ${escapeHtml(item.label)} into</span>
            <select data-merge="${escapeHtml(item.key)}">
              ${mergeSelect(item.key, catalogMerchants)}
            </select>
          </label>
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
    catalogMerchants = payload.merchants ?? catalogMerchants;
    renderBuckets(buckets);

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

  /**
   * @param {Array<{ key: string, label: string, custom?: boolean }>} options
   */
  function renderBuckets(options) {
    const builtin = options.filter((row) => !row.custom);
    const custom = options.filter((row) => row.custom);
    const chips = [
      ...builtin.map(
        (row) => `<li class="bucket-chip">${escapeHtml(row.label)}</li>`
      ),
      ...custom.map(
        (row) =>
          `<li class="bucket-chip bucket-chip-custom">
            <span>${escapeHtml(row.label)}</span>
            <button type="button" class="bucket-delete" data-bucket-delete="${escapeHtml(
              row.key
            )}" aria-label="Remove ${escapeHtml(row.label)}">Remove</button>
          </li>`
      ),
    ].join("");
    setHtml(els.bucketList, `<ul class="bucket-chips">${chips}</ul>`);
    setText(
      els.bucketMeta,
      custom.length
        ? `${custom.length} extra bucket${custom.length === 1 ? "" : "s"}`
        : "built-in only — add your own below"
    );
  }

  async function load() {
    const params = new URLSearchParams({
      status: view.status,
      sort: view.sort,
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
   * @param {string} key
   * @param {string} label
   */
  async function rename(key, label) {
    const res = await api("/merchants", {
      method: "PUT",
      body: JSON.stringify({ key, label }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
  }

  /**
   * @param {string} key
   * @param {string} mergeInto
   */
  async function mergeInto(key, mergeInto) {
    const res = await api("/merchants", {
      method: "PUT",
      body: JSON.stringify({
        key,
        mergeInto,
        applyToDhan:
          els.applyDhan instanceof HTMLInputElement && els.applyDhan.checked,
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

  els.sort?.addEventListener("change", () => {
    if (!(els.sort instanceof HTMLSelectElement)) {
      return;
    }
    view.sort = els.sort.value;
    view.page = 1;
    writeUrl();
    load();
  });

  els.resetView?.addEventListener("click", () => {
    view.q = "";
    view.status = "uncategorized";
    view.sort = "lastSeen";
    view.page = 1;
    if (els.query instanceof HTMLInputElement) {
      els.query.value = "";
    }
    if (els.status instanceof HTMLSelectElement) {
      els.status.value = view.status;
    }
    if (els.sort instanceof HTMLSelectElement) {
      els.sort.value = view.sort;
    }
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

  els.bucketForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(els.bucketLabel instanceof HTMLInputElement)) {
      return;
    }
    const label = els.bucketLabel.value.replace(/\s+/g, " ").trim();
    if (!label) {
      return;
    }
    const submit =
      els.bucketForm instanceof HTMLFormElement
        ? els.bucketForm.querySelector("button[type='submit']")
        : null;
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = true;
    }
    setText(els.bucketMeta, "Saving…");
    try {
      const res = await api("/merchants/buckets", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      els.bucketLabel.value = "";
      if (body.buckets) {
        buckets = body.buckets;
        renderBuckets(buckets);
      }
      await load();
    } catch (error) {
      setText(
        els.bucketMeta,
        error instanceof Error ? error.message : "Could not add bucket"
      );
    } finally {
      if (submit instanceof HTMLButtonElement) {
        submit.disabled = false;
      }
    }
  });

  els.bucketList?.addEventListener("click", async (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest("button[data-bucket-delete]")
        : null;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.bucketDelete) {
      return;
    }
    target.disabled = true;
    setText(els.bucketMeta, "Removing…");
    try {
      const res = await api(
        `/merchants/buckets/${encodeURIComponent(target.dataset.bucketDelete)}`,
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      if (body.buckets) {
        buckets = body.buckets;
        renderBuckets(buckets);
      }
      await load();
    } catch (error) {
      setText(
        els.bucketMeta,
        error instanceof Error ? error.message : "Could not remove bucket"
      );
      target.disabled = false;
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

  els.smsDialogApply?.addEventListener("click", async () => {
    if (
      !(els.smsDialogAssign instanceof HTMLFormElement) ||
      !(els.smsDialogApply instanceof HTMLButtonElement)
    ) {
      return;
    }

    const smsId = Number(els.smsDialogAssign.dataset.smsId);
    if (!Number.isFinite(smsId) || smsId <= 0) {
      return;
    }

    els.smsDialogApply.disabled = true;
    setText(els.smsDialogAssignMeta, "Updating Dhan…");
    if (els.smsDialogAssignMeta) {
      els.smsDialogAssignMeta.hidden = false;
    }

    try {
      const res = await api("/merchants/apply", {
        method: "POST",
        body: JSON.stringify({ smsId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      showDhanResult(body.dhan);
      if (body.dhan?.skipped) {
        setText(
          els.smsDialogAssignMeta,
          `Dhan skipped — ${body.dhan.reason || "not configured"}`
        );
        return;
      }
      const updated = Number(body.dhan?.updated ?? 0);
      setText(
        els.smsDialogAssignMeta,
        updated ? "Applied this SMS in Dhan." : "Dhan did not update this SMS."
      );
    } catch (error) {
      setText(
        els.smsDialogAssignMeta,
        error instanceof Error ? error.message : "Could not apply in Dhan"
      );
    } finally {
      els.smsDialogApply.disabled = false;
    }
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
    if (target instanceof HTMLSelectElement && target.dataset.merge) {
      if (!target.value) {
        return;
      }
      target.disabled = true;
      try {
        const dhan = await mergeInto(target.dataset.merge, target.value);
        await load();
        showDhanResult(dhan);
      } catch (error) {
        setText(
          els.pageMeta,
          error instanceof Error ? error.message : "Could not merge merchants"
        );
        target.disabled = false;
      }
      return;
    }
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

  els.list?.addEventListener("focusout", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.rename) {
      return;
    }

    const next = target.value.replace(/\s+/g, " ").trim();
    if (!next || next === target.defaultValue) {
      target.value = target.defaultValue;
      return;
    }

    target.disabled = true;
    try {
      await rename(target.dataset.rename, next);
      await load();
    } catch (error) {
      setText(
        els.pageMeta,
        error instanceof Error ? error.message : "Could not rename merchant"
      );
      target.value = target.defaultValue;
      target.disabled = false;
    }
  });

  els.list?.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      event.key === "Enter" &&
      target instanceof HTMLInputElement &&
      target.dataset.rename
    ) {
      event.preventDefault();
      target.blur();
    }
  });

  readUrl();
  writeUrl();
  load();
})();
