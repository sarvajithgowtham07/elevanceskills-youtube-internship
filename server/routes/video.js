
import express from "express";
import { getallvideo, uploadvideo } from "../controllers/video.js";
import { downloadVideo } from "../controllers/download.js";
import upload from "../filehelper/filehelper.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.post("/upload", upload.single("file"), uploadvideo);
routes.get("/getall", getallvideo);
routes.get("/download/:videoId", verifyToken, downloadVideo);

export default routes;