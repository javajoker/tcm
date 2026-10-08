// E42 — the photo of the tongue and of the face (PM-50; docs/post-mvp/design/ai-assisted-intake.md §1, §3, §4; privacy §2): in the development build, with the mock gateway that Playwright starts,
// in three languages. Each module has its own consent; a picture the quality gate refuses is not sent and says why; a good one is shown first and sent only on Send — shrunk, upright and
// with none of the metadata a camera put in it (a place, a time, a make: this scenario puts them in and looks for them in what is sent); the suggestions are the app's own features,
// confirmed one by one, and then the same findings as the manual step records; the picture is stored nowhere; the page never asks for the camera (the headers deny it, and nothing calls
// getUserMedia: the device's own camera app hands over the file).
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { inspectJpeg } from "@tcm/ai";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { blurry, cameraJpeg, dark, everythingStored, face, tongue } from "./support/photo.ts";

const GATEWAY = "http://127.0.0.1:8787";
const MARK = "MARKER-E42-GPS-25.0330N-121.5654E";
const NAME = {
  tongue: { en: ["pale, swollen tongue", "tooth marks on the tongue edges", "white greasy coating"], "zh-Hant": ["舌淡胖", "舌邊齒痕", "白膩苔"], "zh-Hans": ["舌淡胖", "舌边齿痕", "白腻苔"] },
  face: { en: ["sallow complexion"], "zh-Hant": ["面色萎黃"], "zh-Hans": ["面色萎黄"] },
} as const;

async function axeClean(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E42: each photo module has its own consent; a refused picture is not sent; a good one is sent once, on Send, without its metadata; the suggestions are confirmed one by one; nothing is stored", async ({ app, page, lang }) => {
  test.setTimeout(150_000);
  const requests: { method: string; path: string; body: string }[] = [];
  page.on("request", (r) => { if (r.url().startsWith(GATEWAY)) requests.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  const photoRequests = (): typeof requests => requests.filter((r) => r.path.startsWith("/v1/observe/"));
  // the page never asks for the camera: a spy on getUserMedia counts the asks (none are expected)
  let asked = 0;
  await page.exposeFunction("__cameraAsked", () => { asked++; });
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (devices === undefined) return;
    devices.getUserMedia = () => { void (window as unknown as { __cameraAsked: () => void }).__cameraAsked(); return Promise.reject(new DOMException("denied", "NotAllowedError")); };
  });

  // 1 — consent, module by module: asked first, and not agreeing sends nothing; the page's headers deny the camera
  const response = await page.goto(`/${lang}/settings`);
  expect(response!.headers()["permissions-policy"]).toContain("camera=()");
  const settings = page.getByRole("region", { name: app.t("ai.settings.title") });
  const tongueBox = settings.getByRole("checkbox", { name: new RegExp(app.t("ai.settings.tongue")) });
  const faceBox = settings.getByRole("checkbox", { name: new RegExp(app.t("ai.settings.face")) });
  await expect(tongueBox).not.toBeChecked();
  await tongueBox.click({ force: true });
  const dialog = page.getByRole("dialog", { name: app.t("ai.consent.tongue.title") });
  await expect(dialog).toContainText(app.t("ai.consent.photo.kept"));
  await expect(dialog).toContainText(app.t("ai.consent.photo.never"));
  await axeClean(page, "the photo consent statement");
  await dialog.getByRole("button", { name: app.t("ai.consent.cancel") }).click();
  await expect(dialog).toBeHidden();
  await expect(tongueBox).not.toBeChecked();
  expect(requests, "nothing is sent before consent").toEqual([]);
  await tongueBox.click({ force: true });
  await page.getByRole("dialog", { name: app.t("ai.consent.tongue.title") }).getByRole("button", { name: app.t("ai.consent.confirm") }).click();
  await expect(settings.getByTestId("ai-service-tongue")).toContainText(app.t("ai.settings.status.on"));
  await faceBox.click({ force: true });
  await page.getByRole("dialog", { name: app.t("ai.consent.face.title") }).getByRole("button", { name: app.t("ai.consent.confirm") }).click();
  await expect(settings.getByTestId("ai-service-face")).toContainText(app.t("ai.settings.status.on"));
  await expect(settings.getByRole("checkbox", { name: new RegExp(app.t("ai.settings.conversation")) })).not.toBeChecked();
  expect(requests.map((r) => `${r.method} ${r.path}`), "only the service's state was asked").toEqual(["GET /v1/config", "GET /v1/config"]);
  await axeClean(page, "Settings with the photos on");

  // 2 — the profile, the screening and the questions as always, then the observation stage
  await app.toObserve(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(app.heading("observe.title")).toBeVisible();
  await expect(page.getByRole("region", { name: app.t("ai.photo.face.card") })).toBeVisible();
  await page.getByRole("link", { name: app.t("ai.photo.entry.tongue") }).click();
  await expect(page.getByRole("heading", { level: 1, name: app.t("ai.photo.tongue.title") })).toBeVisible();
  await app.simplified("tongue photo screen");
  await axeClean(page, "the tongue photo screen");
  const input = page.getByTestId("photo-input");

  // 3 — pictures the gate refuses: said in plain words, kept nowhere, sent nowhere
  await input.setInputFiles({ name: "dark.png", mimeType: "image/png", buffer: dark() });
  const refused = page.getByTestId("photo-refused");
  await expect(refused).toContainText(app.t("ai.photo.quality.dark"));
  await axeClean(page, "a refused picture");
  await expect(page.getByTestId("photo-view")).toHaveCount(0);
  await input.setInputFiles({ name: "blurry.png", mimeType: "image/png", buffer: blurry() });
  await expect(refused).toContainText(app.t("ai.photo.quality.blurry"));
  await expect(refused).not.toContainText(app.t("ai.photo.quality.dark"));
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") });
  await expect(refused).toContainText(app.t("ai.photo.error.type"));
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not a PNG file at all") });
  await expect(refused).toContainText(app.t("ai.photo.error.unreadable"));
  expect(photoRequests(), "a refused picture is never sent").toEqual([]);

  // 4 — a good picture from a "camera": with an EXIF block, a place and a comment in it. It is shown first; nothing is sent by choosing it
  const camera = await cameraJpeg(page, tongue({ Comment: MARK }), `GPS ${MARK}`, `taken at home ${MARK}`);
  expect(camera.includes(MARK), "the picture really carries the metadata").toBe(true);
  await input.setInputFiles({ name: "IMG_0042.jpg", mimeType: "image/jpeg", buffer: camera });
  const view = page.getByTestId("photo-view").locator("canvas");
  await expect(view).toBeVisible();
  const shown = await view.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(Math.max(shown.w, shown.h), "shrunk to at most 1024 px on the long side").toBeLessThanOrEqual(1024);
  expect(shown.w / shown.h, "upright, in proportion").toBeCloseTo(640 / 480, 1);
  const box = (await view.boundingBox())!;
  expect(box.width, "shown within the page's width, whatever the screen").toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.width / box.height, "…and still in proportion").toBeCloseTo(640 / 480, 1);
  await expect(page.getByText(app.t("ai.photo.preview.hint"))).toBeVisible();
  await axeClean(page, "the picture shown before sending");
  expect(photoRequests()).toEqual([]);
  expect(requests.filter((r) => r.path === "/v1/session"), "not even a session before Send").toEqual([]);

  // 5 — Send: one session, one photo; no metadata, the module's features, nothing of the profile
  await page.getByRole("button", { name: app.t("ai.photo.send"), exact: true }).click();
  const items = page.getByTestId("photo-suggestion");
  await expect(items).toHaveCount(3);
  expect(photoRequests().map((r) => `${r.method} ${r.path}`)).toEqual(["POST /v1/observe/tongue"]);
  const sent = JSON.parse(photoRequests()[0]!.body) as { v: number; lang: string; module?: string; image: { type: string; data: string }; vocabulary: { id: string; label: string; group: string }[]; exclusive: string[][] };
  expect(Object.keys(sent).sort()).toEqual(["exclusive", "image", "lang", "v", "vocabulary"]);
  expect(sent.lang).toBe(lang);
  const jpeg = Buffer.from(sent.image.data, "base64");
  const checked = inspectJpeg(jpeg, 200, 2048);
  expect(checked.ok, "a JPEG with no metadata at all, within the sizes").toBe(true);
  expect(jpeg.length).toBeLessThanOrEqual(524_288);
  expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  // (the bytes of the picture, not the request's text: a short word can occur by chance in base64)
  for (const needle of [MARK, "Exif", "GPS", "taken at home", "IMG_0042"]) expect(jpeg.includes(needle), `the picture sent does not hold "${needle}"`).toBe(false);
  expect(photoRequests()[0]!.body.includes(MARK), "…nor does the request").toBe(false);
  expect(sent.vocabulary.map((v) => v.id)).toContain("T_BODY_PALE_SWOLLEN");
  expect(sent.vocabulary.map((v) => v.id)).not.toContain("T_SUBLINGUAL_VEINS");
  expect(sent.exclusive.some((g) => g.includes("T_BODY_PALE") && g.includes("T_BODY_RED"))).toBe(true);
  for (const needle of ['"ageYears"', '"profile"', '"subject"', '"birth"', '"medications"', '"male"', '"findings"', '"screening"']) expect(photoRequests()[0]!.body.includes(needle), `the request does not hold ${needle}`).toBe(false);

  // 6 — the suggestions are the app's own words; nothing counts before it is confirmed
  await expect(items.locator("strong")).toHaveText([...NAME.tongue[lang]]);
  await expect(page.getByRole("button", { name: app.t("ai.photo.done"), exact: true })).toBeDisabled();
  await axeClean(page, "the suggestions");
  await items.nth(0).getByRole("button", { name: app.t("ai.photo.result.yes") }).click();
  await items.nth(0).getByRole("button", { name: app.t("ai.photo.result.no") }).click();          // the tooth marks: not what this person sees
  await items.nth(0).getByRole("button", { name: app.t("ai.photo.result.yes") }).click();
  await expect(items).toHaveCount(0);
  const recorded = page.getByRole("region", { name: app.t("ai.photo.confirmed.title") });
  await expect(recorded.getByTestId("photo-confirmed")).toHaveCount(2);
  await page.getByRole("button", { name: app.t("ai.photo.done"), exact: true }).click();
  await expect(app.heading("observe.title")).toBeVisible();

  // 7 — the same findings as the manual step records: it shows the colour and the coating that were confirmed
  await page.locator("#observe-tongue").getByRole("link", { name: app.t("observe.hub.edit") }).click();
  await page.getByRole("button", { name: app.t("observe.next"), exact: true }).click();
  await expect(page.getByRole("radio", { name: new RegExp(NAME.tongue[lang][0]) })).toBeChecked();
  await page.getByRole("button", { name: app.t("observe.next"), exact: true }).click();
  await page.getByRole("button", { name: app.t("observe.next"), exact: true }).click();
  await expect(page.getByRole("checkbox", { name: new RegExp(NAME.tongue[lang][2]) })).toBeChecked();

  // 8 — the face: its own screen, its own features; a confirmed one is a finding of the questions' kind
  await page.getByRole("button", { name: app.t("observe.done"), exact: true }).or(page.getByRole("link", { name: app.t("observe.cant") })).first().click();
  await expect(app.heading("observe.title")).toBeVisible();
  await page.getByRole("region", { name: app.t("ai.photo.face.card") }).getByRole("link", { name: app.t("ai.photo.face.card.start") }).click();
  await expect(page.getByRole("heading", { level: 1, name: app.t("ai.photo.face.title") })).toBeVisible();
  await page.getByTestId("photo-input").setInputFiles({ name: "face.png", mimeType: "image/png", buffer: face({ Comment: MARK }) });
  await expect(page.getByTestId("photo-view").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: app.t("ai.photo.send"), exact: true }).click();
  await expect(page.getByTestId("photo-suggestion").locator("strong")).toHaveText([...NAME.face[lang]]);
  expect(photoRequests().map((r) => r.path)).toEqual(["/v1/observe/tongue", "/v1/observe/face"]);
  expect(photoRequests()[1]!.body.includes(MARK), "the PNG's text chunk does not travel").toBe(false);
  await page.getByTestId("photo-suggestion").first().getByRole("button", { name: app.t("ai.photo.result.yes") }).click();
  await page.getByRole("button", { name: app.t("ai.photo.done"), exact: true }).click();
  await expect(page.getByRole("region", { name: app.t("ai.photo.face.card") })).toContainText(app.t("ai.photo.face.status.some"));
  expect(requests.filter((r) => r.path === "/v1/session"), "a session for each photo screen, none before Send").toHaveLength(2);

  // 9 — nothing of any picture is stored: not in the preferences, not in the database, not in a cache — and the page never asked for the camera
  const stored = await everythingStored(page);
  for (const needle of [MARK, "data:image", "/9j/", "iVBORw0KGgo", "Exif", "IMG_0042", sent.image.data.slice(2_000, 2_080)]) expect(stored.includes(needle), `stored: ${needle}`).toBe(false);
  expect(stored).toContain("T_BODY_PALE_SWOLLEN");                    // the findings are
  expect(asked, "the camera was never asked for").toBe(0);

  // 10 — withdrawing one module takes its way in away and leaves the other
  await page.waitForTimeout(600);                                      // (the draft is saved a moment after a change)
  await app.goto("/settings");
  await tongueBox.click({ force: true });
  await expect(tongueBox).not.toBeChecked();
  await expect(faceBox).toBeChecked();
  await app.goto("/observe");
  await expect(app.heading("observe.title")).toBeVisible();
  await expect(page.getByRole("link", { name: app.t("ai.photo.entry.tongue") })).toHaveCount(0);
  await expect(page.getByText(app.t("ai.photo.entry.offer"))).toBeVisible();
  await expect(page.getByRole("region", { name: app.t("ai.photo.face.card") })).toBeVisible();
  await app.goto("/observe/photo/tongue");
  await expect(page.getByRole("region", { name: app.t("ai.settings.title") })).toBeVisible();      // sent to Settings to agree first
  expect(app.path()).toBe("/settings");
  await app.simplified("Settings with a photo module withdrawn");
});
