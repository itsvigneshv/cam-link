type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[CamLink]";

function emit(level: LogLevel, message: string, data?: unknown) {
  const payload = data === undefined ? "" : data;
  const fn =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;
  if (payload === "") fn(`${PREFIX} ${message}`);
  else fn(`${PREFIX} ${message}`, payload);
}

export const log = {
  debug: (message: string, data?: unknown) => emit("debug", message, data),
  info: (message: string, data?: unknown) => emit("info", message, data),
  warn: (message: string, data?: unknown) => emit("warn", message, data),
  error: (message: string, data?: unknown) => emit("error", message, data),
  ice: (message: string, data?: unknown) => emit("info", `ICE ${message}`, data),
  rtc: (message: string, data?: unknown) => emit("info", `RTC ${message}`, data),
};
