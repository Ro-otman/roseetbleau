(() => {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const loaderStart = performance.now();

  const setupHeaderOffset = () => {
    const header = document.querySelector(".site-header");
    if (!header) {
      return;
    }

    const updateOffset = () => {
      const height = Math.max(
        0,
        Math.ceil(header.getBoundingClientRect().height),
      );
      document.documentElement.style.setProperty(
        "--site-header-offset",
        `${height}px`,
      );
    };

    updateOffset();
    window.addEventListener("resize", updateOffset);
    window.addEventListener("orientationchange", updateOffset);

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateOffset);
      resizeObserver.observe(header);
    }
  };

  const setupUserMenu = () => {
    const userMenu = document.querySelector("[data-user-menu]");
    if (!userMenu) {
      return;
    }

    const toggle = userMenu.querySelector("[data-user-menu-toggle]");
    const panel = userMenu.querySelector("[data-user-menu-panel]");
    if (!toggle || !panel) {
      return;
    }

    const setOpen = (open) => {
      userMenu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      setOpen(!userMenu.classList.contains("is-open"));
    });

    document.addEventListener("click", (event) => {
      if (!userMenu.classList.contains("is-open")) {
        return;
      }

      if (!userMenu.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && userMenu.classList.contains("is-open")) {
        setOpen(false);
      }
    });
  };

  const setupSiteLoader = () => {
    const loader = document.querySelector("[data-site-loader]");

    if (!loader) {
      document.body?.classList.remove("is-loading");
      return;
    }

    const minVisibleMs = prefersReducedMotion ? 0 : 520;

    const hideLoader = () => {
      const elapsed = performance.now() - loaderStart;
      const remaining = Math.max(0, minVisibleMs - elapsed);

      window.setTimeout(() => {
        loader.classList.add("is-hidden");
        document.body?.classList.remove("is-loading");

        if (prefersReducedMotion) {
          loader.remove();
          return;
        }

        loader.addEventListener(
          "transitionend",
          () => {
            loader.remove();
          },
          { once: true },
        );

        window.setTimeout(() => {
          if (document.body.contains(loader)) {
            loader.remove();
          }
        }, 800);
      }, remaining);
    };

    if (document.readyState === "complete") {
      hideLoader();
      return;
    }

    window.addEventListener("load", hideLoader, { once: true });
  };

  const setupMobileSearchToggle = () => {
    const toggleButtons = Array.from(
      document.querySelectorAll("[data-mobile-search-toggle]"),
    );
    const searchForm = document.querySelector("[data-header-search]");

    if (!toggleButtons.length || !searchForm) {
      return;
    }

    const searchInput = searchForm.querySelector("input[type='search']");
    const mobileMediaQuery = window.matchMedia("(max-width: 900px)");

    const setOpen = (open) => {
      searchForm.classList.toggle("is-open", open);
      document.body.classList.toggle(
        "mobile-search-open",
        open && mobileMediaQuery.matches,
      );
      toggleButtons.forEach((button) => {
        button.setAttribute("aria-expanded", String(open));
      });
    };

    const handleViewportChange = () => {
      const mobileActive = mobileMediaQuery.matches;
      document.body.classList.toggle("mobile-has-bottom-nav", mobileActive);
      if (!mobileActive) {
        setOpen(false);
      }
    };

    toggleButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();

        if (!mobileMediaQuery.matches) {
          return;
        }

        const shouldOpen = !searchForm.classList.contains("is-open");
        setOpen(shouldOpen);

        if (shouldOpen) {
          window.setTimeout(() => {
            searchInput?.focus();
          }, 10);
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (
        !mobileMediaQuery.matches ||
        !searchForm.classList.contains("is-open")
      ) {
        return;
      }

      const clickedInsideSearch = searchForm.contains(event.target);
      const clickedToggle = toggleButtons.some((button) =>
        button.contains(event.target),
      );

      if (!clickedInsideSearch && !clickedToggle) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && searchForm.classList.contains("is-open")) {
        setOpen(false);
      }
    });

    if (typeof mobileMediaQuery.addEventListener === "function") {
      mobileMediaQuery.addEventListener("change", handleViewportChange);
    } else if (typeof mobileMediaQuery.addListener === "function") {
      mobileMediaQuery.addListener(handleViewportChange);
    }

    handleViewportChange();
  };

  const setupShopMobileFilters = () => {
    const toggleButtons = Array.from(
      document.querySelectorAll("[data-shop-filter-toggle]"),
    );
    const filterPanel = document.querySelector("[data-shop-filters]");

    if (!toggleButtons.length || !filterPanel) {
      return;
    }

    const mobileMediaQuery = window.matchMedia("(max-width: 900px)");

    const setOpen = (open) => {
      filterPanel.classList.toggle("is-open", open);
      toggleButtons.forEach((button) => {
        button.setAttribute("aria-expanded", String(open));
      });
    };

    const handleViewportChange = () => {
      if (!mobileMediaQuery.matches) {
        setOpen(false);
      }
    };

    toggleButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();

        if (!mobileMediaQuery.matches) {
          return;
        }

        setOpen(!filterPanel.classList.contains("is-open"));
      });
    });

    document.addEventListener("click", (event) => {
      if (!mobileMediaQuery.matches || !filterPanel.classList.contains("is-open")) {
        return;
      }

      const clickedInsidePanel = filterPanel.contains(event.target);
      const clickedToggle = toggleButtons.some((button) =>
        button.contains(event.target),
      );

      if (!clickedInsidePanel && !clickedToggle) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && filterPanel.classList.contains("is-open")) {
        setOpen(false);
      }
    });

    filterPanel.addEventListener("click", (event) => {
      const clickedLink = event.target.closest("a");
      if (clickedLink && mobileMediaQuery.matches) {
        setOpen(false);
      }
    });

    if (typeof mobileMediaQuery.addEventListener === "function") {
      mobileMediaQuery.addEventListener("change", handleViewportChange);
    } else if (typeof mobileMediaQuery.addListener === "function") {
      mobileMediaQuery.addListener(handleViewportChange);
    }

    handleViewportChange();
  };

  const setupCarousel = (carousel) => {
    const track = carousel.querySelector("[data-carousel-track]");
    const slides = Array.from(
      carousel.querySelectorAll("[data-carousel-slide]"),
    );
    const prevButton = carousel.querySelector("[data-carousel-prev]");
    const nextButton = carousel.querySelector("[data-carousel-next]");
    const dots = Array.from(carousel.querySelectorAll("[data-carousel-dot]"));

    if (!track || slides.length < 2) {
      return;
    }

    const intervalMs = Number(carousel.dataset.interval) || 5000;
    let currentIndex = 0;
    let autoplayTimer = null;

    const normalizeIndex = (index) => {
      const length = slides.length;
      return ((index % length) + length) % length;
    };

    const updateUI = (index) => {
      currentIndex = normalizeIndex(index);
      track.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;

      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === currentIndex;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });

      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === currentIndex;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-current", active ? "true" : "false");
      });
    };

    const nextSlide = () => updateUI(currentIndex + 1);
    const prevSlide = () => updateUI(currentIndex - 1);

    const stopAutoplay = () => {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    };

    const startAutoplay = () => {
      if (prefersReducedMotion) {
        return;
      }
      stopAutoplay();
      autoplayTimer = window.setInterval(nextSlide, intervalMs);
    };

    prevButton?.addEventListener("click", () => {
      prevSlide();
      startAutoplay();
    });

    nextButton?.addEventListener("click", () => {
      nextSlide();
      startAutoplay();
    });

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const dotIndex = Number(dot.dataset.carouselDot);
        if (!Number.isNaN(dotIndex)) {
          updateUI(dotIndex);
          startAutoplay();
        }
      });
    });

    carousel.addEventListener("mouseenter", stopAutoplay);
    carousel.addEventListener("mouseleave", startAutoplay);

    carousel.addEventListener("focusin", stopAutoplay);
    carousel.addEventListener("focusout", (event) => {
      if (!carousel.contains(event.relatedTarget)) {
        startAutoplay();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });

    updateUI(0);
    startAutoplay();
  };

  const setupDetailsGallery = () => {
    const galleryRoots = Array.from(
      document.querySelectorAll("[data-details-gallery]"),
    );

    galleryRoots.forEach((galleryRoot) => {
      const mainImage = galleryRoot.querySelector("[data-details-main-image]");
      const thumbs = Array.from(
        galleryRoot.querySelectorAll("[data-details-thumb]"),
      );

      if (!mainImage || thumbs.length < 2) {
        return;
      }

      const setActiveThumb = (activeThumb) => {
        const nextSrc = activeThumb.dataset.imageSrc;
        const nextAlt = activeThumb.dataset.imageAlt;

        if (nextSrc && mainImage.getAttribute("src") !== nextSrc) {
          mainImage.setAttribute("src", nextSrc);
        }

        if (typeof nextAlt === "string" && nextAlt.length > 0) {
          mainImage.setAttribute("alt", nextAlt);
        }

        thumbs.forEach((thumb) => {
          const isActive = thumb === activeThumb;
          thumb.classList.toggle("is-active", isActive);
          thumb.setAttribute("aria-current", isActive ? "true" : "false");
        });
      };

      const initialActiveThumb =
        thumbs.find((thumb) => thumb.classList.contains("is-active")) ||
        thumbs[0];
      setActiveThumb(initialActiveThumb);

      thumbs.forEach((thumb) => {
        thumb.addEventListener("click", (event) => {
          event.preventDefault();
          setActiveThumb(thumb);
        });
      });
    });
  };

  const setupFavoriteButtons = () => {
    const favoriteButtons = Array.from(
      document.querySelectorAll("[data-favorite-btn]"),
    );
    const isUserAuthenticated = document.body?.dataset.authUser === "true";

    const applyFavoriteVisualState = (button, isFavorite) => {
      button.setAttribute("aria-pressed", String(isFavorite));

      const icon = button.querySelector(".bx");
      if (icon) {
        icon.classList.toggle("bx-heart", !isFavorite);
        icon.classList.toggle("bxs-heart", isFavorite);
      }

      if (button.classList.contains("details-buy-card__wish")) {
        const textNode = button.querySelector("span");
        if (textNode) {
          textNode.textContent = isFavorite
            ? "Retirer des favoris"
            : "Ajouter aux favoris";
        }
      }
    };

    const animateFavoriteButton = (button) => {
      if (prefersReducedMotion) {
        return;
      }

      button.classList.remove("is-bouncing");
      void button.offsetWidth;
      button.classList.add("is-bouncing");
    };

    favoriteButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const productSlug = String(button.dataset.productSlug || "").trim();

        if (!productSlug) {
          const pressed = button.getAttribute("aria-pressed") === "true";
          applyFavoriteVisualState(button, !pressed);
          animateFavoriteButton(button);
          return;
        }

        if (!isUserAuthenticated) {
          window.location.href = "/login";
          return;
        }

        if (button.dataset.favoriteBusy === "true") {
          return;
        }

        button.dataset.favoriteBusy = "true";
        button.disabled = true;

        fetch("/favoris/toggle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ slug: productSlug }),
        })
          .then(async (response) => {
            const payload = await response.json().catch(() => null);

            if (response.status === 401) {
              window.location.href = "/login";
              return;
            }

            if (!response.ok || !payload?.ok) {
              throw new Error(payload?.message || "Erreur favoris");
            }

            const nextFavoriteState = Boolean(payload.isFavorite);
            applyFavoriteVisualState(button, nextFavoriteState);
            animateFavoriteButton(button);

            if (
              button.dataset.favoriteContext === "favoris" &&
              nextFavoriteState === false
            ) {
              window.location.reload();
            }
          })
          .catch((error) => {
            console.error("[FAVORIS] toggle error:", error);
          })
          .finally(() => {
            button.dataset.favoriteBusy = "false";
            button.disabled = false;
          });
      });

      button.addEventListener("animationend", () => {
        button.classList.remove("is-bouncing");
      });
    });
  };

  const setupDetailsPurchaseControls = () => {
    const buyCard = document.querySelector(".details-buy-card");
    if (!buyCard) {
      return;
    }

    const initToggleGroup = (selector) => {
      const buttons = Array.from(buyCard.querySelectorAll(selector));
      if (!buttons.length) {
        return;
      }

      const setActive = (activeButton) => {
        buttons.forEach((button) => {
          const isActive = button === activeButton;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
      };

      const initialActive =
        buttons.find((button) => button.classList.contains("is-active")) ||
        buttons[0];
      setActive(initialActive);

      buttons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          setActive(button);
        });
      });
    };

    initToggleGroup(".details-size");
    initToggleGroup(".details-color");

    const qtyRoot = buyCard.querySelector(".details-qty");
    if (!qtyRoot) {
      return;
    }

    const qtyButtons = Array.from(qtyRoot.querySelectorAll("button"));
    const qtyValueNode = qtyRoot.querySelector("span");
    if (qtyButtons.length < 2 || !qtyValueNode) {
      return;
    }

    const normalizeQty = (value) => {
      if (!Number.isFinite(value) || value < 1) {
        return 1;
      }
      return Math.min(99, Math.floor(value));
    };

    const readQty = () => {
      const parsed = Number.parseInt(qtyValueNode.textContent || "1", 10);
      return normalizeQty(parsed);
    };

    const writeQty = (nextQty) => {
      qtyValueNode.textContent = String(normalizeQty(nextQty));
    };

    qtyButtons[0].addEventListener("click", (event) => {
      event.preventDefault();
      writeQty(readQty() - 1);
    });

    qtyButtons[1].addEventListener("click", (event) => {
      event.preventDefault();
      writeQty(readQty() + 1);
    });
  };

  const CART_STORAGE_KEY = "rosebleu_cart_state_v1";
  const CART_STORAGE_VERSION = 1;
  const ORDER_HISTORY_STORAGE_KEY = "rosebleu_orders_history_v1";
  const CART_SHIPPING_FLAT_AMOUNT = 4.9;
  const CART_FREE_SHIPPING_THRESHOLD = 120;
  const CHECKOUT_PAYMENT_METHODS = new Set([
    "card",
    "mobile_money",
    "bank_transfer",
    "cash_on_delivery",
  ]);
  const CHECKOUT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CHECKOUT_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

  const normalizeCount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    return Math.floor(numeric);
  };

  const toMoney = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  };

  const formatEur = (value) => {
    const amount = toMoney(value);
    return `${amount.toFixed(2).replace(".", ",")} EUR`;
  };

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const readCartState = () => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.items)
      ) {
        return null;
      }

      return parsed;
    } catch (_error) {
      return null;
    }
  };

  const writeCartState = (state) => {
    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({
          version: CART_STORAGE_VERSION,
          items: Array.isArray(state?.items) ? state.items : [],
          totalQuantity: normalizeCount(state?.totalQuantity || 0),
          summary: state?.summary || null,
          updatedAt: Date.now(),
        }),
      );
    } catch (_error) {
      // Ignore storage errors.
    }
  };

  const readOrderHistory = () => {
    try {
      const raw = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const writeOrderHistory = (history) => {
    try {
      const safeHistory = Array.isArray(history) ? history.slice(0, 15) : [];
      window.localStorage.setItem(
        ORDER_HISTORY_STORAGE_KEY,
        JSON.stringify(safeHistory),
      );
    } catch (_error) {
      // Ignore storage errors.
    }
  };

  const rememberPlacedOrder = (order) => {
    const safeOrder = order && typeof order === "object" ? order : null;
    if (!safeOrder) {
      return;
    }

    const entry = {
      id: String(safeOrder.id || "").trim(),
      number: String(safeOrder.number || "").trim(),
      total: String(safeOrder.total || "").trim(),
      itemCount: normalizeCount(safeOrder.itemCount || 0),
      paymentMethod: String(safeOrder.paymentMethod || "").trim(),
      createdAt: Date.now(),
    };

    const previous = readOrderHistory().filter(
      (item) => String(item?.number || "").trim() !== entry.number,
    );
    writeOrderHistory([entry, ...previous]);
  };

  const renderCartCountBadges = (count) => {
    const cartCountNodes = Array.from(document.querySelectorAll("[data-cart-count]"));
    const normalizedCount = normalizeCount(count);
    const label = normalizedCount > 99 ? "99+" : String(normalizedCount);

    cartCountNodes.forEach((node) => {
      node.textContent = label;
      node.hidden = normalizedCount <= 0;
    });
  };

  const computeCartSummary = (items) => {
    const pricing = (Array.isArray(items) ? items : []).reduce(
      (acc, item) => {
        const qty = normalizeCount(item.qty || 0);
        const unit = toMoney(item.unitPriceValue);
        const oldUnit = toMoney(item.oldPriceValue);
        const lineCurrent = unit * qty;
        const lineDisplay = (oldUnit > unit ? oldUnit : unit) * qty;
        acc.currentSubtotal += lineCurrent;
        acc.displaySubtotal += lineDisplay;
        return acc;
      },
      { currentSubtotal: 0, displaySubtotal: 0 },
    );

    const discountRaw = Math.max(0, pricing.displaySubtotal - pricing.currentSubtotal);
    const shippingRaw =
      pricing.currentSubtotal > 0 &&
      pricing.currentSubtotal < CART_FREE_SHIPPING_THRESHOLD
        ? CART_SHIPPING_FLAT_AMOUNT
        : 0;
    const totalRaw = pricing.currentSubtotal + shippingRaw;

    return {
      subtotal: formatEur(pricing.displaySubtotal),
      discount: discountRaw > 0 ? `-${formatEur(discountRaw)}` : "0,00 EUR",
      shipping: shippingRaw > 0 ? formatEur(shippingRaw) : "Offerte",
      total: formatEur(totalRaw),
    };
  };

  const normalizeCartItem = (item, index = 0) => {
    const qty = normalizeCount(item?.qty || item?.quantity || 0);
    const unitPriceValue = toMoney(item?.unitPriceValue);
    const derivedOldUnit =
      qty > 0 ? toMoney(item?.lineCompareValue) / Math.max(1, qty) : 0;
    const oldPriceValue = toMoney(item?.oldPriceValue || derivedOldUnit);
    const maxQty = normalizeCount(item?.maxQty || 99) || 99;

    return {
      itemId: normalizeCount(item?.itemId || item?.id || 0),
      productId: normalizeCount(item?.productId || 0),
      slug: String(item?.slug || "").trim(),
      name: String(item?.name || "Produit Rose&Bleu").trim(),
      category: String(item?.category || "Collection").trim(),
      size: String(item?.size || "Unique").trim(),
      color: String(item?.color || "Standard").trim(),
      qty: qty || 1,
      unitPriceValue,
      oldPriceValue: oldPriceValue > unitPriceValue ? oldPriceValue : 0,
      maxQty,
      stock: String(item?.stock || "Disponible").trim(),
      badge: String(item?.badge || "Produit").trim(),
      sku: String(item?.sku || `RB-CART-${500 + index}`).trim(),
      href: String(item?.href || "/details").trim(),
      image: String(item?.image || "").trim(),
      palette: String(item?.palette || "rose").trim(),
    };
  };

  const setupCartCounter = () => {
    const addToCartButtons = Array.from(
      document.querySelectorAll("[data-add-to-cart]"),
    );

    const storedState = readCartState();
    if (storedState) {
      renderCartCountBadges(storedState.totalQuantity || 0);
    }

    const fetchCartCount = async () => {
      try {
        const response = await fetch("/cart/count", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => null);
        const nextCount = normalizeCount(payload?.cartCount || 0);
        renderCartCountBadges(nextCount);

        const currentState = readCartState();
        if (currentState) {
          currentState.totalQuantity = nextCount;
          writeCartState(currentState);
        } else {
          writeCartState({
            items: [],
            totalQuantity: nextCount,
            summary: null,
          });
        }
      } catch (_error) {
        // Silent failure: keep current UI state.
      }
    };

    const getDetailsAddPayload = (button) => {
      const buyCard = button.closest(".details-buy-card");
      if (!buyCard) {
        return {
          quantity: 1,
          size: "",
          color: "",
        };
      }

      const qtyNode = buyCard.querySelector(".details-qty span");
      const sizeButton = buyCard.querySelector(".details-size.is-active");
      const colorButton = buyCard.querySelector(".details-color.is-active");

      return {
        quantity: normalizeCount(
          Number.parseInt(qtyNode?.textContent || "1", 10),
        ) || 1,
        size: String(sizeButton?.textContent || "").trim(),
        color: String(colorButton?.getAttribute("aria-label") || "").trim(),
      };
    };

    addToCartButtons.forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.cartBusy === "true") {
          return;
        }

        const productSlug = String(button.dataset.productSlug || "").trim();
        const fallbackHref = String(button.getAttribute("href") || "/cart");
        if (!productSlug) {
          window.location.href = fallbackHref;
          return;
        }

        const addPayload = getDetailsAddPayload(button);
        const optimisticDelta = Math.max(
          1,
          normalizeCount(addPayload.quantity || 1),
        );
        const previousState = readCartState();
        const previousCount = normalizeCount(previousState?.totalQuantity || 0);
        const optimisticCount = previousCount + optimisticDelta;

        button.dataset.cartBusy = "true";
        button.setAttribute("aria-disabled", "true");

        renderCartCountBadges(optimisticCount);
        if (previousState) {
          previousState.totalQuantity = optimisticCount;
          writeCartState(previousState);
        } else {
          writeCartState({
            items: [],
            totalQuantity: optimisticCount,
            summary: null,
          });
        }

        try {
          const response = await fetch("/cart/add", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify({
              slug: productSlug,
              quantity: addPayload.quantity,
              size: addPayload.size,
              color: addPayload.color,
            }),
          });

          const payload = await response.json().catch(() => null);

          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.message || "Erreur panier");
          }

          const nextCount = normalizeCount(payload.cartCount || 0);
          renderCartCountBadges(nextCount);

          const currentState = readCartState();
          if (currentState) {
            currentState.totalQuantity = nextCount;
            writeCartState(currentState);
          } else {
            writeCartState({
              items: [],
              totalQuantity: nextCount,
              summary: null,
            });
          }

          window.dispatchEvent(new CustomEvent("rosebleu:cart-mutated"));
        } catch (error) {
          console.error("[CART] add error:", error);
          renderCartCountBadges(previousCount);
          if (previousState) {
            previousState.totalQuantity = previousCount;
            writeCartState(previousState);
          } else {
            writeCartState({
              items: [],
              totalQuantity: previousCount,
              summary: null,
            });
          }
          fetchCartCount();
        } finally {
          button.dataset.cartBusy = "false";
          button.removeAttribute("aria-disabled");
        }
      });
    });

    fetchCartCount();
  };

  const setupCartPageClient = () => {
    const cartPage = document.querySelector("[data-cart-page]");
    if (!cartPage) {
      return;
    }

    const cartListNode = cartPage.querySelector("[data-cart-list]");
    const clearButton = cartPage.querySelector("[data-cart-clear]");
    const summarySubtotalNode = cartPage.querySelector("[data-cart-summary-subtotal]");
    const summaryDiscountNode = cartPage.querySelector("[data-cart-summary-discount]");
    const summaryShippingNode = cartPage.querySelector("[data-cart-summary-shipping]");
    const summaryTotalNode = cartPage.querySelector("[data-cart-summary-total]");
    const totalQtyNodes = Array.from(cartPage.querySelectorAll("[data-cart-total-qty]"));
    const totalAmountNodes = Array.from(
      cartPage.querySelectorAll("[data-cart-total-amount]"),
    );
    const checkoutForm = cartPage.querySelector("[data-checkout-form]");
    const checkoutSubmitButton = cartPage.querySelector("[data-checkout-submit]");
    const checkoutFeedbackNode = cartPage.querySelector("[data-checkout-feedback]");
    const checkoutSuccessNode = cartPage.querySelector("[data-checkout-success]");
    const checkoutSuccessNumberNode = cartPage.querySelector(
      "[data-checkout-success-number]",
    );
    const checkoutSuccessTotalNode = cartPage.querySelector(
      "[data-checkout-success-total]",
    );

    if (!cartListNode) {
      return;
    }

    const setCheckoutFieldValidity = (fieldName, valid) => {
      if (!checkoutForm) {
        return;
      }

      const field = checkoutForm.querySelector(
        `[data-checkout-field="${fieldName}"]`,
      );
      if (!field) {
        return;
      }

      if (valid) {
        field.removeAttribute("aria-invalid");
      } else {
        field.setAttribute("aria-invalid", "true");
      }
    };

    const clearCheckoutValidationState = () => {
      if (!checkoutForm) {
        return;
      }

      checkoutForm
        .querySelectorAll("[data-checkout-field]")
        .forEach((field) => field.removeAttribute("aria-invalid"));
    };

    const hideCheckoutFeedback = () => {
      if (!checkoutFeedbackNode) {
        return;
      }

      checkoutFeedbackNode.hidden = true;
      checkoutFeedbackNode.classList.remove("is-error", "is-success", "is-info");
      checkoutFeedbackNode.innerHTML = "";
    };

    const showCheckoutFeedback = ({ tone = "info", title = "", message = "" } = {}) => {
      if (!checkoutFeedbackNode) {
        return;
      }

      const normalizedTone = ["error", "success"].includes(tone) ? tone : "info";
      checkoutFeedbackNode.classList.remove("is-error", "is-success", "is-info");
      checkoutFeedbackNode.classList.add(`is-${normalizedTone}`);
      checkoutFeedbackNode.innerHTML = `
        <strong>${escapeHtml(title || "Information")}</strong>
        <p>${escapeHtml(message || "")}</p>
      `;
      checkoutFeedbackNode.hidden = false;
    };

    const showCheckoutSuccess = (order) => {
      if (!checkoutSuccessNode) {
        return;
      }

      if (checkoutSuccessNumberNode) {
        checkoutSuccessNumberNode.textContent = String(order?.number || "-");
      }

      if (checkoutSuccessTotalNode) {
        checkoutSuccessTotalNode.textContent = String(order?.total || "-");
      }

      checkoutSuccessNode.hidden = false;
    };

    const setCheckoutBusy = (busy) => {
      if (!checkoutSubmitButton) {
        return;
      }

      checkoutSubmitButton.disabled = Boolean(busy);
      checkoutSubmitButton.dataset.checkoutBusy = busy ? "true" : "false";
    };

    const readCheckoutPayload = () => {
      if (!checkoutForm) {
        return null;
      }

      const formData = new FormData(checkoutForm);
      const payload = {
        fullName: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        line1: String(formData.get("line1") || "").trim(),
        line2: String(formData.get("line2") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        stateRegion: String(formData.get("stateRegion") || "").trim(),
        postalCode: String(formData.get("postalCode") || "").trim(),
        countryCode: String(formData.get("countryCode") || "").trim().toUpperCase(),
        paymentMethod: String(formData.get("paymentMethod") || "").trim().toLowerCase(),
        note: String(formData.get("note") || "").trim(),
      };

      return payload;
    };

    const validateCheckoutPayload = (payload) => {
      const fieldErrors = {};
      const phoneDigits = String(payload?.phone || "").replace(/[^\d]/g, "");

      if (String(payload?.fullName || "").length < 2) {
        fieldErrors.fullName = "Nom complet requis.";
      }
      if (!CHECKOUT_EMAIL_PATTERN.test(String(payload?.email || ""))) {
        fieldErrors.email = "Email invalide.";
      }
      if (phoneDigits.length < 6) {
        fieldErrors.phone = "Telephone invalide.";
      }
      if (String(payload?.line1 || "").length < 4) {
        fieldErrors.line1 = "Adresse de livraison requise.";
      }
      if (String(payload?.city || "").length < 2) {
        fieldErrors.city = "Ville requise.";
      }
      if (!CHECKOUT_COUNTRY_CODE_PATTERN.test(String(payload?.countryCode || ""))) {
        fieldErrors.countryCode = "Code pays invalide.";
      }
      if (!CHECKOUT_PAYMENT_METHODS.has(String(payload?.paymentMethod || ""))) {
        fieldErrors.paymentMethod = "Paiement invalide.";
      }

      return {
        ok: Object.keys(fieldErrors).length === 0,
        fieldErrors,
      };
    };

    const syncPlaceOrder = async (payload) => {
      const response = await fetch("/orders/place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      return { response, body };
    };

    const parseItemsFromDom = () => {
      return Array.from(cartListNode.querySelectorAll("[data-cart-item]")).map(
        (node, index) =>
          normalizeCartItem(
            {
              itemId: node.dataset.itemId,
              productId: node.dataset.productId,
              slug: node.dataset.productSlug,
              name: node.dataset.name,
              category: node.dataset.category,
              size: node.dataset.size,
              color: node.dataset.color,
              qty: node.dataset.qty,
              unitPriceValue: node.dataset.unitPriceValue,
              oldPriceValue: node.dataset.oldPriceValue,
              maxQty: node.dataset.maxQty,
              stock: node.dataset.stock,
              badge: node.dataset.badge,
              sku: node.dataset.sku,
              href: node.dataset.href,
              image: node.dataset.image,
              palette: node.dataset.palette,
            },
            index,
          ),
      );
    };

    const renderItemCard = (item) => {
      const qty = normalizeCount(item.qty);
      const unitPrice = formatEur(item.unitPriceValue);
      const oldPrice =
        item.oldPriceValue > item.unitPriceValue ? formatEur(item.oldPriceValue) : "";
      const lineTotal = formatEur(item.unitPriceValue * qty);
      const hasImage = Boolean(item.image);
      const canIncrease = qty < normalizeCount(item.maxQty);

      return `
        <article
          class="cart-item"
          data-cart-item
          data-item-id="${escapeHtml(item.itemId)}"
          data-product-id="${escapeHtml(item.productId)}"
          data-product-slug="${escapeHtml(item.slug)}"
          data-name="${escapeHtml(item.name)}"
          data-category="${escapeHtml(item.category)}"
          data-size="${escapeHtml(item.size)}"
          data-color="${escapeHtml(item.color)}"
          data-qty="${escapeHtml(qty)}"
          data-unit-price-value="${escapeHtml(item.unitPriceValue)}"
          data-old-price-value="${escapeHtml(item.oldPriceValue)}"
          data-max-qty="${escapeHtml(item.maxQty)}"
          data-stock="${escapeHtml(item.stock)}"
          data-badge="${escapeHtml(item.badge)}"
          data-sku="${escapeHtml(item.sku)}"
          data-href="${escapeHtml(item.href)}"
          data-image="${escapeHtml(item.image)}"
          data-palette="${escapeHtml(item.palette)}"
        >
          <a class="cart-item__media cart-item__media--${escapeHtml(item.palette)}${
            hasImage ? " has-image" : ""
          }" href="${escapeHtml(item.href)}">
            ${
              hasImage
                ? `<img class="cart-item__image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" />`
                : ""
            }
            <span class="cart-item__badge">${escapeHtml(item.badge)}</span>
            <span class="cart-item__sku">${escapeHtml(item.sku)}</span>
          </a>
          <div class="cart-item__body">
            <div class="cart-item__top">
              <p class="cart-item__category">${escapeHtml(item.category)}</p>
              <a class="cart-item__name" href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>
            </div>
            <ul class="cart-item__meta">
              <li><strong>Taille:</strong> <span>${escapeHtml(item.size)}</span></li>
              <li><strong>Couleur:</strong> <span>${escapeHtml(item.color)}</span></li>
              <li><strong>Etat:</strong> <span>${escapeHtml(item.stock)}</span></li>
            </ul>
            <div class="cart-item__controls">
              <div class="cart-qty" aria-label="Quantite ${escapeHtml(item.name)}">
                <button type="button" data-cart-dec aria-label="Diminuer la quantite">-</button>
                <span data-cart-qty>${escapeHtml(qty)}</span>
                <button type="button" data-cart-inc aria-label="Augmenter la quantite" ${
                  canIncrease ? "" : "disabled"
                }>+</button>
              </div>
              <div class="cart-item__links">
                <a href="/favoris">
                  <i class="bx bx-heart"></i>
                  <span>Mettre en favoris</span>
                </a>
                <button type="button" data-cart-remove>
                  <i class="bx bx-trash"></i>
                  <span>Supprimer</span>
                </button>
              </div>
            </div>
          </div>
          <div class="cart-item__pricing">
            <p class="cart-item__unit">Prix: <strong data-cart-unit-price>${escapeHtml(unitPrice)}</strong></p>
            ${
              oldPrice
                ? `<p class="cart-item__old" data-cart-old-price>${escapeHtml(oldPrice)}</p>`
                : ""
            }
            <p class="cart-item__total">Total: <strong data-cart-line-total>${escapeHtml(lineTotal)}</strong></p>
          </div>
        </article>
      `;
    };

    const renderEmpty = () => {
      cartListNode.innerHTML = `
        <article class="cart-items-empty" data-cart-empty>
          <p>Ton panier est vide pour le moment.</p>
          <a href="/shop">Explorer le catalogue</a>
        </article>
      `;
    };

    const renderState = (state) => {
      const items = Array.isArray(state?.items) ? state.items : [];
      const summary = computeCartSummary(items);
      const totalQuantity = items.reduce(
        (acc, item) => acc + normalizeCount(item.qty || 0),
        0,
      );

      if (!items.length) {
        renderEmpty();
      } else {
        cartListNode.innerHTML = items.map(renderItemCard).join("");
      }

      if (summarySubtotalNode) {
        summarySubtotalNode.textContent = summary.subtotal;
      }
      if (summaryDiscountNode) {
        summaryDiscountNode.textContent = summary.discount;
      }
      if (summaryShippingNode) {
        summaryShippingNode.textContent = summary.shipping;
      }
      if (summaryTotalNode) {
        summaryTotalNode.textContent = summary.total;
      }

      totalQtyNodes.forEach((node) => {
        node.textContent = String(totalQuantity);
      });
      totalAmountNodes.forEach((node) => {
        node.textContent = summary.total;
      });

      if (clearButton) {
        clearButton.hidden = !items.length;
      }

      if (checkoutForm) {
        checkoutForm.classList.toggle("is-disabled", !items.length);
      }

      if (checkoutSubmitButton && checkoutSubmitButton.dataset.checkoutBusy !== "true") {
        checkoutSubmitButton.disabled = !items.length;
      }

      if (checkoutSuccessNode && items.length > 0) {
        checkoutSuccessNode.hidden = true;
      }

      renderCartCountBadges(totalQuantity);
      writeCartState({
        items,
        totalQuantity,
        summary,
      });
    };

    const mapServerPayloadToState = (payload) => {
      return {
        items: (Array.isArray(payload?.cartItems) ? payload.cartItems : []).map(
          (item, index) => normalizeCartItem(item, index),
        ),
        totalQuantity: normalizeCount(payload?.cartTotalQuantity || payload?.cartCount || 0),
        summary: payload?.cartSummary || null,
      };
    };

    let cartState = { items: [] };

    const domItems = parseItemsFromDom();
    const storedState = readCartState();
    if (domItems.length) {
      cartState = { items: domItems };
    } else if (storedState?.items?.length) {
      cartState = {
        items: storedState.items.map((item, index) =>
          normalizeCartItem(item, index),
        ),
      };
    }

    renderState(cartState);

    const refreshFromServer = async () => {
      try {
        const response = await fetch("/cart/data", {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!payload?.ok) {
          return;
        }

        cartState = mapServerPayloadToState(payload);
        renderState(cartState);
      } catch (_error) {
        // Keep local state as fallback.
      }
    };

    const syncUpdateQuantity = async (itemId, quantity) => {
      const response = await fetch("/cart/item/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ itemId, quantity }),
      });

      if (!response.ok) {
        throw new Error("update_failed");
      }
    };

    const syncRemoveItem = async (itemId) => {
      const response = await fetch("/cart/item/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ itemId }),
      });

      if (!response.ok) {
        throw new Error("remove_failed");
      }
    };

    const syncClear = async () => {
      const response = await fetch("/cart/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("clear_failed");
      }
    };

    if (checkoutForm) {
      checkoutForm.addEventListener("input", (event) => {
        const field = event.target.closest("[data-checkout-field]");
        if (!field) {
          return;
        }

        field.removeAttribute("aria-invalid");
      });

      checkoutForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (checkoutSubmitButton?.dataset.checkoutBusy === "true") {
          return;
        }

        hideCheckoutFeedback();
        clearCheckoutValidationState();

        if (!Array.isArray(cartState.items) || cartState.items.length === 0) {
          showCheckoutFeedback({
            tone: "error",
            title: "Panier vide",
            message: "Ajoute au moins un article avant de confirmer la commande.",
          });
          return;
        }

        const checkoutPayload = readCheckoutPayload();
        const checkoutValidation = validateCheckoutPayload(checkoutPayload);

        if (!checkoutValidation.ok) {
          Object.keys(checkoutValidation.fieldErrors).forEach((fieldName) => {
            setCheckoutFieldValidity(fieldName, false);
          });

          showCheckoutFeedback({
            tone: "error",
            title: "Champs invalides",
            message: "Verifie les informations de livraison et de paiement.",
          });
          return;
        }

        setCheckoutBusy(true);

        try {
          const { response, body } = await syncPlaceOrder(checkoutPayload);

          if (!response.ok || !body?.ok) {
            const serverFieldErrors =
              body?.fieldErrors && typeof body.fieldErrors === "object"
                ? body.fieldErrors
                : {};

            Object.keys(serverFieldErrors).forEach((fieldName) => {
              setCheckoutFieldValidity(fieldName, false);
            });

            showCheckoutFeedback({
              tone: "error",
              title: "Commande non validee",
              message:
                String(body?.message || "").trim() ||
                "Impossible de finaliser la commande.",
            });
            return;
          }

          const order = body.order || {};
          rememberPlacedOrder(order);

          cartState = { items: [] };
          renderState(cartState);
          showCheckoutSuccess(order);

          showCheckoutFeedback({
            tone: "success",
            title: "Commande enregistree",
            message: `Commande ${String(order.number || "").trim()} creee avec succes.`,
          });

          window.dispatchEvent(new CustomEvent("rosebleu:cart-mutated"));
        } catch (error) {
          console.error("[CHECKOUT] place order error:", error);
          showCheckoutFeedback({
            tone: "error",
            title: "Erreur serveur",
            message: "Une erreur est survenue. Reessaie dans un instant.",
          });
        } finally {
          setCheckoutBusy(false);

          if (checkoutSubmitButton && (!cartState.items || !cartState.items.length)) {
            checkoutSubmitButton.disabled = true;
          }
        }
      });
    }

    cartPage.addEventListener("click", async (event) => {
      const clearTrigger = event.target.closest("[data-cart-clear]");
      if (clearTrigger) {
        event.preventDefault();
        const previousState = {
          items: Array.isArray(cartState.items) ? [...cartState.items] : [],
        };
        cartState = { items: [] };
        renderState(cartState);

        try {
          await syncClear();
          window.dispatchEvent(new CustomEvent("rosebleu:cart-mutated"));
        } catch (_error) {
          cartState = previousState;
          renderState(cartState);
          await refreshFromServer();
        }
        return;
      }

      const row = event.target.closest("[data-cart-item]");
      if (!row) {
        return;
      }

      const itemId = normalizeCount(
        Number.parseInt(row.dataset.itemId || "0", 10),
      );
      if (!itemId) {
        return;
      }

      const itemIndex = cartState.items.findIndex(
        (item) => normalizeCount(item.itemId) === itemId,
      );
      if (itemIndex < 0) {
        return;
      }

      if (event.target.closest("[data-cart-remove]")) {
        event.preventDefault();
        const previousItems = [...cartState.items];
        cartState.items = cartState.items.filter(
          (item) => normalizeCount(item.itemId) !== itemId,
        );
        renderState(cartState);

        try {
          await syncRemoveItem(itemId);
          window.dispatchEvent(new CustomEvent("rosebleu:cart-mutated"));
        } catch (_error) {
          cartState.items = previousItems;
          renderState(cartState);
          await refreshFromServer();
        }
        return;
      }

      const isDecrease = Boolean(event.target.closest("[data-cart-dec]"));
      const isIncrease = Boolean(event.target.closest("[data-cart-inc]"));
      if (!isDecrease && !isIncrease) {
        return;
      }

      event.preventDefault();

      const targetItem = { ...cartState.items[itemIndex] };
      const maxQty = normalizeCount(targetItem.maxQty || 99) || 99;
      const currentQty = normalizeCount(targetItem.qty || 0);
      const nextQty = isDecrease
        ? Math.max(0, currentQty - 1)
        : Math.min(maxQty, currentQty + 1);

      if (nextQty === currentQty) {
        return;
      }

      const previousItems = [...cartState.items];
      if (nextQty <= 0) {
        cartState.items = cartState.items.filter(
          (item) => normalizeCount(item.itemId) !== itemId,
        );
      } else {
        targetItem.qty = nextQty;
        cartState.items[itemIndex] = targetItem;
      }
      renderState(cartState);

      try {
        await syncUpdateQuantity(itemId, nextQty);
        window.dispatchEvent(new CustomEvent("rosebleu:cart-mutated"));
      } catch (_error) {
        cartState.items = previousItems;
        renderState(cartState);
        await refreshFromServer();
      }
    });

    window.addEventListener("rosebleu:cart-mutated", () => {
      refreshFromServer();
    });
  };

  document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
  setupFavoriteButtons();
  setupCartCounter();
  setupCartPageClient();
  setupDetailsPurchaseControls();
  setupDetailsGallery();
  setupMobileSearchToggle();
  setupShopMobileFilters();
  setupUserMenu();
  setupHeaderOffset();
  setupSiteLoader();
})();
