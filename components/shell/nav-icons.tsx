import { BookOpen, CalendarClock, ChartColumn, FileText, GraduationCap, Home, Inbox, KeyRound, Layers, ListChecks, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import type { NavIcon } from "@/lib/shell/nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: Home,
  user: UserRound,
  shield: ShieldCheck,
  chart: ChartColumn,
  calendar: CalendarClock,
  book: BookOpen,
  tasks: ListChecks,
  users: Users,
  file: FileText,
  key: KeyRound,
  inbox: Inbox,
  layers: Layers,
};

export const ContextIcon = GraduationCap;
