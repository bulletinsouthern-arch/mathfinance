import { BarChart3, Target, ShieldCheck, Settings2, FileText, Calculator, TrendingUp, Globe2, Factory, UserCog, User, Building2, Box, Clock, ShieldAlert, Activity, Umbrella, Users, Sigma, Landmark, Truck, Megaphone, type LucideIcon } from "lucide-react";

const MAP: Record<number, LucideIcon> = {
  1: BarChart3, 2: Target, 3: ShieldCheck, 4: Settings2, 5: FileText, 6: Calculator, 7: TrendingUp, 8: Globe2,
  9: Factory, 10: UserCog, 11: User, 12: Building2, 13: Box, 14: Clock, 15: ShieldAlert, 16: Activity,
  17: Umbrella, 18: Users, 19: Sigma, 20: Landmark, 21: Truck, 22: Megaphone,
};

export const CAT_ICONS = new Proxy(MAP, { get: (t, k) => t[Number(k)] ?? BarChart3 }) as Record<number, LucideIcon> & { [k: number]: LucideIcon };
