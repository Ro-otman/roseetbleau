import models from "../../models/models.js";

const createAdminPageHandler = (view, pageTitle, adminPageMeta = {}) => {
  return (req, res) => {
    const rawPath = `${req.baseUrl}${req.path === "/" ? "" : req.path}`;
    const currentAdminPath = rawPath || "/admin";

    return res.render(view, {
      layout: adminPageMeta.layout || "layouts/admin",
      pageTitle,
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath,
      adminPageTitle: adminPageMeta.title || "",
      adminPageLead: adminPageMeta.lead || "",
      adminIdentity: adminPageMeta.identity || null,
    });
  };
};

const adminControllers = {
  models,
  showDashboardPage: createAdminPageHandler(
    "pages/admins/dashboard",
    "Admin An’tifath | Rose&Bleu",
    {
      title: "An’tifath",
      identity: {
        showBadge: true,
      },
    }
  ),
  showProductsPage: createAdminPageHandler(
    "pages/admins/produits",
    "Admin Produits | Rose&Bleu",
    {
      title: "Produits",
      lead: "Gere le catalogue, le stock et les actions rapides.",
    }
  ),
  showAddProductPage: createAdminPageHandler(
    "pages/admins/ajoutproduit",
    "Admin Ajout Produit | Rose&Bleu",
    {
      title: "Ajouter un produit",
      lead: "Cree une nouvelle fiche produit complete.",
    }
  ),
  showUsersPage: createAdminPageHandler(
    "pages/admins/users",
    "Admin Utilisateurs | Rose&Bleu",
    {
      title: "Utilisateurs",
      lead: "Consulte les comptes clients et leur activite.",
    }
  ),
  showOrdersPage: createAdminPageHandler(
    "pages/admins/orders",
    "Admin Commandes | Rose&Bleu",
    {
      title: "Commandes",
      lead: "Suis les commandes, statuts et priorites du jour.",
    }
  ),
  showLoginPage: createAdminPageHandler(
    "pages/admins/login",
    "Admin Login | Rose&Bleu",
    {
      layout: "layouts/admin-auth",
    }
  ),
};

export default adminControllers;
