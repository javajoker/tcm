import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useI18n, type T } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import { estimateTap, TAP, type RateBands, type TapResult } from "./tapTempo.ts";

/**
 * Tap-tempo control of the pulse screen (docs/post-mvp/design/tap-tempo-and-regions.md §1.3). The person taps with each beat they feel; the rate is shown only after
 * *Done* (a running number would bias the taps) or when the run ends by itself at 30 taps, and is announced once. It fills the rate field through `onUse`, where the
 * person can still change it. The typed rate and the 30-second count remain for anyone who cannot tap.
 */
export function TapTempo({ bands, onUse }: { bands: RateBands; onUse: (rate: number) => void }): ReactNode {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState<readonly number[]>([]);
  const [result, setResult] = useState<TapResult | null>(null);

  const finish = (times: readonly number[]): void => setResult(estimateTap(times, bands));
  const reset = (): void => { setTaps([]); setResult(null); };
  const close = (): void => { reset(); setOpen(false); };
  const tap = (e: MouseEvent<HTMLButtonElement>): void => {
    const next = [...taps, e.timeStamp];
    setTaps(next);
    if (next.length >= TAP.maxTaps) finish(next);
  };
  // holding Enter would repeat the click: a held key is one tap, not many
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>): void => { if (e.repeat) e.preventDefault(); };

  if (!open) return <Button onClick={() => setOpen(true)}>{t.t("observe.pulse.tap.open")}</Button>;

  return (
    <section aria-labelledby="tap-title" style={{ display: "grid", gap: "var(--space-3)" }}>
      <h3 id="tap-title">{t.t("observe.pulse.tap.title")}</h3>
      {result === null ? (
        <>
          <p>{t.t("observe.pulse.tap.how")}</p>
          <button type="button" className="tap-button" onClick={tap} onKeyDown={keyDown} style={{ minHeight: "5rem", fontSize: "1.25rem" }}>{t.t("observe.pulse.tap.button")}</button>
          <p aria-live="off">{t.plural("observe.pulse.tap.count", taps.length)}</p>
          {taps.length < TAP.minTaps ? <p className="muted">{t.t("observe.pulse.tap.need", { n: TAP.minTaps })}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <Button variant="primary" disabled={taps.length < TAP.minTaps} onClick={() => finish(taps)}>{t.t("observe.pulse.tap.done")}</Button>
            <Button onClick={reset} disabled={taps.length === 0}>{t.t("observe.pulse.tap.reset")}</Button>
            <Button variant="ghost" onClick={close}>{t.t("observe.pulse.tap.close")}</Button>
          </div>
        </>
      ) : (
        <>
          <div role="status" style={{ display: "grid", gap: "var(--space-2)" }}>
            <p>{message(result, bands, t)}</p>
            {result.rate !== null && result.unevenHint ? <p className="muted">{t.t("observe.pulse.tap.result.hint")}</p> : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            {result.rate !== null ? <Button variant="primary" onClick={() => { onUse(result.rate!); close(); }}>{t.t("observe.pulse.tap.use")}</Button> : null}
            <Button onClick={reset}>{t.t("observe.pulse.tap.again")}</Button>
            <Button variant="ghost" onClick={close}>{t.t("observe.pulse.tap.close")}</Button>
          </div>
        </>
      )}
    </section>
  );
}

function message(r: TapResult, bands: RateBands, t: T): string {
  switch (r.status) {
    case "ok": return t.t("observe.pulse.tap.result.ok", { rate: r.rate! });
    case "near-edge": return t.t(Math.abs(r.rate! - bands.rapid_gt) <= Math.abs(r.rate! - bands.slow_lt) ? "observe.pulse.tap.result.nearRapid" : "observe.pulse.tap.result.nearSlow", { rate: r.rate! });
    case "too-uneven": return t.t("observe.pulse.tap.result.tooUneven");
    case "too-few": return t.t("observe.pulse.tap.result.tooFew");
  }
}
