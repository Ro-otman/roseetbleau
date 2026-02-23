(() => {
  if (typeof window === "undefined" || typeof window.io !== "function") {
    return;
  }

  const socket = window.io({
    transports: ["websocket", "polling"],
  });

  window.adminSocket = socket;

  const dashboardRoot = document.querySelector("[data-admin-dashboard]");
  const dashboardApi = dashboardRoot?.getAttribute("data-dashboard-api") || "";
  const updatedAtNode =
    dashboardRoot?.querySelector("[data-dashboard-updated-at]") || null;
  const weeklyChartNode =
    dashboardRoot?.querySelector("[data-dashboard-weekly-chart]") || null;
  const distributionNode =
    dashboardRoot?.querySelector("[data-dashboard-distribution]") || null;
  const recentOrdersNode =
    dashboardRoot?.querySelector("[data-dashboard-recent-orders]") || null;

  const productsRoot = document.querySelector("[data-admin-products]");
  const productsApi = productsRoot?.getAttribute("data-products-api") || "";
  const productsUpdatedAtNode =
    productsRoot?.querySelector("[data-products-updated-at]") || null;
  const productsGridNode =
    productsRoot?.querySelector("[data-products-grid]") || null;
  const productsTotalNode =
    productsRoot?.querySelector("[data-products-total]") || null;
  const productsActiveNode =
    productsRoot?.querySelector("[data-products-active]") || null;
  const productsWatchNode =
    productsRoot?.querySelector("[data-products-watch]") || null;
  const productsFilteredCountNode =
    productsRoot?.querySelector("[data-products-filtered-count]") || null;
  const productsSearchInput =
    productsRoot?.querySelector("[data-products-search-input]") || null;
  const productsFilterLinks = Array.from(
    productsRoot?.querySelectorAll("[data-products-filter-link]") || [],
  );

  const ordersRoot = document.querySelector("[data-admin-orders]");
  const ordersApi = ordersRoot?.getAttribute("data-orders-api") || "";
  const ordersUpdatedAtNode =
    ordersRoot?.querySelector("[data-orders-updated-at]") || null;
  const ordersFilteredCountNode =
    ordersRoot?.querySelector("[data-orders-filtered-count]") || null;
  const ordersSearchInput =
    ordersRoot?.querySelector("[data-orders-search-input]") || null;
  const ordersFilterLinks = Array.from(
    ordersRoot?.querySelectorAll("[data-orders-filter-link]") || [],
  );
  const ordersTableBodyNode =
    ordersRoot?.querySelector("[data-orders-table-body]") || null;

  const usersRoot = document.querySelector("[data-admin-users]");
  const usersApi = usersRoot?.getAttribute("data-users-api") || "";
  const usersUpdatedAtNode =
    usersRoot?.querySelector("[data-users-updated-at]") || null;
  const usersFilteredCountNode =
    usersRoot?.querySelector("[data-users-filtered-count]") || null;
  const usersSearchInput =
    usersRoot?.querySelector("[data-users-search-input]") || null;
  const usersFilterLinks = Array.from(
    usersRoot?.querySelectorAll("[data-users-filter-link]") || [],
  );
  const usersTableBodyNode =
    usersRoot?.querySelector("[data-users-table-body]") || null;

  const ALLOWED_STOCK_FILTERS = new Set(["all", "active", "low", "out"]);
  const ALLOWED_ORDER_FILTERS = new Set([
    "all",
    "review",
    "processing",
    "shipped",
  ]);
  const ALLOWED_USER_FILTERS = new Set(["all", "active", "watch", "blocked"]);

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  };

  const normalizeStockFilter = (value) => {
    const candidate = String(value ?? "")
      .trim()
      .toLowerCase();
    return ALLOWED_STOCK_FILTERS.has(candidate) ? candidate : "all";
  };

  const normalizeOrderFilter = (value) => {
    const candidate = String(value ?? "")
      .trim()
      .toLowerCase();
    return ALLOWED_ORDER_FILTERS.has(candidate) ? candidate : "all";
  };

  const normalizeUserFilter = (value) => {
    const candidate = String(value ?? "")
      .trim()
      .toLowerCase();
    return ALLOWED_USER_FILTERS.has(candidate) ? candidate : "all";
  };

  const normalizeSearchValue = (value) => {
    return String(value ?? "")
      .trim()
      .slice(0, 120);
  };

  const updateFilterLinks = (links, selected, normalizer) => {
    if (!Array.isArray(links) || !links.length) {
      return;
    }

    links.forEach((linkNode) => {
      const rawFilter =
        linkNode.getAttribute("data-products-filter-link") ||
        linkNode.getAttribute("data-orders-filter-link") ||
        linkNode.getAttribute("data-users-filter-link");
      const currentFilter = normalizer(rawFilter);
      const isActive = currentFilter === selected;

      linkNode.classList.toggle("is-active", isActive);
      if (isActive) {
        linkNode.setAttribute("aria-current", "page");
      } else {
        linkNode.removeAttribute("aria-current");
      }
    });
  };

  const updateKpis = (stats) => {
    if (!Array.isArray(stats)) {
      return;
    }

    stats.forEach((item) => {
      const key = String(item?.id || "").trim();
      if (!key) {
        return;
      }

      const valueNode = dashboardRoot?.querySelector(
        `[data-dashboard-kpi-value="${key}"]`,
      );
      const trendNode = dashboardRoot?.querySelector(
        `[data-dashboard-kpi-trend="${key}"]`,
      );
      const trendIconNode = dashboardRoot?.querySelector(
        `[data-dashboard-kpi-trend-icon="${key}"]`,
      );
      const trendWrap = trendNode?.closest(".admin-stat-card__trend");

      if (valueNode) {
        valueNode.textContent = String(item.value || "0");
      }

      if (trendNode) {
        trendNode.textContent = String(item.trend || "0%");
      }

      if (trendIconNode) {
        trendIconNode.className = `bx ${item.trendIcon || "bx-trending-up"}`;
      }

      if (trendWrap) {
        trendWrap.classList.toggle("is-down", item.trendTone === "down");
        trendWrap.classList.toggle("is-up", item.trendTone !== "down");
      }
    });
  };

  const renderWeeklyChart = (weeklyPerformance) => {
    if (!weeklyChartNode || !Array.isArray(weeklyPerformance)) {
      return;
    }

    const bars = weeklyPerformance
      .map((item) => {
        const height = Number(item?.height) || 18;
        const label = escapeHtml(item?.label || "");
        const valueLabel = escapeHtml(item?.valueLabel || "");
        return `<span style="--h: ${height}%" title="${label} - ${valueLabel}"></span>`;
      })
      .join("");

    weeklyChartNode.innerHTML = bars;
  };

  const renderDistribution = (distribution) => {
    if (!distributionNode || !Array.isArray(distribution)) {
      return;
    }

    distributionNode.innerHTML = distribution
      .map((item) => {
        const name = escapeHtml(item?.name || "Collection");
        const percent = Number(item?.percent) || 0;
        return `<li><span>${name}</span><strong>${percent}%</strong></li>`;
      })
      .join("");
  };

  const renderRecentOrders = (orders) => {
    if (!recentOrdersNode || !Array.isArray(orders)) {
      return;
    }

    if (!orders.length) {
      recentOrdersNode.innerHTML =
        '<tr><td colspan="4">Aucune commande recente pour le moment.</td></tr>';
      return;
    }

    recentOrdersNode.innerHTML = orders
      .map((item) => {
        const id = escapeHtml(item?.id || "-");
        const client = escapeHtml(item?.client || "Client");
        const amount = escapeHtml(item?.amount || "0 EUR");
        const status = escapeHtml(item?.status || "A verifier");
        const tone = escapeHtml(item?.tone || "warn");

        return `
          <tr>
            <td data-label="Commande">${id}</td>
            <td data-label="Client">${client}</td>
            <td data-label="Montant">${amount}</td>
            <td data-label="Statut"><span class="admin-badge admin-badge--${tone}">${status}</span></td>
          </tr>
        `;
      })
      .join("");
  };

  const applyDashboardSnapshot = (snapshot) => {
    if (!dashboardRoot || !snapshot || typeof snapshot !== "object") {
      return;
    }

    if (updatedAtNode) {
      const label = String(snapshot.generatedLabel || "").trim();
      updatedAtNode.textContent = label ? `Mise a jour: ${label}` : "";
    }

    updateKpis(snapshot.stats);
    renderWeeklyChart(snapshot.weeklyPerformance);
    renderDistribution(snapshot.categoryDistribution);
    renderRecentOrders(snapshot.recentOrders);
  };

  const fetchDashboardSnapshot = async () => {
    if (!dashboardRoot || !dashboardApi) {
      return;
    }

    try {
      const response = await fetch(dashboardApi, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload?.ok && payload?.snapshot) {
        applyDashboardSnapshot(payload.snapshot);
      }
    } catch (_error) {
      // Keep current values when refresh fails.
    }
  };

  const updateProductsFilterLinks = (stockFilter) => {
    updateFilterLinks(productsFilterLinks, stockFilter, normalizeStockFilter);
  };

  const renderProductCard = (item) => {
    const href = escapeHtml(item?.href || "/admin/produits");
    const image = escapeHtml(item?.image || "/images/hero-slide-1.svg");
    const name = escapeHtml(item?.name || "Produit");
    const status = escapeHtml(item?.status || "Actif");
    const tone = escapeHtml(item?.tone || "ok");
    const sku = escapeHtml(item?.sku || "-");
    const category = escapeHtml(item?.category || "Collection");
    const price = escapeHtml(item?.price || "0 EUR");
    const oldPrice = escapeHtml(item?.oldPrice || "");
    const stock = Number(item?.stock) || 0;
    const updated = escapeHtml(item?.updated || "Maj recente");
    const productId = Number(item?.id) || 0;

    return `
      <article class="admin-product-card">
        <a class="admin-product-card__media" href="${href}" aria-label="Modifier ${name}">
          <img src="${image}" alt="${name}" loading="lazy" />
          <span class="admin-badge admin-badge--${tone}">${status}</span>
          <span class="admin-product-card__sku">${sku}</span>
        </a>

        <div class="admin-product-card__body">
          <p class="admin-product-card__category">${category}</p>
          <h3 class="admin-product-card__name">${name}</h3>

          <div class="admin-product-card__prices">
            <span class="admin-product-card__price-current">${price}</span>
            ${
              oldPrice
                ? `<span class="admin-product-card__price-old">${oldPrice}</span>`
                : ""
            }
          </div>

          <div class="admin-product-card__stock">
            <span><strong>${stock}</strong> en stock</span>
            <span>${updated}</span>
          </div>

          <div class="admin-product-card__actions">
            <a href="${href}"><i class="bx bx-edit"></i><span>Modifier</span></a>
            <form
              action="/admin/produits/${productId}/delete"
              method="post"
              onsubmit="return window.confirm('Supprimer ce produit ? Cette action est irreversible.');"
            >
              <button type="submit"><i class="bx bx-trash"></i><span>Supprimer</span></button>
            </form>
          </div>
        </div>
      </article>
    `;
  };

  const renderProductsGrid = (products) => {
    if (!productsGridNode) {
      return;
    }

    if (!Array.isArray(products) || products.length === 0) {
      productsGridNode.innerHTML =
        '<p class="admin-products-empty" data-products-empty>Aucun produit pour ce filtre.</p>';
      return;
    }

    productsGridNode.innerHTML = products.map((item) => renderProductCard(item)).join("");
  };

  const setProductsRootFilters = (filters = {}) => {
    const q = normalizeSearchValue(filters.q);
    const stock = normalizeStockFilter(filters.stock);

    if (productsRoot) {
      productsRoot.setAttribute("data-products-filter-q", q);
      productsRoot.setAttribute("data-products-filter-stock", stock);
    }

    return { q, stock };
  };

  const buildProductsQuery = () => {
    if (!productsRoot) {
      return "";
    }

    const q = normalizeSearchValue(productsRoot.getAttribute("data-products-filter-q"));
    const stock = normalizeStockFilter(
      productsRoot.getAttribute("data-products-filter-stock"),
    );
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
    }
    if (stock !== "all") {
      params.set("stock", stock);
    }

    return params.toString();
  };

  const applyProductsOverview = (overview) => {
    if (!productsRoot || !overview || typeof overview !== "object") {
      return;
    }

    const filters = setProductsRootFilters(overview.filters || {});
    const summary = overview.summary || {};
    const products = Array.isArray(overview.products) ? overview.products : [];
    const generatedLabel = String(overview.generatedLabel || "").trim();

    if (productsTotalNode) {
      productsTotalNode.textContent = String(Number(summary.totalProducts) || 0);
    }

    if (productsActiveNode) {
      productsActiveNode.textContent = String(Number(summary.activeProducts) || 0);
    }

    if (productsWatchNode) {
      productsWatchNode.textContent = String(Number(summary.watchProducts) || 0);
    }

    if (productsFilteredCountNode) {
      productsFilteredCountNode.textContent = String(
        Number(summary.filteredProducts) || products.length || 0,
      );
    }

    if (productsUpdatedAtNode) {
      productsUpdatedAtNode.textContent = generatedLabel
        ? `Mise a jour: ${generatedLabel}`
        : "";
    }

    if (productsSearchInput) {
      productsSearchInput.value = filters.q;
    }

    updateProductsFilterLinks(filters.stock);
    renderProductsGrid(products);
  };

  const fetchProductsOverview = async () => {
    if (!productsRoot || !productsApi) {
      return;
    }

    const query = buildProductsQuery();
    const url = query ? `${productsApi}?${query}` : productsApi;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload?.ok && payload?.payload) {
        applyProductsOverview(payload.payload);
      }
    } catch (_error) {
      // Keep current values when refresh fails.
    }
  };

  const updateOrdersFilterLinks = (statusFilter) => {
    updateFilterLinks(ordersFilterLinks, statusFilter, normalizeOrderFilter);
  };

  const renderOrderRow = (item) => {
    const orderId = Number(item?.id) || 0;
    const orderNumber = escapeHtml(item?.orderNumber || "-");
    const customer = escapeHtml(item?.customer || "Client");
    const date = escapeHtml(item?.date || "-");
    const total = escapeHtml(item?.total || "0 EUR");
    const payment = escapeHtml(item?.payment || "-");
    const status = escapeHtml(item?.status || "A verifier");
    const tone = escapeHtml(item?.tone || "warn");
    const href = escapeHtml(item?.href || `/admin/orders/${orderId}`);
    const canUpdate = Boolean(item?.canUpdate && item?.nextStatus);
    const nextStatus = escapeHtml(item?.nextStatus || "");
    const nextStatusLabel = escapeHtml(item?.nextStatusLabel || "Mettre a jour");
    const returnTo = escapeHtml(
      `${window.location.pathname || "/admin/orders"}${window.location.search || ""}`,
    );
    const updateAction = canUpdate
      ? `
          <form action="/admin/orders/${orderId}/status" method="post">
            <input type="hidden" name="status" value="${nextStatus}" />
            <input type="hidden" name="returnTo" value="${returnTo}" />
            <button type="submit">Passer ${nextStatusLabel}</button>
          </form>
        `
      : '<button type="button" disabled>Finalisee</button>';

    return `
      <tr>
        <td data-label="Commande">${orderNumber}</td>
        <td data-label="Client">${customer}</td>
        <td data-label="Date">${date}</td>
        <td data-label="Total">${total}</td>
        <td data-label="Paiement">${payment}</td>
        <td data-label="Statut"><span class="admin-badge admin-badge--${tone}">${status}</span></td>
        <td data-label="Action">
          <div class="admin-row-actions">
            <a href="${href}">Details</a>
            ${updateAction}
          </div>
        </td>
      </tr>
    `;
  };

  const renderOrdersTable = (orders) => {
    if (!ordersTableBodyNode) {
      return;
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      ordersTableBodyNode.innerHTML =
        '<tr><td colspan="7">Aucune commande pour ce filtre.</td></tr>';
      return;
    }

    ordersTableBodyNode.innerHTML = orders.map((item) => renderOrderRow(item)).join("");
  };

  const setOrdersRootFilters = (filters = {}) => {
    const q = normalizeSearchValue(filters.q);
    const status = normalizeOrderFilter(filters.status);

    if (ordersRoot) {
      ordersRoot.setAttribute("data-orders-filter-q", q);
      ordersRoot.setAttribute("data-orders-filter-status", status);
    }

    return { q, status };
  };

  const buildOrdersQuery = () => {
    if (!ordersRoot) {
      return "";
    }

    const q = normalizeSearchValue(ordersRoot.getAttribute("data-orders-filter-q"));
    const status = normalizeOrderFilter(
      ordersRoot.getAttribute("data-orders-filter-status"),
    );
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
    }
    if (status !== "all") {
      params.set("status", status);
    }

    return params.toString();
  };

  const applyOrdersOverview = (overview) => {
    if (!ordersRoot || !overview || typeof overview !== "object") {
      return;
    }

    const filters = setOrdersRootFilters(overview.filters || {});
    const summary = overview.summary || {};
    const orders = Array.isArray(overview.orders) ? overview.orders : [];
    const generatedLabel = String(overview.generatedLabel || "").trim();

    if (ordersFilteredCountNode) {
      ordersFilteredCountNode.textContent = String(
        Number(summary.filteredOrders) || orders.length || 0,
      );
    }

    if (ordersUpdatedAtNode) {
      ordersUpdatedAtNode.textContent = generatedLabel
        ? `Mise a jour: ${generatedLabel}`
        : "";
    }

    if (ordersSearchInput) {
      ordersSearchInput.value = filters.q;
    }

    updateOrdersFilterLinks(filters.status);
    renderOrdersTable(orders);
  };

  const fetchOrdersOverview = async () => {
    if (!ordersRoot || !ordersApi) {
      return;
    }

    const query = buildOrdersQuery();
    const url = query ? `${ordersApi}?${query}` : ordersApi;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload?.ok && payload?.payload) {
        applyOrdersOverview(payload.payload);
      }
    } catch (_error) {
      // Keep current values when refresh fails.
    }
  };

  const updateUsersFilterLinks = (statusFilter) => {
    updateFilterLinks(usersFilterLinks, statusFilter, normalizeUserFilter);
  };

  const renderUserRow = (item) => {
    const userId = Number(item?.id) || 0;
    const name = escapeHtml(item?.name || "Client");
    const email = escapeHtml(item?.email || "-");
    const orders = Number(item?.orders) || 0;
    const spent = escapeHtml(item?.spent || "0 EUR");
    const status = escapeHtml(item?.status || "A verifier");
    const tone = escapeHtml(item?.tone || "warn");
    const href = escapeHtml(item?.href || `/admin/users/${userId}`);
    const canUpdate = Boolean(item?.canUpdate && item?.nextStatus);
    const nextStatus = escapeHtml(item?.nextStatus || "");
    const nextStatusLabel = escapeHtml(item?.nextStatusLabel || "Mettre a jour");
    const returnTo = escapeHtml(
      `${window.location.pathname || "/admin/users"}${window.location.search || ""}`,
    );
    const updateAction = canUpdate
      ? `
          <form action="/admin/users/${userId}/status" method="post">
            <input type="hidden" name="status" value="${nextStatus}" />
            <input type="hidden" name="returnTo" value="${returnTo}" />
            <button type="submit">${nextStatusLabel}</button>
          </form>
        `
      : '<button type="button" disabled>Bloque</button>';

    return `
      <tr>
        <td data-label="Nom">${name}</td>
        <td data-label="Email">${email}</td>
        <td data-label="Commandes">${orders}</td>
        <td data-label="Depenses">${spent}</td>
        <td data-label="Statut"><span class="admin-badge admin-badge--${tone}">${status}</span></td>
        <td data-label="Action">
          <div class="admin-row-actions">
            <a href="${href}">Profil</a>
            ${updateAction}
          </div>
        </td>
      </tr>
    `;
  };

  const renderUsersTable = (users) => {
    if (!usersTableBodyNode) {
      return;
    }

    if (!Array.isArray(users) || users.length === 0) {
      usersTableBodyNode.innerHTML =
        '<tr><td colspan="6">Aucun utilisateur pour ce filtre.</td></tr>';
      return;
    }

    usersTableBodyNode.innerHTML = users.map((item) => renderUserRow(item)).join("");
  };

  const setUsersRootFilters = (filters = {}) => {
    const q = normalizeSearchValue(filters.q);
    const status = normalizeUserFilter(filters.status);

    if (usersRoot) {
      usersRoot.setAttribute("data-users-filter-q", q);
      usersRoot.setAttribute("data-users-filter-status", status);
    }

    return { q, status };
  };

  const buildUsersQuery = () => {
    if (!usersRoot) {
      return "";
    }

    const q = normalizeSearchValue(usersRoot.getAttribute("data-users-filter-q"));
    const status = normalizeUserFilter(
      usersRoot.getAttribute("data-users-filter-status"),
    );
    const params = new URLSearchParams();

    if (q) {
      params.set("q", q);
    }
    if (status !== "all") {
      params.set("status", status);
    }

    return params.toString();
  };

  const applyUsersOverview = (overview) => {
    if (!usersRoot || !overview || typeof overview !== "object") {
      return;
    }

    const filters = setUsersRootFilters(overview.filters || {});
    const summary = overview.summary || {};
    const users = Array.isArray(overview.users) ? overview.users : [];
    const generatedLabel = String(overview.generatedLabel || "").trim();

    if (usersFilteredCountNode) {
      usersFilteredCountNode.textContent = String(
        Number(summary.filteredUsers) || users.length || 0,
      );
    }

    if (usersUpdatedAtNode) {
      usersUpdatedAtNode.textContent = generatedLabel
        ? `Mise a jour: ${generatedLabel}`
        : "";
    }

    if (usersSearchInput) {
      usersSearchInput.value = filters.q;
    }

    updateUsersFilterLinks(filters.status);
    renderUsersTable(users);
  };

  const fetchUsersOverview = async () => {
    if (!usersRoot || !usersApi) {
      return;
    }

    const query = buildUsersQuery();
    const url = query ? `${usersApi}?${query}` : usersApi;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload?.ok && payload?.payload) {
        applyUsersOverview(payload.payload);
      }
    } catch (_error) {
      // Keep current values when refresh fails.
    }
  };

  socket.on("connect", () => {
    document.documentElement.setAttribute("data-admin-socket", "connected");
    void fetchDashboardSnapshot();
    void fetchProductsOverview();
    void fetchOrdersOverview();
    void fetchUsersOverview();
  });

  socket.on("disconnect", () => {
    document.documentElement.setAttribute("data-admin-socket", "disconnected");
  });

  socket.on("admin:stats:update", (snapshot) => {
    applyDashboardSnapshot(snapshot);
  });

  socket.on("admin:products:created", () => {
    void fetchProductsOverview();
  });

  socket.on("admin:products:updated", () => {
    void fetchProductsOverview();
  });

  socket.on("admin:products:deleted", () => {
    void fetchProductsOverview();
  });

  socket.on("admin:orders:updated", () => {
    void fetchOrdersOverview();
  });

  socket.on("admin:users:updated", () => {
    void fetchUsersOverview();
  });

  if (dashboardRoot) {
    void fetchDashboardSnapshot();

    window.setInterval(() => {
      if (!socket.connected) {
        void fetchDashboardSnapshot();
      }
    }, 15000);
  }

  if (productsRoot) {
    void fetchProductsOverview();

    window.setInterval(() => {
      if (!socket.connected) {
        void fetchProductsOverview();
      }
    }, 15000);
  }

  if (ordersRoot) {
    void fetchOrdersOverview();

    window.setInterval(() => {
      if (!socket.connected) {
        void fetchOrdersOverview();
      }
    }, 15000);
  }

  if (usersRoot) {
    void fetchUsersOverview();

    window.setInterval(() => {
      if (!socket.connected) {
        void fetchUsersOverview();
      }
    }, 15000);
  }
})();
