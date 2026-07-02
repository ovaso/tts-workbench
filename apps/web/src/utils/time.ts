const DEFAULT_TIME_ZONE = "Asia/Shanghai";

// formatLocalDateTime: 入参为 ISO 时间字符串；功能是按 Asia/Shanghai 展示本地日期时间。
export function formatLocalDateTime(value: string, timeZone = DEFAULT_TIME_ZONE): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
