import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Building2, LayoutDashboard, Radar, Send, Settings, Sun, Moon, PlusCircle } from 'lucide-react';
import { useEffect } from 'react';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  // ESC inside cmdk closes by default, but if the user clicks the backdrop we
  // also want to close — handle via a sibling click-outside on the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  function run(fn: () => void) { fn(); onOpenChange(false); }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm animate-in fade-in-0"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg
                   rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden
                   animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full">
          <Command.Input
            placeholder="Type a command or search…"
            className="w-full h-12 px-4 bg-transparent border-b border-border text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">No results found.</Command.Empty>

            <Command.Group heading="Jump to">
              <Item onSelect={() => run(() => navigate('/'))} icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" hint="G then D" />
              <Item onSelect={() => run(() => navigate('/agencies'))} icon={<Building2 className="h-4 w-4" />} label="Agencies" hint="G then A" />
              <Item onSelect={() => run(() => navigate('/sweeps'))} icon={<Radar className="h-4 w-4" />} label="Sweeps" hint="G then S" />
              <Item onSelect={() => run(() => navigate('/outreach'))} icon={<Send className="h-4 w-4" />} label="Outreach" hint="G then O" />
              <Item onSelect={() => run(() => navigate('/settings'))} icon={<Settings className="h-4 w-4" />} label="Settings" hint="G then ," />
            </Command.Group>

            <Command.Group heading="Actions">
              <Item onSelect={() => run(() => navigate('/sweeps?new=1'))} icon={<PlusCircle className="h-4 w-4" />} label="Start a new sweep" />
            </Command.Group>

            <Command.Group heading="Preferences">
              <Item
                onSelect={() => run(() => {
                  const next = !document.documentElement.classList.contains('dark');
                  document.documentElement.classList.toggle('dark', next);
                })}
                icon={
                  document.documentElement.classList.contains('dark')
                    ? <Sun className="h-4 w-4" />
                    : <Moon className="h-4 w-4" />
                }
                label="Toggle theme"
                hint="⌘⇧L"
              />
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({
  onSelect, icon, label, hint,
}: { onSelect: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] text-foreground/80 cursor-pointer
                 data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground font-mono">{hint}</span>}
    </Command.Item>
  );
}
