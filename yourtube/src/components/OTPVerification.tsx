
"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function OTPVerification() {
  const {
    otpRequired,
    pendingLogin,
    verifyOTP,
    resendOTP,
    cancelOTP,
  } = useUser();

  const [otp, setOtp] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [resendsRemaining, setResendsRemaining] = useState(3);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("email");

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  if (!otpRequired || !pendingLogin) {
    return null;
  }


  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError("Enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await verifyOTP(otp, trustDevice);

      if (!result.success) {
        if (result.message === "Incorrect OTP") {
          setError(
            typeof result.attemptsRemaining === "number"
              ? `Incorrect OTP. ${result.attemptsRemaining} attempt(s) remaining.`
              : "Incorrect OTP. Please try again."
          );
        } else if (
          result.message === "Too many OTP attempts or OTP expired"
        ) {
          setError("OTP expired or maximum attempts reached. Please request a new OTP.");
        } else {
          setError(result.message || "OTP verification failed.");
        }

        setOtp("");
        return;
      }

      setOtp("");
    } catch (error) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const handleResend = async () => {
    if (verificationMethod !== "email") return;

    setResendLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await resendOTP();

      setOtp("");
      setCooldown(response.cooldownSeconds || 60);
      setResendsRemaining(response.resendsRemaining);
      setSuccess(response.message || "New OTP sent successfully");
    } catch (error: any) {
      const data = error?.response?.data;

      if (data?.cooldownSeconds) {
        setCooldown(data.cooldownSeconds);
      }

      if (data?.resendsRemaining !== undefined) {
        setResendsRemaining(data.resendsRemaining);
      }

      setError(data?.message || "Unable to resend OTP");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-background text-foreground border p-6 shadow-xl">
        <h2 className="text-xl font-semibold mb-2">
          Verify Your Login
        </h2>

        <p className="text-sm text-muted-foreground mb-5">
          We detected a new login environment. Choose a verification method.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <Button
            type="button"
            variant={verificationMethod === "email" ? "default" : "outline"}
            onClick={() => {
              setVerificationMethod("email");
              setOtp("");
              setError("");
              setSuccess("");
            }}
          >
            Email OTP
          </Button>

          <Button type="button" variant="outline" disabled>
            Mobile OTP
          </Button>
        </div>

        {verificationMethod === "email" && (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              Enter the verification code sent to:
            </p>

            <p className="font-medium mb-4">
              {pendingLogin.email}
            </p>

            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium">Check your Spam or Junk folder</p>
              <p className="mt-1 text-xs text-muted-foreground">
                If you don't see the verification email in your Inbox, please check your Spam or Junk folder. If you find it there, mark it as Not Spam so future OTP emails arrive in your Inbox.
              </p>
            </div>
            <Input
              value={otp}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtp(value);
                setError("");
                setSuccess("");
              }}
              placeholder="Enter 6-digit OTP"
              inputMode="numeric"
              maxLength={6}
              className="text-center text-lg tracking-[0.5em]"
            />

            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              Trust this device for 30 days
            </label>
          </>
        )}

        {error && (
          <p className="text-sm text-red-500 mt-3" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-600 mt-3" role="status">
            {success}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          <Button
            type="button"
            onClick={cancelOTP}
            variant="outline"
            className="flex-1"
            disabled={loading || resendLoading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleResend}
            variant="outline"
            className="flex-1"
            disabled={
              loading ||
              resendLoading ||
              cooldown > 0 ||
              resendsRemaining <= 0
            }
          >
            {resendLoading
              ? "Sending..."
              : cooldown > 0
                ? `Resend (${cooldown}s)`
                : resendsRemaining <= 0
                  ? "Limit reached"
                  : "Resend OTP"}
          </Button>

          <Button
            type="button"
            onClick={handleVerify}
            className="flex-1"
            disabled={loading || resendLoading || otp.length !== 6}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-5">
          The code expires in 10 minutes.
        </p>

        <p className="text-xs text-muted-foreground text-center mt-1">
          Resends remaining: {resendsRemaining}/3
        </p>
      </div>
    </div>
  );
}
