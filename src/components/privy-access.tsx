"use client";
import {
  PrivyProvider,
  usePrivy,
  useLogin,
  useModalStatus,
} from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { AuthOverlayContext } from "./auth-overlay";
import { api } from "@/lib/client-api";
import type { Identity } from "@/lib/domain";
function AuthOverlay({ children }: { children: React.ReactNode }) {
  const { isOpen } = useModalStatus();
  return (
    <AuthOverlayContext.Provider value={isOpen}>
      {children}
    </AuthOverlayContext.Provider>
  );
}
function LogoutListener() {
  const { logout } = usePrivy();
  useEffect(() => {
    const handle = () => {
      void logout();
    };
    window.addEventListener("stage-signout", handle);
    return () => window.removeEventListener("stage-signout", handle);
  }, [logout]);
  return null;
}
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return children;
  return (
    <PrivyProvider
      appId={appId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        appearance: { theme: "light", accentColor: "#354b3a" },
      }}
    >
      <AuthOverlay>
        <LogoutListener />
        {children}
      </AuthOverlay>
    </PrivyProvider>
  );
}
function ConnectedAccess({
  link,
  onSuccess,
}: {
  link: boolean;
  onSuccess: (user: Identity) => Promise<void>;
}) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [working, setWorking] = useState(false);
  const [opening, setOpening] = useState(false);
  const exchanging = useRef(false);
  const requested = useRef(false);
  const wasOpen = useRef(false);
  const { isOpen } = useModalStatus();
  useEffect(() => {
    if (isOpen) setOpening(false);
    else if (wasOpen.current) {
      requested.current = false;
      setOpening(false);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);
  const [error, setError] = useState("");
  async function exchange() {
    if (exchanging.current) return;
    exchanging.current = true;
    setOpening(false);
    setWorking(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in with Privy to continue.");
      const result = await api("privy-login", { token, link });
      await onSuccess(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
    } finally {
      exchanging.current = false;
      setWorking(false);
    }
  }
  const { login } = useLogin({
    onComplete: () => {
      if (!requested.current) return;
      requested.current = false;
      void exchange();
    },
    onError: () => {
      if (!requested.current) return;
      requested.current = false;
      setOpening(false);
      setError("Sign-in was not completed. Please try again.");
    },
  });
  return (
    <>
      <button
        className="btn full"
        disabled={!ready || working || opening}
        onClick={() => {
          setError("");
          if (authenticated) void exchange();
          else {
            requested.current = true;
            setOpening(true);
            login();
          }
        }}
      >
        {opening
          ? "Opening secure sign-in…"
          : working
            ? "Connecting…"
            : link
              ? "Link Privy to this account"
              : "Continue with email or wallet"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function PrivyAccess(props: {
  link?: boolean;
  onSuccess: (user: Identity) => Promise<void>;
}) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return (
    <ConnectedAccess link={props.link || false} onSuccess={props.onSuccess} />
  );
}
