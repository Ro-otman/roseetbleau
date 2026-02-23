import config from "../config/config.js";
import authModel from "./users/authModel.js";
import catalogModel from "./users/catalogModel.js";
import orderModel from "./users/orderModel.js";

const models = {
  config,
  authModel,
  catalogModel,
  orderModel,
};

export default models;
