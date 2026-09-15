"use client";

import { useEffect, useState } from "react";

/**
 * R4.4 (roadmap.md): "Funktionen, die online bleiben müssen, verständlich
 * deaktivieren" - genutzt von den Admin-Generierungs-/Quellenimport-
 * Steuerelementen (SourcesManager, ContentGenerationControl), die ohne
 * Verbindung ohnehin nur mit einem Netzwerkfehler scheitern würden.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    (async () => setOnline(navigator.onLine))();
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
