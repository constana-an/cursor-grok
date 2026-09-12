import { ActivityLogIcon, BookmarkIcon, CameraIcon, ChatBubbleIcon, CheckCircledIcon, HeartIcon, HomeIcon, RocketIcon, StarFilledIcon, SunIcon, TimerIcon } from "@radix-ui/react-icons";
import { dayKeyOf, todayKey, weekKey } from "./date.ts";
import type { Lang } from "./i18n.ts";
import type { Category, CoupleTask, MemoryEntry, MenuItem, Milestone, MilestoneKind, Order, OrderStatus, TaskFrequency, TaskRequirement } from "./types.ts";

/**
 * The shop's own copy, in both languages.
 *
 * Shipped items carry their English next to their Chinese rather than in the
 * dictionary: a menu item is one thing with two names, and splitting them
 * across two files is how one of them ends up forgotten. A couple's own wishes
 * have no `en` and never get one — those are their words, not the shop's.
 */
export const MENU: MenuItem[] = [
  { id: "fruit-tea", category: "food", name: "缤纷水果茶", description: "满杯鲜果，酸甜刚刚好", price: 28, image: "/assets/menu/fruit-tea.png", tint: "#fff0e5", en: { name: "Fruit Tea, Full Cup", description: "Packed with fresh fruit, sweet and sour just right" } },
  { id: "ice-cream", category: "food", name: "草莓冰淇淋", description: "今天的甜，要一起分享", price: 32, image: "/assets/menu/ice-cream.png", tint: "#ffe8ef", en: { name: "Strawberry Ice Cream", description: "Today's sweetness, meant to be shared" } },
  { id: "milk-tea", category: "food", name: "奶茶投喂", description: "半糖去冰，再加一份想念", price: 36, image: "/assets/menu/milk-tea.png", tint: "#fff0e5", en: { name: "A Milk Tea, Delivered", description: "Half sugar, no ice, and a little missing you" } },
  { id: "duck-neck", category: "food", name: "绝味鸭脖", description: "香辣入味，越啃越上头", price: 38, image: "/assets/menu/duck-neck.png", tint: "#ffe8e2", en: { name: "Spicy Duck Necks", description: "Hot and savoury, impossible to stop at one" } },
  { id: "breakfast", category: "food", name: "爱心早餐", description: "豆浆包子油条，起床就能吃", price: 42, image: "/assets/menu/breakfast.png", tint: "#fff1dd", en: { name: "Breakfast, Made for You", description: "Soy milk, buns and crullers, ready when you wake" } },
  { id: "fried-chicken", category: "food", name: "炸鸡可乐", description: "今晚一起快乐加倍", price: 48, image: "/assets/menu/fried-chicken.png", tint: "#fff0df", en: { name: "Fried Chicken and Coke", description: "Double the happiness, tonight" } },
  { id: "cake", category: "food", name: "草莓奶油蛋糕", description: "切一块软乎乎的甜给你", price: 52, image: "/assets/menu/cake.png", tint: "#ffe8ef", en: { name: "Strawberry Cream Cake", description: "A soft, sweet slice cut just for you" } },
  { id: "sushi", category: "food", name: "寿司约会", description: "便利店也行，重要的是一起", price: 56, image: "/assets/menu/sushi.png", tint: "#fff0ea", en: { name: "Sushi Date", description: "The corner shop counts — being together is the point" } },
  { id: "roast-chicken", category: "food", name: "香喷喷烤鸡", description: "金黄酥香，撕着吃最快乐", price: 62, image: "/assets/menu/roast-chicken.png", tint: "#fff0df", en: { name: "Roast Chicken", description: "Golden and crisp, best pulled apart by hand" } },
  { id: "hotpot", category: "food", name: "暖呼呼火锅", description: "鸳鸯锅走起，今天都要吃饱", price: 68, image: "/assets/menu/hotpot.png", tint: "#ffe7eb", en: { name: "Hot Pot, Steaming", description: "Split broth, and nobody leaves hungry" } },
  { id: "crayfish", category: "food", name: "麻辣小龙虾", description: "戴上手套，认真嗦一大盆", price: 72, image: "/assets/menu/crayfish.png", tint: "#ffe6e3", en: { name: "Spicy Crayfish", description: "Gloves on, one serious bowlful" } },
  { id: "bbq", category: "food", name: "快乐烤肉", description: "肉食动物最爱的治愈时刻", price: 78, image: "/assets/menu/bbq.png", tint: "#ffe8e2", en: { name: "Happy Barbecue", description: "The carnivore's favourite kind of comfort" } },
  { id: "hug", category: "care", name: "十分钟抱抱", description: "什么都不用说，抱紧就好", price: 48, image: "/assets/menu/hug.png", tint: "#ffe3ef", en: { name: "A Ten-Minute Hug", description: "Nothing needs saying — just hold on" } },
  { id: "wake-up", category: "care", name: "温柔叫早", description: "用喜欢的声音开启新一天", price: 56, image: "/assets/menu/wake-up.png", tint: "#fff1d9", en: { name: "A Gentle Wake-Up", description: "Start the day with your favourite voice" } },
  { id: "dry-hair", category: "care", name: "帮忙吹头发", description: "洗完头就交给我照顾", price: 62, image: "/assets/menu/dry-hair.png", tint: "#e5f6ee", en: { name: "I'll Dry Your Hair", description: "Wash it and leave the rest to me" } },
  { id: "sleep", category: "care", name: "晚安哄睡", description: "陪你聊到困意来敲门", price: 68, image: "/assets/menu/sleep.png", tint: "#e7efff", en: { name: "Talked to Sleep", description: "I'll stay on the line until sleep knocks" } },
  { id: "no-phone", category: "care", name: "一小时不看手机", description: "把全部注意力认真交给你", price: 78, image: "/assets/menu/no-phone.png", tint: "#f0e8ff", en: { name: "One Phone-Free Hour", description: "All of my attention, properly handed over" } },
  { id: "massage", category: "care", name: "肩颈按摩", description: "辛苦啦，今天让我照顾你", price: 88, image: "/assets/menu/massage.png", tint: "#efe8ff", en: { name: "Neck and Shoulder Massage", description: "You've worked hard — let me take care of you" } },
  { id: "listen", category: "care", name: "认真倾听一小时", description: "不讲道理，只认真听你说", price: 98, image: "/assets/menu/listen.png", tint: "#e6f2ff", en: { name: "An Hour of Listening", description: "No advice, no arguing — just listening" } },
  { id: "hair-wash", category: "care", name: "豪华洗头服务", description: "含按摩、吹干和无限耐心", price: 118, image: "/assets/menu/hair-wash.png", tint: "#ffe6ee", en: { name: "The Deluxe Hair Wash", description: "Massage, blow-dry and unlimited patience" } },
  { id: "walk", category: "date", name: "牵手散步", description: "不赶路，只和你慢慢走", price: 60, image: "/assets/menu/walk.png", tint: "#e5f6ee", en: { name: "A Walk, Hand in Hand", description: "Nowhere to be, just slowly with you" } },
  { id: "sunset", category: "date", name: "去看日落", description: "收藏一场只属于我们的晚霞", price: 78, image: "/assets/menu/sunset.png", tint: "#fff0dd", en: { name: "Go Watch the Sunset", description: "One evening sky kept just for us" } },
  { id: "movie", category: "date", name: "电影之夜", description: "零食、毯子和你都要有", price: 88, image: "/assets/menu/movie.png", tint: "#e9e6ff", en: { name: "Movie Night", description: "Snacks, a blanket, and you" } },
  { id: "cook", category: "date", name: "一起做顿饭", description: "哪怕手忙脚乱也很浪漫", price: 98, image: "/assets/menu/cook.png", tint: "#fff0e5", en: { name: "Cook a Meal Together", description: "Romantic even when it's chaos" } },
  { id: "coffee", category: "date", name: "咖啡店约会", description: "找个角落坐下来慢慢聊", price: 108, image: "/assets/menu/coffee.png", tint: "#f2eadf", en: { name: "Coffee Shop Date", description: "Find a corner and talk for a while" } },
  { id: "museum", category: "date", name: "逛展览馆", description: "把今天喜欢的作品讲给你听", price: 118, image: "/assets/menu/museum.png", tint: "#e6f2ff", en: { name: "Wander an Exhibition", description: "I'll tell you about my favourite piece" } },
  { id: "picnic", category: "date", name: "公园野餐", description: "带上水果和一整天好心情", price: 138, image: "/assets/menu/picnic.png", tint: "#e8f6df", en: { name: "Picnic in the Park", description: "Bring fruit and a whole day of good mood" } },
  { id: "day-trip", category: "date", name: "周末小旅行", description: "你负责期待，我负责计划", price: 188, image: "/assets/menu/day-trip.png", tint: "#e6f2ff", en: { name: "A Weekend Away", description: "You do the looking forward, I'll do the planning" } },
  { id: "choose-meal", category: "limited", name: "今天吃什么我决定", description: "一次免纠结的最高决定权", price: 120, image: "/assets/menu/choose-meal.png", tint: "#fff3d2", limited: true, en: { name: "I Decide What We Eat", description: "Supreme authority, one debate skipped" } },
  { id: "forgive", category: "limited", name: "和好抱抱券", description: "吵架后先抱一分钟再说", price: 148, image: "/assets/menu/forgive.png", tint: "#ffe6ee", limited: true, en: { name: "Make-Up Hug Voucher", description: "After a fight, one minute of holding on first" } },
  { id: "wish", category: "limited", name: "任性愿望券", description: "一辈子只有一次，请认真使用", price: 188, image: "/assets/menu/wish.png", tint: "#fff3d2", limited: true, en: { name: "One Wilful Wish", description: "Once in a lifetime — spend it well" } },
  { id: "full-day", category: "limited", name: "一整天听你安排", description: "从早餐到晚安全部交给你", price: 228, image: "/assets/menu/full-day.png", tint: "#e9e4ff", limited: true, en: { name: "A Whole Day, Your Call", description: "Breakfast to goodnight, all of it yours" } },
  { id: "anniversary", category: "limited", name: "纪念日惊喜", description: "只在特别的日子闪闪发光", price: 288, image: "/assets/menu/anniversary.png", tint: "#ffe1e9", limited: true, en: { name: "An Anniversary Surprise", description: "It only shines on the special days" } },
  { id: "staycation", category: "limited", name: "双人度假日", description: "认真空出一天，只陪彼此", price: 360, image: "/assets/menu/staycation.png", tint: "#e1f3ff", limited: true, en: { name: "A Day Off, Just Us", description: "One day cleared on purpose, for each other only" } },
];

/**
 * Every person owns their own wallet and funds their own orders, so rewards are
 * sized for a single earner: at most 8 coins a day and 29 a week, about 85 in a
 * perfect week, against a 28–360 price ladder. Both partners claim their own
 * copy of each task; a claim by one never consumes the other's.
 */
export const TASKS: CoupleTask[] = [
  { id: "morning", frequency: "daily", title: "好好说早安或晚安", description: "让今天从被惦记开始或结束", reward: 1, icon: SunIcon, tone: "gold", en: { title: "Say good morning or goodnight properly", description: "Start or end the day being thought of" } },
  { id: "compliment", frequency: "daily", title: "认真夸对方一次", description: "要具体，不可以只说“你好看”", reward: 2, icon: ChatBubbleIcon, tone: "pink", en: { title: "Pay one real compliment", description: "Be specific — “you look nice” doesn't count" } },
  { id: "mood", frequency: "daily", title: "分享今天的心情", description: "开心或委屈都可以被看见", reward: 2, icon: ActivityLogIcon, tone: "lavender", en: { title: "Share how today felt", description: "Happy or hurt, both deserve to be seen" } },
  { id: "focus", frequency: "daily", title: "专心陪伴 20 分钟", description: "放下手机，认真听彼此说话", reward: 3, icon: TimerIcon, tone: "mint", en: { title: "Twenty undivided minutes", description: "Phones down, actually listening to each other" } },
  { id: "photo", frequency: "weekly", title: "记录一张本周合照", description: "把普通日子也收藏起来", reward: 5, icon: CameraIcon, tone: "pink", requires: "photo", en: { title: "Take one photo together this week", description: "Keep the ordinary days too" } },
  { id: "walk-task", frequency: "weekly", title: "一起散步半小时", description: "边走边聊，不带任务地相处", reward: 6, icon: RocketIcon, tone: "mint", en: { title: "Walk together for half an hour", description: "Talk as you go, with nothing to achieve" } },
  { id: "order-task", frequency: "weekly", title: "认真完成一份订单", description: "说到做到，是小铺最重要的规则", reward: 8, icon: CheckCircledIcon, tone: "gold", requires: "order-done", en: { title: "Finish one order properly", description: "Doing what you said is this shop's first rule" } },
  { id: "date-task", frequency: "weekly", title: "完成一次用心约会", description: "不看价格，重点是认真安排", reward: 10, icon: BookmarkIcon, tone: "lavender", requires: "date-done", en: { title: "Go on one thoughtful date", description: "The price is not the point — the planning is" } },
];

export const REQUIREMENT_HINTS: Record<Lang, Record<TaskRequirement, string>> = {
  zh: {
    photo: "先去「回忆」上传一张本周的照片",
    "order-done": "先完成一份对方点的心愿",
    "date-done": "先完成一份对方点的「去约会」心愿",
  },
  en: {
    photo: "Add a photo from this week to Memories first",
    "order-done": "Finish one of their wishes first",
    "date-done": "Finish one of their date wishes first",
  },
};

export const requirementHint = REQUIREMENT_HINTS.zh;

const DATE_ITEM_IDS = new Set(MENU.filter((item) => item.category === "date").map((item) => item.id));

/** Orders placed before item_category existed still have to be classifiable. */
const isDateOrder = (order: Order) => (order.itemCategory ? order.itemCategory === "date" : DATE_ITEM_IDS.has(order.itemId));

/**
 * Whether the real action behind a task has happened in the current period.
 *
 * Mirrors the check inside `claim_couple_task` so the button can say what is
 * missing instead of just failing; the server stays the authority, because it
 * is the one crediting the wallet.
 */
export function taskRequirementMet(
  task: CoupleTask,
  context: {
    orders: Order[];
    memories: MemoryEntry[];
    /** Display name of this identity: the recipient is the one who does it. */
    currentName: string;
    /** Auth user id in cloud mode; absent in local mode. */
    currentUserId?: string;
    /** Local mode has no album, so a photo can never be witnessed there. */
    memoriesTracked: boolean;
  },
): boolean {
  if (!task.requires) return true;
  const since = periodKeyFor(task.frequency);
  const withinPeriod = (value: string | undefined) => {
    const day = value ? dayKeyOf(value) : null;
    return day !== null && day >= since;
  };
  if (task.requires === "photo") {
    if (!context.memoriesTracked) return true;
    return context.memories.some((memory) =>
      (!context.currentUserId || memory.createdBy === context.currentUserId) && withinPeriod(memory.createdAt));
  }
  return context.orders.some((order) =>
    order.status === "done"
    && order.to === context.currentName
    && (task.requires === "order-done" || isDateOrder(order))
    && withinPeriod(order.completedAt ?? order.createdAt));
}

/**
 * Coins one person earned from tasks this week, from their claim keys alone.
 * Shared by the tasks screen and the local-mode partner card so both sides of
 * "我 42 / 对方 30" are counted the same way.
 */
export function earnedInWeek(claims: readonly string[], monday: string = weekKey(), today: string = todayKey()): number {
  return claims.reduce((sum, key) => {
    const [period, id] = key.split(":");
    if (period < monday || period > today) return sum;
    return sum + (TASKS.find((task) => task.id === id)?.reward ?? 0);
  }, 0);
}

/** What one person can earn in a perfect week: 7 daily rounds plus the weekly set. */
export const WEEKLY_PERSONAL_GOAL = TASKS.reduce(
  (sum, task) => sum + task.reward * (task.frequency === "daily" ? 7 : 1),
  0,
);

/**
 * The four daily tasks never change, so after a month they read as chores. This
 * rotates something to talk about and something small to do, on top of them.
 *
 * Derived from the calendar day alone, never from the identity: both phones
 * must land on the same pair, or "今天聊这个" means nothing.
 */
export const DAILY_PROMPTS: Array<{ topic: string; action: string; en: { topic: string; action: string } }> = [
  { topic: "你最近一次觉得被我照顾到，是什么时候？", action: "把那件事再做一次", en: { topic: "When did you last feel looked after by me?", action: "Do that same thing again" } },
  { topic: "如果这周末可以什么都不做，你想怎么过？", action: "在日历上圈出那半天", en: { topic: "If this weekend had nothing in it, how would you spend it?", action: "Circle that half-day on the calendar" } },
  { topic: "我身上有什么小习惯是你偷偷喜欢的？", action: "今天说出口一次", en: { topic: "Which of my small habits do you secretly like?", action: "Say it out loud once today" } },
  { topic: "最近有什么事你其实想说，但一直没说？", action: "认真听完，不打断", en: { topic: "Is there something you've wanted to say but haven't?", action: "Listen all the way through, no interrupting" } },
  { topic: "我们第一次见面，你记得的第一个细节是什么？", action: "翻出那天的一张照片", en: { topic: "What's the first detail you remember from the day we met?", action: "Dig out a photo from that day" } },
  { topic: "你最近在忙的事情里，哪一件最耗心力？", action: "替对方分掉一件小事", en: { topic: "Of everything you're busy with, what drains you most?", action: "Take one small thing off their plate" } },
  { topic: "有没有哪句话，我说过之后你记了很久？", action: "今天再写一句给对方", en: { topic: "Is there something I said that stayed with you?", action: "Write them another line today" } },
  { topic: "如果明年这个时候，我们一起去一个地方，你想去哪？", action: "把它记进心愿单", en: { topic: "A year from now, if we went somewhere together, where would it be?", action: "Put it on the wish list" } },
  { topic: "你觉得我们相处里，最舒服的时刻是什么样的？", action: "今晚复刻那个时刻", en: { topic: "What does the most comfortable moment between us look like?", action: "Recreate it tonight" } },
  { topic: "最近有什么让你笑出声的小事？", action: "讲给对方听", en: { topic: "What small thing made you laugh out loud recently?", action: "Tell them about it" } },
  { topic: "你希望被安慰的时候，我怎么做最有用？", action: "记下来，下次照做", en: { topic: "When you need comforting, what actually helps?", action: "Write it down and do exactly that next time" } },
  { topic: "我们之间有什么只有彼此懂的暗号或梗？", action: "今天用一次", en: { topic: "What's a joke or signal only the two of you understand?", action: "Use it once today" } },
  { topic: "你最近对自己满意的一件事是什么？", action: "认真夸对方这一点", en: { topic: "What have you been quietly pleased with about yourself?", action: "Compliment them on exactly that" } },
  { topic: "如果今天可以重来一次，你想改哪一小段？", action: "一起把它过成想要的样子", en: { topic: "If today could run again, which small part would you change?", action: "Live that part the way you wanted it" } },
];

/** Same day, same prompt, on both phones. */
export function promptOfDay(day: string = todayKey()): { topic: string; action: string; en: { topic: string; action: string } } {
  let hash = 0;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
  return DAILY_PROMPTS[hash % DAILY_PROMPTS.length];
}

/**
 * Starting points for a couple's own wish. A blank form asks people to be
 * inventive on the spot, which is exactly when nothing comes to mind.
 */
export const WISH_TEMPLATES: Array<{ name: string; description: string; price: number; category: Category; en: { name: string; description: string } }> = [
  { name: "陪我散步", description: "不赶路，走到哪算哪", price: 30, category: "date", en: { name: "Walk with me", description: "No destination, no hurry" } },
  { name: "一起做饭", description: "一个人洗菜，一个人掌勺", price: 48, category: "date", en: { name: "Cook together", description: "One washes, one stirs" } },
  { name: "认真听我说十分钟", description: "不给建议，只听着", price: 36, category: "care", en: { name: "Ten minutes of listening", description: "No advice, just listening" } },
  { name: "帮我按按肩膀", description: "十分钟就够，认真一点", price: 40, category: "care", en: { name: "Rub my shoulders", description: "Ten minutes is plenty — but mean it" } },
  { name: "带一份宵夜回来", description: "什么都行，是你挑的就好", price: 32, category: "food", en: { name: "Bring home a late snack", description: "Anything, as long as you chose it" } },
  { name: "一起看一集剧", description: "不看手机，看完聊两句", price: 28, category: "date", en: { name: "One episode together", description: "Phones away, and talk about it after" } },
];

/**
 * 相爱天数、累计完成、连续签到 have all been on screen from the beginning, and
 * nothing has ever happened when one of them reached a number worth noticing.
 * These give the counters somewhere to arrive.
 *
 * Every line is written for its own moment — a template would produce "恭喜达成
 * 相爱 100 天", which is exactly the tone this app is trying not to have.
 */
export const MILESTONES: Milestone[] = [
  { id: "days-100", kind: "days", threshold: 100, title: "相爱 100 天", body: "三位数了。前 99 天里，有几天是真的很难过的，你们还是走到了这里。", en: { title: "100 days together", body: "Three digits. Some of those 99 days were genuinely hard, and you got here anyway." } },
  { id: "days-365", kind: "days", threshold: 365, title: "相爱一整年", body: "一年四季都陪对方过了一遍。明年的这一天，记得回来看看今天写了什么。", en: { title: "A whole year together", body: "You've been through all four seasons with each other. Come back on this day next year and read what today said." } },
  { id: "days-520", kind: "days", threshold: 520, title: "相爱 520 天", body: "这个数字是自己撞上来的，不庆祝一下说不过去。", en: { title: "520 days together", body: "This number walked right into you. It would be rude not to celebrate it." } },
  { id: "days-1000", kind: "days", threshold: 1000, title: "相爱 1000 天", body: "一千天。这已经不是运气了，是两个人每天都选择了对方。", en: { title: "1,000 days together", body: "A thousand days. That isn't luck any more — it's two people choosing each other, daily." } },
  { id: "wishes-1", kind: "wishes", threshold: 1, title: "第一个心愿完成了", body: "小铺正式开张。第一份认真回应，值得被记住。", en: { title: "Your first wish, finished", body: "The shop is properly open. The first answer given seriously is worth remembering." } },
  { id: "wishes-10", kind: "wishes", threshold: 10, title: "第 10 个心愿", body: "十次说到做到。这间小铺开始有信用了。", en: { title: "Ten wishes", body: "Ten times of doing what you said. This shop is building credit." } },
  { id: "wishes-50", kind: "wishes", threshold: 50, title: "第 50 个心愿", body: "五十份被认真对待的期待。翻翻时间线，那里面有很多个普通的好日子。", en: { title: "Fifty wishes", body: "Fifty hopes taken seriously. Scroll the timeline — there are a lot of ordinary good days in there." } },
  { id: "wishes-100", kind: "wishes", threshold: 100, title: "第 100 个心愿", body: "一百次。这间小铺已经是你们相处方式的一部分了。", en: { title: "A hundred wishes", body: "One hundred. This shop is part of how the two of you get along now." } },
  { id: "streak-7", kind: "streak", threshold: 7, title: "连续签到一周", body: "七天都记得回来看看对方，比听起来难。", en: { title: "A week of check-ins", body: "Seven days of remembering to come back for each other. Harder than it sounds." } },
  { id: "streak-30", kind: "streak", threshold: 30, title: "连续签到 30 天", body: "一整个月没断过。这已经是习惯，不是坚持了。", en: { title: "Thirty days in a row", body: "A whole month unbroken. That's a habit now, not an effort." } },
  { id: "streak-100", kind: "streak", threshold: 100, title: "连续签到 100 天", body: "一百天不断，说明你每天都想起了这件事，也想起了对方。", en: { title: "A hundred days in a row", body: "A hundred unbroken days means you thought of this — and of them — every single one." } },
];

export type MilestoneCounts = { days: number; wishes: number; streak: number };

/** Everything the couple has already passed, in the order the list defines. */
export function reachedMilestones(counts: MilestoneCounts): Milestone[] {
  return MILESTONES.filter((milestone) => counts[milestone.kind] >= milestone.threshold);
}

/**
 * The nearest thing still ahead, measured by how far away it is rather than by
 * list order — otherwise a distant 相爱 1000 天 would hide 第 10 个心愿.
 */
export function nextMilestone(counts: MilestoneCounts): { milestone: Milestone; remaining: number } | null {
  let best: { milestone: Milestone; remaining: number } | null = null;
  for (const milestone of MILESTONES) {
    const remaining = milestone.threshold - counts[milestone.kind];
    if (remaining > 0 && (!best || remaining < best.remaining)) best = { milestone, remaining };
  }
  return best;
}

/** How the shortfall reads for each counter. */
export const MILESTONE_UNITS: Record<Lang, Record<MilestoneKind, string>> = {
  zh: { days: "天", wishes: "个心愿", streak: "天签到" },
  en: { days: "days", wishes: "wishes", streak: "check-in days" },
};

export const milestoneUnit = MILESTONE_UNITS.zh;

/** English singulars, so "1 wishes to go" never reaches the screen. */
const MILESTONE_UNIT_ONE: Record<MilestoneKind, string> = { days: "day", wishes: "wish", streak: "check-in day" };

export function milestoneUnitOf(lang: Lang, kind: MilestoneKind, count: number): string {
  if (lang === "en" && Math.abs(count) === 1) return MILESTONE_UNIT_ONE[kind];
  return MILESTONE_UNITS[lang][kind];
}

export const categoryMeta: Array<{ id: Category; label: string; subtitle: string; icon: typeof HomeIcon; en: { label: string; subtitle: string } }> = [
  { id: "food", label: "点吃的", subtitle: "想吃就许愿", icon: HomeIcon, en: { label: "Food", subtitle: "Crave it, then wish for it" } },
  { id: "care", label: "点服务", subtitle: "今天想被偏爱", icon: HeartIcon, en: { label: "Care", subtitle: "Be someone's favourite today" } },
  { id: "date", label: "去约会", subtitle: "一起出发", icon: RocketIcon, en: { label: "Dates", subtitle: "Head out together" } },
  { id: "limited", label: "限定券", subtitle: "珍贵且唯一", icon: StarFilledIcon, en: { label: "Limited", subtitle: "Rare, and only once" } },
];

export const STATUS_TEXT: Record<Lang, Record<OrderStatus, string>> = {
  zh: {
    pending: "等对方回应",
    accepted: "已接单",
    doing: "进行中",
    done: "甜蜜完成",
    rejected: "这次未接单",
    cancelled: "已撤回",
  },
  en: {
    pending: "Waiting for a reply",
    accepted: "Accepted",
    doing: "In progress",
    done: "Sweetly finished",
    rejected: "Declined this time",
    cancelled: "Withdrawn",
  },
};

export const statusText = STATUS_TEXT.zh;

/** What the order sheet offers for "希望什么时候"; free text is also allowed. */
export const DESIRED_TIME_OPTIONS: ReadonlyArray<Record<Lang, string>> = [
  { zh: "尽快", en: "As soon as you can" },
  { zh: "今晚", en: "Tonight" },
  { zh: "明天", en: "Tomorrow" },
  { zh: "这周末", en: "This weekend" },
];

export const DESIRED_TIMES = DESIRED_TIME_OPTIONS.map((option) => option.zh);

export const desiredTimes = (lang: Lang): string[] => DESIRED_TIME_OPTIONS.map((option) => option[lang]);

/**
 * An order stores whatever wording was on screen when it was placed, so a
 * partner reading in the other language would otherwise see a stray "今晚" in an
 * English list. Free text the couple typed themselves has no match here and is
 * shown exactly as written.
 */
export function localizeDesiredTime(value: string, lang: Lang): string {
  const match = DESIRED_TIME_OPTIONS.find((option) => option.zh === value || option.en === value);
  return match ? match[lang] : value;
}

/** Copy for a shipped item in `lang`; a couple's own wish is returned untouched. */
export function localizedItem(item: MenuItem, lang: Lang): { name: string; description: string } {
  return lang === "en" && item.en ? item.en : { name: item.name, description: item.description };
}

/**
 * An order row carries the name it was placed with. For a shipped item the id
 * is enough to name it again in the reader's language; a custom wish keeps the
 * couple's own words.
 */
export function localizedItemName(order: Pick<Order, "itemId" | "itemName">, lang: Lang): string {
  if (lang === "zh") return order.itemName;
  return MENU.find((item) => item.id === order.itemId)?.en?.name ?? order.itemName;
}

export function localizedTask(task: CoupleTask, lang: Lang): { title: string; description: string } {
  return lang === "en" && task.en ? task.en : { title: task.title, description: task.description };
}

export function localizedMilestone(milestone: Milestone, lang: Lang): { title: string; body: string } {
  return lang === "en" && milestone.en ? milestone.en : { title: milestone.title, body: milestone.body };
}

export function localizedPrompt(prompt: { topic: string; action: string; en: { topic: string; action: string } }, lang: Lang) {
  return lang === "en" ? prompt.en : { topic: prompt.topic, action: prompt.action };
}

export function localizedTemplate(template: { name: string; description: string; en: { name: string; description: string } }, lang: Lang) {
  return lang === "en" ? template.en : { name: template.name, description: template.description };
}

export function localizedCategory(meta: (typeof categoryMeta)[number], lang: Lang): { label: string; subtitle: string } {
  return lang === "en" ? meta.en : { label: meta.label, subtitle: meta.subtitle };
}

export function periodKeyFor(frequency: TaskFrequency): string {
  return frequency === "daily" ? todayKey() : weekKey();
}

export function taskClaimKey(task: CoupleTask): string {
  return `${periodKeyFor(task.frequency)}:${task.id}`;
}
