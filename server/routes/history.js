import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
  saveProgress,
  getProgress,
} from "../controllers/history.js";

const routes = express.Router();

routes.put("/progress/:videoId", saveProgress);
routes.get("/progress/:userId/:videoId", getProgress);
routes.get("/:userId", getallhistoryVideo);
routes.post("/views/:videoId", handleview);
routes.post("/:videoId", handlehistory);

export default routes;
