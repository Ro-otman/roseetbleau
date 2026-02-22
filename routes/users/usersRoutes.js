import { Router } from "express";
import authControllers from "../../controllers/users/authControllers.js";
import usersControllers from "../../controllers/users/controllers.js";

const usersRouter = Router();

usersRouter.get("/", usersControllers.showIndexPage);
usersRouter.get("/shop", usersControllers.showShopPage);
usersRouter.get("/about", usersControllers.showAboutPage);
usersRouter.get("/faq", usersControllers.showFaqPage);
usersRouter.get("/favoris", usersControllers.showFavorisPage);
usersRouter.get("/details", usersControllers.showDetailsPage);
usersRouter.get("/login", usersControllers.showLoginPage);
usersRouter.get("/signup", usersControllers.showSignupPage);
usersRouter.get("/cart", usersControllers.showCartPage);

usersRouter.post("/signup", authControllers.signup);
usersRouter.post("/login", authControllers.login);
usersRouter.post("/logout", authControllers.logout);
usersRouter.post("/auth/refresh", authControllers.refresh);

const usersRoutes = {
  usersControllers,
  authControllers,
};

export default usersRouter;
export { usersRouter, usersRoutes };
