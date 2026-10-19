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
  const { user } = useUser();
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingDevice, setRevokingDevice] = useState<string | null>(null);

  useEffect(() => {
    if (!user?._id) return;

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
                          {device.ipAddress}
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
                          IP: {login.ipAddress}
                        </span>

                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {login.city}, {login.state},{" "}
                          {login.country}
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