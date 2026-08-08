// =============================================
// opera-db.js — 莆仙戏曲目数据库 (35个节目)
// 从 index.html 阶段3拆分提取 (2026-08-08)
// =============================================

'use strict';

// =============================================
// 莆仙戏曲目数据库
// =============================================
const operaDB = [
{
    id: 'chuncao',
    title: '春草闯堂',
    description: '聪明机智的丫鬟春草，巧妙帮助小姐与薛玫庭，一段充满喜剧色彩的古代爱情故事。莆仙戏经典保留剧目。',
    poster: 'opera_images/chuncao.jpg',
    keywords: ['春草', '闯堂', '丫鬟', '聪明', '小姐', '爱情', '喜剧', 'chuncao', 'chun cao', '小丫鬟', '春草闯堂', '好笑'],
    category: '莆仙戏',
    media: 'opera_audio/chuncao.wav'
  },

{
    id: 'zhuangyuan',
    title: '状元与乞丐',
    description: '同日出生的两个孩子，命运却截然不同。状元与乞丐的故事，讲述命运与努力的关系，发人深省的莆仙戏佳作。',
    poster: 'opera_images/zhuangyuan.jpg',
    keywords: ['状元', '乞丐', '命运', '努力', '读书', '考试', 'zhuangyuan', 'qigai', '状元乞丐', '考上', '状元与乞丐'],
    category: '莆仙戏',
    media: 'opera_audio/zhuangyuan.wav'
  },

{
    id: 'jiangmeifei',
    title: '江梅妃',
    description: '讲述唐代才貌双全的江采萍（梅妃）与唐玄宗的爱情故事。她以梅花为魂，才华横溢却命运多舛，感人至深。',
    poster: 'opera_images/puxianxi_jiangmeifei.jpg',
    keywords: ['江', '梅妃', '江采萍', '唐玄宗', '皇帝', '梅花', '妃子', '美人', 'jiangmeifei', 'jiang meifei', '江梅妃', '梅妃'],
    category: '莆仙戏',
    media: 'opera_audio/jiangmeifei.wav',
    subtitles: [
      {start: 0, end: 6, text: '（莆仙戏《江梅妃》选段——福建省莆仙戏剧院演出）'},
      {start: 6, end: 16, text: '江采萍，福建莆田人，唐玄宗宠妃，号梅妃'},
      {start: 16, end: 30, text: '擅长诗赋，曾作《梅花赋》得君王赞赏'},
      {start: 30, end: 45, text: '杨玉环入宫后，梅妃渐失宠，独居上阳宫'},
      {start: 45, end: 60, text: '玄宗密赐一斛珍珠以表歉意'},
      {start: 60, end: 78, text: '梅妃婉拒，赋诗一首——柳叶双眉久不描'},
      {start: 78, end: 95, text: '残妆和泪污红绡，长门尽日无梳洗'},
      {start: 95, end: 115, text: '何必珍珠慰寂寥'},
    ]
  },

{
    id: 'xintinglei',
    title: '新亭泪',
    description: '东晋名士王导、周顗等新亭对泣，感慨国土沦丧，抒发忧国忧民的壮志豪情。一曲慷慨悲歌，荡气回肠。',
    poster: 'opera_images/puxianxi_xintinglei_v2.jpg',
    keywords: ['新亭', '泪', '哭', '东晋', '忧国', '爱国', '名士', 'xintinglei', 'xin ting lei', '新亭泪', '新亭对泣', '悲'],
    category: '莆仙戏',
    media: 'opera_audio/xintinglei.wav'
  },

{
    id: 'qiufengci',
    title: '秋风辞',
    description: '汉武帝晚年求仙问道，秋风萧瑟中回顾一生功过。一首秋风辞，道尽帝王孤独与世事无常，气势恢宏。',
    poster: 'opera_images/puxianxi_qiufengci.jpg',
    keywords: ['秋风', '辞', '汉武帝', '皇帝', '诗', '晚年', '孤独', '帝王', 'qiufengci', 'qiu feng ci', '秋风辞', '汉武'],
    category: '莆仙戏',
    media: 'opera_audio/qiufengci.wav'
  },

{
    id: 'dianshi_xiaoshuo',
    title: '射雕英雄传',
    description: '83版经典武侠剧，黄日华翁美杰主演。郭靖从蒙古草原到中原武林的传奇成长之路，"华山论剑"成为永恒经典。',
    poster: 'opera_images/dianshi_shediaoyingxiongzhuan.jpg',
    keywords: ['射雕英雄传','黄日华','翁美杰','武侠','郭靖','黄蓉','经典','dianshi1'],
    category: '电视剧',
    media: 'opera_audio/shediaoyingxiongzhuan.wav'
  },

{
    id: 'dianshi_hongloumeng',
    title: '红楼梦',
    description: '87版经典古装剧，陈晓旭饰演林黛玉如诗如画。贾宝玉与林黛玉的爱情悲剧，"花谢花飞花满天"催人泪下。',
    poster: 'opera_images/dianshi_hongloumeng(1).jpg',
    keywords: ['红楼梦','林黛玉','贾宝玉','陈晓旭','经典','古装','dianshi2'],
    category: '电视剧',
    media: 'opera_audio/hongloumeng.wav'
  },

{
    id: 'dianshi_sanguoyanyi',
    title: '三国演义',
    description: '94版经典历史剧，波澜壮阔的三国争霸史诗。桃园三结义、三顾茅庐、赤壁之战，英雄辈出的年代。',
    poster: 'opera_images/dianshi_sanguoyanyi(1).jpg',
    keywords: ['三国演义','诸葛亮','关羽','刘备','曹操','经典','历史','dianshi3'],
    category: '电视剧',
    media: 'opera_audio/sanguoyanyi.wav'
  },

{
    id: 'dianshi_shuihu',
    title: '水浒传',
    description: '98版经典名著剧，武松打虎、鲁智深倒拔垂杨柳、林冲夜奔，梁山好汉的豪迈故事。好汉歌一响浑身是劲。',
    poster: 'opera_images/dianshi_shuihuzhuan.jpg',
    keywords: ['水浒传','武松','打虎','鲁智深','林冲','好汉歌','经典','dianshi4'],
    category: '电视剧',
    media: 'opera_audio/shuihuzhuan.wav'
  },

{
    id: 'dianshi_xiyouji88',
    title: '西游记',
    description: '86版经典神话剧，六小龄童演绎的孙悟空不可超越。大闹天宫、三打白骨精、真假美猴王，百看不厌的经典。',
    poster: 'opera_images/dianshi_xiyouji.jpg',
    keywords: ['西游记','孙悟空','六小龄童','大闹天宫','三打白骨精','经典','神话','dianshi5'],
    category: '电视剧',
    media: 'opera_audio/xiyouji.wav'
  },

{
    id: 'yinyue_dongfanghong',
    title: '东方红',
    description: '经典革命歌曲，歌颂伟大领袖毛主席。旋律激昂振奋人心，那个年代人人会唱的时代之歌。',
    poster: 'opera_images/yinyue_dongfanghong(1).jpg',
    keywords: ['革命歌曲','东方红','经典','红歌','毛主席','yinyue1'],
    category: '音乐',
    media: 'opera_audio/dongfanghong.wav'
  },

{
    id: 'yinyue_gongchangzhichi',
    title: '没有共产党就没有新中国',
    description: '经典革命歌曲，慷慨激昂唱出人民群众的心声。阿嬷那代人的青春记忆，人人会唱。',
    poster: 'opera_images/yinyue_meiyougongchandang(1).jpg',
    keywords: ['革命歌曲','共产党','经典','红歌','没有共产党','yinyue2'],
    category: '音乐',
    media: 'opera_audio/meiyougongchandang.wav'
  },

{
    id: 'yinyue_dabatguilai',
    title: '打靶归来',
    description: '经典军旅歌曲，"日落西山红霞飞，战士打靶把营归"。旋律欢快活泼，士兵们凯旋归来的喜悦，阿嬷最爱唱的歌。',
    poster: 'opera_images/yinyue_dabaguiwei.jpg',
    keywords: ['军歌','打靶归来','经典','红歌','士兵','欢快','yinyue3'],
    category: '音乐',
    media: 'opera_audio/dabaguiwei.wav',
    subtitles: [
      {start: 0, end: 6, text: '（经典军旅歌曲《打靶归来》）'},
      {start: 6, end: 15, text: '日落西山红霞飞'},
      {start: 15, end: 24, text: '战士打靶把营归 把营归'},
      {start: 24, end: 34, text: '胸前红花映彩霞'},
      {start: 34, end: 44, text: '愉快的歌声满天飞'},
      {start: 44, end: 53, text: '咪索拉咪索 拉索咪索瑞'},
      {start: 53, end: 63, text: '愉快的歌声满天飞'},
      {start: 63, end: 73, text: '歌声飞到北京去'},
      {start: 73, end: 82, text: '毛主席听了心欢喜'},
      {start: 82, end: 92, text: '咪索拉咪索 拉索咪索瑞'},
      {start: 92, end: 102, text: '毛主席听了心欢喜'},
      {start: 102, end: 115, text: '夸咱们歌儿唱得好'},
      {start: 115, end: 125, text: '夸咱们枪法数第一'},
      {start: 125, end: 126, text: '咪索拉咪索 拉索咪索瑞'},
    ]
  },

{
    id: 'yinyue_zuixuanminzufeng',
    title: '最炫民族风',
    description: '凤凰传奇经典广场舞神曲，广场舞阿姨们的最爱。旋律一响就忍不住跟着节奏动起来。',
    poster: 'opera_images/yinyue_zuixuanminzufeng(1).jpg',
    keywords: ['广场舞','最炫民族风','凤凰传奇','跳舞','yinyue4'],
    category: '音乐',
    media: 'opera_audio/zuixuanminzufeng.wav'
  },

{
    id: 'yinyue_xiaopingguo',
    title: '小苹果',
    description: '筷子兄弟经典广场舞金曲，火遍全国。简单欢快的节奏，阿嬷和姐妹们跳舞的标配曲目。',
    poster: 'opera_images/yinyue_xiaopingguo(1).jpg',
    keywords: ['广场舞','小苹果','筷子兄弟','跳舞','欢快','yinyue5'],
    category: '音乐',
    media: 'opera_audio/xiaopingguo.wav'
  },

{
    id: 'dianying_didaozhan',
    title: '地道战',
    description: '1965年经典抗战电影，华北平原民兵利用地道巧妙打击日本侵略者。高家庄民兵的智慧与勇气，阿嬷年轻时的记忆。',
    poster: 'opera_images/dianying_didaozhan(1).jpg',
    keywords: ['地道战','抗战','经典电影','民兵','日本','老电影','dianying1'],
    category: '电影',
    media: 'opera_audio/didaaozhan.wav'
  },

{
    id: 'dianying_tiedao',
    title: '铁道游击队',
    description: '1956年经典抗战电影，鲁南铁道游击队在火车上与日寇斗智斗勇。"弹起我心爱的土琵琶"唱遍全国。',
    poster: 'opera_images/dianying_tiedaoyoujidui.jpg',
    keywords: ['铁道游击队','抗战','经典电影','火车','游击队','老电影','dianying2'],
    category: '电影',
    media: 'opera_audio/tiedaoyoujidui.wav'
  },

{
    id: 'dianying_yingxiongernv',
    title: '英雄儿女',
    description: '1964年经典抗美援朝电影，志愿军战士王成坚守阵地英勇牺牲。"为了胜利，向我开炮！"震撼人心的经典台词。',
    poster: 'opera_images/dianying_yingxiongernv(1).jpg',
    keywords: ['英雄儿女','抗美援朝','经典电影','志愿军','王成','老电影','dianying3'],
    category: '电影',
    media: 'opera_audio/yingxiongernv.wav'
  },

{
    id: 'dianying_rendaonianzhong',
    title: '人到中年',
    description: '1982年经典现实主义电影，讲述中年女医生陆文婷在工作和家庭间的艰难抉择。感动了无数观众的时代佳作。',
    poster: 'opera_images/dianying_rendaonian.jpg',
    keywords: ['人到中年','经典电影','医生','现实','80年代','老电影','dianying4'],
    category: '电影',
    media: 'opera_audio/rendaonian.wav'
  },

{
    id: 'dianying_lushanlian',
    title: '庐山恋',
    description: '1980年经典爱情电影，改革开放后第一部爱情片。庐山美景中的纯真爱情，张瑜郭凯敏主演，创造了票房神话。',
    poster: 'opera_images/dianying_lushanlian(1).jpg',
    keywords: ['庐山恋','爱情','经典电影','庐山','张瑜','80年代','老电影','dianying5'],
    category: '电影',
    media: 'opera_audio/lushanlian.wav'
  },

{
    id: 'gezaixi_chensanwuniang',
    title: '陈三五娘',
    description: '泉州才子陈三途经潮州遇见五娘，两人一见钟情，经过重重波折终于团圆。闽南文化瑰宝，最经典的爱情传奇。',
    poster: 'opera_images/gezaixi_chensanwuniang_v2.jpg',
    keywords: ['陈三五娘','陈三','五娘','歌仔戏','闽南戏','爱情','经典','gezaixi1'],
    category: '歌仔戏',
    media: 'opera_audio/chensanwuniang.wav'
  },

{
    id: 'gezaixi_liangshanboyingtain',
    title: '梁山伯与祝英台',
    description: '中国四大民间传说之一。祝英台女扮男装求学，与梁山伯同窗三载情深意重，最终化为蝴蝶双飞。凄美爱情的千古绝唱。',
    poster: 'opera_images/gezaixi_liangzhu(1).jpg',
    keywords: ['梁山伯','祝英台','梁祝','歌仔戏','蝴蝶','爱情','悲剧','gezaixi2'],
    category: '歌仔戏',
    media: 'opera_audio/liangzhu.wav'
  },

{
    id: 'gezaixi_lvmenzheng',
    title: '吕蒙正',
    description: '穷书生发奋苦读，最终高中状元。妻子刘月娥抛绣球招亲，不嫌贫爱富，夫妻相濡以沫终得团圆。闽南传统大戏。',
    poster: 'opera_images/gezaixi_lvmengzheng.jpg',
    keywords: ['吕蒙正','歌仔戏','状元','穷书生','传统','爱情','gezaixi3'],
    category: '歌仔戏',
    media: 'opera_audio/lvmengzheng.wav'
  },

{
    id: 'gezaixi_xuepinggui',
    title: '薛平贵与王宝钏',
    description: '薛平贵远征西凉十八年，王宝钏寒窑苦守十八年。最终夫妻相认，团圆团聚。忠贞爱情的传世经典。',
    poster: 'opera_images/gezaixi_xuepinggui(1)(1).jpg',
    keywords: ['薛平贵','王宝钏','歌仔戏','十八年','寒窑','忠贞','爱情','gezaixi4'],
    category: '歌仔戏',
    media: 'opera_audio/xuepinggui.wav'
  },

{
    id: 'gezaixi_wangjinlong',
    title: '王金龙与苏三',
    description: '苏三与吏部尚书之子王金龙真心相爱，被迫离散后王金龙发奋读书高中，最终为苏三昭雪冤屈，有情人终成眷属。',
    poster: 'opera_images/gezaixi_wangjinlongsusam.jpg',
    keywords: ['王金龙','苏三','歌仔戏','冤屈','爱情','传统','gezaixi5'],
    category: '歌仔戏',
    media: 'opera_audio/wangjinlongsusam.wav'
  },

{
    title: '八骏马',
    description: '南音名谱，以八匹骏马奔腾为主题的器乐名曲，气势恢宏。',
    category: '南音',
    keywords: ['八骏','骏马','八骏马','南音','nanyin','器乐','名谱'],
    media: 'opera_audio/bajunma.wav',
    poster: 'opera_images/nanyin_bajunma_v4.jpg'
  },

{
    title: '梅花操',
    description: '南音四大名谱之一，以梅花为主题的器乐名曲，清雅脱俗。',
    category: '南音',
    keywords: ['梅花','梅花操','南音','nanyin','器乐','四大名谱'],
    media: 'opera_audio/meihuacao.wav',
    poster: 'opera_images/nanyin_meihuacao_v3.jpg'
  },

{
    title: '百鸟归巢',
    description: '南音经典名曲，描绘百鸟归巢的美妙意境，生动传神。',
    category: '南音',
    keywords: ['百鸟','归巢','百鸟归巢','南音','nanyin','经典'],
    media: 'opera_audio/bainiaoguichao.wav',
    poster: 'opera_images/nanyin_bainiaoguichao.jpg'
  },

{
    title: '三千两金',
    description: '南音传统曲目，讲述商人千金散尽还复来的故事。',
    category: '南音',
    keywords: ['三千','两金','三千两金','南音','nanyin','传统'],
    media: 'opera_audio/sanqianliangjin.wav',
    poster: 'opera_images/nanyin_sanqianliangjin.jpg'
  },

{
    title: '直入花园',
    description: '南音名曲，描绘春日花园游赏的优美意境。',
    category: '南音',
    keywords: ['直入','花园','直入花园','南音','nanyin','泉州'],
    media: 'opera_audio/zhiruhuayuan.wav',
    poster: 'opera_images/nanyin_zhiruhuayuan_v3.jpg'
  },

{
    title: '小沙弥下山',
    description: '漳州布袋戏经典喜剧，小和尚初次下山化缘的趣味故事。',
    category: '木偶戏',
    keywords: ['小沙弥','下山','沙弥','布袋戏','木偶戏','muouxi','漳州'],
    media: 'opera_audio/xiaoshamixiashan.wav',
    poster: 'opera_images/muouxi_xiaoshamixiashan.jpg'
  },

{
    title: '驯猴',
    description: '漳州布袋戏精彩短剧，灵巧猴偶表演各种高难度杂技动作。',
    category: '木偶戏',
    keywords: ['驯猴','猴','猴子','布袋戏','木偶戏','muouxi','杂技'],
    media: 'opera_audio/xunhou.wav',
    poster: 'opera_images/muouxi_xunhou.jpg'
  },

{
    title: '元宵乐',
    description: '提线木偶戏节日剧目，元宵佳节舞龙舞狮的欢乐场景。',
    category: '木偶戏',
    keywords: ['元宵','元宵乐','提线','木偶戏','muouxi','节日','龙灯'],
    media: 'opera_audio/yuanxiaole.wav',
    poster: 'opera_images/muouxi_yuanxiaole.jpg'
  },

{
    title: '大名府',
    description: '提线木偶戏经典武打剧目，卢俊义大名府的英雄故事。',
    category: '木偶戏',
    keywords: ['大名府','卢俊义','水浒','提线','木偶戏','muouxi','武打'],
    media: 'opera_audio/damingfu.wav',
    poster: 'opera_images/muouxi_damingfu.jpg'
  },

{
    title: '雷万春打虎',
    description: '布袋戏经典武打剧目，雷万春景阳冈打虎的英勇故事。',
    category: '木偶戏',
    keywords: ['雷万春','打虎','布袋戏','木偶戏','muouxi','武打','英雄'],
    media: 'opera_audio/leiwenchundahe.wav',
    poster: 'opera_images/muouxi_leiwanchundahu.jpg'
  }
];;
