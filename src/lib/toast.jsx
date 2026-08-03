import { createContext, useCallback, useContext, useRef, useState } from "react";
import { T, fB } from "./theme.js";

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback((message, { type = "success", duration = 4000 } = {}) => {
    const id = ++idCounter;
    setToasts((list) => [...list, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full px-4 sm:px-0"
        style={{ maxWidth: 360 }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className="flex items-start gap-2 rounded-md px-4 py-3 shadow-lg"
            style={{
              ...fB,
              fontSize: 13,
              lineHeight: 1.4,
              background: t.type === "error" ? "#FDECEA" : "#E4F0ED",
              border: `1px solid ${t.type === "error" ? "#F3B5AE" : T.teal}`,
              color: t.type === "error" ? "#7A1F17" : T.ink,
            }}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{ color: "inherit", opacity: 0.6, lineHeight: 1, fontSize: 16 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
