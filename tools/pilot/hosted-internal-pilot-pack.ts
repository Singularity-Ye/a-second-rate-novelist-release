import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ScaffoldPilotPackInput = {
  rootDir?: string;
  date: string;
};

type CollectPilotDayInput = {
  rootDir?: string;
  date: string;
  day: number;
  baseUrl: string;
  auth?: {
    username?: string;
    password?: string;
  };
  fetchImpl?: typeof fetch;
};

type PilotParticipant = {
  participant_id: string;
  account_token: string;
  invite_code: string;
  source_channel: string;
  user_type: string;
  owner: string;
  day1_opened_at: string;
  day7_status: string;
  completed_f1_f4_f7_f9: string;
};

export function scaffoldPilotPack(input: ScaffoldPilotPackInput) {
  const packDir = resolvePackDir(input.rootDir, input.date);
  mkdirSync(packDir, { recursive: true });
  mkdirSync(path.join(packDir, "records"), { recursive: true });

  const participantsCsv = path.join(packDir, "participants.csv");
  writeIfMissing(
    participantsCsv,
    [
      "participant_id,account_token,invite_code,source_channel,user_type,owner,day1_opened_at,day7_status,completed_f1_f4_f7_f9",
    ].join("\n"),
  );

  for (let day = 1; day <= 7; day += 1) {
    writeIfMissing(
      path.join(packDir, `daily-metrics-day${day}.md`),
      [
        `# Day ${day} Pilot Metrics`,
        "",
        "- cohort_status:",
        "- key_findings:",
        "- blockers:",
        "",
        "| participant_id | account_token | event_count | open_case_count | last_event | latest_case_status |",
        "| --- | --- | --- | --- | --- | --- |",
      ].join("\n"),
    );
  }

  const issuePriorityTable = path.join(packDir, `Phase0_问题优先级表_${input.date}.md`);
  writeIfMissing(
    issuePriorityTable,
    [
      `# Phase0 问题优先级表 ${input.date}`,
      "",
      "| issue_id | priority | category | summary | owner | status | retest_status |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    ].join("\n"),
  );

  const retestSummary = path.join(packDir, "retest-summary.md");
  writeIfMissing(
    retestSummary,
    [
      "# Retest Summary",
      "",
      "- date:",
      "- fixed_items:",
      "- still_open:",
      "- go_no_go_recommendation:",
    ].join("\n"),
  );

  return {
    packDir,
    participantsCsv,
    issuePriorityTable,
    retestSummary,
  };
}

export async function collectPilotDay(input: CollectPilotDayInput) {
  assertDay(input.day);
  const fetchImpl = input.fetchImpl ?? fetch;
  const scaffolded = scaffoldPilotPack({
    rootDir: input.rootDir,
    date: input.date,
  });
  const packDir = scaffolded.packDir;
  const rawDir = path.join(packDir, "raw", `day${input.day}`);
  mkdirSync(rawDir, { recursive: true });

  const participants = readParticipants(scaffolded.participantsCsv);
  const summaryRows: string[] = [];

  for (const participant of participants) {
    const participantDir = path.join(rawDir, participant.participant_id);
    mkdirSync(participantDir, { recursive: true });

    const telemetryEvents = await fetchJson(
      fetchImpl,
      `${trimTrailingSlash(input.baseUrl)}/api/telemetry/events?account_token=${encodeURIComponent(participant.account_token)}`,
      input.auth,
    );
    const telemetryFunnel = await fetchJson(
      fetchImpl,
      `${trimTrailingSlash(input.baseUrl)}/api/telemetry/funnel?account_token=${encodeURIComponent(participant.account_token)}`,
      input.auth,
    );
    const betaSupportOverview = await fetchJson(
      fetchImpl,
      `${trimTrailingSlash(input.baseUrl)}/api/beta/support/overview?account_token=${encodeURIComponent(participant.account_token)}`,
      input.auth,
    );

    writeJson(path.join(participantDir, "telemetry-events.json"), telemetryEvents);
    writeJson(path.join(participantDir, "telemetry-funnel.json"), telemetryFunnel);
    writeJson(path.join(participantDir, "beta-support-overview.json"), betaSupportOverview);

    const events = arrayOf(telemetryEvents?.data?.events);
    const supportCases = arrayOf(betaSupportOverview?.data?.cases);
    const lastEvent = events.length > 0 ? String(events[events.length - 1]?.event_name ?? "none") : "none";
    const latestCaseStatus =
      supportCases.length > 0 ? String(supportCases[0]?.status ?? "none") : "none";

    summaryRows.push(
      `| ${participant.participant_id} | ${participant.account_token} | ${events.length} | ${supportCases.length} | ${lastEvent} | ${latestCaseStatus} |`,
    );
  }

  const dailyMetricsFile = path.join(packDir, `daily-metrics-day${input.day}.md`);
  writeFileSync(
    dailyMetricsFile,
    [
      `# Day ${input.day} Pilot Metrics`,
      "",
      `- generated_at: ${new Date().toISOString()}`,
      `- participant_count: ${participants.length}`,
      "",
      "| participant_id | account_token | event_count | open_case_count | last_event | latest_case_status |",
      "| --- | --- | --- | --- | --- | --- |",
      ...summaryRows,
    ].join("\n"),
    "utf8",
  );

  return {
    packDir,
    rawDir,
    dailyMetricsFile,
    participantCount: participants.length,
  };
}

export async function runCli(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command) {
    throw new Error("Usage: tsx tools/pilot/hosted-internal-pilot-pack.ts <scaffold|collect-day> [options]");
  }

  const args = parseArgs(rest);
  if (command === "scaffold") {
    const date = readArg(args, "date", todayDate());
    const result = scaffoldPilotPack({
      rootDir: args["root-dir"],
      date,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "collect-day") {
    const date = readArg(args, "date", todayDate());
    const dayValue = Number.parseInt(readArg(args, "day"), 10);
    const baseUrl = readArg(args, "base-url", process.env.HOSTED_SHARED_DEV_BASE_URL);
    const username = args.username ?? process.env.HOSTED_SHARED_DEV_BASIC_AUTH_USERNAME;
    const password = args.password ?? process.env.HOSTED_SHARED_DEV_BASIC_AUTH_PASSWORD;
    const result = await collectPilotDay({
      rootDir: args["root-dir"],
      date,
      day: dayValue,
      baseUrl,
      auth: {
        username,
        password,
      },
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unsupported command ${command}`);
}

function resolvePackDir(rootDir: string | undefined, date: string) {
  const base = path.resolve(rootDir ?? path.join(process.cwd(), "apps/.tmp/tc-cdx-104"));
  return path.join(base, "pilot-pack", date);
}

function writeIfMissing(file: string, body: string) {
  try {
    readFileSync(file, "utf8");
  } catch {
    writeFileSync(file, body, "utf8");
  }
}

function readParticipants(file: string): PilotParticipant[] {
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map((item) => item.trim());
  return rows.map((row) => {
    const values = row.split(",").map((item) => item.trim());
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as PilotParticipant;
    return record;
  });
}

async function fetchJson(fetchImpl: typeof fetch, url: string, auth?: { username?: string; password?: string }) {
  const headers = buildHeaders(auth);
  const response = await fetchImpl(url, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed request ${url}: ${response.status}`);
  }

  return response.json();
}

function buildHeaders(auth?: { username?: string; password?: string }) {
  if (!auth?.username || !auth?.password) {
    return {};
  }

  return {
    authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
  };
}

function writeJson(file: string, payload: unknown) {
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function arrayOf<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

function assertDay(day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw new Error(`day must be an integer between 1 and 7, got ${day}`);
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(items: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item?.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    parsed[key] = items[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

function readArg(args: Record<string, string>, key: string, fallback?: string) {
  const value = args[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing --${key}`);
  }

  return value;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  void runCli(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
