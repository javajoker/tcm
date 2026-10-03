"""Glossary (zh-Hant ⇄ English, pinyin). English follows WHO International Standard Terminologies on
Traditional Medicine where the author knows the standard term; every English entry is `needs-review`
(SOP D11). Format: 繁體中文 | English | pinyin | domain."""

_TABLE = """
陰陽|yin and yang|yīn yáng|theory
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
望診|inspection|wàng zhěn|diagnosis
聞診|listening and smelling examination|wén zhěn|diagnosis
問診|inquiry|wèn zhěn|diagnosis
切診|palpation (pulse-taking)|qiè zhěn|diagnosis
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
食積|food stagnation|shí jī|product
氣滯|qi stagnation|qì zhì|product
氣虛|qi deficiency|qì xū|nature
血虛|blood deficiency|xuè xū|nature
陰虛|yin deficiency|yīn xū|nature
陽虛|yang deficiency|yáng xū|nature
體質|constitution|tǐ zhì|constitution
平和質|balanced constitution|píng hé zhì|constitution
氣虛質|qi-deficiency constitution|qì xū zhì|constitution
陽虛質|yang-deficiency constitution|yáng xū zhì|constitution
陰虛質|yin-deficiency constitution|yīn xū zhì|constitution
痰濕質|phlegm-dampness constitution|tán shī zhì|constitution
濕熱質|damp-heat constitution|shī rè zhì|constitution
血瘀質|blood-stasis constitution|xuè yū zhì|constitution
氣鬱質|qi-stagnation constitution|qì yù zhì|constitution
特稟質|special (allergic) diathesis|tè bǐng zhì|constitution
舌質|tongue body|shé zhì|tongue
舌苔|tongue coating|shé tāi|tongue
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
脈象|pulse quality|mài xiàng|pulse
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
治則|treatment principle|zhì zé|treatment
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
時方|later-period formula|shí fāng|formula
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
八字|eight characters (BaZi)|bā zì|bazi
大運|decade luck cycle|dà yùn|bazi
流年|annual cycle|liú nián|bazi
司令|commanding hidden stem|sī lìng|bazi
四氣調神|regulating the spirit in accordance with the four seasons|sì qì tiáo shén|season
長夏|late summer|cháng xià|season
"""


def parse() -> list[dict]:
    out, seen = [], set()
    for line in _TABLE.strip().splitlines():
        zh, en, py, dom = [x.strip() for x in line.split("|")]
        key = (zh, dom)
        assert key not in seen, f"duplicate {key}"
        seen.add(key)
        out.append({"zh-Hant": zh, "en": en, "pinyin": py, "domain": dom, "status": "needs-review"})
    return out


GLOSSARY = parse()
