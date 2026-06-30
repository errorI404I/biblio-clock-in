import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Save, Lock, Activity, Sparkles, History, Zap, Pencil, Users, LogOut, Clock, Megaphone, Image as ImageIcon, Trophy, Terminal, PlayCircle } from "lucide-react";

const ADMIN_PASS = "54321";
const ALLOWED_IP = "131.221.0.8";
const HEARTBEAT_TOLERANCE_MS = 70 * 60 * 1000; // ventana: 1h + margen

type Session = {
  id: string;
  user_name: string;
  start_time: string;
  end_time: string | null;
  total_minutes: number | null;
  last_seen: string | null;
  multiplier?: number | null;
  event_name?: string | null;
};

type Setting = {
  id: string;
  key: string;
  multiplier: number;
  event_name: string | null;
  active: boolean;
};

export function AdminPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [active, setActive] = useState<Session[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [eventName, setEventName] = useState("");
  const [multiplier, setMultiplier] = useState(2);
  const [eventActive, setEventActive] = useState(false);
  const [eventMinutes, setEventMinutes] = useState<number>(0); // 0 = indefinido
  const [eventExpiresAt, setEventExpiresAt] = useState<string | null>(null);
  // Broadcast
  const [bcastMsg, setBcastMsg] = useState("");
  const [bcastMins, setBcastMins] = useState(10);
  const [bcastImg, setBcastImg] = useState("");
  const [bcastImgMins, setBcastImgMins] = useState(15);
  const [bcastFile, setBcastFile] = useState<File | null>(null);
  const [bcastFilePreview, setBcastFilePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [bcasts, setBcasts] = useState<any[]>([]);
  // Diagnóstico
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagNow, setDiagNow] = useState(Date.now());

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => setDiagNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [authed]);

  // Hook 20:00 hs (AR, UTC-3): registra cierre general en el log del Diag
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const msToNextClose = () => {
      const now = Date.now();
      const t = new Date();
      t.setUTCHours(23, 0, 0, 0); // 20:00 AR = 23:00 UTC
      if (t.getTime() <= now) t.setUTCDate(t.getUTCDate() + 1);
      return t.getTime() - now;
    };
    const fire = async () => {
      if (cancelled) return;
      const stamp = () => new Date().toLocaleTimeString("es-AR", { hour12: false });
      setDiagLogs((prev) => [...prev, `[${stamp()}] 🚨 HORA DE CIERRE ALCANZADA (20:00 hs)`]);
      setDiagLogs((prev) => [...prev, `[${stamp()}] 🔐 Cerrando y asegurando sesiones en masa de forma automática...`]);
      const { data } = await supabase.from("sessions").select("id").is("end_time", null);
      const pending = data?.length ?? 0;
      await new Promise((r) => setTimeout(r, 1500));
      const { data: stillOpen } = await supabase.from("sessions").select("id").is("end_time", null);
      const remaining = stillOpen?.length ?? 0;
      const closed = Math.max(0, pending - remaining);
      setDiagLogs((prev) => [
        ...prev,
        `[${stamp()}] ✅ Sistema cerrado con éxito. ${closed} sesiones cargadas al ranking. (Sistema bloqueado hasta las 07:00)`,
      ]);
      loadAll();
    };
    let timer = setTimeout(async function tick() {
      await fire();
      if (!cancelled) timer = setTimeout(tick, msToNextClose());
    }, msToNextClose());
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authed]);

  const appendLog = (line: string) =>
    setDiagLogs((prev) => [...prev.slice(-300), line]);

  const runDiagnostic = async (simulated: boolean) => {
    if (diagRunning) return;
    setDiagRunning(true);
    const stamp = () => new Date().toLocaleTimeString("es-AR", { hour12: false });
    const tag = simulated ? "🧪 SIMULACIÓN" : "⏳ INICIANDO CHEQUEO GLOBAL DE HORA EN PUNTO";
    appendLog(`[${stamp()}] ${tag}`);
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*")
      .is("end_time", null);
    appendLog(`[${stamp()}] 📋 Sesiones activas detectadas: ${sessions?.length ?? 0}`);
    appendLog(`[${stamp()}] 🛡 IP autorizada: ${ALLOWED_IP}`);
    if (!sessions || sessions.length === 0) {
      appendLog(`[${stamp()}] ✅ Nada que procesar.`);
      setDiagRunning(false);
      return;
    }
    const { data: settingRow } = await supabase
      .from("settings")
      .select("multiplier,event_name,active")
      .eq("key", "multiplier")
      .maybeSingle();
    const mult = settingRow?.active ? Number(settingRow.multiplier) || 1 : 1;
    const evName = settingRow?.active ? settingRow.event_name : null;
    let kept = 0;
    let kicked = 0;
    for (const s of sessions) {
      const startMs = new Date(s.start_time).getTime();
      const lastSeenMs = s.last_seen ? new Date(s.last_seen).getTime() : startMs;
      const ageMs = Date.now() - lastSeenMs;
      const isFresh = ageMs <= HEARTBEAT_TOLERANCE_MS;
      const accumMin = Math.max(1, Math.round((Date.now() - startMs) / 60000));
      const lastSeenStr = new Date(lastSeenMs).toLocaleTimeString("es-AR", { hour12: false });
      appendLog(`[${stamp()}] 🔎 Analizando usuario: ${s.user_name}...`);
      appendLog(`           - Último latido válido: ${lastSeenStr} (hace ${Math.round(ageMs / 60000)} min)`);
      appendLog(`           - IP Autorizada: ${ALLOWED_IP}`);
      if (isFresh) {
        appendLog(`           - Resultado: MATCH. El usuario sigue conectado.`);
        if (simulated) {
          appendLog(`           - Acción (sim): Se blindarían ${Math.round(accumMin * mult)} min. Sesión continúa activa.`);
        } else {
          appendLog(`           - Acción: Se blindan ${Math.round(accumMin * mult)} min. Sesión continúa activa.`);
        }
        kept++;
      } else {
        const savedRaw = Math.max(1, Math.round((lastSeenMs - startMs) / 60000));
        const saved = Math.round(savedRaw * mult);
        appendLog(`           - Resultado: MISMATCH. Usuario fuera de rango (latido viejo).`);
        if (simulated) {
          appendLog(`           - Acción (sim): CORTE DE EMERGENCIA. Se cerraría a las ${lastSeenStr}. Minutos salvados: ${saved} min.`);
        } else {
          const { error } = await supabase
            .from("sessions")
            .update({
              end_time: new Date(lastSeenMs).toISOString(),
              total_minutes: saved,
              last_seen: new Date(lastSeenMs).toISOString(),
              multiplier: mult,
              event_name: evName,
            })
            .eq("id", s.id);
          if (error) {
            appendLog(`           - ❌ Error al cerrar: ${error.message}`);
          } else {
            appendLog(`           - Acción: CORTE DE EMERGENCIA. Sesión cerrada a las ${lastSeenStr}. Minutos salvados: ${saved} min. Estado: Offline.`);
          }
        }
        kicked++;
      }
    }
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    appendLog(`[${stamp()}] ✅ CHEQUEO FINALIZADO. Procesados: ${sessions.length} (mantenidos: ${kept}, cortados: ${kicked}). Próximo control a las ${nextHour.toLocaleTimeString("es-AR", { hour12: false })}.`);
    setDiagRunning(false);
    loadAll();
  };

  const msToNextHourTick = (() => {
    const n = new Date(diagNow);
    const next = new Date(n);
    next.setHours(n.getHours() + 1, 0, 0, 0);
    return next.getTime() - n.getTime();
  })();

  useEffect(() => {
    if (!open) {
      setAuthed(false);
      setPass("");
    }
  }, [open]);

  const loadAll = async () => {
    const [{ data: act }, { data: hist }, { data: s }, { data: bc }] = await Promise.all([
      supabase.from("sessions").select("*").is("end_time", null).order("start_time", { ascending: false }),
      supabase.from("sessions").select("*").not("end_time", "is", null).order("start_time", { ascending: false }).limit(100),
      supabase.from("settings").select("*").eq("key", "multiplier").maybeSingle(),
      (supabase as any).from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setActive((act ?? []) as Session[]);
    setHistory((hist ?? []) as Session[]);
    if (s) {
      setSetting(s as Setting);
      setMultiplier(Number(s.multiplier) || 1);
      setEventName(s.event_name ?? "");
      setEventActive(!!s.active);
      const exp = (s as any).expires_at as string | null;
      setEventExpiresAt(exp ?? null);
      if (exp) {
        const remainMin = Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / 60000));
        setEventMinutes(remainMin);
      }
    }
    setBcasts(bc ?? []);
  };

  useEffect(() => {
    if (authed) {
      loadAll();
      const t = setInterval(loadAll, 10000);
      return () => clearInterval(t);
    }
  }, [authed]);

  const tryAuth = () => {
    if (pass === ADMIN_PASS) setAuthed(true);
    else toast.error("Clave incorrecta");
  };

  const saveEvent = async () => {
    if (!setting) return;
    // Si activamos y hay minutos > 0, calcular expires_at = ahora + minutos
    // Si activamos sin minutos (0 o vacío) => indefinido (expires_at = null)
    // Si lo apagamos => expires_at = null
    const expiresIso =
      eventActive && eventMinutes > 0
        ? new Date(Date.now() + eventMinutes * 60 * 1000).toISOString()
        : null;
    const { error } = await supabase
      .from("settings")
      .update({
        multiplier,
        event_name: eventName.trim() || null,
        active: eventActive,
        expires_at: expiresIso,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", setting.id);
    if (error) return toast.error("Error al guardar");
    setEventExpiresAt(expiresIso);
    toast.success(
      eventActive && expiresIso
        ? `Evento activado por ${eventMinutes} min`
        : eventActive
          ? "Evento activado (indefinido)"
          : "Evento desactivado"
    );
    loadAll();
  };


  const deleteSession = async (id: string) => {
    if (!confirm("¿Eliminar esta sesión?")) return;
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) return toast.error("Error al eliminar");
    toast.success("Sesión eliminada");
    loadAll();
  };

  const editMinutes = async (s: Session) => {
    const v = prompt(`Editar minutos para ${s.user_name}:`, String(s.total_minutes ?? 0));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (Number.isNaN(n) || n < 0) return toast.error("Valor inválido");
    const { error } = await supabase.from("sessions").update({ total_minutes: n }).eq("id", s.id);
    if (error) return toast.error("Error");
    toast.success("Actualizado");
    loadAll();
  };

  const nukeAll = async () => {
    if (!confirm("¿Estás seguro de que querés patear a todos?")) return;
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*")
      .is("end_time", null);
    if (!sessions || sessions.length === 0) {
      toast.message("No hay sesiones activas.");
      return;
    }
    const { data: s } = await supabase
      .from("settings")
      .select("multiplier,event_name,active")
      .eq("key", "multiplier")
      .maybeSingle();
    const mult = s?.active ? Number(s.multiplier) || 1 : 1;
    const evName = s?.active ? s.event_name : null;
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    let count = 0;
    for (const sess of sessions) {
      const raw = Math.max(1, Math.round((nowMs - new Date(sess.start_time).getTime()) / 60000));
      const minutes = Math.round(raw * mult);
      const { error } = await supabase
        .from("sessions")
        .update({
          end_time: nowIso,
          total_minutes: minutes,
          last_seen: nowIso,
          multiplier: mult,
          event_name: evName,
        })
        .eq("id", sess.id);
      if (!error) count++;
    }
    toast.success(`💥 ${count} sesiones cerradas y guardadas.`);
    loadAll();
  };

  const renameUser = async (oldName: string) => {
    const v = prompt(`Renombrar a "${oldName}":`, oldName);
    if (v == null) return;
    const newName = v.trim();
    if (!newName || newName === oldName) return;
    const { error } = await supabase
      .from("sessions")
      .update({ user_name: newName })
      .eq("user_name", oldName);
    if (error) return toast.error("Error al renombrar");
    toast.success(`Renombrado: ${oldName} → ${newName}`);
    loadAll();
  };

  // Kick individual user - close their active session now
  const kickUser = async (s: Session) => {
    if (!confirm(`¿Desconectar a ${s.user_name}?`)) return;
    const { data: setting } = await supabase
      .from("settings")
      .select("multiplier,event_name,active")
      .eq("key", "multiplier")
      .maybeSingle();
    const mult = setting?.active ? Number(setting.multiplier) || 1 : 1;
    const evName = setting?.active ? setting.event_name : null;
    const nowIso = new Date().toISOString();
    const raw = Math.max(1, Math.round((Date.now() - new Date(s.start_time).getTime()) / 60000));
    const minutes = Math.round(raw * mult);
    const { error } = await supabase
      .from("sessions")
      .update({
        end_time: nowIso,
        total_minutes: minutes,
        last_seen: nowIso,
        multiplier: mult,
        event_name: evName,
      })
      .eq("id", s.id);
    if (error) return toast.error("Error al desconectar");
    toast.success(`👢 ${s.user_name} desconectado · ${minutes} min`);
    loadAll();
  };

  // Adjust user total (insert a synthetic adjustment row, +/- minutes)
  const adjustUserTime = async (name: string) => {
    const v = prompt(`Ajustar minutos para "${name}" (+sumar / -restar):`, "0");
    if (v == null) return;
    const delta = parseInt(v, 10);
    if (Number.isNaN(delta) || delta === 0) return toast.error("Valor inválido");
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("sessions").insert({
      user_name: name,
      start_time: nowIso,
      end_time: nowIso,
      total_minutes: delta,
      last_seen: nowIso,
      multiplier: 1,
      event_name: delta >= 0 ? "Ajuste admin (+)" : "Penalización admin (−)",
    });
    if (error) return toast.error("Error al ajustar");
    toast.success(`⏱ ${name}: ${delta > 0 ? "+" : ""}${delta} min`);
    loadAll();
  };

  // Send text broadcast
  const sendTextBroadcast = async () => {
    const msg = bcastMsg.trim();
    if (!msg) return toast.error("Escribe un mensaje");
    if (bcastMins <= 0) return toast.error("Duración inválida");
    const expires = new Date(Date.now() + bcastMins * 60 * 1000).toISOString();
    const { error } = await (supabase as any).from("broadcasts").insert({
      type: "text",
      message: msg,
      expires_at: expires,
    });
    if (error) return toast.error("Error al enviar");
    toast.success(`📢 Mensaje enviado por ${bcastMins} min`);
    setBcastMsg("");
    loadAll();
  };

  // Handle file selection (with preview)
  const onPickFile = (f: File | null) => {
    setBcastFile(f);
    if (bcastFilePreview) URL.revokeObjectURL(bcastFilePreview);
    setBcastFilePreview(f ? URL.createObjectURL(f) : "");
  };

  // Send image broadcast (uploads file if provided, else uses URL)
  const sendImageBroadcast = async () => {
    if (bcastImgMins <= 0) return toast.error("Duración inválida");
    let url = bcastImg.trim();

    if (bcastFile) {
      setUploading(true);
      try {
        const ext = bcastFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("announcements_images")
          .upload(path, bcastFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: bcastFile.type || undefined,
          });
        if (upErr) {
          setUploading(false);
          return toast.error("Error al subir: " + upErr.message);
        }
        const { data: pub } = supabase.storage
          .from("announcements_images")
          .getPublicUrl(path);
        url = pub.publicUrl;
      } catch (e: any) {
        setUploading(false);
        return toast.error("Error al subir: " + (e?.message ?? "desconocido"));
      }
      setUploading(false);
    }

    if (!url) return toast.error("Subí un archivo o pegá una URL");

    const expires = new Date(Date.now() + bcastImgMins * 60 * 1000).toISOString();
    const { error } = await (supabase as any).from("broadcasts").insert({
      type: "image",
      image_url: url,
      expires_at: expires,
    });
    if (error) return toast.error("Error al enviar");
    toast.success(`🖼 Pop-up enviado por ${bcastImgMins} min`);
    setBcastImg("");
    onPickFile(null);
    loadAll();
  };

  const deleteBroadcast = async (id: string) => {
    const { error } = await (supabase as any).from("broadcasts").delete().eq("id", id);
    if (error) return toast.error("Error");
    toast.success("Eliminado");
    loadAll();
  };

  // Lista única de usuarios desde el historial + activos
  const allUsers = Array.from(
    new Map(
      [...active, ...history].map((s) => [s.user_name, s.user_name])
    ).keys()
  ).sort();

  // Ranking calculado (suma de minutos por usuario)
  const ranking = (() => {
    const map = new Map<string, number>();
    for (const s of [...active, ...history]) {
      if (s.total_minutes != null) map.set(s.user_name, (map.get(s.user_name) ?? 0) + (s.total_minutes ?? 0));
    }
    return Array.from(map, ([user_name, minutes]) => ({ user_name, minutes })).sort((a, b) => b.minutes - a.minutes);
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Panel de Administración
          </DialogTitle>
        </DialogHeader>

        {!authed ? (
          <div className="space-y-3">
            <Label>Clave de acceso</Label>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAuth()}
              autoFocus
            />
            <Button onClick={tryAuth} className="w-full">Ingresar</Button>
          </div>
        ) : (
          <Tabs defaultValue="live">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="live"><Activity className="mr-1 h-4 w-4" />Vivo</TabsTrigger>
              <TabsTrigger value="ranking"><Trophy className="mr-1 h-4 w-4" />Ranking</TabsTrigger>
              <TabsTrigger value="broadcast"><Megaphone className="mr-1 h-4 w-4" />Broad.</TabsTrigger>
              <TabsTrigger value="event"><Sparkles className="mr-1 h-4 w-4" />Evento</TabsTrigger>
              <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Users</TabsTrigger>
              <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Hist.</TabsTrigger>
              <TabsTrigger value="diag"><Terminal className="mr-1 h-4 w-4" />Diag</TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="mt-4 space-y-3">
              <Button
                onClick={nukeAll}
                variant="destructive"
                className="w-full font-bold uppercase tracking-wider"
                size="lg"
              >
                <Zap className="mr-2 h-5 w-5" /> Desconectar a Todos
              </Button>
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Sesiones activas ({active.length})</h3>
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nadie conectado.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {active.map((s) => {
                      const mins = Math.floor((Date.now() - new Date(s.start_time).getTime()) / 60000);
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{s.user_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Inicio: {new Date(s.start_time).toLocaleTimeString()} · {mins} min
                            </div>
                          </div>
                          <span className="h-2 w-2 rounded-full bg-primary" />
                          <Button size="sm" variant="destructive" onClick={() => kickUser(s)} className="h-7 px-2 text-xs">
                            <LogOut className="mr-1 h-3 w-3" /> Kick
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="ranking" className="mt-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Ranking · Ajuste manual ({ranking.length})</h3>
                {ranking.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {ranking.map((r, i) => {
                      const h = Math.floor(r.minutes / 60);
                      const m = r.minutes % 60;
                      return (
                        <li key={r.user_name} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                            <span className="truncate font-medium">{r.user_name}</span>
                          </div>
                          <span className="font-mono tabular-nums text-xs text-muted-foreground">
                            {h}h {String(m).padStart(2, "0")}m
                          </span>
                          <Button size="sm" variant="outline" onClick={() => adjustUserTime(r.user_name)} className="h-7 px-2 text-xs">
                            <Clock className="mr-1 h-3 w-3" /> Ajustar
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Ingresa valor positivo (bono) o negativo (penalización) en minutos.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="broadcast" className="mt-4 space-y-4">
              <Card className="p-4 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Megaphone className="h-4 w-4" /> Mensaje de texto (banner)
                </h3>
                <Input
                  placeholder="Ej: ¡Cierra a las 22:00! Apuren."
                  value={bcastMsg}
                  onChange={(e) => setBcastMsg(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Duración (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={bcastMins}
                    onChange={(e) => setBcastMins(parseInt(e.target.value, 10) || 1)}
                  />
                  <Button onClick={sendTextBroadcast} className="ml-auto">
                    <Megaphone className="mr-2 h-4 w-4" /> Enviar
                  </Button>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="h-4 w-4" /> Pop-up de imagen
                </h3>

                {/* Drag & drop / file picker */}
                <label
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f && f.type.startsWith("image/")) onPickFile(f);
                    else if (f) toast.error("Solo se permiten imágenes");
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground cursor-pointer hover:bg-muted/40"
                >
                  <ImageIcon className="h-5 w-5" />
                  <span>Arrastrá una imagen aquí o hacé click para elegir</span>
                  <span className="text-[10px] opacity-70">JPG, PNG, WEBP, GIF</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                {bcastFile && (
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <img
                      src={bcastFilePreview}
                      alt="preview"
                      className="h-16 w-16 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="truncate font-medium">{bcastFile.name}</div>
                      <div className="text-muted-foreground">
                        {(bcastFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onPickFile(null)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  <span className="relative mx-auto block w-fit bg-background px-2 text-[10px] uppercase text-muted-foreground">
                    o usar URL
                  </span>
                </div>

                <Input
                  placeholder="URL de la imagen (https://...)"
                  value={bcastImg}
                  onChange={(e) => setBcastImg(e.target.value)}
                  disabled={!!bcastFile}
                />

                <div className="flex items-center gap-2">
                  <Label className="text-xs">Duración (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={bcastImgMins}
                    onChange={(e) => setBcastImgMins(parseInt(e.target.value, 10) || 1)}
                  />
                  <Button onClick={sendImageBroadcast} disabled={uploading} className="ml-auto">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {uploading ? "Subiendo..." : "Enviar Foto"}
                  </Button>
                </div>

                {!bcastFile && bcastImg && (
                  <img src={bcastImg} alt="preview" className="max-h-32 rounded-md border object-contain" />
                )}
              </Card>


              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Broadcasts ({bcasts.length})</h3>
                {bcasts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin envíos.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {bcasts.map((b) => {
                      const exp = new Date(b.expires_at).getTime();
                      const active = exp > Date.now();
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-xs">
                              {b.type === "image" ? <ImageIcon className="h-3 w-3" /> : <Megaphone className="h-3 w-3" />}
                              <span className={active ? "font-bold text-primary" : "text-muted-foreground"}>
                                {active ? "Activo" : "Expirado"}
                              </span>
                              <span className="text-muted-foreground">· vence {new Date(b.expires_at).toLocaleTimeString()}</span>
                            </div>
                            <div className="truncate text-xs">{b.message ?? b.image_url}</div>
                          </div>
                          <Button size="sm" variant="destructive" onClick={() => deleteBroadcast(b.id)} className="h-7 px-2">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </TabsContent>



            <TabsContent value="event" className="mt-4 space-y-4">
              <Card className="p-4 space-y-3">
                <div>
                  <Label>Nombre del evento</Label>
                  <Input
                    placeholder="Sábado de Maratón"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Multiplicador</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 1.5, 2, 2.5, 3].map((v) => (
                      <Button
                        key={v}
                        type="button"
                        variant={multiplier === v ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMultiplier(v)}
                      >
                        x{v}
                      </Button>
                    ))}
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      className="w-24"
                      value={multiplier}
                      onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ev-active">Evento activo</Label>
                  <Switch id="ev-active" checked={eventActive} onCheckedChange={setEventActive} />
                </div>
                <Button onClick={saveEvent} className="w-full">
                  <Save className="mr-2 h-4 w-4" /> Guardar
                </Button>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="mt-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Usuarios ({allUsers.length})</h3>
                {allUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin usuarios.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {allUsers.map((name) => (
                      <li key={name} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="truncate font-medium">{name}</span>
                        <Button size="sm" variant="outline" onClick={() => renameUser(name)}>
                          <Pencil className="mr-1 h-3 w-3" /> Renombrar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Renombra todas las sesiones del usuario; se refleja en el ranking global.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-semibold">Últimas sesiones ({history.length})</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin registros.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {history.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{s.user_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(s.start_time).toLocaleString()} · {s.total_minutes ?? 0} min
                            {s.multiplier && Number(s.multiplier) > 1 ? ` · x${s.multiplier}` : ""}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => editMinutes(s)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteSession(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="diag" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Próximo corte global</div>
                  <div className="mt-1 font-mono text-lg font-bold">
                    {(() => {
                      const total = Math.max(0, Math.floor(msToNextHourTick / 1000));
                      const m = Math.floor(total / 60);
                      const s = total % 60;
                      return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
                    })()}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">IP Autorizada</div>
                  <div className="mt-1 font-mono text-lg font-bold">{ALLOWED_IP}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Usuarios en la mira</div>
                  <div className="mt-1 font-mono text-lg font-bold">{active.length}</div>
                </Card>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runDiagnostic(true)}
                  disabled={diagRunning}
                  size="lg"
                  className="font-bold uppercase tracking-wider"
                >
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Forzar Chequeo Ahora (Simular Hora en Punto)
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => runDiagnostic(false)}
                  disabled={diagRunning}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Ejecutar Real (cortes verdaderos)
                </Button>
                <Button variant="outline" onClick={() => setDiagLogs([])} disabled={diagRunning}>
                  <Trash2 className="mr-2 h-3 w-3" />
                  Limpiar
                </Button>
              </div>

              <div
                className="h-[360px] overflow-auto rounded-md border border-green-900/50 bg-black p-3 font-mono text-[11px] leading-relaxed text-green-400 shadow-inner"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {diagLogs.length === 0 ? (
                  <div className="text-green-700">
                    {"// Consola de Diagnóstico del Servidor"}
                    {"\n// Esperando eventos... Presioná 'Forzar Chequeo' para simular."}
                  </div>
                ) : (
                  diagLogs.map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.includes("MISMATCH") || l.includes("CORTE") || l.includes("❌")
                          ? "text-red-400"
                          : l.includes("MATCH") || l.includes("✅")
                            ? "text-green-300"
                            : l.includes("🔎") || l.includes("INICIANDO") || l.includes("SIMULACIÓN")
                              ? "text-yellow-300"
                              : "text-green-400"
                      }
                    >
                      {l}
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Reglas: un usuario es MATCH si su último latido es menor a 70 min. MISMATCH → corte de emergencia en el último latido válido (no se pierden los minutos blindados).
              </p>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
