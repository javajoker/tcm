"""Glossary (zh-Hant ⇄ English, pinyin). English follows the WHO International Standard Terminologies on Traditional Medicine (Western Pacific Region, 2007) where the standard term is known;
every entry is `needs-review` until the linguistic reviewer has checked it against the standard (SOP D11, task V-06).

Format of a row: 繁體中文 | English | pinyin | domain [| alt English; alt English … [| note]]. `source` (K-12) says where the English comes from:
  who-istm-2007  the English is the WHO standard term (the entries in WHO_ISTM below, which the author knows with confidence);
  textbook       an established textbook rendering that is not confirmed as the WHO term (the default);
  project        a gloss coined for this app (BaZi, five periods and six qi, and the like), written in the plain WHO style.
`alt` lists accepted alternative English renderings (the lint accepts them in paired strings); a parenthetical in `en` is also accepted as an alternative."""

import json
import re
import unicodedata
from pathlib import Path

_TABLE = """
陰陽|yin and yang|yīn yáng|theory|yin-yang|
五行|five phases (five elements)|wǔ xíng|theory
木|wood|mù|wuxing
火|fire|huǒ|wuxing
土|earth|tǔ|wuxing
金|metal|jīn|wuxing
水|water|shuǐ|wuxing
相生|generation (mutual promotion)|xiāng shēng|wuxing
相克|restraint (mutual control)|xiāng kè|wuxing
相乘|over-restraint|xiāng chéng|wuxing
相侮|counter-restraint (insult)|xiāng wǔ|wuxing
母病及子|disorder of the mother affecting the child|mǔ bìng jí zǐ|wuxing
子盜母氣|child draining the mother's qi|zǐ dào mǔ qì|wuxing
肝|liver|gān|zangfu
心|heart|xīn|zangfu
脾|spleen|pí|zangfu
肺|lung|fèi|zangfu
腎|kidney|shèn|zangfu
膽|gallbladder|dǎn|zangfu
小腸|small intestine|xiǎo cháng|zangfu
胃|stomach|wèi|zangfu
大腸|large intestine|dà cháng|zangfu
膀胱|bladder|páng guāng|zangfu
氣|qi|qì|substance
血|blood|xuè|substance
津液|body fluids|jīn yè|substance
精|essence|jīng|substance
神|spirit (shen)|shén|substance
四診|four examinations|sì zhěn|diagnosis
望診|inspection|wàng zhěn|diagnosis|observation|
聞診|listening and smelling examination|wén zhěn|diagnosis
問診|inquiry|wèn zhěn|diagnosis|questions; questionnaire; questioning|
切診|palpation (pulse-taking)|qiè zhěn|diagnosis|pulse|
十問歌|ten questions mnemonic|shí wèn gē|diagnosis
辨證論治|pattern differentiation and treatment determination|biàn zhèng lùn zhì|diagnosis
證|pattern (syndrome)|zhèng|diagnosis
證素|pattern element|zhèng sù|diagnosis
病位|disease location|bìng wèi|diagnosis
病性|disease nature|bìng xìng|diagnosis
八綱|eight principles|bā gāng|diagnosis
表|exterior|biǎo|bagang
裡|interior|lǐ|bagang
寒|cold|hán|bagang
熱|heat|rè|bagang
虛|deficiency|xū|bagang
實|excess|shí|bagang
風|wind|fēng|liuxie
暑|summer-heat|shǔ|liuxie
濕|dampness|shī|liuxie
燥|dryness|zào|liuxie
火|fire (heat)|huǒ|liuxie
六淫|six climatic pathogenic factors|liù yín|liuxie
痰|phlegm|tán|product
飲|fluid-retention (rheum)|yǐn|product
瘀|blood stasis|yū|product
食積|food stagnation|shí jī|product|food retention|
氣滯|qi stagnation|qì zhì|product
氣虛|qi deficiency|qì xū|nature
血虛|blood deficiency|xuè xū|nature
陰虛|yin deficiency|yīn xū|nature
陽虛|yang deficiency|yáng xū|nature
體質|constitution|tǐ zhì|constitution|constitutional|
平和質|balanced constitution|píng hé zhì|constitution|Balanced|
氣虛質|qi-deficiency constitution|qì xū zhì|constitution|Qi deficiency|
陽虛質|yang-deficiency constitution|yáng xū zhì|constitution|Yang deficiency|
陰虛質|yin-deficiency constitution|yīn xū zhì|constitution|Yin deficiency|
痰濕質|phlegm-dampness constitution|tán shī zhì|constitution|Phlegm-dampness|
濕熱質|damp-heat constitution|shī rè zhì|constitution|Damp-heat|
血瘀質|blood-stasis constitution|xuè yū zhì|constitution|Blood stasis|
氣鬱質|qi-stagnation constitution|qì yù zhì|constitution|Qi stagnation|
特稟質|special (allergic) diathesis|tè bǐng zhì|constitution
舌質|tongue body|shé zhì|tongue
舌苔|tongue coating|shé tāi|tongue|coating|On the tongue screens the word "coating" alone is clear.
齒痕|tooth marks|chǐ hén|tongue
裂紋|cracks|liè wén|tongue
芒刺|prickles (red dots)|máng cì|tongue
瘀斑|ecchymosis|yū bān|tongue
舌下絡脈|sublingual veins|shé xià luò mài|tongue
舌尖|tongue tip|shé jiān|tongue
舌根|tongue root|shé gēn|tongue
薄白苔|thin white coating|báo bái tāi|tongue
膩苔|greasy coating|nì tāi|tongue
剝苔|peeled coating|bō tāi|tongue
脈象|pulse quality|mài xiàng|pulse|pulse|
寸關尺|cun, guan, chi positions|cùn guān chǐ|pulse
浮脈|floating pulse|fú mài|pulse
沉脈|deep pulse|chén mài|pulse
遲脈|slow pulse|chí mài|pulse
數脈|rapid pulse|shuò mài|pulse
滑脈|slippery pulse|huá mài|pulse
澀脈|choppy pulse|sè mài|pulse
弦脈|wiry pulse|xián mài|pulse
細脈|thin pulse|xì mài|pulse
洪脈|surging pulse|hóng mài|pulse
緊脈|tight pulse|jǐn mài|pulse
緩脈|moderate pulse|huǎn mài|pulse
濡脈|soggy pulse|rú mài|pulse
弱脈|weak pulse|ruò mài|pulse
結脈|knotted pulse|jié mài|pulse
代脈|regularly intermittent pulse|dài mài|pulse
促脈|rapid-irregular pulse|cù mài|pulse
治則|treatment principle|zhì zé|treatment|direction of care|The app says "direction of care" in the result so that it does not read as a treatment instruction.
治法|treatment method|zhì fǎ|treatment
治病求本|treat the root|zhì bìng qiú běn|treatment
標本緩急|priority of root and branch|biāo běn huǎn jí|treatment
三因制宜|treatment adapted to person, time and place|sān yīn zhì yí|treatment
治未病|preventive treatment|zhì wèi bìng|treatment
八法|eight methods|bā fǎ|treatment
汗法|diaphoresis|hàn fǎ|treatment
和法|harmonising|hé fǎ|treatment
溫法|warming|wēn fǎ|treatment
清法|clearing|qīng fǎ|treatment
消法|dispersing|xiāo fǎ|treatment
補法|tonifying|bǔ fǎ|treatment
方劑|formula|fāng jì|formula
君臣佐使|sovereign, minister, assistant, envoy|jūn chén zuǒ shǐ|formula
經方|classical formula|jīng fāng|formula
時方|later-period formula|shí fāng|formula|later formula|
加減|modification (addition and subtraction)|jiā jiǎn|formula
四氣|four natures|sì qì|herb
五味|five flavours|wǔ wèi|herb
歸經|channel tropism|guī jīng|herb
升降浮沉|ascending, descending, floating, sinking|shēng jiàng fú chén|herb
十八反|eighteen incompatibilities|shí bā fǎn|herb
十九畏|nineteen antagonisms|shí jiǔ wèi|herb
運氣|five periods and six qi|yùn qì|yunqi
歲運|annual phase (central period)|suì yùn|yunqi
司天|qi governing heaven|sī tiān|yunqi
在泉|qi at the spring (below)|zài quán|yunqi
主氣|host qi|zhǔ qì|yunqi
客氣|guest qi|kè qì|yunqi
節氣|solar term|jié qì|calendar
四柱|four pillars (BaZi)|sì zhù|bazi
八字|eight characters (BaZi)|bā zì|bazi|birth chart|The app says "birth chart" for the whole feature; the four pillars are shown only as a derived panel.
大運|decade luck cycle|dà yùn|bazi
流年|annual cycle|liú nián|bazi
司令|commanding hidden stem|sī lìng|bazi
四氣調神|regulating the spirit in accordance with the four seasons|sì qì tiáo shén|season
長夏|late summer|cháng xià|season
證型|pattern type|zhèng xíng|diagnosis|pattern; pattern/syndrome|The usual everyday word for the pattern a person leans towards; "pattern" alone is the WHO term for 證.
辨證|pattern differentiation|biàn zhèng|diagnosis||
氣血|qi and blood|qì xuè|substance|qi, blood|"Qi, blood" is accepted where the two are listed among other items (the six constraints).
臟腑|zang-fu organs (viscera)|zàng fǔ|zangfu|zang-fu; organs; organ|Functional systems, not the anatomical organs.
經絡|channels and collaterals|jīng luò|theory|meridians|"Meridian" is the common loan; WHO uses "channels and collaterals".
穴位|acupuncture point (acupoint)|xué wèi|treatment|acupoint; acupressure point; acupressure|
舌象|tongue appearance|shé xiàng|tongue|tongue picture; tongue|
寒熱|cold and heat|hán rè|bagang|cold-heat|
虛實|deficiency and excess|xū shí|bagang|deficiency-excess|
表裡|exterior and interior|biǎo lǐ|bagang|exterior-interior|
中醫|traditional Chinese medicine|zhōng yī|theory|TCM; Chinese medicine|
中醫師|TCM practitioner|zhōng yī shī|diagnosis|practitioner; licensed practitioner; qualified practitioner; traditional Chinese medicine practitioner|The app never says "TCM doctor": a practitioner is a licensed person, not the app.
藥材|herbal material|yào cái|herb|herb; medicinal material|
惡寒|aversion to cold|wù hán|diagnosis||Not relieved by adding clothes; distinct from 畏寒.
畏寒|cold intolerance (fear of cold)|wèi hán|diagnosis|fear of cold|Relieved by warmth; distinct from 惡寒.
自汗|spontaneous sweating|zì hàn|diagnosis||
盜汗|night sweating|dào hàn|diagnosis|night sweats|
潮熱|tidal fever|cháo rè|diagnosis||
心悸|palpitations|xīn jì|diagnosis||
痰濕|phlegm-dampness|tán shī|nature||
濕熱|damp-heat|shī rè|nature||
苔乾|dry coating|tāi gān|tongue||
往來寒熱|alternating chills and fever|wǎng lái hán rè|diagnosis||The shaoyang pattern; distinct from 寒熱 (cold and heat) as a pair of poles.
五味子|schisandra (wuweizi)|wǔ wèi zǐ|herb|wuweizi|The herb, not the five flavours (五味).
"""


# English terms known with confidence to be the WHO ISTM (2007) renderings; everything else is `textbook`, or `project` for the BaZi / yunqi / season / calendar glosses.
WHO_ISTM = {
    "陰陽", "五行", "木", "火", "土", "金", "水", "相生", "相克", "相乘", "相侮", "肝", "心", "脾", "肺", "腎", "膽", "小腸", "胃", "大腸", "膀胱", "氣", "血", "津液", "精", "四診", "望診", "聞診", "問診", "切診",
    "辨證論治", "辨證", "證", "八綱", "表", "裡", "寒", "熱", "虛", "實", "風", "暑", "濕", "燥", "六淫", "痰", "飲", "瘀", "氣滯", "氣虛", "血虛", "陰虛", "陽虛", "舌質", "舌苔", "齒痕", "裂紋",
    "浮脈", "沉脈", "遲脈", "數脈", "滑脈", "澀脈", "弦脈", "洪脈", "緊脈", "緩脈", "濡脈", "弱脈", "結脈", "代脈", "促脈", "四氣", "五味", "歸經", "十八反", "十九畏", "君臣佐使", "歸經", "體質",
    "自汗", "盜汗", "潮熱", "惡寒", "氣血", "經絡", "表裡", "寒熱", "虛實", "心悸",
}
PROJECT_DOMAINS = {"bazi", "yunqi", "season", "calendar"}


def parse() -> list[dict]:
    out, seen = [], set()
    for line in _TABLE.strip().splitlines():
        cols = [x.strip() for x in line.split("|")]
        zh, en, py, dom = cols[:4]
        alt = [a.strip() for a in cols[4].split(";") if a.strip()] if len(cols) > 4 else []
        note = cols[5] if len(cols) > 5 and cols[5] else None
        key = (zh, dom)
        assert key not in seen, f"duplicate {key}"
        seen.add(key)
        source = "project" if dom in PROJECT_DOMAINS else "who-istm-2007" if zh in WHO_ISTM else "textbook"
        out.append({"zh-Hant": zh, "en": en, "pinyin": py, "domain": dom, "status": "needs-review", "source": source, "alt": alt, "note": note})
    return out


_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")


def slug(pinyin: str) -> str:
    """The pinyin without tone marks, lower case, words joined by hyphens (`yīn yáng` → `yin-yang`)."""
    plain = "".join(c for c in unicodedata.normalize("NFD", pinyin.lower()) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def assign_ids(items: list[dict], previous: dict[tuple[str, str], str]) -> None:
    """A stable ASCII id for every term, for the addresses of the Learn pages (`/learn/terms/<id>`). An id that has been published is never changed: the terms of the committed file keep theirs, and
    only a new term gets one — its pinyin slug, then the slug with its domain, then a number. (An address is a promise.)"""
    used = {i for i in previous.values()}
    for item in items:
        key = (item["zh-Hant"], item["domain"])
        if key in previous:
            item["id"] = previous[key]
            continue
        base = slug(item["pinyin"]) or "term"
        for candidate in (base, f"{base}-{item['domain']}", *(f"{base}-{item['domain']}-{n}" for n in range(2, 50))):
            if candidate not in used and _ID.match(candidate):
                item["id"] = candidate
                used.add(candidate)
                break
        else:
            raise ValueError(f"no free id for {key}")


def _previous() -> dict[tuple[str, str], str]:
    path = Path(__file__).resolve().parents[3] / "data" / "glossary.json"
    if not path.exists():
        return {}
    return {(t["zh-Hant"], t["domain"]): t["id"] for t in json.loads(path.read_text(encoding="utf-8"))["items"] if "id" in t}


GLOSSARY = parse()
assign_ids(GLOSSARY, _previous())
