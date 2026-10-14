import { useEffect, useMemo, useRef, useState } from "react";
import { Send, MessagesSquare, Users2, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Button, Spinner } from "../components/ui/ui";
import { formatDateTime } from "../lib/format";
import type { ChatMessage } from "../types";

interface DirectoryPerson {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface DirectMessage {
  id: string;
  company_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
}

type Selection = { type: "group" } | { type: "dm"; userId: string };

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-slate-700",
  hr: "bg-rose-500",
  employee: "bg-brand-600",
};

function displayNameFor(p: DirectoryPerson) {
  if (p.role === "admin") return "Admin";
  if (p.role === "hr") return "HR";
  return `${p.first_name} ${p.last_name}`;
}

function initialsFor(p: DirectoryPerson) {
  if (p.role === "admin") return "AD";
  if (p.role === "hr") return "HR";
  return `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`;
}

export default function Chat() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [selection, setSelection] = useState<Selection>({ type: "group" });
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatEnabledForEmployees, setChatEnabledForEmployees] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      const [{ data: msgs }, { data: dmRows }, { data: directory }, { data: companySettings }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("company_id", profile!.company_id).order("created_at", { ascending: true }).limit(300),
        supabase
          .from("direct_messages")
          .select("*")
          .eq("company_id", profile!.company_id)
          .or(`sender_id.eq.${profile!.id},recipient_id.eq.${profile!.id}`)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase.rpc("company_directory"),
        supabase.from("company_settings").select("chat_enabled_for_employees").eq("company_id", profile!.company_id).single(),
      ]);
      if (cancelled) return;
      setGroupMessages((msgs as ChatMessage[]) ?? []);
      setDms((dmRows as DirectMessage[]) ?? []);
      setPeople(((directory as DirectoryPerson[]) ?? []).filter((p) => p.id !== profile!.id).sort((a, b) => a.first_name.localeCompare(b.first_name)));
      setChatEnabledForEmployees(companySettings?.chat_enabled_for_employees ?? true);
      setLoading(false);
    }
    load();

    const groupChannel = supabase
      .channel(`chat-${profile.company_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `company_id=eq.${profile.company_id}` },
        (payload) => {
          setGroupMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    const dmChannel = supabase
      .channel(`dm-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `company_id=eq.${profile.company_id}` },
        (payload) => {
          const row = payload.new as DirectMessage;
          if (row.sender_id === profile.id || row.recipient_id === profile.id) {
            setDms((prev) => [...prev, row]);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(dmChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [selection, groupMessages, dms]);

  const peopleById = useMemo(() => {
    const map: Record<string, DirectoryPerson> = {};
    for (const p of people) map[p.id] = p;
    return map;
  }, [people]);

  const lastDmByPerson = useMemo(() => {
    const map: Record<string, DirectMessage> = {};
    for (const m of dms) {
      const other = m.sender_id === profile?.id ? m.recipient_id : m.sender_id;
      const prev = map[other];
      if (!prev || m.created_at > prev.created_at) map[other] = m;
    }
    return map;
  }, [dms, profile?.id]);

  const lastGroupMessage = groupMessages[groupMessages.length - 1];

  const activeMessages: (ChatMessage | DirectMessage)[] =
    selection.type === "group"
      ? groupMessages
      : dms.filter(
          (m) =>
            (m.sender_id === profile?.id && m.recipient_id === selection.userId) ||
            (m.sender_id === selection.userId && m.recipient_id === profile?.id)
        );

  function selectConversation(next: Selection) {
    setSelection(next);
    setMobileView("chat");
  }

  async function send() {
    const body = text.trim();
    if (!body || !profile) return;
    setSending(true);
    setText("");
    const { error } =
      selection.type === "group"
        ? await supabase.from("chat_messages").insert({ company_id: profile.company_id, sender_id: profile.id, message: body })
        : await supabase.from("direct_messages").insert({
            company_id: profile.company_id,
            sender_id: profile.id,
            recipient_id: selection.userId,
            message: body,
          });
    setSending(false);
    if (error) setText(body);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (loading || !profile) return <Spinner />;

  if (profile.role === "employee" && !chatEnabledForEmployees) {
    return (
      <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-6xl flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
        <MessagesSquare className="h-10 w-10 text-slate-300" />
        <h2 className="mt-3 text-lg font-semibold text-slate-800">Chat is currently unavailable</h2>
        <p className="mt-1 text-sm text-slate-500">Please check with your Admin or HR if you need to send a message.</p>
      </div>
    );
  }

  const otherPerson = selection.type === "dm" ? peopleById[selection.userId] : null;
  const activeName = selection.type === "group" ? "Group Chat" : otherPerson ? displayNameFor(otherPerson) : "Unknown";
  const activeSubtitle = selection.type === "group" ? "Everyone in the company" : otherPerson?.role ?? "";

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Conversation list */}
      <div className={`${mobileView === "chat" ? "hidden" : "flex"} w-full flex-col border-r border-slate-100 md:flex md:w-80 md:shrink-0`}>
        <div className="border-b border-slate-100 p-4">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <MessagesSquare className="h-5 w-5" /> Chat
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => selectConversation({ type: "group" })}
            className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
              selection.type === "group" ? "bg-brand-50" : ""
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
              <Users2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">Group Chat</p>
              <p className="truncate text-xs text-slate-400">{lastGroupMessage ? lastGroupMessage.message : "Everyone in the company"}</p>
            </div>
          </button>

          {people.map((p) => {
            const last = lastDmByPerson[p.id];
            const isActive = selection.type === "dm" && selection.userId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectConversation({ type: "dm", userId: p.id })}
                className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${isActive ? "bg-brand-50" : ""}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${ROLE_COLOR[p.role] ?? "bg-slate-500"}`}>
                  {initialsFor(p)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{displayNameFor(p)}</p>
                  <p className="truncate text-xs capitalize text-slate-400">{last ? last.message : p.role}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active conversation */}
      <div className={`${mobileView === "list" ? "hidden" : "flex"} flex-1 flex-col md:flex`}>
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <button onClick={() => setMobileView("list")} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
              selection.type === "group" ? "bg-brand-600" : ROLE_COLOR[otherPerson?.role ?? ""] ?? "bg-slate-500"
            }`}
          >
            {selection.type === "group" ? <Users2 className="h-4 w-4" /> : otherPerson ? initialsFor(otherPerson) : ""}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{activeName}</p>
            <p className="truncate text-xs capitalize text-slate-400">{activeSubtitle}</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {activeMessages.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello!</p>
          ) : (
            activeMessages.map((m) => {
              const mine = m.sender_id === profile.id;
              const sender = peopleById[m.sender_id];
              const name = sender ? displayNameFor(sender) : "Unknown";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                    {!mine && selection.type === "group" && (
                      <p className="mb-0.5 text-xs font-semibold text-slate-500">
                        {name} <span className="font-normal capitalize text-slate-400">· {sender?.role ?? ""}</span>
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">{m.message}</p>
                    <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-slate-400"}`}>{formatDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-slate-100 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Button type="button" onClick={send} loading={sending} disabled={!text.trim()}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
