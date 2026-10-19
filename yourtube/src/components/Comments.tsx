"use client";

import React, { useEffect, useState, useMemo } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface MentionUser {
  _id: string;
  name?: string;
  channelname?: string;
  image?: string;
}

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  userImage?: string;
  userLocation?: string;
  commentedon: string;
  parentComment?: string | { _id: string } | null;
  likes?: string[];
  dislikes?: string[];
  mentions?: string[];
  isEdited?: boolean;
  editedAt?: string | null;
  status?: string;
}

type SortOption = "newest" | "oldest" | "liked" | "relevant";

interface CommentsProps {
  videoId: string;
}

const Comments = ({ videoId }: CommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [loading, setLoading] = useState(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<string[]>([]);
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({});
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaMessage, setCaptchaMessage] = useState("");
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("SPAM");
  const [isReporting, setIsReporting] = useState(false);

  const { user } = useUser();
  const captchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

  useEffect(() => {
    loadComments();
  }, [videoId]);

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(res.data);
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchMentionUsers = async (text: string) => {
    if (!text.trim()) {
      setMentionUsers([]);
      return;
    }
    try {
      const res = await axiosInstance.get(
        `/user/search-users/${encodeURIComponent(text)}`
      );
      setMentionUsers(res.data);
    } catch (error) {
      console.error("Error searching mention users:", error);
      setMentionUsers([]);
    }
  };

  const detectMention = (value: string, cursorPosition: number) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
    if (match) {
      const start = cursorPosition - match[0].length;
      const searchText = match[1];
      setMentionStart(start);
      setMentionSearch(searchText);
      searchMentionUsers(searchText);
    } else {
      setMentionStart(null);
      setMentionSearch("");
      setMentionUsers([]);
    }
  };

  const handleMentionSelect = (selectedUser: MentionUser, isReply = false) => {
    const username = selectedUser.channelname || selectedUser.name || "user";
    const currentText = isReply ? replyText : newComment;
    if (mentionStart === null) return;
    const beforeMention = currentText.slice(0, mentionStart);
    const afterMention = currentText
      .slice(mentionStart)
      .replace(/^@[a-zA-Z0-9_.-]*/, "");
    const updatedText = beforeMention + `@${username} ` + afterMention;

    if (isReply) {
      setReplyText(updatedText);
    } else {
      setNewComment(updatedText);
    }
    setMentionUsers([]);
    setMentionSearch("");
    setMentionStart(null);
  };

  const extractMentions = async (text: string) => {
    const usernames = text.match(/@[a-zA-Z0-9_.-]+/g) || [];
    if (usernames.length === 0) return [];

    const mentionIds: string[] = [];
    for (const username of usernames) {
      const searchText = username.substring(1);
      try {
        const res = await axiosInstance.get(
          `/user/search-users/${encodeURIComponent(searchText)}`
        );
        const matchedUser = res.data.find(
          (foundUser: MentionUser) =>
            (foundUser.channelname || foundUser.name || "").toLowerCase() ===
            searchText.toLowerCase()
        );
        if (matchedUser && !mentionIds.includes(matchedUser._id)) {
          mentionIds.push(matchedUser._id);
        }
      } catch (error) {
        console.error("Error fetching mentioned user:", error);
      }
    }
    return mentionIds;
  };

  const handleCaptchaChange = (token: string | null) => {
    setCaptchaToken(token);
    setCaptchaMessage("");
  };

  const resetCaptcha = () => {
    setCaptchaToken(null);
  };

  const getErrorData = (error: any) => {
    return error?.response?.data || {};
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;
    if (captchaRequired && !captchaToken) {
      setCaptchaMessage("Please complete the CAPTCHA to continue.");
      return;
    }
    setIsSubmitting(true);
    try {
      const mentionIds = await extractMentions(newComment);
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: newComment,
        usercommented: user.name,
        mentions: mentionIds,
        captchaToken,
      });
      if (res.data.comment) {
        const newCommentObj: Comment = {
          _id: res.data.result?._id || Date.now().toString(),
          videoid: videoId,
          userid: user._id,
          commentbody: newComment,
          usercommented: user.name || "Anonymous",
          userImage: user.image || "",
          commentedon: new Date().toISOString(),
          parentComment: null,
          likes: [],
          dislikes: [],
          mentions: mentionIds,
          isEdited: false,
          editedAt: null,
        };
        setComments((prev) => [newCommentObj, ...prev]);
      }
      setNewComment("");
      setCaptchaRequired(false);
      setCaptchaMessage("");
      resetCaptcha();
    } catch (error: any) {
      console.error("Error adding comment:", error);
      const errorData = getErrorData(error);
      if (errorData.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaMessage(
          errorData.message || "Please complete the CAPTCHA to continue."
        );
      } else {
        setCaptchaMessage(errorData.message || "Unable to post comment.");
      }
      resetCaptcha();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/comment/like/${commentId}`, {
        userid: user._id,
      });
      setComments((prev) =>
        prev.map((comment) =>
          comment._id === commentId
            ? {
                ...comment,
                likes: res.data.likes,
                dislikes: res.data.dislikes,
              }
            : comment
        )
      );
    } catch (error) {
      console.error("Like error:", error);
    }
  };

  const handleDislike = async (commentId: string) => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/comment/dislike/${commentId}`, {
        userid: user._id,
      });
      setComments((prev) =>
        prev.map((comment) =>
          comment._id === commentId
            ? {
                ...comment,
                likes: res.data.likes,
                dislikes: res.data.dislikes,
              }
            : comment
        )
      );
    } catch (error) {
      console.error("Dislike error:", error);
    }
  };

  const handleReply = async (parentCommentId: string) => {
    if (!user || !replyText.trim()) return;
    if (captchaRequired && !captchaToken) {
      setCaptchaMessage("Please complete the CAPTCHA to continue.");
      return;
    }
    setIsReplying(true);
    try {
      const mentionIds = await extractMentions(replyText);
      const res = await axiosInstance.post("/comment/reply", {
        videoid: videoId,
        userid: user._id,
        commentbody: replyText,
        usercommented: user.name,
        parentComment: parentCommentId,
        mentions: mentionIds,
        captchaToken,
      });
      if (res.data.comment) {
        const newReply: Comment = {
          _id: res.data.result?._id || Date.now().toString(),
          videoid: videoId,
          userid: user._id,
          commentbody: replyText,
          usercommented: user.name || "Anonymous",
          userImage: user.image || "",
          commentedon: new Date().toISOString(),
          parentComment: parentCommentId,
          likes: [],
          dislikes: [],
          mentions: mentionIds,
          isEdited: false,
          editedAt: null,
        };
        setComments((prev) => [...prev, newReply]);
      }
      setReplyText("");
      setReplyingTo(null);
      setCaptchaRequired(false);
      setCaptchaMessage("");
      resetCaptcha();
    } catch (error: any) {
      console.error("Error adding reply:", error);
      const errorData = getErrorData(error);
      if (errorData.captchaRequired) {
        setCaptchaRequired(true);
        setCaptchaMessage(
          errorData.message || "Please complete the CAPTCHA to continue."
        );
      } else {
        setCaptchaMessage(errorData.message || "Unable to post reply.");
      }
      resetCaptcha();
    } finally {
      setIsReplying(false);
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editText.trim()) return;
    try {
      const res = await axiosInstance.post(
        `/comment/editcomment/${editingCommentId}`,
        {
          commentbody: editText,
          userid: user?._id,
        }
      );
      if (res.data) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId
              ? {
                  ...c,
                  commentbody: editText.trim(),
                  isEdited: true,
                  editedAt: new Date().toISOString(),
                }
              : c
          )
        );
        setEditingCommentId(null);
        setEditText("");
      }
    } catch (error) {
      console.error("Update error:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await axiosInstance.delete(`/comment/deletecomment/${id}`, {
        data: { userid: user?._id },
      });
      if (res.data.comment) {
        setComments((prev) =>
          prev.map((comment) =>
            comment._id === id
              ? { ...comment, status: "DELETED", commentbody: "[deleted]", isEdited: false }
              : comment
          )
        );
        setEditingCommentId((current) => (current === id ? null : current));
        setReplyingTo((current) => (current === id ? null : current));
      }
    } catch (error: any) {
      console.error(error?.response?.data?.message || "Unable to delete comment.");
    }
  };

  const handleReport = async (commentId: string) => {
    if (!user) return;
    setIsReporting(true);
    try {
      const res = await axiosInstance.post("/comment/report", {
        commentid: commentId,
        reporterid: user._id,
        reason: reportReason,
      });
      alert(res.data.message || "Comment reported successfully");
      setReportingCommentId(null);
      setReportReason("SPAM");
    } catch (error: any) {
      alert(error?.response?.data?.message || "Unable to report this comment");
    } finally {
      setIsReporting(false);
    }
  };

  const getReplies = (commentId: string) => {
    return comments.filter((comment) => {
      if (!comment.parentComment || comment.status === "DELETED") return false;

      const parentId =
        typeof comment.parentComment === "object"
          ? comment.parentComment._id
          : comment.parentComment;

      return String(parentId) === String(commentId);
    });
  };

  const handleTranslate = async (comment: Comment) => {
    const id = comment._id;
    if (translations[id]) {
      setTranslations((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      setTranslationErrors((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      return;
    }

    setTranslatingIds((prev) => [...prev, id]);
    setTranslationErrors((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    try {
      const targetLanguage = /[\u0C00-\u0C7F]/.test(comment.commentbody)
        ? "en"
        : "te";
      const response = await axiosInstance.post("/comment/translate", {
        text: comment.commentbody,
        targetLanguage,
      });
      setTranslations((prev) => ({
        ...prev,
        [id]: response.data.translatedText,
      }));
    } catch (error: any) {
      setTranslationErrors((prev) => ({
        ...prev,
        [id]:
          error?.response?.data?.message ||
          "Translation failed. Please try again.",
      }));
    } finally {
      setTranslatingIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const renderCommentText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, index) =>
      part.startsWith("@") ? (
        <span key={index} className="font-medium text-blue-500">
          {part}
        </span>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      )
    );
  };

  const sortedComments = useMemo(() => {
    const topLevelComments = comments.filter(
      (comment) => !comment.parentComment && comment.status !== "DELETED"
    );

    return [...topLevelComments].sort((a, b) => {
      if (sortOption === "newest") {
        return (
          new Date(b.commentedon).getTime() -
          new Date(a.commentedon).getTime()
        );
      }

      if (sortOption === "oldest") {
        return (
          new Date(a.commentedon).getTime() -
          new Date(b.commentedon).getTime()
        );
      }

      if (sortOption === "liked") {
        return (b.likes?.length || 0) - (a.likes?.length || 0);
      }

      if (sortOption === "relevant") {
        const scoreA =
          (a.likes?.length || 0) * 2 + getReplies(a._id).length;
        const scoreB =
          (b.likes?.length || 0) * 2 + getReplies(b._id).length;

        return scoreB - scoreA;
      }

      return 0;
    });
  }, [comments, sortOption]);

  const renderReportBox = (commentId: string) => {
    if (reportingCommentId !== commentId || !user) {
      return null;
    }
    return (
      <div className="mt-3 p-3 border rounded-md bg-muted/30">
        <p className="text-sm font-medium mb-2">Report this comment</p>
        <select
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="SPAM">Spam</option>
          <option value="HARASSMENT">Harassment</option>
          <option value="OFFENSIVE_CONTENT">Offensive content</option>
        </select>
        <div className="flex gap-2 mt-3">
          <Button
            onClick={() => handleReport(commentId)}
            disabled={isReporting}
          >
            {isReporting ? "Reporting..." : "Submit Report"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setReportingCommentId(null);
              setReportReason("SPAM");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div>Loading comments...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {
            comments.filter(
              (comment) =>
                !comment.parentComment && comment.status !== "DELETED"
            ).length
          }{" "}
          Comments
        </h2>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="liked">Most Liked</option>
          <option value="relevant">Most Relevant</option>
        </select>
      </div>

      {user && (
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2 relative">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => {
                setNewComment(e.target.value);
                detectMention(
                  e.target.value,
                  e.target.selectionStart || e.target.value.length
                );
              }}
              onKeyUp={(e) => {
                detectMention(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart || e.currentTarget.value.length
                );
              }}
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />

            {mentionUsers.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {mentionUsers.map((mentionUser) => (
                  <button
                    key={mentionUser._id}
                    type="button"
                    onClick={() => handleMentionSelect(mentionUser)}
                    className="w-full flex items-center gap-3 p-2 text-left hover:bg-muted"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={mentionUser.image || ""} />
                      <AvatarFallback>
                        {(mentionUser.name || "U")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">
                        {mentionUser.name || "User"}
                      </div>
                      {mentionUser.channelname && (
                        <div className="text-xs text-gray-500">
                          @{mentionUser.channelname}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setNewComment("")}
                disabled={!newComment.trim()}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={
                  !newComment.trim() ||
                  isSubmitting ||
                  (captchaRequired && !captchaToken)
                }
              >
                {isSubmitting ? "Commenting..." : "Comment"}
              </Button>
            </div>

            {captchaRequired && (
              <div className="mt-3 p-3 border rounded-md bg-muted/30">
                <p className="text-sm mb-3">
                  Too many comments were posted in a short time. Please complete
                  the CAPTCHA to continue.
                </p>
                {captchaSiteKey ? (
                  <ReCAPTCHA
                    sitekey={captchaSiteKey}
                    onChange={handleCaptchaChange}
                    onExpired={resetCaptcha}
                    onErrored={() => {
                      setCaptchaMessage(
                        "CAPTCHA could not be loaded. Please try again."
                      );
                      resetCaptcha();
                    }}
                  />
                ) : (
                  <p className="text-sm text-red-500">
                    CAPTCHA site key is not configured.
                  </p>
                )}
                {captchaMessage && (
                  <p className="text-sm text-red-500 mt-2">{captchaMessage}</p>
                )}
              </div>
            )}

            {captchaMessage && !captchaRequired && (
              <p className="text-sm text-red-500">{captchaMessage}</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sortedComments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          sortedComments.map((comment) => {
            const replies = getReplies(comment._id);
            return (
              <div key={comment._id} className="flex gap-4">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={comment.userImage || ""} />
                  <AvatarFallback>
                    {comment.usercommented?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {comment.usercommented}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDistanceToNow(new Date(comment.commentedon))} ago
                    </span>
                    {comment.isEdited && (
                      <span className="text-xs text-gray-500">(edited)</span>
                    )}
                  </div>

                  {editingCommentId === comment._id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          onClick={handleUpdateComment}
                          disabled={!editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">
                        {renderCommentText(
                          translations[comment._id] || comment.commentbody
                        )}
                      </p>

                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <Button
                          variant="ghost"
                          onClick={() => handleTranslate(comment)}
                          disabled={translatingIds.includes(comment._id)}
                        >
                          {translatingIds.includes(comment._id)
                            ? "Translating..."
                            : translations[comment._id]
                              ? "Show Original"
                              : /[\u0C00-\u0C7F]/.test(comment.commentbody)
                                ? "Translate to English"
                                : "Translate to Telugu"}
                        </Button>
                        {translationErrors[comment._id] && (
                          <span className="text-sm text-red-500">
                            {translationErrors[comment._id]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                        <button
                          onClick={() => handleLike(comment._id)}
                          disabled={!user}
                          className="hover:text-blue-500"
                        >
                          👍 {comment.likes?.length || 0}
                        </button>
                        <button
                          onClick={() => handleDislike(comment._id)}
                          disabled={!user}
                          className="hover:text-red-500"
                        >
                          👎 {comment.dislikes?.length || 0}
                        </button>
                        {user && comment.status !== "DELETED" && (
                          <button
                            onClick={() => {
                              setReplyingTo(
                                replyingTo === comment._id ? null : comment._id
                              );
                              setReplyText("");
                            }}
                            className="hover:text-blue-500"
                          >
                            Reply
                          </button>
                        )}
                        {comment.status !== "DELETED" &&
                          comment.userid === user?._id && (
                            <>
                              <button
                                onClick={() => handleEdit(comment)}
                                className="hover:text-blue-500"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(comment._id)}
                                className="hover:text-red-500"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        {user &&
                          comment.status !== "DELETED" &&
                          comment.userid !== user._id && (
                            <button
                              onClick={() => {
                                setReportingCommentId(
                                  reportingCommentId === comment._id
                                    ? null
                                    : comment._id
                                );
                                setReportReason("SPAM");
                              }}
                              className="hover:text-red-500"
                            >
                              Report
                            </button>
                          )}
                      </div>

                      {renderReportBox(comment._id)}

                      {replyingTo === comment._id && user && (
                        <div className="mt-3 flex gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={user.image || ""} />
                            <AvatarFallback>
                              {user.name?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-2 relative">
                            <Textarea
                              placeholder={`Reply to ${comment.usercommented}...`}
                              value={replyText}
                              onChange={(e) => {
                                setReplyText(e.target.value);
                                detectMention(
                                  e.target.value,
                                  e.target.selectionStart ||
                                  e.target.value.length
                                );
                              }}
                              onKeyUp={(e) => {
                                detectMention(
                                  e.currentTarget.value,
                                  e.currentTarget.selectionStart ||
                                  e.currentTarget.value.length
                                );
                              }}
                              className="min-h-[60px] resize-none"
                            />
                            {mentionUsers.length > 0 && (
                              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {mentionUsers.map((mentionUser) => (
                                  <button
                                    key={mentionUser._id}
                                    type="button"
                                    onClick={() =>
                                      handleMentionSelect(mentionUser, true)
                                    }
                                    className="w-full flex items-center gap-3 p-2 text-left hover:bg-muted"
                                  >
                                    <Avatar className="w-8 h-8">
                                      <AvatarImage
                                        src={mentionUser.image || ""}
                                      />
                                      <AvatarFallback>
                                        {(mentionUser.name || "U")[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="text-sm font-medium">
                                        {mentionUser.name || "User"}
                                      </div>
                                      {mentionUser.channelname && (
                                        <div className="text-xs text-gray-500">
                                          @{mentionUser.channelname}
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => handleReply(comment._id)}
                                disabled={
                                  !replyText.trim() ||
                                  isReplying ||
                                  (captchaRequired && !captchaToken)
                                }
                              >
                                {isReplying ? "Replying..." : "Reply"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {replies.length > 0 && (
                        <div className="ml-8 mt-4 space-y-4 border-l pl-4">
                          {replies.map((reply) => (
                            <div key={reply._id} className="flex gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={reply.userImage || ""} />
                                <AvatarFallback>
                                  {reply.usercommented?.[0] || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">
                                    {reply.usercommented}
                                  </span>
                                  <span className="text-xs text-gray-600">
                                    {formatDistanceToNow(
                                      new Date(reply.commentedon)
                                    )}{" "}
                                    ago
                                  </span>
                                  {reply.isEdited && (
                                    <span className="text-xs text-gray-500">
                                      (edited)
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm">
                                  {renderCommentText(
                                    translations[reply._id] || reply.commentbody
                                  )}
                                </p>
                                <div className="mt-2 flex items-center gap-3 flex-wrap">
                                  <Button
                                    variant="ghost"
                                    onClick={() => handleTranslate(reply)}
                                    disabled={translatingIds.includes(reply._id)}
                                  >
                                    {translatingIds.includes(reply._id)
                                      ? "Translating..."
                                      : translations[reply._id]
                                        ? "Show Original"
                                        : /[\u0C00-\u0C7F]/.test(reply.commentbody)
                                          ? "Translate to English"
                                          : "Translate to Telugu"}
                                  </Button>
                                  {translationErrors[reply._id] && (
                                    <span className="text-sm text-red-500">
                                      {translationErrors[reply._id]}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                                  <button
                                    onClick={() => handleLike(reply._id)}
                                    disabled={!user}
                                    className="hover:text-blue-500"
                                  >
                                    👍 {reply.likes?.length || 0}
                                  </button>
                                  <button
                                    onClick={() => handleDislike(reply._id)}
                                    disabled={!user}
                                    className="hover:text-red-500"
                                  >
                                    👎 {reply.dislikes?.length || 0}
                                  </button>
                                  {reply.userid === user?._id && (
                                    <>
                                      <button
                                        onClick={() => handleEdit(reply)}
                                        className="hover:text-blue-500"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleDelete(reply._id)}
                                        className="hover:text-red-500"
                                      >
                                        Delete
                                      </button>
                                    </>
                                  )}
                                  {user && reply.userid !== user._id && (
                                    <button
                                      onClick={() => {
                                        setReportingCommentId(
                                          reportingCommentId === reply._id
                                            ? null
                                            : reply._id
                                        );
                                        setReportReason("SPAM");
                                      }}
                                      className="hover:text-red-500"
                                    >
                                      Report
                                    </button>
                                  )}
                                </div>
                                {renderReportBox(reply._id)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Comments;