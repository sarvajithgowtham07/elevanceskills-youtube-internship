import mongoose from "mongoose";
const videochema = mongoose.Schema(
  {
    videotitle: { type: String, required: true },
    filename: { type: String, required: true },
    filetype: { type: String, required: true },
    filename: { type: String, required: true },
    filepath: { type: String, required: true },
    thumbnail: {
      type: String,
      default: "",
    },
    filesize: { type: String, required: true },
    videochanel: { type: String, required: true },
    Like: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploader: { type: String },
    publicId: {
      type: String,
    },
    accessLevel: {
      type: String,
      enum: ["Free", "Bronze", "Silver", "Gold"],
      default: "Free"
    },
    qualities: {
      type: [
        {
          label: { type: String, required: true },
          filepath: { type: String, required: true }
        }
      ],
      default: []
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("videofiles", videochema);
