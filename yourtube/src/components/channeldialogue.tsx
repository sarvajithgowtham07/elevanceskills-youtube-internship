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
  const { user, login } = useUser();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    channelImage: "",
  });
  const [isSubmitting, setisSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isopen) return;

    setErrorMessage("");

    if (channeldata && mode === "edit") {
      setFormData({
        name: channeldata.name || "",
        description: channeldata.description || "",
        channelImage: channeldata.channelImage || "",
      });
    } else {
      setFormData({
        name: user?.name || "",
        description: "",
        channelImage: "",
      });
    }
  }, [channeldata, mode, user, isopen]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user || isSubmitting) return;

    if (!formData.name.trim()) {
      setErrorMessage("Channel name is required.");
      return;
    }

    setisSubmitting(true);
    setErrorMessage("");

    try {
      const payload = {
        channelname: formData.name,
        description: formData.description,
        channelImage: formData.channelImage,
      };

      const response = await axiosInstance.patch(
        `/user/update/${user._id}`,
        payload
      );

      login(response?.data);
      onclose();
      router.push(`/channel/${user._id}`);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message ||
        "Unable to save your channel. Please try again."
      );
    } finally {
      setisSubmitting(false);
    }
  };

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
            <Label htmlFor="channelImage">Channel Logo URL</Label>
            <Input
              id="channelImage"
              name="channelImage"
              value={formData.channelImage}
              onChange={handleChange}
              placeholder="https://example.com/neffex-logo.png"
            />
            {formData.channelImage && (
              <img
                src={formData.channelImage}
                alt="Channel logo preview"
                className="h-16 w-16 rounded-full object-cover"
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