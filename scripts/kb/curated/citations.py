"""Quotations cited by the SOP and the knowledge base.

Each entry is (id, source, quote) where `quote` is the SIMPLIFIED text as it appears in the reference
source. build_citations.py checks every quote against the actual source text (whitespace-insensitive,
exact otherwise) and records `verified`. Only short quotations are stored — never whole chapters.

source = "lib:<path under reference/sources/TCM-Library/raw>"  -> MIT-licensed compilation (UTF-8)
       | "book:<numeric prefix in TCM-Ancient-Books>|<book>|<chapter>" -> reference-only compilation (GB18030)
IDs: <book>-<chapter number>-<n>.  For 傷寒論 the id carries the clause number of the Song-edition
numbering (e.g. shanghan-035); the text is verified, the number comes from the standard numbering and
is flagged `clause_no_verified: false`.
"""

SW = "lib:neijing/suwen/suwen_{:03d}.txt"
LS = "lib:neijing/lingshu/lingshu_{:03d}.txt"
NJ = "lib:nanjing/nanjing_{:02d}.txt"
SH = "lib:shanghan/shanghan_{:02d}.txt"
JG = "lib:jingui/jingui_{:02d}.txt"

CITATIONS = [
    # ── 素問 ──────────────────────────────────────────────────────────────
    ("suwen-001-1", SW.format(1), "食饮有节，起居有常，不妄作劳"),
    ("suwen-001-2", SW.format(1), "精神内守，病安从来"),
    ("suwen-001-3", SW.format(1), "女子七岁，肾气盛"),
    ("suwen-002-1", SW.format(2), "春三月，此谓发陈"),
    ("suwen-002-2", SW.format(2), "圣人不治已病，治未病；不治已乱，治未乱"),
    ("suwen-003-1", SW.format(3), "味过于酸，肝气以津，脾气乃绝"),
    ("suwen-003-2", SW.format(3), "味过于咸，大骨气劳"),
    ("suwen-003-3", SW.format(3), "味过于甘，心气喘满，色黑，肾气不衡"),
    ("suwen-003-4", SW.format(3), "味过于苦，脾气不濡，胃气乃厚"),
    ("suwen-003-5", SW.format(3), "味过于辛，筋脉沮弛，精神乃央"),
    ("suwen-003-6", SW.format(3), "春伤于风，邪气留连，乃为洞泄"),
    ("suwen-003-7", SW.format(3), "夏伤于暑，秋为痎疟"),
    ("suwen-003-8", SW.format(3), "秋伤于湿，上逆而咳，发为痿厥"),
    ("suwen-003-9", SW.format(3), "冬伤于寒，春必温病"),
    ("suwen-003-10", SW.format(3), "阳者，卫外而为固也"),                          # 營衛 (PM-52): what 衛 is for
    ("suwen-004-1", SW.format(4), "故春善病鼽衄"),
    ("suwen-004-2", SW.format(4), "故春善病鼽衄，仲夏善病胸胁，长夏善病洞泄寒中，秋善病风疟，冬善病痹厥"),
    ("suwen-004-3", SW.format(4), "南方赤色，入通于心，开窍于耳，藏精于心"),
    ("suwen-004-4", SW.format(4), "北方黑色，入通于肾，开窍于二阴，藏精于肾"),
    ("suwen-005-1", SW.format(5), "善诊者，察色按脉，先别阴阳"),
    ("suwen-005-2", SW.format(5), "治病必求于本"),
    ("suwen-005-3", SW.format(5), "形不足者，温之以气"),
    ("suwen-005-4", SW.format(5), "视喘息，听音声"),
    ("suwen-005-5", SW.format(5), "辛甘发散为阳，酸苦涌泄为阴"),
    ("suwen-005-6", SW.format(5), "东方生风，风生木，木生酸，酸生肝，肝生筋，筋生心，肝主目"),
    ("suwen-005-7", SW.format(5), "南方生热，热生火，火生苦，苦生心，心生血，血生脾，心主舌"),
    ("suwen-005-8", SW.format(5), "中央生湿，湿生土，土生甘，甘生脾，脾生肉，肉生肺，脾主口"),
    ("suwen-005-9", SW.format(5), "西方生燥，燥生金，金生辛，辛生肺，肺生皮毛，皮毛生肾，肺主鼻"),
    ("suwen-005-10", SW.format(5), "北方生寒，寒生水，水生咸，咸生肾，肾生骨髓，髓生肝，肾主耳"),
    # the herb property model (PM-36): 氣味厚薄, and 寒熱 as 陰陽
    ("suwen-005-11", SW.format(5), "味厚者为阴，薄为阴之阳；气厚者为阳，薄为阳之阴。味厚则泄，薄则通。气薄则发泄，厚则发热"),
    ("suwen-005-12", SW.format(5), "阴胜则阳病，阳胜则阴病。阳胜则热，阴胜则寒"),
    ("suwen-005-13", SW.format(5), "其在皮者，汗而发之"),     # the direction of treating the exterior (PM-39)
    ("suwen-007-1", SW.format(7), "阳加于阴，谓之汗"),
    ("suwen-010-1", SW.format(10), "青如草兹者死"),
    ("suwen-010-2", SW.format(10), "肝受血而能视"),
    ("suwen-012-1", SW.format(12), "东方之域"),
    ("suwen-012-2", SW.format(12), "圣人杂合以治，各得其所宜。故治所以异而病皆愈者，得病之情，知治之大体也"),   # 同病異治 (PM-40)
    ("suwen-013-1", SW.format(13), "得神者昌，失神者亡"),
    ("suwen-017-1", SW.format(17), "诊法常以平旦"),
    ("suwen-017-2", SW.format(17), "言而微，终日乃复言者"),
    ("suwen-018-1", SW.format(18), "人一呼脉再动，一吸脉亦再动，呼吸定息，脉五动，闰以太息，命曰平人"),
    ("suwen-019-1", SW.format(19), "五脏受气于其所生，传之于其所胜，气舍于其所生，死于其所不胜"),
    ("suwen-020-1", SW.format(20), "实则泻之，虚则补之"),   # 補瀉 (PM-36)
    ("suwen-022-1", SW.format(22), "五谷为养，五果为助"),
    ("suwen-022-2", SW.format(22), "肝欲散，急食辛以散之"),
    ("suwen-023-1", SW.format(23), "酸入肝，辛入肺，苦入心，咸入肾，甘入脾"),
    ("suwen-028-1", SW.format(28), "邪气盛则实，精气夺则虚"),
    ("suwen-034-1", SW.format(34), "胃不和，则卧不安"),
    ("suwen-039-1", SW.format(39), "怒则气上"),
    ("suwen-039-2", SW.format(39), "思则气结"),
    ("suwen-039-3", SW.format(39), "百病生于气"),
    ("suwen-062-1", SW.format(62), "阳虚则外寒，阴虚则内热"),
    ("suwen-062-2", SW.format(62), "血气不和，百病乃变化而生"),
    ("suwen-065-1", SW.format(65), "小大不利治其标，小大利治其本"),
    ("suwen-066-1", SW.format(66), "甲己之岁，土运统之"),
    ("suwen-066-2", SW.format(66), "子午之岁，上见少阴"),
    ("suwen-067-1", SW.format(67), "气有余则制己所胜而侮所不胜，其不及则己所不胜侮而乘之，己所胜轻而侮之"),
    ("suwen-068-1", SW.format(68), "亢则害，承乃制"),
    ("suwen-069-1", SW.format(69), "岁木太过，风气流行，脾土受邪"),
    ("suwen-069-2", SW.format(69), "岁火太过，炎暑流行，金肺受邪"),
    ("suwen-069-3", SW.format(69), "岁土太过，雨湿流行，肾水受邪"),
    ("suwen-069-4", SW.format(69), "岁金太过，燥气流行，肝木受邪"),
    ("suwen-069-5", SW.format(69), "岁水太过，寒气流行，邪害心火"),
    ("suwen-069-6", SW.format(69), "岁木不及，燥乃大行"),
    ("suwen-069-7", SW.format(69), "岁火不及，寒乃大行"),
    ("suwen-069-8", SW.format(69), "岁土不及，风乃大行"),
    ("suwen-069-9", SW.format(69), "岁金不及，炎火乃行"),
    ("suwen-069-10", SW.format(69), "岁水不及，湿乃大行"),
    ("suwen-070-1", SW.format(70), "必先岁气，无伐天和"),
    ("suwen-070-2", SW.format(70), "大毒治病，十去其六"),
    ("suwen-070-3", SW.format(70), "无盛盛，无虚虚"),
    ("suwen-070-5", SW.format(70), "能毒者以厚药，不胜毒者以薄药"),              # 因人 (PM-40)
    ("suwen-070-6", SW.format(70), "西北之气散而寒之，东南之气收而温之，所谓同病异治也"),   # 因地 (PM-40)
    ("suwen-070-4", SW.format(70), "大毒治病，十去其六；常毒治病，十去其七；小毒治病，十去其八；无毒治病，十去其九"),   # the four grades of 毒 (PM-36)
    ("suwen-071-1", SW.format(71), "有故无殒，亦无殒也"),
    ("suwen-071-3", SW.format(71), "用寒远寒，用凉远凉，用温远温，用热远热，食宜同法"),   # 因時 (PM-40)
    ("suwen-071-4", SW.format(71), "发表不远热，攻里不远寒"),     # when the treatment needs it the season does not hold it back (PM-40, PM-42)
    ("suwen-071-2", SW.format(71), "木郁达之"),
    ("suwen-074-1", SW.format(74), "谨守病机，各司其属"),
    ("suwen-074-2", SW.format(74), "寒者热之，热者寒之"),
    ("suwen-074-3", SW.format(74), "诸病水液，澄澈清冷，皆属于寒"),
    ("suwen-074-4", SW.format(74), "诸转反戾，水液浑浊，皆属于热"),
    ("suwen-074-5", SW.format(74), "诸湿肿满，皆属于脾"),
    ("suwen-074-6", SW.format(74), "诸风掉眩，皆属于肝"),
    ("suwen-074-7", SW.format(74), "诸逆冲上，皆属于火"),
    ("suwen-074-8", SW.format(74), "谨察阴阳所在而调之，以平为期"),
    ("suwen-074-9", SW.format(74), "逆者正治，从者反治"),
    ("suwen-074-10", SW.format(74), "主病之谓君，佐君之谓臣，应臣之谓使"),
    ("suwen-074-11", SW.format(74), "君一臣二，制之小也"),
    ("suwen-074-12", SW.format(74), "必伏其所主，而先其所因"),
    # the herb property model and the methods (PM-36): the yin-yang of the flavours, 燥潤, the direction a treatment gives
    ("suwen-074-13", SW.format(74), "辛甘发散为阳，酸苦涌泄为阴，咸味涌泄为阴，淡味渗泄为阳"),
    ("suwen-074-14", SW.format(74), "六者或收或散，或缓或急，或燥或润"),     # stops before 或軟或坚: the source's Simplified text has a stray Traditional 軟
    ("suwen-074-15", SW.format(74), "高者抑之，下者举之，有余折之，不足补之"),
    ("suwen-074-16", SW.format(74), "燥者濡之，急者缓之，散者收之，损者温之"),
    # 營衛 in the model (PM-52; docs/post-mvp/design/ying-wei.md): where 營 and 衛 come from
    ("suwen-043-1", SW.format(43), "荣者，水谷之精气也，和调于五脏，洒陈于六腑，乃能入于脉也"),
    ("suwen-043-2", SW.format(43), "卫者，水谷之悍气也，其气慓疾滑利，不能入于脉也"),
    # ── 靈樞 ──────────────────────────────────────────────────────────────
    ("lingshu-004-1", LS.format(4), "见其色，知其病，命曰明"),
    ("lingshu-008-1", LS.format(8), "脾气虚则四肢不用"),
    ("lingshu-008-2", LS.format(8), "肝藏血，血舍魂"),
    ("lingshu-010-1", LS.format(10), "盛则泻之，虚则补之"),
    ("lingshu-017-1", LS.format(17), "脾气通于口"),
    ("lingshu-017-2", LS.format(17), "肾气通于耳"),
    ("lingshu-018-1", LS.format(18), "气至阳而起，至阴而止"),
    ("lingshu-018-2", LS.format(18), "其清者为营，浊者为卫，营在脉中，卫在脉外"),         # 營衛 (PM-52)
    ("lingshu-018-3", LS.format(18), "营出于中焦，卫出于下焦"),
    ("lingshu-018-4", LS.format(18), "卫气行于阴二十五度，行于阳二十五度，分为昼夜"),
    ("lingshu-028-1", LS.format(28), "中气不足，溲便为之变"),
    ("lingshu-030-1", LS.format(30), "上焦开发，宣五谷味，熏肤、充身、泽毛，若雾露之溉，是谓气"),   # 營衛 (PM-52)
    ("lingshu-046-1", LS.format(46), "同时得病，其病各异"),
    ("lingshu-047-1", LS.format(47), "卫气者，所以温分肉，充皮肤，肥腠理，司开阖者也"),          # 營衛 (PM-52)
    ("lingshu-049-1", LS.format(49), "五色独决于明堂"),
    ("lingshu-064-1", LS.format(64), "木形之人"),
    ("lingshu-071-1", LS.format(71), "目不瞑"),
    ("lingshu-071-2", LS.format(71), "营气者，泌其津液，注之于脉，化以为血"),                    # 營衛 (PM-52)
    ("lingshu-072-1", LS.format(72), "太阴之人"),
    ("lingshu-080-1", LS.format(80), "卫气不得入于阴，常留于阳"),                              # 營衛 (PM-52): 衛 and sleep, an explanation only
    ("lingshu-053-1", LS.format(53), "胃厚、色黑、大骨及肥骨者，皆胜毒；故其瘦而薄胃者，皆不胜毒也"),   # 因人 (PM-40)
    # ── 難經 ──────────────────────────────────────────────────────────────
    ("nanjing-061-1", NJ.format(61), "望而知之谓之神"),
    ("nanjing-069-1", NJ.format(69), "虚者补其母，实者泻其子"),
    ("nanjing-077-1", NJ.format(77), "见肝之病，则知肝当传之与脾"),
    # ── 傷寒論 (clause numbers: standard Song-edition numbering, not verified against the data) ──
    ("shanghan-001", SH.format(5), "太阳之为病，脉浮，头项强痛而恶寒"),
    ("shanghan-002", SH.format(5), "太阳病，发热，汗出，恶风，脉缓者，名为中风"),
    ("shanghan-003", SH.format(5), "脉阴阳俱紧者，名为伤寒"),
    ("shanghan-006", SH.format(5), "发热而渴，不恶寒者，为温病"),
    ("shanghan-007", SH.format(5), "发热恶寒者，发于阳也"),
    ("shanghan-012", SH.format(5), "太阳中风，阳浮而阴弱。阳浮者，热自发；阴弱者，汗自出"),     # 營衛 (PM-52)
    ("shanghan-012-2", SH.format(5), "服已须臾，啜热稀粥一升余，以助药力。温覆令一时许"),   # 桂枝湯 makes a sweat only with the porridge and the covering
    ("shanghan-016", SH.format(5), "观其脉证，知犯何逆，随证治之"),
    ("shanghan-035", SH.format(6), "无汗而喘者，麻黄汤主之"),
    ("shanghan-053", SH.format(6), "病常自汗出者"),
    ("shanghan-053-2", SH.format(6), "此为营气和。营气和者，外不谐，以卫气不共营气和谐故尔。以营行脉中，卫行脉外，复发其汗，营卫和则愈，宜桂枝汤"),
    ("shanghan-054", SH.format(6), "病人藏无他病，时发热，自汗出，而不愈者，此卫气不和也"),
    ("shanghan-095", SH.format(6), "太阳病，发热汗出者，此为荣弱卫强，故使汗出"),
    ("shanghan-096", SH.format(6), "往来寒热，胸胁苦满"),
    ("shanghan-101", SH.format(6), "但见一证便是，不必悉具"),
    ("shanghan-180", SH.format(8), "阳明之为病，胃家实"),
    ("shanghan-263", SH.format(9), "少阳之为病，口苦、咽干、目眩也"),
    ("shanghan-273", SH.format(10), "太阴之为病，腹满而吐，食不下，自利益甚"),
    ("shanghan-281", SH.format(11), "少阴之为病，脉微细，但欲寐也"),
    ("shanghan-303", SH.format(11), "心中烦，不得卧"),
    ("shanghan-326", SH.format(12), "厥阴之为病，消渴，气上撞心"),
    ("shanghan-350", SH.format(12), "伤寒脉滑而厥者，里有热也，白虎汤主之"),
    ("shanghan-386", SH.format(13), "理中丸主之"),
    # ── 金匱要略 ──────────────────────────────────────────────────────────
    ("jingui-001-1", JG.format(1), "见肝之病，知肝传脾，当先实脾"),
    ("jingui-006-1", JG.format(6), "虚劳虚烦不得眠，酸枣仁汤主之"),
    ("jingui-006-2", JG.format(6), "八味肾气丸主之"),
    ("jingui-007-1", JG.format(7), "麦门冬汤主之"),
    ("jingui-010-1", JG.format(10), "按之不痛为虚，痛者为实"),
    ("jingui-010-2", JG.format(10), "腹满时减，复如故，此为寒"),
    ("jingui-012-1", JG.format(12), "病痰饮者，当以温药和之"),
    # ── later classics (TCM-Ancient-Books, GB18030, reference-only) ─────────────
    ("shanghan-zhizhang-tongue-zones", "book:494|傷寒指掌|察舌", "满舌属胃。中心亦属胃。舌尖属心。舌根属肾。两旁属肝胆。四畔属脾。"),
    ("jingyue-shiwen-1", "book:637|景岳全書|傳忠錄·十問篇", "一问寒热二问汗，三问头身四问便，五问饮食六问胸，七聋八渴俱当辨，九因脉色察阴阳，十从气味章神见"),
    ("yixue-xinwu-bagang", "book:601|醫學心悟|寒熱虛實表裏陰陽辨", "病有总要，寒、热、虚、实、表、里、阴、阳，八字而已"),
    ("yixue-xinwu-bafa", "book:601|醫學心悟|醫門八法", "而论治病之方，则又以汗、和、下、消、吐、清、温、补，八法尽之"),
    ("danxi-xinfa-1", "book:570|丹溪心法|能合色脉可以万全", "有诸内者形诸外"),
    ("bencao-bianxue-18fan-1", "book:031|本草便讀|十八反歌訣", "藻戟遂芫俱战草。诸参辛芍叛藜芦"),
    ("binhu-maixue-sanbu", "book:506|瀕湖脈學|四言舉要", "心肝居左肺脾居右肾与命门居两尺部"),
    # 營衛 in the model (PM-52): the commentaries that read 傷寒論 in 營衛 terms, and the warm-disease texts
    ("zhujie-shanghan-012-1", "book:461|註解傷寒論|辨太陽病脈證並治法上第五", "阴脉弱者，荣气弱也。风并于卫，则卫实而荣虚"),
    ("zhujie-shanghan-012-2", "book:461|註解傷寒論|辨太陽病脈證並治法上第五", "以自汗出，则皮肤缓，腠理疏"),
    ("zhujie-shanghan-012-3", "book:461|註解傷寒論|辨太陽病脈證並治法上第五", "与桂枝汤和荣卫而散风邪也"),
    ("zhujie-shanghan-038", "book:461|註解傷寒論|辨太陽病脈證並治法第六", "寒并于荣者，为荣强卫弱"),
    ("zhujie-shanghan-053", "book:461|註解傷寒論|辨太陽病脈證並治法第六", "卫受风邪而荣不病者，为荣气和也。卫既客邪，则不能与荣气和谐，亦不能卫护皮腠，是以常自汗出"),
    ("zhujie-shanghan-055", "book:461|註解傷寒論|辨太陽病脈證並治法第六", "伤寒脉浮紧，邪在表也，当与麻黄汤发汗"),
    ("yizong-jinjian-taiyang-1", "book:575|醫宗金鑑|訂正仲景全書傷寒論註·辨太陽病脈證並治上篇", "卫为风客，则卫邪强而发热矣"),
    ("yizong-jinjian-taiyang-2", "book:575|醫宗金鑑|訂正仲景全書傷寒論註·辨太陽病脈證並治上篇", "卫阳为风邪所干，不能敷布"),
    ("yizong-jinjian-guizhi", "book:575|醫宗金鑑|訂正仲景全書傷寒論註·桂枝湯方", "桂枝辛温，辛能发散，温通卫阳。芍药酸寒，酸能收敛，寒走荣阴。桂枝君芍药，是于发汗中寓敛汗之旨；芍药、臣桂枝，是于和荣中有调卫之功。生姜之辛，佐桂枝以解表；大枣之甘，佐芍药以和中"),
    ("wenre-lun-1", "book:544|溫熱論|溫病大綱", "肺主气属卫；心主血属营"),
    ("wenre-lun-6", "book:544|溫熱論|衛、氣、營、血看法", "卫之后方言气，营之后方言血。在卫汗之可也"),
    ("wenbing-tiaobian-shangjiao-3", "book:526|溫病條辨|上焦篇·風溫、溫熱、溫疫、溫毒、冬溫", "头痛，微恶风寒，身热自汗，口渴"),
    # the herb property model (PM-36)
    ("shennong-xulu-1", "book:000|神農本草經|序錄", "药有酸、咸、甘、苦、辛五味，又有寒、热、温、凉四气，及有毒无毒"),
    ("bencao-gangmu-shengjiang", "book:013|本草綱目|序例上·升降浮沉", "酸咸无升，甘辛无降，寒无浮，热无沉，其性然也"),
    ("bencao-beiyao-xingzhi-1", "book:018|本草備要|藥性總義", "凡药轻虚者浮而升，重实者沉而降"),
    ("bencao-beiyao-xingzhi-2", "book:018|本草備要|藥性總義", "枯燥者入气分，润泽者入血分"),
    # the prescription model (PM-37): 七情, processing (炮製) and the amount (量效)
    ("shennong-xulu-qiqing-1", "book:000|神農本草經|序錄", "有单行者，有相须者，有相使者，有相畏者，有相恶者，有相反者，有相杀者"),
    ("shennong-xulu-qiqing-2", "book:000|神農本草經|序錄", "当用相须、相使者良，勿用相恶、相反者。若有毒宜制，可用相畏、相杀者"),
    ("bencao-jizhu-banxia", "book:002|本草經集注|序錄上", "半夏有毒，用之必须生姜，此是取其所畏，以相制耳"),
    ("bencao-mengquan-zhizao-1", "book:012|本草蒙筌|總論·製造資水火", "酒制升提，姜制发散。入盐走肾脏，仍使软坚；用醋注肝经，且资住痛。童便制，除劣性降下；米泔制，去燥性和中。乳制滋润回枯，助生阴血；蜜制甘缓难化，增益元阳。陈壁土制，窃真气骤补中焦；麦麸皮制，抑酷性勿伤上膈。乌豆汤，甘草汤渍曝，并解毒致令平和"),
    ("bencao-mengquan-zhizao-2", "book:012|本草蒙筌|總論·製造資水火", "有剜去瓤免胀，有抽去心除烦"),
    ("bencao-xinbian-gegen-1", "book:017|本草新編|葛根", "葛根轻浮，少用则浮而外散，多用则沉而内降矣"),
    ("bencao-xinbian-renshen-1", "book:017|本草新編|人參", "人参气味阳多于阴，少用则泛上，多用则沉下"),
    ("depei-bencao-shengma-1", "book:036|得配本草|升麻", "多用则散，少用则升，蜜炙使不骤升"),
    ("benjing-fengyuan-sumu-1", "book:019|本經逢原|蘇方木", "少用则和血，多用则破血"),
    ("waike-quansheng-honghua-1", "book:239|外科全生集|諸藥法制及藥性·紅花", "酒洒焙，少用通经活血，多用破血，去瘀血"),
]
