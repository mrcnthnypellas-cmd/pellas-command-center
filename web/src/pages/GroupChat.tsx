import { useEffect, useRef, useState } from "react";
import { Send, MessagesSquare } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Card, Button, Spinner } from "../components/ui/ui";
import { formatDateTime } from "../lib/format";
import type { ChatMessage } from "../types";

interface ProfileLite {
  first_name: string;
  last_name: string;
  role: string;
}

export default function GroupChat() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      const [{ data: msgs }, { data: people }] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("*")
          .eq("company_id", profile!.company_id)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase.from("profiles").select("id, first_name, last_name, role").eq("company_id", profile!.company_id),
      ]);
      if (cancelled) return;
      setMessages((msgs as ChatMessage[]) ?? []);
      const map: Record<string, ProfileLite> = {};
      for (const p of (people ?? []) as (ProfileLite & { id: string })[]) map[p.id] = p;
      setProfilesById(map);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`chat-${profile.company_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `company_id=eq.${profile.company_id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || !profile) return;
    setSending(true);
    setText("");
    const { error } = await supabase.from("chat_messages").insert({
      company_id: profile.company_id,
      sender_id: profile.id,
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

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <MessagesSquare className="h-5 w-5" /> Group Chat
        </h1>
        <p className="text-sm text-slate-500">One shared chat for everyone in the company — admin, HR, and employees.</p>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello!</p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === profile.id;
              const sender = profilesById[m.sender_id];
              const name = sender ? `${sender.first_name} ${sender.last_name}` : "Unknown";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                    {!mine && (
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
      </Card>
    </div>
  );
}
