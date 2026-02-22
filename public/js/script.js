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

  const setupFavoriteButtons = () => {
    const favoriteButtons = Array.from(
      document.querySelectorAll("[data-favorite-btn]"),
    );

    favoriteButtons.forEach((button) => {
      const icon = button.querySelector(".bx");

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const pressed = button.getAttribute("aria-pressed") === "true";
        const nextPressed = !pressed;

        button.setAttribute("aria-pressed", String(nextPressed));

        if (icon) {
          icon.classList.toggle("bx-heart", !nextPressed);
          icon.classList.toggle("bxs-heart", nextPressed);
        }

        if (prefersReducedMotion) {
          return;
        }

        button.classList.remove("is-bouncing");
        void button.offsetWidth;
        button.classList.add("is-bouncing");
      });

      button.addEventListener("animationend", () => {
        button.classList.remove("is-bouncing");
      });
    });
  };

  const setupCartCounter = () => {
    const cartCountNodes = Array.from(document.querySelectorAll("[data-cart-count]"));
    const addToCartButtons = Array.from(
      document.querySelectorAll("[data-add-to-cart]"),
    );

    if (!cartCountNodes.length && !addToCartButtons.length) {
      return;
    }

    const storageKey = "rosebleu_cart_count";

    const normalizeCount = (value) => {
      if (!Number.isFinite(value) || value < 0) {
        return 0;
      }
      return Math.floor(value);
    };

    const readCount = () => {
      try {
        const rawCount = window.localStorage.getItem(storageKey);
        const parsedCount = Number.parseInt(rawCount ?? "0", 10);
        return normalizeCount(parsedCount);
      } catch (error) {
        return 0;
      }
    };

    const writeCount = (count) => {
      try {
        window.localStorage.setItem(storageKey, String(normalizeCount(count)));
      } catch (error) {
        // Local storage can be unavailable in some browsing contexts.
      }
    };

    const renderCount = (count) => {
      const normalizedCount = normalizeCount(count);
      const label = normalizedCount > 99 ? "99+" : String(normalizedCount);

      cartCountNodes.forEach((node) => {
        node.textContent = label;
        node.hidden = normalizedCount <= 0;
      });
    };

    let cartCount = readCount();
    renderCount(cartCount);

    addToCartButtons.forEach((button) => {
      button.addEventListener("click", () => {
        cartCount = normalizeCount(cartCount + 1);
        writeCount(cartCount);
        renderCount(cartCount);
      });
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey) {
        return;
      }

      cartCount = readCount();
      renderCount(cartCount);
    });
  };

  document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
  setupFavoriteButtons();
  setupCartCounter();
  setupMobileSearchToggle();
  setupShopMobileFilters();
  setupUserMenu();
  setupHeaderOffset();
  setupSiteLoader();
})();
