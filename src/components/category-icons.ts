import { BarChart3, Target, ShieldCheck, Settings2, FileText, Calculator, TrendingUp, Globe2, Factory, UserCog, User, Building2, Box, Clock, ShieldAlert, Activity, Umbrella, Users, Sigma, Landmark, Truck, Megaphone, type LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [BarChart3, Target, ShieldCheck, Settings2, FileText, Calculator, TrendingUp, Globe2, Factory, UserCog, User, Building2, Box, Clock, ShieldAlert, Activity, Umbrella, Users, Sigma, Landmark, Truck, Megaphone];
export const catIcon = (cat: number): LucideIcon => ICONS[cat - 1] ?? BarChart3;
