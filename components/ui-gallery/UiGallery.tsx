"use client";

import { ArrowRight, Download, Plus, Users } from "lucide-react";
import { useState } from "react";
import {
  Avatar, AvatarStack, Badge, Button, Callout, Card, DataTable, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, EmptyState, Kbd, Overline, ProgressBar, ProgressRing, SearchField, SegmentedControl, SegmentedProgress, Select, Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger,
  Skeleton, StatTile, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipProvider, toast, Toaster,
} from "@/components/ui";

type Row = { person: string; course: string; status: string };
const ROWS: Row[] = [
  { person: "Anna Beispiel", course: "Kubernetes Administrator", status: "Bestanden" },
  { person: "Ben Muster", course: "Security+", status: "In Arbeit" },
];

function Showcase() {
  const [seg, setSeg] = useState("all");
  const [sel, setSel] = useState("a");
  return (
    <div className="flex min-w-0 flex-col gap-6 bg-background p-6 text-foreground">
      <section className="flex flex-wrap items-center gap-3">
        <Button>Primär</Button>
        <Button variant="secondary">Sekundär</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="inverted">Invertiert</Button>
        <Button size="sm" iconLeft={<Plus className="h-4 w-4" />}>Klein</Button>
        <Button size="lg" iconRight={<ArrowRight className="h-4 w-4" />}>Weiter</Button>
        <Button disabled>Gesperrt</Button>
      </section>
      <section className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">Kontext</Badge><Badge tone="mint">Mint</Badge><Badge tone="info">In Arbeit</Badge><Badge tone="warning">Läuft bald ab</Badge><Badge tone="danger">Überfällig</Badge><Badge>Neutral</Badge><Badge tone="violet">Gruppe</Badge>
        <Kbd>⌘K</Kbd><Kbd>A</Kbd>
      </section>
      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Fragen beantwortet" value="1.284" sub="+86 diese Woche" subTone="accent" />
        <StatTile label="Trefferquote" value="82 %" sub="+3 Punkte" subTone="accent" />
        <StatTile label="Überfällig" value="3" sub="Erinnerung möglich" subTone="danger" />
        <StatTile label="Lernzeit" value="14,5 h" sub="diese Woche 3,2 h" />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Card variant="hero">
          <Overline>Weitermachen</Overline>
          <h2 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">Troubleshooting von Netzwerkfehlern</h2>
          <ProgressBar value={62} size="lg" className="mt-4 max-w-[520px]" label="Fortschritt" />
          <div className="mt-4 flex gap-2"><Button iconRight={<ArrowRight className="h-4 w-4" />}>Weiterlernen</Button><Button variant="secondary">12 Wiederholungen</Button></div>
        </Card>
        <Card className="flex items-center gap-5">
          <ProgressRing value={78} caption="von 100" label="Prüfungsbereitschaft 78" markAt={70} />
          <div className="flex-1 space-y-2">
            <ProgressBar value={90} tone="accent" size="sm" /><ProgressBar value={55} tone="warning" size="sm" /><ProgressBar value={25} tone="danger" size="sm" />
            <SegmentedProgress label="Frage 4 von 8" segments={["correct", "correct", "wrong", "current", "open", "open", "open", "open"]} />
          </div>
        </Card>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <Callout tone="exam" title="Prüfungsrelevant">Ein Service ohne passenden Selector hat keine Endpoints.</Callout>
        <Callout tone="mistake" title="Häufiger Fehler">Labels und Selector müssen exakt übereinstimmen.</Callout>
        <Callout tone="memo" title="Merksatz">Pod → ReplicaSet → Deployment.</Callout>
        <Callout tone="info" title="Hinweis">Nur gegen eigene Testumgebungen ausführen.</Callout>
      </section>
      <section className="flex flex-wrap items-center gap-4">
        <AvatarStack names={["Anna Beispiel", "Ben Muster", "Cem Test", "Dana Probe", "Eli Neu", "Fay Alt"]} />
        <Avatar name="Anna Beispiel" size="lg" /><Avatar name="offen@firma.de" dashed />
        <SegmentedControl value={seg} onChange={setSeg} label="Filter" options={[{ value: "all", label: "Alle" }, { value: "late", label: "Überfällig" }, { value: "done", label: "Abgeschlossen" }]} />
        <div className="w-56"><Select value={sel} onValueChange={setSel} label="Gruppe" options={[{ value: "a", label: "Infrastruktur & Netzwerk" }, { value: "b", label: "Security" }]} /></div>
        <div className="w-72"><SearchField placeholder="Suchen …" aria-label="Suche" /></div>
      </section>
      <Tabs defaultValue="one">
        <TabsList><TabsTrigger value="one">Übersicht</TabsTrigger><TabsTrigger value="two">Mitarbeitende</TabsTrigger><TabsTrigger value="three">Kursgruppen</TabsTrigger></TabsList>
        <TabsContent value="one" className="pt-4">
          <DataTable columns={[{ key: "p", header: "Person", render: (r: Row) => <span className="flex items-center gap-2"><Avatar name={r.person} size="sm" />{r.person}</span> }, { key: "c", header: "Lernpfad", render: (r: Row) => r.course }, { key: "s", header: "Status", render: (r: Row) => <Badge tone={r.status === "Bestanden" ? "mint" : "info"}>{r.status}</Badge> }, { key: "n", header: "Zahl", align: "right", render: () => "1.234" }]} rows={ROWS} rowKey={(r) => r.person} caption="Beispiel" />
        </TabsContent>
        <TabsContent value="two" className="pt-4"><EmptyState icon={<Users />} title="Noch niemand eingeladen" description="Lade die ersten Mitarbeitenden ein." action={<Button size="sm">Einladen</Button>} /></TabsContent>
        <TabsContent value="three" className="pt-4"><div className="flex gap-3"><Skeleton className="h-16 w-1/3" /><Skeleton className="h-16 w-1/3" /><Skeleton className="h-16 w-1/3" /></div></TabsContent>
      </Tabs>
      <section className="flex flex-wrap items-center gap-3">
        <Dialog><DialogTrigger asChild><Button variant="secondary">Dialog</Button></DialogTrigger><DialogContent><DialogTitle>Lernpfad zuweisen</DialogTitle><DialogDescription>Personen wählen, Lernpfad wählen, Frist setzen.</DialogDescription><div className="mt-4 flex justify-end"><Button>Zuweisen</Button></div></DialogContent></Dialog>
        <Sheet><SheetTrigger asChild><Button variant="secondary">Sheet</Button></SheetTrigger><SheetContent><SheetTitle>Kurs generieren</SheetTitle><SheetDescription>Schritt 1 von 4</SheetDescription></SheetContent></Sheet>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost">Menü</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuCheckItem checked>Persönlich</DropdownMenuCheckItem><DropdownMenuCheckItem checked={false}>Firma</DropdownMenuCheckItem><DropdownMenuItem>Abmelden</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Tooltip content="Als Datei speichern"><Button variant="ghost" size="sm" iconLeft={<Download className="h-4 w-4" />} aria-label="Download">Hinweis</Button></Tooltip>
        <Button variant="secondary" onClick={() => toast.success("Gespeichert")}>Toast</Button>
      </section>
    </div>
  );
}

const CONTEXTS = [
  { value: "personal", label: "Persönlich" },
  { value: "company", label: "Firma" },
  { value: "admin", label: "Plattform-Admin" },
] as const;

/** Alle Bausteine je Kontext in hell UND dunkel nebeneinander (die Klassen `.light`/`.dark` setzen die Tokens lokal). */
export function UiGallery() {
  const [ctx, setCtx] = useState<(typeof CONTEXTS)[number]["value"]>("personal");
  return (
    <TooltipProvider>
      <Toaster />
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">UI-Bausteine</h1>
        <SegmentedControl value={ctx} onChange={setCtx} label="Kontext" options={CONTEXTS.map((c) => ({ value: c.value, label: c.label }))} />
      </div>
      <div data-context={ctx} className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <div className="dark overflow-hidden rounded-2xl border border-border" data-testid="gallery-dark"><Showcase /></div>
        <div className="light overflow-hidden rounded-2xl border border-border" data-testid="gallery-light"><Showcase /></div>
      </div>
    </TooltipProvider>
  );
}
