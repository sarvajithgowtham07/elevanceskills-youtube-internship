import mongoose from "mongoose";

const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  themePreference: {
    type: String,
    enum: ["light", "dark"],
    default: "dark",
  },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);