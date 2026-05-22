import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, X } from "lucide-react";

type Broadcast = {
  id: string;
  type: "text" | "image";
  message: string | null;
  image_url: string | null;
  expires_at: string;
  created_at: string;
};

export function BroadcastBanner() {
  const [items, setItems] = useState<Broadcast[]>([]);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("broadcasts")
      .select("*")
      .eq("type", "text")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Broadcast[]);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const ch = (supabase as any)
      .channel("broadcasts-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () => load())
      .subscribe();
    return () => {
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [load]);

  const visible = items.filter((b) => new Date(b.expires_at).getTime() > now);
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {visible.map((b) => (
        <div
          key={b.id}
          className="flex items-center gap-3 rounded-xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 px-4 py-3 shadow-lg animate-pulse"
        >
          <Megaphone className="h-5 w-5 flex-shrink-0 text-yellow-500" />
          <p className="flex-1 font-bold text-foreground">{b.message}</p>
        </div>
      ))}
    </div>
  );
}

export function BroadcastImageModal() {
  const [item, setItem] = useState<Broadcast | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("broadcasts")
      .select("*")
      .eq("type", "image")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setItem((data ?? null) as Broadcast | null);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const ch = (supabase as any)
      .channel("broadcasts-image")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () => load())
      .subscribe();
    return () => {
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [load]);

  if (!item || !item.image_url) return null;
  if (new Date(item.expires_at).getTime() <= now) return null;
  if (dismissed.has(item.id)) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative max-h-[90vh] max-w-[90vw]">
        <button
          onClick={() => setDismissed((s) => new Set(s).add(item.id))}
          className="absolute -right-3 -top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg hover:scale-110 transition-transform"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={item.image_url}
          alt="Anuncio"
          className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain"
        />
      </div>
    </div>
  );
}
