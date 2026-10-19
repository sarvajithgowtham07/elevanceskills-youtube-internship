"use client";

import { useState } from "react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function OTPVerification() {
  const {
    otpRequired,
    pendingLogin,
    verifyOTP,
    cancelOTP,
  } = useUser();

  const [otp, setOtp] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          <p className="text-sm text-red-500 mt-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            type="button"
            onClick={cancelOTP}
            variant="outline"
            className="flex-1"
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleVerify}
            className="flex-1"
            disabled={loading || otp.length !== 6}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-5">
          The code expires in 10 minutes.
        </p>
      </div>
    </div>
  );
}