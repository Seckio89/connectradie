import { useEffect, useState } from 'react';
import { Type, RotateCcw } from 'lucide-react';
import {
  DEFAULT_TEXT_SCALE,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TEXT_SCALE_EVENT,
  TEXT_SCALE_STEP,
  getTextScale,
  setTextScale,
  toPercent,
} from '../../lib/textScale';

/**
 * Settings → Interface. Successor to the light/dark Appearance toggle that was
 * removed at the v2 cutover.
 *
 * Self-contained with no props, following SiteCheckInSetting: the preference is
 * device-local, so Settings.tsx has no state to own and no save handler to pass
 * down. The slider writes through on every change — it applies live to the whole
 * page, which is the point of putting it on a slider rather than behind a Save.
 */
export default function InterfaceTab() {
  const [scale, setScale] = useState(getTextScale);

  // Resync if the scale is changed elsewhere (another tab, or a future control).
  useEffect(() => {
    const sync = () => setScale(getTextScale());
    window.addEventListener(TEXT_SCALE_EVENT, sync);
    return () => window.removeEventListener(TEXT_SCALE_EVENT, sync);
  }, []);

  const update = (next: number) => {
    setScale(next);
    setTextScale(next);
  };

  const isDefault = scale === DEFAULT_TEXT_SCALE;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h3 className="text-lg font-semibold text-ct-paper mb-1">Interface</h3>
        <p className="text-sm text-ct-mute-2 mb-6">
          Adjust how ConnecTradie looks on this device. These settings are saved here
          only — sign in on another phone or computer and you can set it differently.
        </p>
      </div>

      <div className="p-4 bg-ct-surface-2 rounded-ct-md border border-ct-line">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center flex-shrink-0">
              <Type className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div>
              <p className="font-medium text-ct-paper">Text size</p>
              <p className="text-sm text-ct-mute-2">
                Drag left for smaller text, right for larger. Everything resizes as you go.
              </p>
            </div>
          </div>
          <span className="font-ct-mono text-sm text-ct-teal flex-shrink-0 tabular-nums">
            {toPercent(scale)}%
          </span>
        </div>

        <input
          type="range"
          min={MIN_TEXT_SCALE}
          max={MAX_TEXT_SCALE}
          step={TEXT_SCALE_STEP}
          value={scale}
          onChange={(e) => update(Number.parseFloat(e.target.value))}
          aria-label="Text size"
          aria-valuetext={`${toPercent(scale)} percent`}
          className="w-full h-2 bg-ct-line rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ct-teal focus:ring-offset-2 focus:ring-offset-ct-surface-2 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ct-teal [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ct-ink [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ct-teal [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ct-ink"
        />

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-ct-mute">{toPercent(MIN_TEXT_SCALE)}%</span>
          <span className="text-xs text-ct-mute">{toPercent(MAX_TEXT_SCALE)}%</span>
        </div>

        {/* Live sample. The whole page rescales as the slider moves, but a fixed
            block of representative text gives somewhere to look while dragging. */}
        <div className="mt-5 p-4 bg-ct-surface rounded-ct-sm border border-ct-line-soft">
          <p className="text-xs font-ct-mono uppercase tracking-[0.1em] text-ct-mute mb-2">Preview</p>
          <p className="font-medium text-ct-paper mb-1">Leaking tap, Granville NSW</p>
          <p className="text-sm text-ct-mute-2">
            Three quotes in. Payment is held securely until you approve the work.
          </p>
        </div>

        <button
          type="button"
          onClick={() => update(DEFAULT_TEXT_SCALE)}
          disabled={isDefault}
          className="inline-flex items-center gap-2 mt-5 px-4 py-2 border border-ct-line text-ct-mute-2 text-sm font-medium rounded-ct-sm hover:bg-ct-surface-2 hover:text-ct-paper transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to default
        </button>
      </div>

      <div className="bg-ct-surface-2 border border-ct-line rounded-ct-md p-4">
        <p className="text-sm font-medium text-ct-paper mb-1">How this works</p>
        <p className="text-sm text-ct-mute-2">
          Text size applies everywhere in ConnecTradie on this device and is remembered
          next time you open the app. You can also pinch to zoom at any time.
        </p>
      </div>
    </div>
  );
}
