import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import OTPVerification from "@/components/OTPVerification";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { UserProvider } from "../lib/AuthContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-background text-foreground">
        <title>Your-Tube Clone</title>
        <Header />
        <Toaster />
        <OTPVerification />
        <div className="flex">
          <Sidebar />
          <Component {...pageProps} />
        </div>
      </div>
    </UserProvider>
  );
}