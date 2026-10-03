// Dev-only component catalogue (UX spec §6): every base component in every state, so states can be reviewed (and axe-checked) in one place.
// Strings here are developer-facing and deliberately not localised; the module is only reachable behind IS_DEV_PROFILE.
import { useState, type ReactNode } from "react";
import { usePageTitle } from "../app/usePageTitle.ts";
import { Button, Card, Chip, Dialog, DialogActions, Field, LinkButton, Notice, Progress, SegmentedControl, Select, Skeleton, Tile, TextInput, Tooltip } from "../ui/index.ts";

type Sev = "light" | "moderate" | "severe";

export default function Catalogue(): ReactNode {
  usePageTitle(null);
  const [sev, setSev] = useState<Sev | null>("moderate");
  const [one, setOne] = useState("b");
  const [many, setMany] = useState<readonly string[]>(["x"]);
  const [dlg, setDlg] = useState<null | "modal" | "blocking" | "sheet">(null);
  const toggle = (v: string, on: boolean): void => setMany((m) => (on ? [...m, v] : m.filter((x) => x !== v)));
  return (
    <div data-testid="catalogue">
      <h1>Component catalogue</h1>

      <Card title="Buttons" id="c-buttons">
        <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>Disabled</Button><LinkButton href="/dev/catalogue">Link styled as button</LinkButton>
        </p>
        <Button variant="primary" block>Block</Button>
      </Card>

      <Card title="Chips and notices" id="c-notices">
        <p><Chip>Plain</Chip> <Chip tone="primary">Primary</Chip> <Chip tone="notice">Notice</Chip></p>
        <Notice kind="emergency" kindLabel="Emergency" title="Seek emergency care">Chest pain with breathlessness needs urgent care.</Notice>
        <br /><Notice kind="caution" kindLabel="Caution" title="Pregnancy">Several formulas are not suitable.</Notice>
        <br /><Notice kind="info" kindLabel="Information">Educational use only.</Notice>
      </Card>

      <Card title="Selection" id="c-selection">
        <fieldset style={{ border: 0, padding: 0 }}><legend>Radio tiles</legend>
          {["a", "b", "c"].map((v) => <Tile key={v} type="radio" name="one" value={v} checked={one === v} onChange={() => setOne(v)} label={`Option ${v}`} description={v === "b" ? "With a description" : undefined} disabled={v === "c"} />)}
        </fieldset>
        <fieldset style={{ border: 0, padding: 0 }}><legend>Checkbox tiles</legend>
          {["x", "y"].map((v) => <Tile key={v} type="checkbox" name="many" value={v} checked={many.includes(v)} onChange={(on) => toggle(v, on)} label={`Item ${v}`} />)}
        </fieldset>
        <SegmentedControl legend="Severity" value={sev} onChange={setSev} options={[{ value: "light", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }]} />
      </Card>

      <Card title="Fields, progress, tooltip, loading" id="c-fields">
        <Field label="Height (cm)" hint="Whole centimetres" required><TextInput inputMode="numeric" defaultValue="170" /></Field>
        <Field label="Weight (kg)" error="Enter a number between 20 and 300"><TextInput defaultValue="abc" /></Field>
        <Field label="Time zone"><Select defaultValue="a"><option value="a">Asia/Taipei</option><option value="b">Europe/London</option></Select></Field>
        <Progress value={0.4} name="Questions answered" label="2 / 5" />
        <p>Term with a tooltip <Tooltip label="What is this?">An explanation that opens by tap or keyboard.</Tooltip></p>
        <div aria-busy="true"><Skeleton width="60%" /><br /><Skeleton /></div>
      </Card>

      <Card title="Dialogs" id="c-dialogs">
        <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <Button onClick={() => setDlg("modal")}>Modal</Button><Button onClick={() => setDlg("blocking")}>Blocking notice</Button><Button onClick={() => setDlg("sheet")}>Sheet</Button>
        </p>
      </Card>

      <Dialog open={dlg === "modal"} onClose={() => setDlg(null)} labelledBy="dlg-modal-title">
        <h2 id="dlg-modal-title">Modal</h2><p>Esc, the backdrop and the button all close it.</p>
        <DialogActions><Button variant="primary" onClick={() => setDlg(null)}>Close</Button></DialogActions>
      </Dialog>
      <Dialog open={dlg === "blocking"} onClose={() => setDlg(null)} labelledBy="dlg-block-title" dismissable={false} alert>
        <h2 id="dlg-block-title">Blocking notice</h2><p>Only the explicit action closes this.</p>
        <DialogActions><Button variant="primary" onClick={() => setDlg(null)}>I understand</Button></DialogActions>
      </Dialog>
      <Dialog open={dlg === "sheet"} onClose={() => setDlg(null)} labelledBy="dlg-sheet-title" variant="sheet">
        <h2 id="dlg-sheet-title">Sheet</h2><p>Bottom sheet on phones, side panel on wide screens.</p>
        <DialogActions><Button onClick={() => setDlg(null)}>Close</Button></DialogActions>
      </Dialog>
    </div>
  );
}
