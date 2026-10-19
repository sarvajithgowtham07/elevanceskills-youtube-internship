import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { createContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { useEffect, useContext } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);

  const applyTheme = (theme) => {
    if (typeof document === "undefined") return;

    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  };

  const login = (userdata, token) => {
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

    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("light", "dark");
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const changeTheme = async (theme) => {
    if (!user) return;

    try {
      const response = await axiosInstance.patch(`/user/theme/${user._id}`, {
        themePreference: theme,
      });

      const updatedUser = response.data;

      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      applyTheme(theme);
    } catch (error) {
      console.error("Error updating theme:", error);
    }
  };

  const processLogin = async (firebaseuser) => {
    const firebaseToken = await firebaseuser.getIdToken();

    const payload = {
      email: firebaseuser.email,
      name: firebaseuser.displayName,
      image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      firebaseToken,
    };

    const response = await axiosInstance.post("/user/login", payload);

    if (response.data.requiresOTP) {
      setPendingLogin({
        userId: response.data.userId,
        email: response.data.email,
        loginActivityId: response.data.loginActivityId,
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
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("Google sign-in succeeded:", !!result.user);
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };


  const verifyOTP = async (otp, trustDevice) => {
    if (!pendingLogin || !auth.currentUser) return false;

    try {
      const firebaseToken = await auth.currentUser.getIdToken();

      const response = await axiosInstance.post("/user/verify-otp", {
        userId: pendingLogin.userId,
        loginActivityId: pendingLogin.loginActivityId,
        otp,
        trustDevice,
        firebaseToken,
      });

      if (response.data.result && response.data.token) {
        login(response.data.result, response.data.token);
        return true;
      }

      return false;
    } catch (error) {
      console.error("OTP verification error:", error);
      throw error;
    }
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseuser) => {
      if (firebaseuser && !user && !otpRequired) {
        try {
          await processLogin(firebaseuser);
        } catch (error) {
          console.error(error);
        }
      }
    });

    return () => unsubscribe();
  }, [user, otpRequired]);

  return (
    <UserContext.Provider
      value={{
        user,
        otpRequired,
        pendingLogin,
        login,
        logout,
        handlegooglesignin,
        changeTheme,
        verifyOTP,
        cancelOTP,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);