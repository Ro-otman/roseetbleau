import { Router } from "express";
import authControllers from "../../controllers/users/authControllers.js";

const usersRouter = Router();

usersRouter.get("/", authControllers.showIndexPage);
usersRouter.get("/shop", authControllers.showShopPage);
usersRouter.get("/about", authControllers.showAboutPage);
usersRouter.get("/faq", authControllers.showFaqPage);
usersRouter.get("/favoris", authControllers.showFavorisPage);
usersRouter.get("/details", authControllers.showDetailsPage);
usersRouter.get("/login", authControllers.showLoginPage);
usersRouter.get("/signup", authControllers.showSignupPage);
usersRouter.get("/cart", authControllers.showCartPage);

const usersRoutes = {
  authControllers,
};

export default usersRouter;
export { usersRouter, usersRoutes };
