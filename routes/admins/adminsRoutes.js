import { Router } from "express";
import adminControllers from "../../controllers/admins/adminControllers.js";

const adminsRouter = Router();

adminsRouter.get("/", adminControllers.showDashboardPage);
adminsRouter.get("/dashboard", adminControllers.showDashboardPage);
adminsRouter.get("/produits", adminControllers.showProductsPage);
adminsRouter.get("/ajoutproduit", adminControllers.showAddProductPage);
adminsRouter.get("/users", adminControllers.showUsersPage);
adminsRouter.get("/orders", adminControllers.showOrdersPage);
adminsRouter.get("/login", adminControllers.showLoginPage);

const adminsRoutes = {
  adminControllers,
};

export default adminsRouter;
export { adminsRouter, adminsRoutes };
