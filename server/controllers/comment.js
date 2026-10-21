import users from "../Modals/Auth.js";
import comment from "../Modals/comment.js";
import mongoose from "mongoose";
import commentRateLimit from "../Modals/commentRateLimit.js";
import commentReport from "../Modals/commentReport.js";
import commentModeration from "../Modals/commentModeration.js";

const abusiveWords = [
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "idiot",
  "stupid",
  "moron",
];

const COMMENT_EDIT_DELETE_LIMIT_MS = 15 * 60 * 1000;

const normalizeText = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const containsAbusiveWords = (text) => {
  const normalizedText = normalizeText(text);

  return abusiveWords.some((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    return pattern.test(normalizedText);
  });
};

const containsMaliciousLink = (text) => {
  const urlPattern = /(https?:\/\/|www\.)[^\s]+/gi;
  const suspiciousPattern =
    /(javascript:|data:text\/html|<script|javascript%3a)/gi;

  return urlPattern.test(text) || suspiciousPattern.test(text);
};

const containsRepeatedCharacters = (text) => {
  return /(.)\1{7,}/u.test(text);
};

const containsExcessiveSpecialCharacters = (text) => {
  const specialCharacters =
    text.match(/[!@#$%^&*()_+=\[\]{};:'",.<>/?\\|`~]/g) || [];

  const nonSpaceCharacters = text.replace(/\s/g, "").length;

  if (nonSpaceCharacters < 10) {
    return false;
  }

  return specialCharacters.length / nonSpaceCharacters > 0.7;
};

const containsExcessiveEmoji = (text) => {
  const emojis =
    text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || [];

  return emojis.length >= 8;
};

const moderateComment = async (text, userid = null, videoid = null) => {
  if (containsAbusiveWords(text)) {
    return {
      allowed: false,
      message: "Your comment contains inappropriate language.",
    };
  }

  if (containsMaliciousLink(text)) {
    return {
      allowed: false,
      message: "Links or potentially malicious content are not allowed.",
    };
  }

  if (containsRepeatedCharacters(text)) {
    return {
      allowed: false,
      message: "Repeated characters are not allowed.",
    };
  }

  if (containsExcessiveSpecialCharacters(text)) {
    return {
      allowed: false,
      message: "Excessive special characters are not allowed.",
    };
  }

  if (containsExcessiveEmoji(text)) {
    return {
      allowed: false,
      message: "Please reduce excessive emoji usage.",
    };
  }

  if (userid && videoid) {
    const normalizedText = normalizeText(text);

    const existingComments = await comment
      .find({
        userid,
        videoid,
        parentComment: null,
        status: { $ne: "DELETED" },
      })
      .select("commentbody");

    const duplicateComment = existingComments.some(
      (existing) => normalizeText(existing.commentbody) === normalizedText
    );

    if (duplicateComment) {
      return {
        allowed: false,
        message: "You have already posted this comment.",
      };
    }
  }

  return { allowed: true };
};

const verifyCaptcha = async (captchaToken) => {
  if (!captchaToken) {
    return {
      success: false,
      message: "CAPTCHA verification is required.",
    };
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.error("RECAPTCHA_SECRET_KEY is missing.");

    return {
      success: false,
      message: "CAPTCHA configuration is missing.",
    };
  }

  try {
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: secretKey,
          response: captchaToken,
        }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      console.error(
        "CAPTCHA verification failed:",
        result["error-codes"] || []
      );

      return {
        success: false,
        message: "CAPTCHA verification failed.",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("CAPTCHA verification error:", error);

    return {
      success: false,
      message: "Unable to verify CAPTCHA.",
    };
  }
};

const checkCommentRateLimit = async (userid, captchaToken = null) => {
  const now = new Date();

  let rateRecord = await commentRateLimit.findOne({ userid });

  if (!rateRecord) {
    await commentRateLimit.create({
      userid,
      timestamps: [now],
      captchaRequired: false,
    });

    return { allowed: true };
  }

  if (rateRecord.blockedUntil && rateRecord.blockedUntil > now) {
    return {
      allowed: false,
      captchaRequired: true,
      message:
        "Too many comments in a short time. Please complete the CAPTCHA.",
    };
  }

  if (rateRecord.captchaRequired) {
    const captchaResult = await verifyCaptcha(captchaToken);

    if (!captchaResult.success) {
      return {
        allowed: false,
        captchaRequired: true,
        message: captchaResult.message,
      };
    }

    rateRecord.timestamps = [];
    rateRecord.blockedUntil = null;
    rateRecord.captchaRequired = false;

    await rateRecord.save();

    return {
      allowed: true,
      captchaVerified: true,
    };
  }

  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

  const recentTimestamps = rateRecord.timestamps.filter(
    (timestamp) => timestamp > oneMinuteAgo
  );

  if (recentTimestamps.length >= 5) {
    rateRecord.timestamps = recentTimestamps;
    rateRecord.blockedUntil = new Date(now.getTime() + 60 * 1000);
    rateRecord.captchaRequired = true;

    await rateRecord.save();

    return {
      allowed: false,
      captchaRequired: true,
      message:
        "Too many comments in a short time. Please complete the CAPTCHA.",
    };
  }

  recentTimestamps.push(now);

  rateRecord.timestamps = recentTimestamps;
  rateRecord.blockedUntil = null;

  await rateRecord.save();

  return { allowed: true };
};

export const postcomment = async (req, res) => {
  const { videoid, commentbody, parentComment, mentions, captchaToken } =
    req.body;

  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(userid) ||
    !mongoose.Types.ObjectId.isValid(videoid)
  ) {
    return res.status(400).json({
      message: "Invalid user or video",
    });
  }

  if (!commentbody || !commentbody.trim()) {
    return res.status(400).json({
      message: "Comment cannot be empty",
    });
  }

  try {
    const rateLimit = await checkCommentRateLimit(userid, captchaToken);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        message: rateLimit.message,
        rateLimited: true,
        captchaRequired: rateLimit.captchaRequired || false,
      });
    }

    const moderation = await moderateComment(
      commentbody.trim(),
      userid,
      videoid
    );

    if (!moderation.allowed) {
      return res.status(400).json({
        message: moderation.message,
        moderationBlocked: true,
      });
    }

    if (parentComment) {
      if (!mongoose.Types.ObjectId.isValid(parentComment)) {
        return res.status(400).json({
          message: "Invalid parent comment",
        });
      }

      const parent = await comment.findById(parentComment);

      if (!parent || parent.status === "DELETED") {
        return res.status(404).json({
          message: "Parent comment not found",
        });
      }

      if (parent.videoid.toString() !== videoid) {
        return res.status(400).json({
          message: "Invalid parent comment",
        });
      }
    }

    const validMentions = Array.isArray(mentions)
      ? mentions.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];

    const authenticatedUser = await users
      .findById(userid)
      .select("name channelname");

    if (!authenticatedUser) {
      return res.status(401).json({
        message: "Authenticated user not found",
      });
    }

    const usercommented =
      authenticatedUser.channelname || authenticatedUser.name || "User";

    const newComment = new comment({
      userid,
      videoid,
      commentbody: commentbody.trim(),
      usercommented,
      parentComment: parentComment || null,
      mentions: validMentions,
    });

    await newComment.save();

    return res.status(200).json({
      comment: true,
      result: newComment,
    });
  } catch (error) {
    console.error("error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoid)) {
    return res.status(400).json({
      message: "Invalid video",
    });
  }

  try {
    const comments = await comment
      .find({ videoid })
      .populate("userid", "name channelname image profilePicture location")
      .sort({ commentedon: -1 })
      .lean();

    const formattedComments = comments.map((item) => {
      const author =
        item.userid && typeof item.userid === "object" ? item.userid : null;

      return {
        ...item,
        userid: author?._id?.toString() || item.userid?.toString() || "",
        userImage: author?.image || author?.profilePicture || "",
        userLocation: author?.location || "",
        usercommented:
          author?.channelname || author?.name || item.usercommented,
      };
    });

    return res.status(200).json(formattedComments);
  } catch (error) {
    console.error("Get comments error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const replycomment = async (req, res) => {
  const { videoid, commentbody, parentComment, mentions, captchaToken } =
    req.body;

  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(userid) ||
    !mongoose.Types.ObjectId.isValid(videoid) ||
    !mongoose.Types.ObjectId.isValid(parentComment)
  ) {
    return res.status(400).json({
      message: "Invalid request",
    });
  }

  if (!commentbody || !commentbody.trim()) {
    return res.status(400).json({
      message: "Reply cannot be empty",
    });
  }

  try {
    const rateLimit = await checkCommentRateLimit(userid, captchaToken);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        message: rateLimit.message,
        rateLimited: true,
        captchaRequired: rateLimit.captchaRequired || false,
      });
    }

    const moderation = await moderateComment(
      commentbody.trim(),
      userid,
      videoid
    );

    if (!moderation.allowed) {
      return res.status(400).json({
        message: moderation.message,
        moderationBlocked: true,
      });
    }

    const parent = await comment.findById(parentComment);

    if (!parent || parent.status === "DELETED") {
      return res.status(404).json({
        message: "Parent comment not found",
      });
    }

    if (parent.videoid.toString() !== videoid) {
      return res.status(400).json({
        message: "Invalid parent comment",
      });
    }

    const validMentions = Array.isArray(mentions)
      ? mentions.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];

    const authenticatedUser = await users
      .findById(userid)
      .select("name channelname");

    if (!authenticatedUser) {
      return res.status(401).json({
        message: "Authenticated user not found",
      });
    }

    const usercommented =
      authenticatedUser.channelname || authenticatedUser.name || "User";

    const reply = new comment({
      userid,
      videoid,
      commentbody: commentbody.trim(),
      usercommented,
      parentComment,
      mentions: validMentions,
    });

    await reply.save();

    return res.status(200).json({
      comment: true,
      result: reply,
    });
  } catch (error) {
    console.error("error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const likecomment = async (req, res) => {
  const { id } = req.params;
  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({
      message: "Invalid request",
    });
  }

  try {
    const existingComment = await comment.findById(id);

    if (!existingComment || existingComment.status === "DELETED") {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    const alreadyLiked = existingComment.likes.some(
      (user) => user.toString() === userid
    );

    if (alreadyLiked) {
      existingComment.likes.pull(userid);
    } else {
      existingComment.likes.addToSet(userid);
      existingComment.dislikes.pull(userid);
    }

    await existingComment.save();

    return res.status(200).json({
      likes: existingComment.likes,
      dislikes: existingComment.dislikes,
    });
  } catch (error) {
    console.error("error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const dislikecomment = async (req, res) => {
  const { id } = req.params;
  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({
      message: "Invalid request",
    });
  }

  try {
    const existingComment = await comment.findById(id);

    if (!existingComment || existingComment.status === "DELETED") {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    const alreadyDisliked = existingComment.dislikes.some(
      (user) => user.toString() === userid
    );

    if (alreadyDisliked) {
      existingComment.dislikes.pull(userid);
    } else {
      existingComment.dislikes.addToSet(userid);
      existingComment.likes.pull(userid);
    }

    await existingComment.save();

    return res.status(200).json({
      likes: existingComment.likes,
      dislikes: existingComment.dislikes,
    });
  } catch (error) {
    console.error("error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const deletecomment = async (req, res) => {
  const { id } = req.params;
  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({
      message: "Invalid comment or user",
    });
  }

  try {
    const existingComment = await comment.findById(id);

    if (!existingComment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    if (existingComment.userid.toString() !== userid) {
      return res.status(403).json({
        message: "You can only delete your own comments",
      });
    }

    if (existingComment.status === "DELETED") {
      return res.status(400).json({
        message: "Comment has already been deleted",
      });
    }

    if (
      Date.now() - new Date(existingComment.commentedon).getTime() >
      COMMENT_EDIT_DELETE_LIMIT_MS
    ) {
      return res.status(403).json({
        message: "Comments can only be deleted within 15 minutes of posting.",
      });
    }

    existingComment.status = "DELETED";
    existingComment.commentbody = "[deleted]";
    existingComment.isEdited = false;
    existingComment.editedAt = null;

    await existingComment.save();

    await commentModeration.create({
      commentid: existingComment._id,
      action: "DELETED",
      performedBy: userid,
      details: "Comment deleted by its owner",
    });

    return res.status(200).json({
      comment: true,
      result: existingComment,
    });
  } catch (error) {
    console.error("Delete comment error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};


export const editcomment = async (req, res) => {
  const { id } = req.params;
  const { commentbody, expectedVersion } = req.body;
  const userid = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({
      message: "Invalid comment or user",
    });
  }

  if (!commentbody || !commentbody.trim()) {
    return res.status(400).json({
      message: "Comment cannot be empty",
    });
  }

  if (
    expectedVersion === undefined ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return res.status(400).json({
      message: "Invalid comment version. Refresh and try again.",
    });
  }

  try {
    const existingComment = await comment.findById(id);

    if (!existingComment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    if (existingComment.userid.toString() !== userid) {
      return res.status(403).json({
        message: "You can only edit your own comments",
      });
    }

    if (existingComment.status === "DELETED") {
      return res.status(400).json({
        message: "Comment has already been deleted",
      });
    }

    if (
      Date.now() - new Date(existingComment.commentedon).getTime() >
      COMMENT_EDIT_DELETE_LIMIT_MS
    ) {
      return res.status(403).json({
        message: "Comments can only be edited within 15 minutes of posting.",
      });
    }

    if ((existingComment.editVersion ?? 0) !== expectedVersion) {
      return res.status(409).json({
        message: "This comment was edited elsewhere. Refresh comments before editing again.",
        conflict: true,
      });
    }

    const moderation = await moderateComment(
      commentbody.trim(),
      userid,
      existingComment.videoid.toString()
    );

    if (!moderation.allowed) {
      return res.status(400).json({
        message: moderation.message,
        moderationBlocked: true,
      });
    }

    const previousText = existingComment.commentbody;
    const previousVersion = existingComment.editVersion ?? 0;

    const updatedComment = await comment.findOneAndUpdate(
      {
        _id: id,
        editVersion: previousVersion,
      },
      {
        $set: {
          commentbody: commentbody.trim(),
          isEdited: true,
          editedAt: new Date(),
          translations: {},
        },
        $push: {
          editHistory: {
            previousText,
            editedAt: new Date(),
          },
        },
        $inc: {
          editVersion: 1,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedComment) {
      return res.status(409).json({
        message: "This comment was edited elsewhere. Refresh comments before editing again.",
        conflict: true,
      });
    }

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error("Edit comment error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};



export const reportcomment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { commentid, reason } = req.body;
    const reporterid = req.user.id;

    if (!commentid || !reason) {
      return res.status(400).json({
        message: "Comment and reason are required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(commentid) ||
      !mongoose.Types.ObjectId.isValid(reporterid)
    ) {
      return res.status(400).json({
        message: "Invalid comment or reporter",
      });
    }

    const validReasons = ["SPAM", "HARASSMENT", "OFFENSIVE_CONTENT"];

    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        message: "Invalid report reason",
      });
    }

    let report;

    await session.withTransaction(async () => {
      const existingComment = await comment.findById(commentid).session(session);

      if (!existingComment || existingComment.status === "DELETED") {
        const error = new Error("Comment not found");
        error.statusCode = 404;
        throw error;
      }

      const existingReport = await commentReport.findOne({
        commentid,
        reporterid,
      }).session(session);

      if (existingReport) {
        const error = new Error("You have already reported this comment");
        error.statusCode = 409;
        throw error;
      }

      const reports = await commentReport.create(
        [{ commentid, reporterid, reason }],
        { session }
      );

      report = reports[0];

      existingComment.status = "FLAGGED";
      await existingComment.save({ session });

      await commentModeration.create(
        [
          {
            commentid,
            action: "REPORTED",
            reason,
            performedBy: reporterid,
            details: "Comment reported by user",
          },
          {
            commentid,
            action: "FLAGGED",
            reason,
            performedBy: reporterid,
            details: "Comment automatically flagged for admin review",
          },
        ],
        { session }
      );
    });

    return res.status(201).json({
      message: "Comment reported successfully",
      report,
    });
  } catch (error) {
    console.error("Report comment error:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already reported this comment",
      });
    }

    return res.status(500).json({
      message: "Something went wrong",
    });
  } finally {
    await session.endSession();
  }
};