import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  PhoneAuthProvider,
  linkWithCredential
} from "firebase/auth";
import React, { useState, createContext, useEffect, useContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { getBrowserLocation } from "./getBrowserLocation";

const UserContext = createContext();
let recaptchaVerifier = null;

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const applyTheme = (theme) => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  };

  const getAutomaticTheme = () => {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const hour = Number(parts.find((part) => part.type === "hour").value);
    const minute = Number(parts.find((part) => part.type === "minute").value);
    const totalMinutes = hour * 60 + minute;

    return totalMinutes >= 300 && totalMinutes < 720 ? "light" : "dark";
  };

  const login = (userdata, token) => {
    if (!userdata?._id || !token) {
      throw new Error("Valid user and authentication token are required");
    }

    setUser(userdata);
    localStorage.setItem("user", JSON.stringify(userdata));
    localStorage.setItem("token", token);

    const theme = userdata?.themePreference || "dark";
    applyTheme(theme);

    setOtpRequired(false);
    setPendingLogin(null);
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setOtpRequired(false);
    setPendingLogin(null);
    setPhoneConfirmation(null);
    setPhoneVerified(false);

    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("light", "dark");
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const changeTheme = async (themeMode) => {
    try {
      const response = await axiosInstance.patch(
        `/user/theme/${user._id}`,
        { themeMode }
      );

      const updatedUser = response.data;

      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      applyTheme(updatedUser.themePreference);

      return updatedUser;
    } catch (error) {
      console.error("Theme update error:", error);
      throw error;
    }
  };

  const getBrowserName = async () => {
    if (typeof navigator === "undefined") return "Unknown";

    if (navigator.brave?.isBrave) {
      try {
        if (await navigator.brave.isBrave()) return "Brave";
      } catch { }
    }

    const ua = navigator.userAgent;

    if (/Edg\/([\d.]+)/i.test(ua)) return "Edge";
    if (/OPR\/([\d.]+)/i.test(ua)) return "Opera";
    if (/Firefox\/([\d.]+)/i.test(ua)) return "Firefox";
    if (/Chrome\/([\d.]+)/i.test(ua)) return "Chrome";
    if (/Version\/([\d.]+).*Safari/i.test(ua)) return "Safari";

    return "Unknown";
  };

  const processLogin = async (firebaseuser) => {
    const firebaseToken = await firebaseuser.getIdToken();
    const browserName = await getBrowserName();
    const clientLocation = await getBrowserLocation();

    const payload = {
      email: firebaseuser.email,
      name: firebaseuser.displayName,
      image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      firebaseToken,
      browserName,
      clientLocation
    };

    const response = await axiosInstance.post("/user/login", payload);

    if (response.data.requiresOTP) {
      setPendingLogin({
        userId: response.data.userId,
        email: response.data.email,
        loginActivityId: response.data.loginActivityId
      });

      setOtpRequired(true);
      return false;
    }

    if (!response.data.result || !response.data.token) {
      throw new Error("Authentication token missing from server response");
    }

    login(response.data.result, response.data.token);
    return true;
  };

  const handlegooglesignin = async () => {
    if (googleLoading) return;

    setGoogleLoading(true);

    try {
      const result = await signInWithPopup(auth, provider);
      console.log("Google sign-in succeeded:", !!result.user);
    } catch (error) {
      if (
        error.code === "auth/cancelled-popup-request" ||
        error.code === "auth/popup-closed-by-user"
      ) {
        console.log("Google sign-in popup was cancelled.");
        return;
      }

      console.error("Google sign-in failed:", error);
    } finally {
      setGoogleLoading(false);
    }
  };


  const verifyOTP = async (otp, trustDevice) => {
    if (!pendingLogin || !auth.currentUser) {
      return { success: false, message: "Login session not found" };
    }

    try {
      const firebaseToken = await auth.currentUser.getIdToken();
      const browserName = await getBrowserName();

      const response = await axiosInstance.post("/user/verify-otp", {
        userId: pendingLogin.userId,
        loginActivityId: pendingLogin.loginActivityId,
        otp,
        trustDevice,
        firebaseToken,
        browserName
      });

      if (response.data.result && response.data.token) {
        login(response.data.result, response.data.token);
        return { success: true };
      }

      return {
        success: false,
        message: response.data.message || "OTP verification failed"
      };
    } catch (error) {
      if (error.response) {
        return {
          success: false,
          message: error.response.data?.message || "OTP verification failed",
          attemptsRemaining: error.response.data?.attemptsRemaining
        };
      }

      console.error("OTP verification error:", error);

      return {
        success: false,
        message: "Unable to connect to the server. Please try again."
      };
    }
  };


  const resendOTP = async () => {
    if (!pendingLogin || !auth.currentUser) {
      throw new Error("No pending login found");
    }

    const firebaseToken = await auth.currentUser.getIdToken();

    const response = await axiosInstance.post("/user/resend-otp", {
      userId: pendingLogin.userId,
      loginActivityId: pendingLogin.loginActivityId,
      firebaseToken
    });

    return response.data;
  };

  const cancelOTP = async () => {
    setOtpRequired(false);
    setPendingLogin(null);

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error cancelling login:", error);
    }
  };

  const sendPhoneOTP = async (phoneNumber) => {
    if (!auth.currentUser) {
      throw new Error("Please sign in with Google first");
    }

    if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
      throw new Error("Enter a valid phone number with country code, e.g. +919876543210");
    }

    if (auth.currentUser.phoneNumber) {
      throw new Error("A phone number is already linked to this account");
    }

    setPhoneLoading(true);

    try {
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }

      recaptchaVerifier = new RecaptchaVerifier(auth, "phone-recaptcha", {
        size: "normal"
      });

      await recaptchaVerifier.render();

      const phoneProvider = new PhoneAuthProvider(auth);

      const verificationId = await phoneProvider.verifyPhoneNumber(
        phoneNumber,
        recaptchaVerifier
      );

      setPhoneConfirmation({
        verificationId,
        phoneNumber
      });

      return true;
    } catch (error) {
      console.error("Phone OTP sending error:", error);

      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }

      throw error;
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifyPhoneOTP = async (otp) => {
    if (!auth.currentUser || !phoneConfirmation) {
      throw new Error("Please request a phone OTP first");
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      throw new Error("Enter a valid 6-digit OTP");
    }

    setPhoneLoading(true);

    try {
      const credential = PhoneAuthProvider.credential(
        phoneConfirmation.verificationId,
        otp
      );

      const result = await linkWithCredential(auth.currentUser, credential);

      const firebaseToken = await result.user.getIdToken(true);

      const response = await axiosInstance.post("/user/phone/sync", {
        firebaseToken
      });

      const updatedUser = {
        ...user,
        phone: response.data.phone,
        phoneVerified: response.data.phoneVerified
      };

      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));

      setPhoneVerified(true);
      setPhoneConfirmation(null);

      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }

      return true;
    } catch (error) {
      console.error("Phone OTP verification error:", error);
      throw error;
    } finally {
      setPhoneLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseuser) => {
      if (firebaseuser && !user && !otpRequired) {
        try {
          await processLogin(firebaseuser);
        } catch (error) {
          console.error("Login processing error:", error);
        }
      }
    });

    return () => unsubscribe();
  }, [user, otpRequired]);

  useEffect(() => {
    if (!user || (user.themeMode && user.themeMode !== "auto")) {
      return;
    }

    let updating = false;

    const updateAutomaticTheme = async () => {
      const theme = getAutomaticTheme();

      if (theme === user.themePreference || updating) {
        return;
      }

      updating = true;
      applyTheme(theme);

      try {
        const response = await axiosInstance.patch(
          `/user/theme/${user._id}`,
          { themeMode: "auto" }
        );

        const updatedUser = response.data;

        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
        applyTheme(updatedUser.themePreference);
      } catch (error) {
        console.error("Automatic theme update error:", error);
        applyTheme(user.themePreference);
      } finally {
        updating = false;
      }
    };

    updateAutomaticTheme();

    const interval = setInterval(updateAutomaticTheme, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateAutomaticTheme();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  return (
    <UserContext.Provider
      value={{
        user,
        otpRequired,
        pendingLogin,
        googleLoading,
        phoneConfirmation,
        phoneLoading,
        phoneVerified,
        login,
        logout,
        handlegooglesignin,
        changeTheme,
        verifyOTP,
        resendOTP,
        cancelOTP,
        sendPhoneOTP,
        verifyPhoneOTP
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);