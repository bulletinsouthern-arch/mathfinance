import { paymentMethods } from "@/lib/paymongo.functions";
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
    queryFn: async () =>
      (await supabase.from("payment_settings").select("*").eq("provider", "paymongo").maybeSingle())
        .data,
  });
  const { data: methods } = useQuery({
    queryKey: ["admin-payment-methods"],
    queryFn: () => paymentMethods({ data: {} }),
  });
  const [selectedMethods, setSelectedMethods] = useState<string[]>(["card", "gcash", "qrph"]);
  useEffect(() => {
    if (methods) setSelectedMethods(methods);
  }, [methods]);
  const [pub, setPub] = useState("");
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setPub(data.publishable_key);
      setSecret(data.secret_key);
      setWebhook(data.webhook_secret);
      setEnabled(data.enabled);
    }
  }, [data]);

  async function save() {
    if (enabled && !secret.trim())
      return void toast.error("A PayMongo secret key is required to enable payments.");
    if (!selectedMethods.length) return void toast.error("Select at least one payment method.");
    setBusy(true);
    const row = {
      provider: "paymongo",
      publishable_key: pub.trim(),
      secret_key: secret.trim(),
      webhook_secret: webhook.trim(),
      enabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = data
      ? await supabase.from("payment_settings").update(row).eq("id", data.id)
      : await supabase.from("payment_settings").insert(row);
    if (!error) {
      try {
        await paymentMethods({
          data: {
            methods: selectedMethods as (
              "card" | "gcash" | "qrph" | "paymaya" | "grab_pay" | "dob" | "dob_ubp"
            )[],
          },
        });
      } catch {
        setBusy(false);
        return void toast.error("Payment setup could not be activated. Retry saving settings.");
      }
    }
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("PayMongo settings saved");
    qc.invalidateQueries({ queryKey: ["payment-settings"] });
    qc.invalidateQueries({ queryKey: ["payment-gateway-status"] });
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold">
        <CreditCard className="h-5 w-5 text-primary" />
        PayMongo payments
      </h3>
      <p className="text-xs text-muted-foreground">
        Paste the keys from your PayMongo dashboard. They are stored privately and are only visible
        to you here.
      </p>
      <div>
        <Label>Publishable key</Label>
        <Input
          className="mt-1"
          value={pub}
          onChange={(e) => setPub(e.target.value)}
          placeholder="pk_live_… or pk_test_…"
        />
      </div>
      <div>
        <Label>Secret key</Label>
        <Input
          className="mt-1"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="sk_live_… or sk_test_…"
        />
      </div>
      <div>
        <Label>Webhook signing secret (recommended)</Label>
        <Input
          className="mt-1"
          type="password"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="whsk_…"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Checkout verifies payments directly with PayMongo when customers return. Add a webhook to
          confirm payments even if they close the page. In your PayMongo dashboard, add a webhook
          for <span className="font-medium">checkout_session.payment.paid</span> pointing to:
        </p>
        <code className="mt-1 block break-all rounded-md bg-muted px-3 py-2 text-xs">{`${typeof window === "undefined" ? "" : window.location.origin}/api/public/paymongo-webhook`}</code>
      </div>
      <fieldset className="space-y-2 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Checkout payment methods</legend>
        <p className="text-xs text-muted-foreground">
          Choose only methods activated in your PayMongo merchant account. PayMongo shows these
          buttons on its secure checkout. Live payments require live keys and an activated merchant
          account.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["card", "Cards"],
            ["gcash", "GCash"],
            ["qrph", "QR Ph"],
            ["paymaya", "Maya"],
            ["grab_pay", "GrabPay"],
            ["dob", "Online banking"],
            ["dob_ubp", "UnionBank"],
          ].map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedMethods.includes(id!)}
                onChange={(e) =>
                  setSelectedMethods((v) =>
                    e.target.checked ? [...v, id!] : v.filter((x) => x !== id),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label>Payments enabled</Label>
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save payment settings"}
      </Button>
    </section>
  );
}
