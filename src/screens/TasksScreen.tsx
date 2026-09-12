import { ChatBubbleIcon, CheckIcon, HeartFilledIcon, LightningBoltIcon, LockClosedIcon, MoonIcon, TargetIcon } from "@radix-ui/react-icons";
import { REQUIREMENT_HINTS, TASKS, WEEKLY_PERSONAL_GOAL, earnedInWeek, localizedPrompt, localizedTask, promptOfDay, taskClaimKey, taskRequirementMet } from "../lib/catalog";
import { useI18n } from "../i18n";
import type { CoupleTask, MemoryEntry, Order, PartnerStatus } from "../lib/types";
import { PartnerCard } from "./PartnerCard";

export function TasksScreen({
  coins,
  claimedTasks,
  onClaim,
  orders,
  memories,
  currentName,
  currentUserId,
  memoriesTracked,
  partner,
}: {
  coins: number;
  /** Only the current person's claims — both partners earn their own rewards. */
  claimedTasks: string[];
  onClaim: (task: CoupleTask) => void;
  orders: Order[];
  memories: MemoryEntry[];
  currentName: string;
  currentUserId?: string;
  memoriesTracked: boolean;
  /** The other person's week, or null when nobody is paired yet. */
  partner: PartnerStatus | null;
}) {
  const { lang, t } = useI18n();
  const daily = TASKS.filter((task) => task.frequency === "daily");
  const weekly = TASKS.filter((task) => task.frequency === "weekly");
  const earnedThisWeek = earnedInWeek(claimedTasks);
  const progress = Math.min(100, Math.round((earnedThisWeek / WEEKLY_PERSONAL_GOAL) * 100));
  const context = { orders, memories, currentName, currentUserId, memoriesTracked };
  const prompt = localizedPrompt(promptOfDay(), lang);

  const renderTask = (task: CoupleTask) => {
    const claimed = claimedTasks.includes(taskClaimKey(task));
    // Tasks tied to a real action only unlock once the shop has seen it happen.
    const ready = claimed || taskRequirementMet(task, context);
    const Icon = task.icon;
    const copy = localizedTask(task, lang);
    return (
      <article className={`task-card tone-${task.tone}`} key={task.id}>
        <span className="task-icon"><Icon /></span>
        <div className="task-copy">
          <h3>{copy.title}</h3>
          <p>{ready ? copy.description : REQUIREMENT_HINTS[lang][task.requires!]}</p>
        </div>
        <button className={claimed ? "claimed" : ready ? "" : "locked"} disabled={claimed || !ready} onClick={() => onClaim(task)}>
          {claimed ? <><CheckIcon /> {t("tasks.claimed")}</> : ready ? <><HeartFilledIcon /> +{task.reward}</> : <><LockClosedIcon /> {t("tasks.locked")}</>}
        </button>
      </article>
    );
  };

  return (
    <section className="page-section tasks-page">
      <div className="task-hero">
        <div className="task-hero-top"><span><TargetIcon /> {t("tasks.weekPlan")}</span><strong>{earnedThisWeek} / {WEEKLY_PERSONAL_GOAL}</strong></div>
        <h2>{t("tasks.heroTitle")}</h2>
        <p>{t("tasks.heroBody")}</p>
        <div className="task-progress" aria-label={t("tasks.progressAria", { percent: progress })}><span style={{ width: `${progress}%` }} /></div>
        <div className="task-balance"><HeartFilledIcon /><strong>{coins}</strong><span>{t("tasks.myCoins")}</span></div>
      </div>

      <PartnerCard status={partner} />

      {/* The four daily tasks never change; this does, and both phones show the
          same one so "今天聊这个" actually means something. */}
      <div className="daily-prompt">
        <span className="daily-prompt-tag"><ChatBubbleIcon /> {t("tasks.promptTag")}</span>
        <p>{prompt.topic}</p>
        <div className="daily-prompt-action"><LightningBoltIcon /> {t("tasks.promptAction", { action: prompt.action })}</div>
      </div>

      <div className="task-heading"><div><span>{t("tasks.dailyRefresh")}</span><h2>{t("tasks.dailyTitle")}</h2></div><strong>{daily.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{daily.length}</strong></div>
      <div className="task-list">{daily.map(renderTask)}</div>

      {/* Both partners get their own copy of every task, so these headings say
          "我的": one side claiming a task never consumes the other's. */}
      <div className="task-heading weekly"><div><span>{t("tasks.weeklyRefresh")}</span><h2>{t("tasks.weeklyTitle")}</h2></div><strong>{weekly.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{weekly.length}</strong></div>
      <div className="task-list">{weekly.map(renderTask)}</div>

      <div className="economy-note"><span><MoonIcon /></span><div><strong>{t("tasks.economyTitle")}</strong><p>{t("tasks.economyBody")}</p></div></div>
    </section>
  );
}
