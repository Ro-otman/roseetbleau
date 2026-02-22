import { Router } from "express";
import adminControllers from "../../controllers/admins/adminControllers.js";
import productControllers from "../../controllers/admins/productControllers.js";

const adminsRouter = Router();

adminsRouter.get("/", adminControllers.showDashboardPage);
adminsRouter.get("/dashboard", adminControllers.showDashboardPage);
adminsRouter.get("/produits", adminControllers.showProductsPage);
adminsRouter.get("/ajoutproduit", productControllers.showAddProductPage);
adminsRouter.post(
  "/ajoutproduit",
  productControllers.uploadProductImages,
  productControllers.createProduct,
);
adminsRouter.get("/users", adminControllers.showUsersPage);
adminsRouter.get("/orders", adminControllers.showOrdersPage);
adminsRouter.get("/login", adminControllers.showLoginPage);

const adminsRoutes = {
  adminControllers,
  productControllers,
};

export default adminsRouter;
export { adminsRouter, adminsRoutes };
