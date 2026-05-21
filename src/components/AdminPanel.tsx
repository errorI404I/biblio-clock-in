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
import { Trash2, Save, Lock, Activity, Sparkles, History, Zap, Pencil, Users } from "lucide-react";

const ADMIN_PASS = "54321";

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

  useEffect(() => {
    if (!open) {
      setAuthed(false);
      setPass("");
    }
  }, [open]);

  const loadAll = async () => {
    const [{ data: act }, { data: hist }, { data: s }] = await Promise.all([
      supabase.from("sessions").select("*").is("end_time", null).order("start_time", { ascending: false }),
      supabase.from("sessions").select("*").not("end_time", "is", null).order("start_time", { ascending: false }).limit(100),
      supabase.from("settings").select("*").eq("key", "multiplier").maybeSingle(),
    ]);
    setActive((act ?? []) as Session[]);
    setHistory((hist ?? []) as Session[]);
    if (s) {
      setSetting(s as Setting);
      setMultiplier(Number(s.multiplier) || 1);
      setEventName(s.event_name ?? "");
      setEventActive(!!s.active);
    }
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
    const { error } = await supabase
      .from("settings")
      .update({
        multiplier,
        event_name: eventName.trim() || null,
        active: eventActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", setting.id);
    if (error) return toast.error("Error al guardar");
    toast.success("Evento actualizado");
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

  // Lista única de usuarios desde el historial + activos
  const allUsers = Array.from(
    new Map(
      [...active, ...history].map((s) => [s.user_name, s.user_name])
    ).keys()
  ).sort();

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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="live"><Activity className="mr-1 h-4 w-4" />En vivo</TabsTrigger>
              <TabsTrigger value="event"><Sparkles className="mr-1 h-4 w-4" />Evento</TabsTrigger>
              <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Usuarios</TabsTrigger>
              <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Historial</TabsTrigger>
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
                        <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <div className="font-medium">{s.user_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Inicio: {new Date(s.start_time).toLocaleTimeString()} · {mins} min
                            </div>
                          </div>
                          <span className="h-2 w-2 rounded-full bg-primary" />
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
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
