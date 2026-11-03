import mongoose from "mongoose";

const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  channelImage: { type: String, default: "" },
  description: { type: String },
  image: { type: String },
  phone: {
    type: String,
    default: ""
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ""
  },
  themeMode: {
    type: String,
    enum: ["auto", "light", "dark"],
    default: "auto"
  },
  themePreference: {
    type: String,
    enum: ["light", "dark"],
    default: "dark"
  },
  joinedon: { type: Date, default: Date.now }
});

export default mongoose.model("user", userschema);