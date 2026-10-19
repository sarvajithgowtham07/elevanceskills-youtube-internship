
import express from "express";
import {
  deletecomment,
  getallcomment,
  postcomment,
  editcomment,
  replycomment,
  likecomment,
  dislikecomment,
  reportcomment,
} from "../controllers/comment.js";
import { translateText } from "../controllers/translate.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.get("/:videoid", getallcomment);
routes.post("/translate", translateText);

routes.post("/postcomment", verifyToken, postcomment);
routes.post("/reply", verifyToken, replycomment);
routes.post("/like/:id", verifyToken, likecomment);
routes.post("/dislike/:id", verifyToken, dislikecomment);
routes.delete("/deletecomment/:id", verifyToken, deletecomment);
routes.post("/editcomment/:id", verifyToken, editcomment);
routes.post("/report", verifyToken, reportcomment);

export default routes;