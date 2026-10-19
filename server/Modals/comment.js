import mongoose from "mongoose";

const commentschema = mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    commentbody: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    usercommented: {
      type: String,
      required: true,
    },
    commentedon: {
      type: Date,
      default: Date.now,
    },
    language: {
      type: String,
      default: "en",
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
    dislikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
    status: {
      type: String,
      enum: ["VISIBLE", "HIDDEN", "DELETED", "FLAGGED"],
      default: "VISIBLE",
    },
    translations: [
      {
        language: {
          type: String,
          required: true,
        },
        text: {
          type: String,
          required: true,
        },
        translatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("comment", commentschema);