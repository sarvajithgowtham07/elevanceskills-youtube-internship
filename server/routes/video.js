import express from "express";
import {
  getallvideo,
  uploadvideo,
  getVideoPlayback,
  recordWatchTime
} from "../controllers/video.js";
import { downloadVideo } from "../controllers/download.js";
import upload from "../filehelper/filehelper.js";
import verifyToken from "../middleware/authMiddleware.js";
import { getDownloadHistory } from "../controllers/downloadHistory.js";

const routes = express.Router();

routes.post("/upload", verifyToken, upload.single("file"), uploadvideo);
routes.get("/getall", getallvideo);
routes.get("/play/:videoId", verifyToken, getVideoPlayback);
routes.post("/watch-time/heartbeat", verifyToken, recordWatchTime);
routes.get("/download/:videoId", verifyToken, downloadVideo);
routes.get("/downloads/history", verifyToken, getDownloadHistory);

export default routes;