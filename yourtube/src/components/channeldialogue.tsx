
import { useRouter } from "next/router";
import React, { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

const Channeldialogue = ({ isopen, onclose, channeldata, mode }: any) => {
  const { user, login, uploadChannelImage } = useUser();
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    channelImage: "",
  });

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSubmitting, setisSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isopen) return;

    setErrorMessage("");
    setSelectedImage(null);
    setPreviewUrl("");

    if (channeldata && mode === "edit") {
      setFormData({
        name: channeldata.name || channeldata.channelname || "",
        description: channeldata.description || "",
        channelImage: channeldata.channelImage || "",
      });
    } else {
      setFormData({
        name: user?.channelname || user?.name || "",
        description: user?.description || "",
        channelImage: user?.channelImage || "",
      });
    }
  }, [channeldata, mode, user, isopen]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setErrorMessage("Please select a JPG, PNG, WEBP or GIF image.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image size must not exceed 5 MB.");
      e.target.value = "";
      return;
    }

    setErrorMessage("");
    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user?._id || isSubmitting) return;

    if (!formData.name.trim()) {
      setErrorMessage("Channel name is required.");
      return;
    }

    setisSubmitting(true);
    setErrorMessage("");

    try {
      if (selectedImage) {
        const updatedUser = await uploadChannelImage(selectedImage);

        if (!updatedUser?.channelImage) {
          throw new Error("Channel logo upload failed.");
        }
      }

      const response = await axiosInstance.patch(
        `/user/update/${user._id}`,
        {
          channelname: formData.name.trim(),
          description: formData.description,
        }
      );

      const updatedUser = response.data.result || response.data.user || response.data;

      if (!updatedUser?._id) {
        throw new Error("Channel details could not be updated.");
      }

      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Authentication token not found. Please sign in again.");
      }

      login(updatedUser, token);
      onclose();
      router.push(`/channel/${user._id}`);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to save your channel. Please try again."
      );
    } finally {
      setisSubmitting(false);
    }
  };

  const displayedImage = previewUrl || formData.channelImage || user?.channelImage;

  return (
    <Dialog open={isopen} onOpenChange={onclose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create your channel" : "Edit your channel"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handlesubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Channel Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Channel Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Tell viewers about your channel..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channelImage">Channel Logo</Label>
            <Input
              id="channelImage"
              name="channelImage"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageChange}
            />

            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP or GIF. Maximum size: 5 MB.
            </p>

            {displayedImage && (
              <img
                src={displayedImage}
                alt="Channel logo preview"
                className="h-20 w-20 rounded-full object-cover"
              />
            )}
          </div>

          {errorMessage && (
            <p className="text-sm text-red-500">{errorMessage}</p>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={onclose}>
              Cancel
            </Button>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                  ? "Create Channel"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Channeldialogue;
