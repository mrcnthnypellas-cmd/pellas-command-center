import { createContext, useContext } from "react";
import type { Appearance } from "./appearance";

export type Me = { id: string; username: string; displayName: string; role: string; capabilities: string[] };
export type SessionCtx = {
  me: Me; serverName: string; serverId: string;
  can: (cap: string) => boolean; logout: () => void; refreshServer: () => void;
  appearance: Appearance; setAppearance: (a: Appearance) => void;
};
export const Session = createContext<SessionCtx>(null!);
export const useSession = () => useContext(Session);
