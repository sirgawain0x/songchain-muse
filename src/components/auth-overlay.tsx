"use client";
import { createContext, useContext } from "react";
export const AuthOverlayContext = createContext(false);
export function useAuthOverlay() {
  return useContext(AuthOverlayContext);
}
