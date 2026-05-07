import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wifi, WifiOff, LogIn, LogOut, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

const ALLOWED_IP = "131.221.0.8";
const STORAGE_KEY = "horasbiblio_user_name";

type Session = {
  id: string;
  user_name: string;
  start_time: string;
  end_time: string | null;
  total_minutes: number | null;
};

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Index() {
  const [ip, setIp] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [leaders, setLeaders] = useState<{ user_name: string; minutes: number }[]>([]);

  const isAllowed = ip === ALLOWED_IP;

  // Load saved name
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setUserName(saved);
  }, []);

  // Fetch IP
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIp(d.ip))
      .catch(() => setIp(null))
      .finally(() => setIpLoading(false));
  }, []);

  // Tick clock
  useEffect(() => {
    if (!activeSession) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeSession]);

  const checkActiveSession = useCallback(async (name: string) => {
    if (!name) return;
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_name", name)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveSession(data ?? null);
  }, []);

  // Restore active session when name available
  useEffect(() => {
    if (userName) checkActiveSession(userName);
  }, [userName, checkActiveSession]);

  const loadLeaders = useCallback(async () => {
    const { data } = await supabase
      .from("sessions")
      .select("user_name,total_minutes")
      .not("total_minutes", "is", null);
    if (!data) return;
    const map = new Map<string, number>();
    for (const r of data) {
      map.set(r.user_name, (map.get(r.user_name) ?? 0) + (r.total_minutes ?? 0));
    }
    const arr = Array.from(map, ([user_name, minutes]) => ({ user_name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
    setLeaders(arr);
  }, []);

  useEffect(() => {
    loadLeaders();
  }, [loadLeaders]);

  const handleCheckIn = async () => {
    const name = userName.trim();
    if (!name) {
      toast.error("Ingresa tu nombre");
      return;
    }
    if (!isAllowed) return;
    localStorage.setItem(STORAGE_KEY, name);
    setBusy(true);
    const { data, error } = await supabase
      .from("sessions")
      .insert({ user_name: name })
      .select()
      .single();
    setBusy(false);
    if (error) {
      toast.error("Error al hacer check-in");
      return;
    }
    setActiveSession(data);
    toast.success(`Check-in registrado, ${name}`);
  };

  const handleCheckOut = async () => {
    if (!activeSession) return;
    setBusy(true);
    const end = new Date();
    const minutes = Math.max(
      1,
      Math.round((end.getTime() - new Date(activeSession.start_time).getTime()) / 60000)
    );
    const { error } = await supabase
      .from("sessions")
      .update({ end_time: end.toISOString(), total_minutes: minutes })
      .eq("id", activeSession.id);
    setBusy(false);
    if (error) {
      toast.error("Error al hacer check-out");
      return;
    }
    setActiveSession(null);
    toast.success(`Check-out: ${minutes} min registrados`);
    loadLeaders();
  };

  const elapsed = activeSession
    ? now - new Date(activeSession.start_time).getTime()
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-center" />
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            horas <span className="text-primary">biblio</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registro de tiempo de conexión Wi-Fi
          </p>
        </header>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="leaders" onClick={loadLeaders}>
              <Trophy className="mr-2 h-4 w-4" /> Líderes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6 space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                {ipLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : isAllowed ? (
                  <Wifi className="h-5 w-5 text-primary" />
                ) : (
                  <WifiOff className="h-5 w-5 text-destructive" />
                )}
                <div className="flex-1">
                  <div className="font-semibold">
                    {ipLoading
                      ? "Verificando red..."
                      : isAllowed
                        ? "Conectado a la red autorizada"
                        : "Red no autorizada"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ip ? `IP: ${ip}` : "Sin IP"}
                  </div>
                </div>
                <span
                  className={`h-3 w-3 rounded-full ${
                    isAllowed ? "bg-primary shadow-[0_0_12px_var(--color-primary)]" : "bg-destructive"
                  }`}
                />
              </div>
              {!ipLoading && !isAllowed && (
                <p className="mt-3 text-sm text-destructive">
                  No estás conectado a la red Wi-Fi autorizada.
                </p>
              )}
            </Card>

            <Card
              className="p-6 text-center"
              style={activeSession ? { boxShadow: "var(--shadow-glow)" } : undefined}
            >
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {activeSession ? "Sesión activa" : "Sin sesión"}
              </div>
              <div className="mt-2 font-mono text-5xl sm:text-6xl font-bold tabular-nums">
                {activeSession ? formatDuration(elapsed) : "00:00:00"}
              </div>
              {activeSession && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {activeSession.user_name} · desde{" "}
                  {new Date(activeSession.start_time).toLocaleTimeString()}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">Tu nombre</label>
                <Input
                  className="mt-1.5"
                  placeholder="Ej. María Pérez"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={!!activeSession}
                />
              </div>

              {activeSession ? (
                <Button
                  onClick={handleCheckOut}
                  disabled={busy}
                  variant="destructive"
                  className="w-full"
                  size="lg"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Check-out
                </Button>
              ) : (
                <Button
                  onClick={handleCheckIn}
                  disabled={!isAllowed || busy || !userName.trim()}
                  className="w-full"
                  size="lg"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  Check-in
                </Button>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="leaders" className="mt-6">
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Trophy className="h-5 w-5 text-primary" /> Ranking
              </h2>
              {leaders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay registros completados.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {leaders.map((l, i) => {
                    const h = Math.floor(l.minutes / 60);
                    const m = l.minutes % 60;
                    return (
                      <li
                        key={l.user_name}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                              i === 0
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="font-medium">{l.user_name}</span>
                        </div>
                        <span className="font-mono tabular-nums text-sm">
                          {h}h {String(m).padStart(2, "0")}m
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
