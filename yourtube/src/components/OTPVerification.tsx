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

      if (!result) {
        setError("OTP verification failed");
      }
    } catch (error: any) {
      setError(
        error?.response?.data?.message || "OTP verification failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
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

        <p className="text-sm text-muted-foreground mb-6">
          We detected a new login environment. Enter the verification code
          sent to:
        </p>

        <p className="font-medium mb-4">
          {pendingLogin.email}
        </p>

        <Input
          value={otp}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 6);
            setOtp(value);
            setError("");
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

        {error && (
          <p className="text-sm text-red-500 mt-3">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-600 mt-3">
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