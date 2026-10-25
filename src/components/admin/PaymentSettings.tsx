import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// PayMongo keys are stored in the database and readable by admins only.
export function PaymentSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => (await supabase.from("payment_settings").select("*").eq("provider", "paymongo").maybeSingle()).data,
  });
  const [pub, setPub] = useState("");
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) { setPub(data.publishable_key); setSecret(data.secret_key); setWebhook(data.webhook_secret); setEnabled(data.enabled); }
  }, [data]);

  async function save() {
    setBusy(true);
    const row = { provider: "paymongo", publishable_key: pub.trim(), secret_key: secret.trim(), webhook_secret: webhook.trim(), enabled, updated_at: new Date().toISOString() };
    const { error } = data
      ? await supabase.from("payment_settings").update(row).eq("id", data.id)
      : await supabase.from("payment_settings").insert(row);
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("PayMongo settings saved");
    qc.invalidateQueries({ queryKey: ["payment-settings"] });
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold"><CreditCard className="h-5 w-5 text-primary" />PayMongo payments</h3>
      <p className="text-xs text-muted-foreground">
        Paste the keys from your PayMongo dashboard. They are stored privately and are only visible to you here.
      </p>
      <div>
        <Label>Publishable key</Label>
        <Input className="mt-1" value={pub} onChange={(e) => setPub(e.target.value)} placeholder="pk_live_… or pk_test_…" />
      </div>
      <div>
        <Label>Secret key</Label>
        <Input className="mt-1" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="sk_live_… or sk_test_…" />
      </div>
      <div>
        <Label>Webhook signing secret (optional)</Label>
        <Input className="mt-1" type="password" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="whsk_…" />
        <p className="mt-1 text-xs text-muted-foreground">
          In your PayMongo dashboard, add a webhook for <span className="font-medium">checkout_session.payment.paid</span> pointing to:
        </p>
        <code className="mt-1 block break-all rounded-md bg-muted px-3 py-2 text-xs">{`${typeof window === "undefined" ? "" : window.location.origin}/api/public/paymongo-webhook`}</code>
      </div>
      <div className="flex items-center gap-2"><Switch checked={enabled} onCheckedChange={setEnabled} /><Label>Payments enabled</Label></div>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save payment settings"}</Button>
    </section>
  );
}
