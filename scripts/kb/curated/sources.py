"""Sources registry (PM-35): the books and standards the knowledge base draws on — or, by its design, should draw on — by domain.

One row per work. The builder (`build_sources.py`) adds what is not typed here: the metadata of the corpus edition (author, dynasty, year
and the corpus's own category, from tcm-mkg's catalogue of TCM-Ancient-Books), the existence of every corpus path, and how the data uses
the work (quotations, `book` fields, corpus paths, the markers below). Nothing here is clinical content.

Fields of `src(…)`:
  id       stable ASCII id
  title    the work's title in Traditional Chinese (or its official title)
  domains  keys of DOMAINS
  kind     classic · pharmacopoeia · textbook · standard · compilation · website
  book     TCM-Ancient-Books file prefix ("437") — the corpus edition
  lib      TCM-Library paths (relative to the submodule) that hold the work
  names    other forms of the title used in the data (exact strings of `book` fields)
  markers  substrings that identify the work in any string of the data (standards and websites only)
  status   in-corpus (default when `book` or `lib` is given) · not-in-corpus · bibliography
  author, era   only for works outside the corpus (the corpus edition's own metadata is read by the builder)
  use      what the knowledge base takes, or should take, from it (design: docs/post-mvp/design/knowledge-base-v2.md §2)
"""
from __future__ import annotations

DOMAINS: dict[str, tuple[str, str]] = {
    "theory": ("基礎理論", "Theory: yin-yang, five phases, organs, qi, blood and fluids, causes of disease"),
    "diagnosis": ("四診", "Diagnosis: the four examinations"),
    "pattern-systems": ("辨證", "Pattern systems: six channels, defence-qi-nutrient-blood, triple burner, organs, qi and blood"),
    "materia-medica": ("本草", "Herbs: properties, actions, processing, pairings"),
    "formulas": ("方劑", "Formulas: composition, roles, explanations, modifications"),
    "treatment": ("治則治法", "Treatment principles and methods"),
    "prevention": ("養生食療", "Constitution, prevention and diet"),
    "acupuncture": ("針灸", "Channels and acupoints"),
    "terminology": ("術語", "Terminology standards"),
}

KINDS = ("classic", "pharmacopoeia", "textbook", "standard", "compilation", "website")
STATUSES = ("in-corpus", "not-in-corpus", "bibliography")


def src(id: str, title: str, domains: list[str], *, kind: str = "classic", book: str | None = None, lib: tuple[str, ...] = (), names: tuple[str, ...] = (),
        markers: tuple[str, ...] = (), status: str | None = None, author: str | None = None, era: str | None = None, use: str | None = None) -> dict:
    row = {"id": id, "title": title, "domains": domains, "kind": kind, "book": book, "lib": list(lib), "names": list(names), "markers": list(markers),
           "status": status or ("in-corpus" if book or lib else "bibliography"), "author": author, "era": era, "use": use}
    return row


SOURCES: list[dict] = [
    # ── theory ────────────────────────────────────────────────────────────────────────────────────────────────
    src("suwen", "黃帝內經素問", ["theory", "treatment", "prevention"], book="437", lib=("raw/neijing/suwen",), names=("素問",),
        use="The correspondences, 君臣佐使 (至真要大論), 五味所入 (宣明五氣), 因地制宜 (異法方宜論, 五常政大論), the seasons (四氣調神大論)"),
    src("lingshu", "靈樞經", ["theory", "acupuncture"], lib=("raw/neijing/lingshu",), names=("靈樞",),
        use="Organs, channels, the body's constitution types"),
    src("nanjing", "難經", ["theory", "diagnosis"], book="421", lib=("raw/nanjing",), names=("八十一難經",),
        use="Pulse positions, the five-phase transmission of disease"),
    src("leijing", "類經", ["theory"], book="427", use="張介賓's arrangement of the 內經 by topic, for finding passages by theme"),
    src("zhongcangjing", "中藏經", ["theory", "pattern-systems"], book="557", names=("華氏中藏經",), use="Organ patterns (臟腑辨證), cold-heat-deficiency-excess of each organ"),
    src("sanyin", "三因極一病證方論", ["theory", "formulas"], book="558", use="The three classes of causes (內因、外因、不內外因)"),
    src("yixue-yuanliu", "醫學源流論", ["theory", "treatment"], book="418", use="五方異治 and other essays on adapting treatment"),
    # ── diagnosis ─────────────────────────────────────────────────────────────────────────────────────────────
    src("maijing", "脈經", ["diagnosis"], book="504", use="The pulse classic: positions, the twenty-four pulses"),
    src("binhu-maixue", "瀕湖脈學", ["diagnosis"], book="506", use="The 27 pulses and their yin-yang class (pulse data)"),
    src("zhenjia-zhengyan", "診家正眼", ["diagnosis"], book="507", use="The 28th pulse (疾)"),
    src("wangzhen-zunjing", "望診遵經", ["diagnosis"], book="517", use="Inspection of the face and body, for the observation screens and the observation lists (FR-41)"),
    src("chashe-bianzheng", "察舌辨症新法", ["diagnosis"], book="521", use="Tongue diagnosis by body and coating"),
    src("shanghan-shejian", "傷寒舌鑑", ["diagnosis"], book="490", use="Tongue atlas of the cold-damage tradition"),
    src("linzheng-yanshe", "臨症驗舌法", ["diagnosis"], book="516", use="Tongue diagnosis"),
    src("shanghan-zhizhang", "傷寒指掌", ["diagnosis", "pattern-systems"], book="494", use="The tongue zones (verified quotation)"),
    # ── pattern systems ───────────────────────────────────────────────────────────────────────────────────────
    src("shanghan", "傷寒論", ["pattern-systems", "formulas"], book="457", lib=("raw/shanghan",), use="The six channels; 經方 and their indications"),
    src("jingui", "金匱要略", ["pattern-systems", "formulas"], book="499", lib=("raw/jingui",), names=("金匱要略方論",), use="Miscellaneous diseases; 經方"),
    src("wenre-lun", "溫熱論", ["pattern-systems"], book="544", use="Defence, qi, nutrient and blood (衛氣營血)"),
    src("wenre-jingwei", "溫熱經緯", ["pattern-systems", "formulas"], book="543", use="The warm-disease classics gathered"),
    src("wenbing-tiaobian", "溫病條辨", ["pattern-systems", "formulas"], book="526", use="The triple burner (三焦); formulas of warm disease"),
    src("wenyi-lun", "溫疫論", ["pattern-systems"], book="522", use="Epidemic disease"),
    src("xiaoer-yaozheng", "小兒藥證直訣", ["pattern-systems", "formulas"], book="133", use="Organ patterns of children; 六味地黃丸"),
    src("jingyue-quanshu", "景岳全書", ["pattern-systems", "formulas", "treatment"], book="637", use="十問歌; the eight principles; 新方八陣"),
    src("yilin-gaicuo", "醫林改錯", ["pattern-systems", "formulas"], book="204", use="Blood stasis and its formulas"),
    src("xuezheng-lun", "血證論", ["pattern-systems"], book="209", use="Qi and blood; bleeding"),
    src("piwei-lun", "脾胃論", ["pattern-systems", "formulas"], book="614", use="Spleen and stomach; raising the clear yang (升陽)"),
    src("neiwaishang", "內外傷辨惑論", ["pattern-systems", "formulas"], book="232", names=("內外傷辨",), use="Internal and external damage; the first source of 補中益氣湯"),
    src("danxi-xinfa", "丹溪心法", ["pattern-systems", "formulas"], book="570", use="六鬱; 越鞠丸; a verified quotation"),
    # ── materia medica ───────────────────────────────────────────────────────────────────────────────────────
    src("shennong", "神農本草經", ["materia-medica"], book="000", lib=("raw/bencao",), use="The three grades; 七情 (序例); the oldest statements of properties"),
    src("bencaojing-jizhu", "本草經集注", ["materia-medica"], book="002", use="陶弘景's commentary; the 七情 table"),
    src("xinxiu-bencao", "新修本草", ["materia-medica"], book="003", use="The Tang pharmacopoeia"),
    src("zhenglei-bencao", "證類本草", ["materia-medica"], book="645", use="The Song compendium"),
    src("bencao-gangmu", "本草綱目", ["materia-medica"], book="013", use="李時珍's compendium: properties, 升降浮沉, processing"),
    src("bencao-gangmu-shiyi", "本草綱目拾遺", ["materia-medica"], book="023", use="Herbs added after 本草綱目"),
    src("zhenzhunang", "珍珠囊補遺藥性賦", ["materia-medica"], book="045", names=("珍珠囊",), use="引經 and the property rhymes"),
    src("yixue-qiyuan", "醫學啟源", ["materia-medica", "theory"], book="578", use="升降浮沉 and 氣味厚薄 (PM-36)"),
    src("tangye-bencao", "湯液本草", ["materia-medica"], book="008", use="氣味厚薄, 引經 (PM-36)"),
    src("bencao-beiyao", "本草備要", ["materia-medica"], book="018", use="Concise properties and actions"),
    src("bencao-congxin", "本草從新", ["materia-medica"], book="021", use="Revised 本草備要"),
    src("depei-bencao", "得配本草", ["materia-medica"], book="036", use="Pairings (得、配、佐、和) for the 七情 table (PM-37)"),
    src("bencao-qiuzhen", "本草求真", ["materia-medica"], book="025", use="Herbs by action class, 補瀉"),
    src("bencao-chongyuan", "本草崇原", ["materia-medica"], book="024", use="Commentary on 神農本草經"),
    src("bencao-haili", "本草害利", ["materia-medica"], book="037", use="The harms and benefits of each herb (利弊; the burden model)"),
    src("leigong-paozhi", "雷公炮炙論", ["materia-medica"], book="039", use="Processing (炮製) (PM-37)"),
    src("paozhi-dafa", "炮炙大法", ["materia-medica"], book="041", use="Processing (炮製) (PM-37)"),
    src("bencao-biandu", "本草便讀", ["materia-medica"], book="031", use="十八反 and 十九畏 rhymes (verified quotation)"),
    src("bencaojing-jie", "本草經解", ["materia-medica"], book="020", use="Properties explained by 氣 and 味"),
    src("bencao-mengquan", "本草蒙筌", ["materia-medica"], book="012", use="Properties; processing"),
    src("shiliao-bencao", "食療本草", ["materia-medica", "prevention"], book="004", use="Foods as medicine"),
    src("bencao-xinbian", "本草新編", ["materia-medica"], book="017", use="量效: how the action of 葛根 and 人參 changes with the amount (PM-37)"),
    src("benjing-fengyuan", "本經逢原", ["materia-medica"], book="019", use="量效: 蘇木 少用和血、多用破血 (PM-37)"),
    src("waike-quansheng", "外科全生集", ["materia-medica", "formulas"], book="239", use="量效: 紅花 少用通經活血、多用破血 (PM-37)"),
    # ── formulas ────────────────────────────────────────────────────────────────────────────────────────────────
    src("qianjin-yaofang", "備急千金要方", ["formulas", "prevention"], book="532", use="Tang formulas; 食治"),
    src("qianjin-yifang", "千金翼方", ["formulas"], book="051", use="Tang formulas"),
    src("waitai-miyao", "外臺秘要", ["formulas"], book="053", use="Tang formula collection"),
    src("hejiju-fang", "太平惠民和劑局方", ["formulas"], book="059", use="Song official formulary (six formulas of the library)"),
    src("yifang-jijie", "醫方集解", ["formulas"], book="087", use="Formulas by method with explanations (方解); modifications"),
    src("tangtou-gejue", "湯頭歌訣", ["formulas"], book="084", use="The formula rhymes"),
    src("shanbu-mingyi-fanglun", "刪補名醫方論", ["formulas"], book="639", use="Formula explanations (方解) for the verification of roles (PM-39)"),
    src("yizong-jinjian", "醫宗金鑑", ["formulas", "pattern-systems"], book="575", use="The Qing imperial textbook; a modification"),
    src("chengfang-qieyong", "成方切用", ["formulas"], book="091", use="Formulas by method"),
    src("yixue-xinwu", "醫學心悟", ["treatment", "formulas"], book="601", use="The eight methods (八法); verified quotations"),
    src("yixue-zhongzhong-canxi", "醫學衷中參西錄", ["formulas"], book="584", use="Modern-era formulas and dose notes"),
    src("yanshi-jisheng", "嚴氏濟生方", ["formulas"], book="077", names=("濟生方",), use="歸脾湯"),
    src("zhengti-leiyao", "正體類要", ["formulas"], book="247", use="A formula of the library"),
    src("yifang-kao", "醫方考", ["formulas"], book="072", use="A modification"),
    src("yizong-jirenbian", "醫宗己任編", ["formulas"], book="624", use="黑逍遙散 (a modification)"),
    src("furen-daquan", "婦人大全良方", ["formulas", "pattern-systems"], book="128", use="Gynaecology; the later 歸脾湯 with 當歸 and 遠志 (via its annotated edition)"),
    src("puji-benshi", "普濟本事方", ["formulas"], book="076", use="Song formulas"),
    # ── prevention, acupuncture ───────────────────────────────────────────────────────────────────────────────
    src("yinshan-zhengyao", "飲膳正要", ["prevention"], book="009", use="Diet and food properties"),
    src("zhenjiu-jiayi", "針灸甲乙經", ["acupuncture"], book="301", use="The classical acupoint locations"),
    src("zhenjiu-dacheng", "針灸大成", ["acupuncture"], book="299", use="Acupoints and their indications"),
    # ── famous works the corpus lacks (each would be a download the owner approves first) ──────────────────────
    src("bianshe-zhinan", "辨舌指南", ["diagnosis"], status="not-in-corpus", author="曹炳章", era="民國（1920）", use="The modern classic of tongue diagnosis"),
    src("shejian-bianzheng", "舌鑑辨正", ["diagnosis"], status="not-in-corpus", author="梁玉瑜", era="清（1894）", use="A tongue atlas with corrections"),
    src("sizhen-juewei", "四診抉微", ["diagnosis"], status="not-in-corpus", author="林之翰", era="清（1723）", use="The four examinations, systematic"),
    src("yaopin-huayi", "藥品化義", ["materia-medica"], status="not-in-corpus", author="賈所學", era="明末", use="The eight aspects of a herb (體色氣味形性能力)"),
    src("shanghan-laisu", "傷寒來蘇集", ["pattern-systems", "formulas"], status="not-in-corpus", author="柯琴", era="清（1669）", use="A major commentary on 傷寒論 (方解 of the 經方)"),
    src("zabing-yuanliu", "雜病源流犀燭", ["pattern-systems"], status="not-in-corpus", author="沈金鰲", era="清（1773）", use="Internal medicine (沈氏尊生書)"),
    src("benjing-shuzheng", "本經疏證", ["materia-medica"], status="not-in-corpus", author="鄒澍", era="清（道光）", use="A commentary on 神農本草經 that explains properties"),
    src("yiji", "醫級", ["formulas"], status="not-in-corpus", author="董西園", era="清（乾隆）", use="杞菊地黃丸 (a modification of the library names it)"),
    # ── standards, modern references, compilations, websites ───────────────────────────────────────────────────
    src("chp-2025", "中華人民共和國藥典（2025年版）一部", ["materia-medica"], kind="pharmacopoeia", lib=("raw/yaodian2025",), names=("中國藥典（2025年版）一部",),
        use="性味、歸經、功能主治、用法用量 of 637 herbs (as transcribed by TCM-Library)"),
    src("zhongyaoxue-textbook", "中藥學（教材）", ["materia-medica"], kind="textbook", lib=("raw/l1",), names=("《中藥學》（清華社）· 藥典外品種",),
        use="63 herbs that the Pharmacopoeia lacks (as transcribed by TCM-Library); copyrighted: facts only"),
    src("tcm-library", "TCM-Library structured entries", ["materia-medica", "formulas"], kind="compilation", lib=("library",),
        use="Entries compiled from the classics and the Pharmacopoeia (MIT compilation); the underlying work is named in each record's `book`"),
    src("who-istm-2007", "WHO International Standard Terminologies on Traditional Medicine in the Western Pacific Region", ["terminology"], kind="standard",
        author="WHO Regional Office for the Western Pacific", era="2007", markers=("who-istm-2007",), use="The English terms of the glossary"),
    src("who-acupoints-2008", "WHO Standard Acupuncture Point Locations in the Western Pacific Region", ["acupuncture"], kind="standard",
        author="WHO Regional Office for the Western Pacific", era="2008", markers=("WHO Standard Acupuncture Point Locations",),
        use="The acupoint locations, in the project's own words"),
    src("ccma-constitution-2009", "中醫體質分類與判定（ZYYXH/T157-2009）", ["prevention", "diagnosis"], kind="standard", author="中華中醫藥學會", era="2009",
        markers=("ZYYXH/T157-2009",), use="The nine constitutions; the questionnaire is the project's own (the standard's items are not copied)"),
    src("textbooks", "全國中醫藥行業高等教育規劃教材（中醫基礎理論、中醫診斷學、中藥學、方劑學、中醫內科學）", ["theory", "diagnosis", "materia-medica", "formulas", "treatment"],
        kind="textbook", author="國家中醫藥管理局規劃", era="current editions", names=("教材",),
        use="The standard teaching statements a reviewer checks against (dose bands, 三因制宜); copyrighted: cited, never copied"),
    src("zhonghua-bencao", "中華本草", ["materia-medica"], kind="textbook", author="國家中醫藥管理局《中華本草》編委會", era="1999",
        use="Comprehensive herb reference for reviewers; copyrighted"),
    src("zhongyao-dacidian", "中藥大辭典", ["materia-medica"], kind="textbook", author="南京中醫藥大學", era="2006（第二版）",
        use="Comprehensive herb reference for reviewers; copyrighted"),
    src("wikisource", "維基文庫 (zh.wikisource.org)", ["formulas"], kind="website", markers=("zh.wikisource.org",),
        use="Traditional-script originals; the second source of six formulas"),
]
