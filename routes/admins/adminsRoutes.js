import { Router } from "express";
import adminControllers from "../../controllers/admins/adminControllers.js";
import productControllers from "../../controllers/admins/productControllers.js";
import {
  optionalAdminAuth,
  requireAdminAuth,
} from "../../middlewares/adminAuth.js";

const adminsRouter = Router();

adminsRouter.use(optionalAdminAuth);
adminsRouter.get("/login", adminControllers.showLoginPage);
adminsRouter.post("/login", adminControllers.login);
adminsRouter.post("/logout", adminControllers.logout);

adminsRouter.use(requireAdminAuth);
adminsRouter.get("/", adminControllers.showDashboardPage);
adminsRouter.get("/dashboard", adminControllers.showDashboardPage);
adminsRouter.get("/api/dashboard-stats", adminControllers.getDashboardStats);
adminsRouter.get("/produits", adminControllers.showProductsPage);
adminsRouter.get("/api/products-overview", adminControllers.getProductsOverview);
adminsRouter.get("/produits/:productId/edit", productControllers.showEditProductPage);
adminsRouter.post("/produits/:productId/edit", productControllers.updateProduct);
adminsRouter.post("/produits/:productId/delete", productControllers.deleteProduct);
adminsRouter.get("/ajoutproduit", productControllers.showAddProductPage);
adminsRouter.post(
  "/ajoutproduit",
  productControllers.uploadProductImages,
  productControllers.createProduct,
);
adminsRouter.get("/users", adminControllers.showUsersPage);
adminsRouter.get("/api/users-overview", adminControllers.getUsersOverview);
adminsRouter.get("/users/:userId", adminControllers.showUserDetailsPage);
adminsRouter.post("/users/:userId/status", adminControllers.updateUserStatus);
adminsRouter.get("/orders", adminControllers.showOrdersPage);
adminsRouter.get("/api/orders-overview", adminControllers.getOrdersOverview);
adminsRouter.get("/orders/:orderId", adminControllers.showOrderDetailsPage);
adminsRouter.post("/orders/:orderId/status", adminControllers.updateOrderStatus);

const adminsRoutes = {
  adminControllers,
  productControllers,
};

export default adminsRouter;
export { adminsRouter, adminsRoutes };
