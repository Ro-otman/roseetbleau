const createPageHandler = (view, pageTitle, pageStylesheet) => {
  return (_req, res) => {
    return res.render(view, {
      pageTitle,
      pageStylesheet,
      currentPath: _req.path,
    });
  };
};

const authControllers = {
  showIndexPage: createPageHandler(
    "pages/users/index",
    "Accueil | Rose&Bleu",
    "/css/pages/index.css"
  ),
  showShopPage: createPageHandler(
    "pages/users/shop",
    "Shop | Rose&Bleu",
    "/css/pages/shop.css"
  ),
  showAboutPage: createPageHandler(
    "pages/users/about",
    "About | Rose&Bleu",
    "/css/pages/about.css"
  ),
  showFaqPage: createPageHandler(
    "pages/users/faq",
    "FAQ | Rose&Bleu",
    "/css/pages/faq.css"
  ),
  showFavorisPage: createPageHandler(
    "pages/users/favoris",
    "Favoris | Rose&Bleu",
    "/css/pages/favoris.css"
  ),
  showDetailsPage: createPageHandler(
    "pages/users/details",
    "Details | Rose&Bleu",
    "/css/pages/details.css"
  ),
  showLoginPage: createPageHandler(
    "pages/users/login",
    "Connexion | Rose&Bleu",
    "/css/pages/login.css"
  ),
  showSignupPage: createPageHandler(
    "pages/users/signup",
    "Inscription | Rose&Bleu",
    "/css/pages/signup.css"
  ),
  showCartPage: createPageHandler(
    "pages/users/cart",
    "Panier | Rose&Bleu",
    "/css/pages/cart.css"
  ),
};

export default authControllers;
