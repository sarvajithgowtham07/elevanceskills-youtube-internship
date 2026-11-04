
import { useEffect, useState } from "react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import {
  ShieldCheck,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Clock,
  Globe,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

const SecurityPage = () => {
  const {
    user,
    sendPhoneOTP,
    verifyPhoneOTP,
    phoneLoading
  } = useUser();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");

  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingDevice, setRevokingDevice] = useState<string | null>(null);

  const [trustedDeviceDuration, setTrustedDeviceDuration] = useState(30);
  const [savingDuration, setSavingDuration] = useState(false);
  const [durationMessage, setDurationMessage] = useState("");
  const [durationError, setDurationError] = useState("");

  useEffect(() => {
    if (!user?._id) return;

    setTrustedDeviceDuration(user.trustedDeviceDuration || 30);

    const loadSecurityData = async () => {
      try {
        const [historyResponse, devicesResponse] = await Promise.all([
          axiosInstance.get(`/user/login-history/${user._id}`),
          axiosInstance.get(`/user/trusted-devices/${user._id}`),
        ]);

        setLoginHistory(historyResponse.data);
        setTrustedDevices(devicesResponse.data);
      } catch (error) {
        console.error("Security data error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSecurityData();
  }, [user]);

  const handleSaveDuration = async () => {
    if (!user?._id) return;

    setSavingDuration(true);
    setDurationMessage("");
    setDurationError("");

    try {
      const response = await axiosInstance.patch(
        `/user/trusted-device-duration/${user._id}`,
        { duration: Number(trustedDeviceDuration) }
      );

      setTrustedDeviceDuration(response.data.trustedDeviceDuration);
      setDurationMessage("Trusted-device duration updated successfully.");
    } catch (error: any) {
      setDurationError(
        error.response?.data?.message || "Unable to update duration."
      );
    } finally {
      setSavingDuration(false);
    }
  };

  const revokeDevice = async (deviceId: string) => {
    if (!user?._id) return;

    try {
      setRevokingDevice(deviceId);

      await axiosInstance.delete(
        `/user/trusted-devices/${user._id}/${deviceId}`
      );

      setTrustedDevices((devices) =>
        devices.filter((device) => device._id !== deviceId)
      );
    } catch (error) {
      console.error("Revoke device error:", error);
    } finally {
      setRevokingDevice(null);
    }
  };

  const handleSendPhoneOTP = async () => {
    setPhoneError("");
    setPhoneSuccess("");

    try {
      await sendPhoneOTP(phoneNumber);
      setOtpSent(true);
      setPhoneSuccess("OTP sent successfully.");
    } catch (error: any) {
      setPhoneError(error.message || "Unable to send OTP.");
    }
  };

  const handleVerifyPhoneOTP = async () => {
    setPhoneError("");
    setPhoneSuccess("");

    try {
      await verifyPhoneOTP(otp);
      setOtpSent(false);
      setOtp("");
      setPhoneSuccess("Your mobile number has been verified successfully.");
    } catch (error: any) {
      setPhoneError(error.message || "OTP verification failed.");
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    if (deviceType === "Mobile") {
      return <Smartphone className="w-5 h-5" />;
    }

    if (deviceType === "Tablet") {
      return <Tablet className="w-5 h-5" />;
    }

    return <Monitor className="w-5 h-5" />;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatIpAddress = (ip: string) => {
    const normalizedIp = ip?.replace(/^::ffff:/, "");

    if (
      normalizedIp === "::1" ||
      normalizedIp === "127.0.0.1" ||
      normalizedIp?.startsWith("127.")
    ) {
      return "Localhost";
    }

    return ip || "Unknown";
  };

  const formatLocation = (login: any) => {
    const ip = login.ipAddress?.replace(/^::ffff:/, "");

    if (
      ip === "::1" ||
      ip === "127.0.0.1" ||
      ip?.startsWith("127.")
    ) {
      return "Local development environment";
    }

    const location = [login.city, login.state, login.country]
      .filter((value) => value && value !== "Unknown")
      .join(", ");

    return location || "Location unavailable";
  };

  if (!user) {
    return (
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="border rounded-xl p-8 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold">
              Account Security
            </h1>
            <p className="text-muted-foreground mt-2">
              Please sign in to view your security information.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8" />
            <h1 className="text-3xl font-bold">
              Account Security
            </h1>
          </div>

          <p className="text-muted-foreground mt-2">
            Review your recent login activity and trusted devices.
          </p>
        </div>

        <section className="border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Smartphone className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">
                Mobile Number Verification
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Verify your mobile number using Firebase Phone Authentication.
              </p>
            </div>
          </div>

          {user.phoneVerified ? (
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">Mobile number verified</p>
                <p className="text-sm">{user.phone}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Mobile Number
                </label>

                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+919876543210"
                  disabled={otpSent || phoneLoading}
                  className="w-full border rounded-lg px-4 py-3 bg-transparent"
                />

                <p className="text-xs text-muted-foreground mt-2">
                  Enter your number with country code. Example: +919876543210
                </p>
              </div>

              {!otpSent ? (
                <button
                  type="button"
                  onClick={handleSendPhoneOTP}
                  disabled={phoneLoading || !phoneNumber}
                  className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {phoneLoading ? "Sending OTP..." : "Send OTP"}
                </button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Enter OTP
                    </label>

                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter 6-digit OTP"
                      className="w-full border rounded-lg px-4 py-3 bg-transparent"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyPhoneOTP}
                    disabled={phoneLoading || otp.length !== 6}
                    className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {phoneLoading ? "Verifying..." : "Verify OTP"}
                  </button>
                </div>
              )}

              {phoneError && (
                <p className="text-sm text-red-500">{phoneError}</p>
              )}

              {phoneSuccess && (
                <p className="text-sm text-green-600">{phoneSuccess}</p>
              )}

              <div id="phone-recaptcha"></div>
            </div>
          )}
        </section>

        <section className="border rounded-xl p-6">
          <div>
            <label className="block text-sm font-medium mb-3">
              Choose trusted-device duration
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[7, 15, 30, 60, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setTrustedDeviceDuration(days);
                    setDurationMessage("");
                    setDurationError("");
                  }}
                  disabled={savingDuration}
                  aria-pressed={trustedDeviceDuration === days}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border p-4 transition-all duration-200 ${
                    trustedDeviceDuration === days
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  {trustedDeviceDuration === days && (
                    <CheckCircle className="w-5 h-5" />
                  )}

                  <span className="text-2xl font-bold">{days}</span>
                  <span className="text-xs font-medium">Days</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mt-5">
            <p className="text-xs text-muted-foreground">
              This setting applies to devices you trust in future OTP verifications. Existing trusted devices keep their current expiry dates.
            </p>

            <button
              type="button"
              onClick={handleSaveDuration}
              disabled={savingDuration}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              {savingDuration ? "Saving..." : "Save Duration"}
            </button>

            {durationMessage && (
              <p className="text-sm text-green-600">{durationMessage}</p>
            )}

            {durationError && (
              <p className="text-sm text-red-500">{durationError}</p>
            )}
          </div>
        </section>

        <section className="border rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold">
                Trusted Devices
              </h2>

              <p className="text-sm text-muted-foreground mt-1">
                Devices that can sign in without OTP verification.
              </p>
            </div>

            <span className="text-sm font-medium">
              {trustedDevices.length} active
            </span>
          </div>

          {loading ? (
            <p className="text-muted-foreground">
              Loading trusted devices...
            </p>
          ) : trustedDevices.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle className="w-5 h-5" />
              <p>No trusted devices found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trustedDevices.map((device) => (
                <div
                  key={device._id}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      {getDeviceIcon(device.deviceType)}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {device.browser} {device.browserVersion}
                        </h3>

                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          Trusted
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground mt-1">
                        {device.operatingSystem} ·{" "}
                        {device.deviceType}
                        {device.deviceModel !== "Unknown"
                          ? ` · ${device.deviceModel}`
                          : ""}
                      </p>

                      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {formatIpAddress(device.ipAddress)}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Trusted {formatDate(device.trustedAt)}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires {formatDate(device.expiresAt)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => revokeDevice(device._id)}
                      disabled={revokingDevice === device._id}
                      className="px-3 py-2 text-sm rounded-md border text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {revokingDevice === device._id
                        ? "Revoking..."
                        : "Revoke"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">
              Login History
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              Recent login attempts and verification activity.
            </p>
          </div>

          {loading ? (
            <p className="text-muted-foreground">
              Loading login history...
            </p>
          ) : loginHistory.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle className="w-5 h-5" />
              <p>No login activity found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {loginHistory.map((login) => (
                <div
                  key={login._id}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      {getDeviceIcon(login.deviceType)}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">
                            {login.browser} {login.browserVersion}
                          </h3>

                          <p className="text-sm text-muted-foreground">
                            {login.operatingSystem} ·{" "}
                            {login.deviceType}
                            {login.deviceModel !== "Unknown"
                              ? ` · ${login.deviceModel}`
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            login.loginStatus === "SUCCESS" ||
                            login.loginStatus === "OTP_VERIFIED"
                              ? "bg-green-100 text-green-700"
                              : login.loginStatus === "OTP_REQUIRED"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {login.loginStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          IP: {formatIpAddress(login.ipAddress)}
                        </span>

                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {formatLocation(login)}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(login.loginTime)}
                        </span>

                        <span>
                          OTP:{" "}
                          {login.otpVerified
                            ? "Verified"
                            : "Not verified"}
                        </span>
                      </div>

                      {login.isTrusted && (
                        <div className="flex items-center gap-1 mt-3 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          Trusted device
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default SecurityPage;
