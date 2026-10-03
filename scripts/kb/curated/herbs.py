"""Curated herb overlay — the herbs used by the MVP formulas.

Machine-derived properties (四氣五味歸經, effects, harms) come from the TCM-Library entries; this table adds what
the structured source does not carry: English names, burden tags (滋膩 苦寒 辛散 …), pregnancy and interaction
flags, cautions. Every flag is a draft awaiting pharmacist/practitioner review (SOP D7/D12).

Line format:  lib | English | tags | pregnancy | interactions | toxic | caution (zh-Hant)
  lib          directory name in TCM-Library/library/zhongyao/<category>/<lib>
  tags         comma list: 滋膩 苦寒 辛散 甘壅 辛熱 活血 燥烈 峻烈 升提 收澀 通利 寒涼 質重（empty = none）
  pregnancy    avoid | caution | ok | - (derive from the source's 注意 text)
  interactions anticoagulant, hypoglycemic, bp-raising, hypokalemia, immune-modulating, sympathomimetic,
               sedative-additive, aristolochic-risk
  toxic        1 | 0 | -  (- = derive from the source's 性味 sentence)
"""

_TABLE = """
mahuang|Ephedra stem|辛散,峻烈|caution|sympathomimetic,bp-raising|0|高血壓、心悸、甲亢、失眠者慎用；發汗力強，中病即止
guizhi|Cinnamon twig|辛散|caution|-|0|孕婦及月經過多者慎用；溫熱病、陰虛火旺者不宜
kuxingren|Bitter apricot kernel|-|-|-|-|內服不宜過量；嬰幼兒慎用
gancao|Licorice root|甘壅|-|hypokalemia,bp-raising|0|不宜與海藻、京大戟、紅大戟、甘遂、芫花同用；長期大量易致水腫、高血壓、低血鉀
zhigancao|Honey-fried licorice|甘壅|-|hypokalemia,bp-raising|0|同甘草；濕盛脹滿者慎用
baishao|White peony root|-|-|-|0|不宜與藜蘆同用；陽衰虛寒者不宜單用
chishao|Red peony root|活血|caution|anticoagulant|0|不宜與藜蘆同用；血寒經閉者不宜
shengjiang|Fresh ginger|辛散|-|-|0|陰虛內熱者不宜多用
ganjiang|Dried ginger|辛熱|caution|-|0|陰虛內熱、血熱妄行者忌用
dazao|Jujube|甘壅|-|-|0|濕盛脘腹脹滿、痰熱咳嗽者慎用
jinyinhua|Honeysuckle flower|寒涼|-|-|0|脾胃虛寒、瘡瘍屬陰證者不宜
lianqiao|Forsythia fruit|苦寒|-|-|0|脾胃虛寒、氣虛膿清者不宜
jiegeng|Platycodon root|-|-|-|0|胃及十二指腸潰瘍者慎用
bohe|Mint|辛散|-|-|0|體虛多汗者不宜
zhuye|Lophatherum (bamboo leaf)|寒涼|-|-|0|無實火、濕熱者慎用
jingjiesui|Schizonepeta spike|辛散|-|-|0|表虛自汗、陰虛頭痛者忌用
dandouchi|Fermented soybean|-|-|-|0|-
niubangzi|Burdock fruit|寒涼|-|-|0|脾虛便溏者慎用
lugen|Reed rhizome|寒涼|-|-|0|脾胃虛寒者慎用
sangye|Mulberry leaf|-|-|-|0|-
juhua|Chrysanthemum flower|-|-|-|0|-
renshen|Ginseng|-|ok|hypoglycemic,anticoagulant,immune-modulating|0|不宜與藜蘆、五靈脂同用；實證、熱證忌用；另煎兌服
baizhu|White atractylodes|燥烈|-|-|0|陰虛內熱、津液虧耗者慎用
fuling|Poria (hoelen)|通利|-|-|0|虛寒滑精、小便過多者慎用
shangyao|Chinese yam|-|-|hypoglycemic|0|濕盛中滿或有實邪、積滯者不宜
baibiandou|White hyacinth bean|-|-|-|0|-
lianzi|Lotus seed|收澀|-|-|0|大便燥結者不宜
yiyiren|Coix seed|通利|caution|-|0|津液不足者慎用；孕婦慎用
sharen|Amomum fruit|辛散|-|-|0|陰虛血燥、火熱內熾者慎用
huangqi|Astragalus root|-|-|immune-modulating,hypoglycemic|0|表實邪盛、氣滯濕阻、食積停滯、陰虛陽亢者忌用
danggui|Chinese angelica root|活血,滋膩|caution|anticoagulant|0|濕盛中滿、大便溏泄者慎用；孕婦及月經過多者慎用
chenpi|Tangerine peel|燥烈|-|-|0|氣虛、陰虛燥咳者不宜
juhong|Red tangerine peel|燥烈|-|-|0|同陳皮
shengma|Cimicifuga rhizome|升提|-|-|0|麻疹已透、陰虛火旺、肝陽上亢者忌用
chaihu|Bupleurum root|升提,辛散|-|-|0|肝陽上亢、肝風內動、陰虛火旺者慎用
banxia|Pinellia tuber|燥烈|caution|-|1|生品有毒須炮製；不宜與烏頭類同用；陰虛燥咳、血證慎用
cangzhu|Black atractylodes|燥烈|-|-|0|陰虛內熱、氣虛多汗者忌用
houpo|Magnolia bark|燥烈,辛散|caution|-|0|氣虛津虧者及孕婦慎用
huashi|Talc|通利,寒涼|caution|-|0|脾虛氣弱、精滑、熱病津傷者忌用；孕婦慎用
tongcao|Rice-paper plant pith|通利|caution|-|0|氣陰兩虛、內無濕熱者慎用；孕婦慎用
doukou|Round cardamom|辛散|-|-|0|陰虛血燥者慎用
yinchen|Capillary wormwood|寒涼|-|-|0|蓄血發黃及血虛萎黃者慎用
huangqin|Scutellaria root|苦寒|-|-|0|脾胃虛寒者不宜
shichangpu|Acorus rhizome|辛散|-|-|0|陰虛陽亢、滑精多汗者慎用
chuanbeimu|Fritillaria (Sichuan)|寒涼|-|-|0|不宜與烏頭類同用；寒痰、濕痰者不宜
mutong|Akebia stem (use Clematis armandii; never Aristolochia manshuriensis)|通利,寒涼|caution|aristolochic-risk|0|歷史上「關木通」含馬兜鈴酸已禁用；配方須使用川木通或通草，不得使用關木通
guanghuoxiang|Patchouli|辛散|-|-|0|陰虛火旺者慎用
shegan|Belamcanda rhizome|苦寒|caution|-|0|脾虛便溏者及孕婦慎用
beishashen|Glehnia root|-|-|-|0|不宜與藜蘆同用；風寒咳嗽者不宜
maidong|Ophiopogon root|滋膩,寒涼|-|-|0|脾胃虛寒泄瀉、痰飲濕濁咳嗽者忌用
dihuang|Rehmannia root (raw)|滋膩,寒涼|-|-|0|脾虛濕滯、腹滿便溏者不宜
shudihuang|Prepared rehmannia|滋膩|-|-|0|脾胃虛弱、氣滯痰多、脘腹脹痛、食少便溏者忌用
yuzhu|Polygonatum odoratum|滋膩|-|-|0|痰濕氣滯者忌用
chuanxiong|Chuanxiong rhizome|辛散,活血|caution|anticoagulant|0|陰虛火旺、多汗、熱盛及無瘀者慎用；孕婦慎用
xiangfu|Cyperus rhizome|辛散|-|-|0|氣虛無滯、陰虛血熱者慎用
zhiqiao|Bitter orange (peel)|燥烈|caution|-|0|脾胃虛弱者及孕婦慎用
zhishi|Immature bitter orange|燥烈|caution|-|0|脾胃虛弱者及孕婦慎用
shenqu|Medicated leaven|-|-|-|0|脾陰虛、胃火盛者不宜
zhizi|Gardenia fruit|苦寒|-|-|0|脾虛便溏者不宜
longdan|Gentian root|苦寒|caution|-|0|脾胃虛寒及陰虛津傷者忌用
zexie|Alisma rhizome|通利|-|-|0|腎虛精滑者忌用
cheqianzi|Plantago seed|通利|-|-|0|腎虛精滑者慎用
suanzaoren|Jujube seed|-|-|sedative-additive|0|有實邪鬱火及滑泄者慎用
zhimu|Anemarrhena rhizome|苦寒,滋膩|-|-|0|脾虛便溏者不宜
fushen|Poria with root (spirit)|通利|-|-|0|同茯苓
longyanrou|Longan aril|甘壅,滋膩|-|-|0|濕盛中滿、停飲、痰火者忌用
muxiang|Costus root|辛散|-|-|0|陰虛津液不足者慎用
yuanzhi|Polygala root|辛散|caution|sedative-additive|0|胃炎、胃潰瘍者慎用；孕婦慎用
huanglian|Coptis rhizome|苦寒|-|-|0|胃虛嘔惡、脾虛泄瀉、五更腎瀉者慎用
huangbai|Phellodendron bark|苦寒|-|-|0|脾胃虛寒者忌用
ejiao|Donkey-hide gelatin|滋膩|-|-|0|脾胃虛弱、嘔吐泄瀉者忌用
danshen|Salvia root|活血|caution|anticoagulant|0|不宜與藜蘆同用；孕婦慎用；月經過多者慎用
xuanshen|Scrophularia root|苦寒,滋膩|-|-|0|不宜與藜蘆同用；脾胃虛寒、食少便溏者不宜
wuweizi|Schisandra fruit|收澀|-|-|0|外有表邪、內有實熱、咳嗽初起、麻疹初期者不宜
tiandong|Asparagus root|滋膩,寒涼|-|-|0|脾虛泄瀉、痰濕內盛者忌用
baiziren|Arborvitae seed|滋膩|-|-|0|便溏及痰多者慎用
zhuru|Bamboo shavings|寒涼|-|-|0|寒痰咳嗽、胃寒嘔吐者不宜
fangfeng|Saposhnikovia root|辛散|-|-|0|血虛發痙、陰虛火旺者慎用
tianhuafen|Trichosanthes root|寒涼|caution|-|0|不宜與烏頭類同用；脾胃虛寒、大便溏泄者不宜；孕婦慎用
shanzhuyu|Cornus fruit|收澀|-|-|0|命門火熾、素有濕熱、小便淋澀者不宜
mudanpi|Moutan bark|活血,寒涼|caution|anticoagulant|0|血虛有寒、月經過多者及孕婦慎用
fuzi|Aconite (prepared)|辛熱,峻烈|avoid|-|1|有毒；孕婦禁用；不宜與半夏、瓜蔞、貝母、白蘞、白及同用；須久煎並由醫師處方
gouqizi|Goji berry|滋膩|-|hypoglycemic|0|脾虛便溏者慎用
lujiaojiao|Deer-antler gelatin|滋膩,辛熱|-|-|0|陰虛火旺者忌用
tusizi|Dodder seed|-|-|-|0|陰虛火旺、大便燥結、小便短赤者不宜
duzhong|Eucommia bark|-|-|-|0|陰虛火旺者慎用
rougui|Cinnamon bark|辛熱|caution|-|0|有出血傾向者及孕婦慎用；不宜與赤石脂同用；陰虛火旺者忌用
taoren|Peach kernel|活血|caution|anticoagulant|0|孕婦慎用；便溏者慎用
honghua|Safflower|活血|caution|anticoagulant|0|孕婦慎用；有出血傾向者不宜
niuxi|Achyranthes root|活血|caution|anticoagulant|0|孕婦慎用；脾虛泄瀉者慎用
wumei|Mume fruit|收澀|-|-|0|外有表邪或內有實熱積滯者不宜
"""

# Herbs absent from TCM-Library: fully curated records.
# id, zh, English, 四氣 (signed warmth), 五味 list, 歸經 list, effects, tags, pregnancy, note
EXTRA = [
    dict(id="jingmi", zh="粳米", en="Japonica rice", temp=0.0, flavors=["甘"], organs=["脾", "胃"],
         effects={"脾.qi": 0.3, "胃.yin": 0.2}, tags=[], pregnancy="ok", note="益氣和中、除煩止渴；常作藥食同源配伍"),
    dict(id="jizihuang", zh="雞子黃", en="Egg yolk", temp=0.0, flavors=["甘"], organs=["心", "腎"],
         effects={"心.yin": 0.5, "腎.yin": 0.3}, tags=["滋膩"], pregnancy="ok", note="滋陰養血、除煩；蛋類過敏者忌用"),
    dict(id="bingtang", zh="冰糖", en="Rock sugar", temp=0.0, flavors=["甘"], organs=["脾", "肺"],
         effects={"肺.yin": 0.2, "胃.yin": 0.2}, tags=["甘壅"], pregnancy="ok", note="潤肺和胃；糖尿病者慎用"),
]

# Names used in formulas → library dir (canonical, Taiwan orthography)
NAME_TO_LIB = {
    "麻黃": "mahuang", "桂枝": "guizhi", "杏仁": "kuxingren", "甘草": "gancao", "炙甘草": "zhigancao", "芍藥": "baishao", "白芍": "baishao",
    "赤芍": "chishao", "生薑": "shengjiang", "乾薑": "ganjiang", "大棗": "dazao", "金銀花": "jinyinhua", "連翹": "lianqiao",
    "桔梗": "jiegeng", "薄荷": "bohe", "竹葉": "zhuye", "荊芥穗": "jingjiesui", "淡豆豉": "dandouchi", "牛蒡子": "niubangzi",
    "蘆根": "lugen", "桑葉": "sangye", "菊花": "juhua", "人參": "renshen", "白朮": "baizhu", "茯苓": "fuling", "山藥": "shangyao",
    "白扁豆": "baibiandou", "蓮子": "lianzi", "薏苡仁": "yiyiren", "砂仁": "sharen", "黃耆": "huangqi", "當歸": "danggui",
    "陳皮": "chenpi", "橘紅": "juhong", "升麻": "shengma", "柴胡": "chaihu", "半夏": "banxia", "蒼朮": "cangzhu", "厚朴": "houpo",
    "滑石": "huashi", "通草": "tongcao", "白豆蔻": "doukou", "茵陳": "yinchen", "黃芩": "huangqin", "石菖蒲": "shichangpu",
    "川貝母": "chuanbeimu", "木通": "mutong", "藿香": "guanghuoxiang", "射干": "shegan", "沙參": "beishashen", "麥冬": "maidong",
    "生地黃": "dihuang", "乾地黃": "dihuang", "熟地黃": "shudihuang", "玉竹": "yuzhu", "川芎": "chuanxiong", "香附": "xiangfu",
    "枳殼": "zhiqiao", "枳實": "zhishi", "神曲": "shenqu", "梔子": "zhizi", "龍膽草": "longdan", "澤瀉": "zexie", "車前子": "cheqianzi",
    "酸棗仁": "suanzaoren", "知母": "zhimu", "茯神": "fushen", "龍眼肉": "longyanrou", "木香": "muxiang", "遠志": "yuanzhi",
    "黃連": "huanglian", "黃柏": "huangbai", "阿膠": "ejiao", "丹參": "danshen", "玄參": "xuanshen", "五味子": "wuweizi", "天冬": "tiandong",
    "柏子仁": "baiziren", "竹茹": "zhuru", "防風": "fangfeng", "天花粉": "tianhuafen", "山茱萸": "shanzhuyu", "牡丹皮": "mudanpi",
    "附子": "fuzi", "枸杞子": "gouqizi", "鹿角膠": "lujiaojiao", "菟絲子": "tusizi", "杜仲": "duzhong", "肉桂": "rougui",
    "桃仁": "taoren", "紅花": "honghua", "牛膝": "niuxi", "烏梅": "wumei",
    "粳米": "jingmi", "雞子黃": "jizihuang", "冰糖": "bingtang",
}


def parse() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for line in _TABLE.strip().splitlines():
        if not line.strip():
            continue
        lib, en, tags, preg, inter, toxic, note = [x.strip() for x in line.split("|")]
        out[lib] = {
            "en": en,
            "tags": [t for t in tags.split(",") if t and t != "-"],
            "pregnancy": None if preg == "-" else preg,
            "interactions": [t for t in inter.split(",") if t and t != "-"],
            "toxic": None if toxic == "-" else bool(int(toxic)),
            "note": None if note == "-" else note,
        }
    return out


OVERLAY = parse()


# Hand-set panel effects for the formula herbs (override the keyword-derived ones). Units: 0.2–0.3 mild,
# 0.5 moderate, 0.8+ strong. Targets: <organ>.qi|blood|yin|yang|stasis, liuxie.<風寒暑濕燥火>, product.<痰飲瘀食積>, bagang.exterior.
# Direction = change made to the panel of the person taking the herb (− on an excess dimension reduces it).
_EFFECTS = """
mahuang|bagang.exterior:-0.9,liuxie.寒:-0.6,liuxie.風:-0.4,肺.stasis:-0.5,product.飲:-0.2
guizhi|bagang.exterior:-0.6,liuxie.寒:-0.5,心.yang:0.5,脾.yang:0.2,膀胱.yang:0.3,product.飲:-0.3
kuxingren|肺.stasis:-0.5,大腸.yin:0.2,product.痰:-0.3,liuxie.燥:-0.2
gancao|脾.qi:0.5,心.qi:0.3,肺.qi:0.2,product.痰:-0.2,liuxie.火:-0.2
zhigancao|脾.qi:0.6,心.qi:0.4,肺.qi:0.2
baishao|肝.blood:0.5,肝.yin:0.4,肝.stasis:-0.3,肝.yang:-0.3
chishao|product.瘀:-0.5,liuxie.火:-0.3,肝.yang:-0.2
shengjiang|bagang.exterior:-0.3,liuxie.寒:-0.4,胃.yang:0.3,product.痰:-0.2
ganjiang|脾.yang:0.8,胃.yang:0.5,liuxie.寒:-0.8,肺.yang:0.3,product.飲:-0.3
dazao|脾.qi:0.4,心.blood:0.3,脾.blood:0.2
jinyinhua|liuxie.火:-0.6,bagang.exterior:-0.2,肺.yang:-0.2
lianqiao|liuxie.火:-0.6,心.yang:-0.3,product.痰:-0.2
jiegeng|肺.stasis:-0.4,product.痰:-0.4
bohe|bagang.exterior:-0.5,liuxie.風:-0.4,肝.stasis:-0.3,liuxie.火:-0.2
zhuye|liuxie.火:-0.4,心.yang:-0.3,liuxie.濕:-0.2
jingjiesui|bagang.exterior:-0.5,liuxie.風:-0.5
dandouchi|bagang.exterior:-0.3,liuxie.火:-0.2
niubangzi|liuxie.火:-0.4,liuxie.風:-0.3,product.痰:-0.2
lugen|liuxie.火:-0.4,胃.yin:0.3,肺.yin:0.2
sangye|liuxie.風:-0.4,liuxie.火:-0.3,肺.yin:0.3,肝.yang:-0.2
juhua|liuxie.風:-0.4,liuxie.火:-0.3,肝.yang:-0.4
renshen|脾.qi:0.9,肺.qi:0.7,心.qi:0.5,腎.qi:0.3,脾.yin:0.2,肺.yin:0.2
baizhu|脾.qi:0.8,liuxie.濕:-0.5
fuling|liuxie.濕:-0.6,product.飲:-0.4,脾.qi:0.3
shangyao|脾.qi:0.4,脾.yin:0.3,肺.yin:0.2,腎.yin:0.3,腎.qi:0.2
baibiandou|脾.qi:0.3,liuxie.濕:-0.3,liuxie.暑:-0.2
lianzi|脾.qi:0.2,腎.qi:0.2,心.yin:0.2
yiyiren|liuxie.濕:-0.6,脾.qi:0.2,product.飲:-0.3,liuxie.火:-0.1
sharen|脾.stasis:-0.4,胃.stasis:-0.4,liuxie.濕:-0.4,脾.yang:0.2
huangqi|脾.qi:0.8,肺.qi:0.7,liuxie.濕:-0.3
danggui|肝.blood:0.6,心.blood:0.5,脾.blood:0.3,product.瘀:-0.4
chenpi|脾.stasis:-0.5,肺.stasis:-0.4,liuxie.濕:-0.4,product.痰:-0.4
juhong|product.痰:-0.5,肺.stasis:-0.4,liuxie.濕:-0.3
shengma|bagang.exterior:-0.3,liuxie.火:-0.3
chaihu|肝.stasis:-0.6,膽.stasis:-0.3,bagang.exterior:-0.3,liuxie.火:-0.2
banxia|product.痰:-0.7,liuxie.濕:-0.6,胃.stasis:-0.5
cangzhu|liuxie.濕:-0.8,脾.stasis:-0.3,liuxie.風:-0.2,脾.qi:0.2
houpo|liuxie.濕:-0.5,脾.stasis:-0.6,胃.stasis:-0.5,product.痰:-0.3
huashi|liuxie.濕:-0.6,liuxie.暑:-0.5,liuxie.火:-0.4
tongcao|liuxie.濕:-0.4,product.飲:-0.2
doukou|liuxie.濕:-0.5,脾.stasis:-0.4,胃.stasis:-0.3,胃.yang:0.2
yinchen|liuxie.濕:-0.6,liuxie.火:-0.4
huangqin|liuxie.火:-0.6,liuxie.濕:-0.4,肺.yang:-0.2,膽.yang:-0.2
shichangpu|product.痰:-0.4,liuxie.濕:-0.3,心.stasis:-0.3
chuanbeimu|product.痰:-0.5,肺.yin:0.3,liuxie.火:-0.2,liuxie.燥:-0.3
mutong|liuxie.濕:-0.5,liuxie.火:-0.5,心.yang:-0.3,小腸.yang:-0.3
guanghuoxiang|liuxie.濕:-0.6,liuxie.暑:-0.4,脾.stasis:-0.3,bagang.exterior:-0.3
shegan|liuxie.火:-0.4,product.痰:-0.4,肺.stasis:-0.3
beishashen|肺.yin:0.6,胃.yin:0.5,liuxie.燥:-0.3,liuxie.火:-0.2
maidong|胃.yin:0.6,肺.yin:0.6,心.yin:0.4,liuxie.燥:-0.3,心.yang:-0.2
dihuang|腎.yin:0.6,肝.yin:0.4,心.yin:0.3,liuxie.火:-0.5,肝.blood:0.2
shudihuang|腎.yin:0.8,肝.blood:0.7,肝.yin:0.5,腎.blood:0.4
yuzhu|肺.yin:0.5,胃.yin:0.5,liuxie.燥:-0.3
chuanxiong|product.瘀:-0.5,肝.stasis:-0.5,liuxie.風:-0.3,肝.blood:0.2
xiangfu|肝.stasis:-0.8,脾.stasis:-0.2,胃.stasis:-0.2
zhiqiao|脾.stasis:-0.5,胃.stasis:-0.5,肺.stasis:-0.3
zhishi|脾.stasis:-0.6,胃.stasis:-0.6,product.痰:-0.4,product.食積:-0.3
shenqu|product.食積:-0.6,脾.qi:0.2,胃.stasis:-0.3
zhizi|liuxie.火:-0.7,liuxie.濕:-0.3,心.yang:-0.3,肝.yang:-0.2
longdan|liuxie.火:-0.8,liuxie.濕:-0.6,肝.yang:-0.6,膽.yang:-0.5
zexie|liuxie.濕:-0.7,product.飲:-0.5,腎.yang:-0.2,liuxie.火:-0.2
cheqianzi|liuxie.濕:-0.6,liuxie.火:-0.2,product.痰:-0.2,膀胱.yang:-0.2
suanzaoren|肝.blood:0.5,心.blood:0.5,心.yin:0.3
zhimu|肺.yin:0.4,胃.yin:0.4,腎.yin:0.4,liuxie.火:-0.6
fushen|liuxie.濕:-0.4,脾.qi:0.2
longyanrou|心.blood:0.6,脾.blood:0.5,心.qi:0.3,脾.qi:0.2
muxiang|脾.stasis:-0.6,胃.stasis:-0.6,大腸.stasis:-0.3
yuanzhi|心.stasis:-0.3,product.痰:-0.4,心.qi:0.2
huanglian|liuxie.火:-0.9,liuxie.濕:-0.6,心.yang:-0.5,胃.yang:-0.4
huangbai|liuxie.火:-0.6,liuxie.濕:-0.7,腎.yang:-0.3,膀胱.yang:-0.3
ejiao|肝.blood:0.7,肺.yin:0.5,腎.yin:0.4,心.blood:0.4
danshen|product.瘀:-0.6,心.blood:0.2,liuxie.火:-0.2
xuanshen|腎.yin:0.5,liuxie.火:-0.5,肺.yin:0.3
wuweizi|肺.qi:0.3,腎.qi:0.3,心.yin:0.2
tiandong|肺.yin:0.6,腎.yin:0.5,liuxie.燥:-0.3,liuxie.火:-0.2
baiziren|心.blood:0.4,心.yin:0.3,大腸.yin:0.3
zhuru|product.痰:-0.5,liuxie.火:-0.3,胃.stasis:-0.3
fangfeng|liuxie.風:-0.6,bagang.exterior:-0.4,liuxie.濕:-0.2
tianhuafen|肺.yin:0.4,胃.yin:0.5,liuxie.火:-0.4,product.痰:-0.2
shanzhuyu|肝.yin:0.4,腎.yin:0.4,腎.qi:0.3
mudanpi|liuxie.火:-0.5,product.瘀:-0.4,肝.yang:-0.2
fuzi|腎.yang:0.9,心.yang:0.7,脾.yang:0.7,liuxie.寒:-1.0
gouqizi|肝.yin:0.5,腎.yin:0.5,肝.blood:0.4
lujiaojiao|腎.yang:0.6,肝.blood:0.4,腎.blood:0.4
tusizi|腎.yang:0.4,腎.yin:0.3,肝.yin:0.2
duzhong|腎.yang:0.4,肝.qi:0.2
rougui|腎.yang:0.8,脾.yang:0.5,liuxie.寒:-0.7
taoren|product.瘀:-0.7,大腸.yin:0.2
honghua|product.瘀:-0.6
niuxi|product.瘀:-0.5,肝.yin:0.2,腎.yin:0.2
wumei|胃.yin:0.3,肺.qi:0.1,liuxie.燥:-0.2
"""


def _parse_effects() -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for line in _EFFECTS.strip().splitlines():
        lib, rest = line.split("|")
        eff: dict[str, float] = {}
        for part in rest.split(","):
            key, val = part.rsplit(":", 1)
            eff[key] = float(val)
        out[lib] = eff
    return out


EFFECT_OVERRIDES = _parse_effects()
assert set(EFFECT_OVERRIDES) <= set(OVERLAY), "effects given for a herb with no overlay row"
