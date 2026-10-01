import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[92vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border p-3 shadow-lg text-sm bg-white ${
              t.kind === "success" ? "border-emerald-200" : t.kind === "error" ? "border-red-200" : "border-slate-200"
            }`}
          >
            {t.kind === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
            {t.kind === "error" && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
            {t.kind === "info" && <Info className="h-5 w-5 text-brand-500 shrink-0" />}
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
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
