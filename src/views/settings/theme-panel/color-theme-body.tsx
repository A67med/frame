import { Check } from "../icons";
import { selectableThemes, type ActiveThemeId } from "@/lib/theme";

export function ColorThemeBody({
  activePreset,
  onSelect,
}: {
  activePreset: ActiveThemeId;
  onSelect: (id: ActiveThemeId) => void;
}) {
  return (
    <div className="animate-fade-in grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {selectableThemes().map((p) => {
        const active = activePreset === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`group relative flex min-h-[168px] flex-col justify-end overflow-hidden rounded-[10px] border p-4 text-start transition ${
              active ? "border-ink" : "border-edge-soft hover:border-edge"
            }`}
            style={{ background: p.swatch[0] }}
          >
            <div
              className="absolute inset-x-0 top-0 h-2/5"
              style={{
                background: `linear-gradient(180deg, ${p.swatch[1]}, ${p.swatch[0]})`,
              }}
            />
            <div
              className="absolute end-3 top-3 flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: p.swatch[2] }}
            >
              {active && <Check size={14} strokeWidth={3} style={{ color: p.swatch[0] }} />}
            </div>
            <div className="relative">
              <p
                className="text-[16.5px] font-semibold leading-[24px]"
                style={{ color: p.swatch[2] }}
              >
                {p.name}
              </p>
              <p
                className="mt-0.5 text-[15.5px] leading-[22px]"
                style={{ color: p.swatch[2], opacity: 0.7 }}
              >
                {p.blurb}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
