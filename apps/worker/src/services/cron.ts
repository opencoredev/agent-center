interface CronField {
  isWildcard: boolean;
  matches(value: number): boolean;
}

interface ParsedCronSchedule {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const CRON_FIELD_CACHE = new Map<string, ParsedCronSchedule>();

function createCronField(
  field: string,
  minimum: number,
  maximum: number,
  label: string,
): CronField {
  const trimmedField = field.trim();

  if (trimmedField.length === 0) {
    throw new Error(`Cron ${label} field cannot be empty`);
  }

  if (trimmedField === "*") {
    return {
      isWildcard: true,
      matches: () => true,
    };
  }

  const values = new Set<number>();

  for (const segment of trimmedField.split(",")) {
    const trimmedSegment = segment.trim();

    if (trimmedSegment.length === 0) {
      throw new Error(`Cron ${label} field contains an empty segment`);
    }

    const [rangePart, stepPart] = trimmedSegment.split("/");

    if (rangePart === undefined) {
      throw new Error(`Cron ${label} field has an invalid segment "${trimmedSegment}"`);
    }

    const step = stepPart === undefined ? 1 : Number(stepPart);

    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Cron ${label} field has an invalid step "${trimmedSegment}"`);
    }

    if (rangePart === "*") {
      for (let value = minimum; value <= maximum; value += step) {
        values.add(value);
      }

      continue;
    }

    if (rangePart.includes("-")) {
      const [startPart, endPart] = rangePart.split("-");
      const start = Number(startPart);
      const end = Number(endPart);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < minimum ||
        end > maximum ||
        start > end
      ) {
        throw new Error(`Cron ${label} field has an invalid range "${trimmedSegment}"`);
      }

      for (let value = start; value <= end; value += step) {
        values.add(value);
      }

      continue;
    }

    const rawValue = Number(rangePart);

    if (!Number.isInteger(rawValue) || rawValue < minimum || rawValue > maximum) {
      throw new Error(`Cron ${label} field has an invalid value "${trimmedSegment}"`);
    }

    values.add(rawValue);
  }

  return {
    isWildcard: false,
    matches(value: number) {
      return values.has(value);
    },
  };
}

function parseCronExpression(expression: string) {
  const cachedSchedule = CRON_FIELD_CACHE.get(expression);

  if (cachedSchedule !== undefined) {
    return cachedSchedule;
  }

  const fields = expression.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(
      `Cron expression "${expression}" must have exactly 5 fields (minute hour day month weekday)`,
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (
    minute === undefined ||
    hour === undefined ||
    dayOfMonth === undefined ||
    month === undefined ||
    dayOfWeek === undefined
  ) {
    throw new Error(`Cron expression "${expression}" is incomplete`);
  }

  const parsedSchedule = {
    minute: createCronField(minute, 0, 59, "minute"),
    hour: createCronField(hour, 0, 23, "hour"),
    dayOfMonth: createCronField(dayOfMonth, 1, 31, "day-of-month"),
    month: createCronField(month, 1, 12, "month"),
    dayOfWeek: createCronField(dayOfWeek, 0, 6, "day-of-week"),
  } satisfies ParsedCronSchedule;

  CRON_FIELD_CACHE.set(expression, parsedSchedule);

  return parsedSchedule;
}

function matchesDay(
  schedule: ParsedCronSchedule,
  dayOfMonth: number,
  dayOfWeek: number,
) {
  const dayOfMonthMatches = schedule.dayOfMonth.matches(dayOfMonth);
  const dayOfWeekMatches = schedule.dayOfWeek.matches(dayOfWeek);

  if (schedule.dayOfMonth.isWildcard && schedule.dayOfWeek.isWildcard) {
    return true;
  }

  if (schedule.dayOfMonth.isWildcard) {
    return dayOfWeekMatches;
  }

  if (schedule.dayOfWeek.isWildcard) {
    return dayOfMonthMatches;
  }

  return dayOfMonthMatches || dayOfWeekMatches;
}

function matchesDate(schedule: ParsedCronSchedule, candidate: Date) {
  return (
    schedule.minute.matches(candidate.getMinutes()) &&
    schedule.hour.matches(candidate.getHours()) &&
    schedule.month.matches(candidate.getMonth() + 1) &&
    matchesDay(schedule, candidate.getDate(), candidate.getDay())
  );
}

export function getNextCronOccurrence(expression: string, from: Date) {
  const schedule = parseCronExpression(expression);
  const candidate = new Date(from);
  const cutoffAt = from.getTime() + 366 * 24 * 60 * 60 * 1000;

  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  while (candidate.getTime() <= cutoffAt) {
    if (matchesDate(schedule, candidate)) {
      return new Date(candidate);
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Could not resolve a future run time for cron "${expression}"`);
}
