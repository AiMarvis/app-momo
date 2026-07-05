import type {
  ChatApprovalMessage,
  ChatSessionState,
  ChatSessionStatus,
  ChatToolMessage,
} from "./types";
import { currentLocale } from "~/i18n";

type ChatUiTone = "neutral" | "accent" | "warning" | "danger" | "success";

interface ChatStatusMeta {
  label: string;
  description: string;
  tone: ChatUiTone;
}

// Exhaustiveness is enforced by `satisfies Record<ChatSessionStatus, …>` —
// adding a new status to the union forces a matching entry here.
const SESSION_STATUS_META = {
  idle: {
    label: "Idle",
    description: "Ready for a new request.",
    tone: "neutral",
  },
  streaming: {
    label: "Thinking",
    description: "The assistant is working and may still call tools.",
    tone: "accent",
  },
  "awaiting-approval": {
    label: "Waiting for approval",
    description: "Waiting for approval before applying changes.",
    tone: "warning",
  },
  applying: {
    label: "Applying",
    description: "Applying approved changes.",
    tone: "warning",
  },
  error: {
    label: "Error",
    description: "The last request failed.",
    tone: "danger",
  },
} as const satisfies Record<ChatSessionStatus, ChatStatusMeta>;

const KO_SESSION_STATUS_META: Record<ChatSessionStatus, ChatStatusMeta> = {
  idle: {
    label: "대기 중",
    description: "새 요청을 바로 시작할 수 있어요.",
    tone: "neutral",
  },
  streaming: {
    label: "생각 중",
    description: "답변을 만들고 있고, 필요한 도구를 계속 사용할 수 있어요.",
    tone: "accent",
  },
  "awaiting-approval": {
    label: "승인 대기",
    description: "변경을 적용하기 전에 승인을 기다리고 있어요.",
    tone: "warning",
  },
  applying: {
    label: "적용 중",
    description: "승인된 변경 사항을 적용하고 있어요.",
    tone: "warning",
  },
  error: {
    label: "오류",
    description: "마지막 요청 처리에 실패했어요.",
    tone: "danger",
  },
};

function truncateSingleLine(value: string | undefined, max = 96): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function getSessionStatusMeta(session: ChatSessionState | null): ChatStatusMeta {
  const isKo = currentLocale() === "ko";
  const table = isKo ? KO_SESSION_STATUS_META : SESSION_STATUS_META;
  if (!session) return table.idle;
  const meta = table[session.status];
  if (session.status === "error" && session.error) {
    return { ...meta, description: session.error };
  }
  return meta;
}

function getToolStatusLabel(item: ChatToolMessage): string {
  const isKo = currentLocale() === "ko";
  if (item.error) return isKo ? "오류" : "Error";
  if (item.success) return isKo ? "완료" : "Done";
  return isKo ? "실행 중" : "Running";
}

function getToolStatusTone(item: ChatToolMessage): ChatUiTone {
  if (item.error) return "danger";
  if (item.success) return "success";
  return "accent";
}

function getToolPreview(item: ChatToolMessage): string {
  if (item.error) {
    return truncateSingleLine(item.error, 100);
  }
  if (item.output) {
    return truncateSingleLine(item.output, 100);
  }
  const fallback = currentLocale() === "ko" ? "결과를 기다리고 있어요." : "Waiting for result.";
  return truncateSingleLine(JSON.stringify(item.arguments), 100) || fallback;
}

const APPROVAL_STATUS_LABEL = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  conflict: "Conflict",
  error: "Error",
} as const satisfies Record<ChatApprovalMessage["status"], string>;

const KO_APPROVAL_STATUS_LABEL: Record<ChatApprovalMessage["status"], string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  applied: "적용 완료",
  conflict: "충돌",
  error: "오류",
};

const APPROVAL_STATUS_TONE = {
  pending: "warning",
  approved: "accent",
  rejected: "neutral",
  applied: "success",
  conflict: "danger",
  error: "danger",
} as const satisfies Record<ChatApprovalMessage["status"], ChatUiTone>;

function getApprovalStatusLabel(item: ChatApprovalMessage): string {
  return (currentLocale() === "ko" ? KO_APPROVAL_STATUS_LABEL : APPROVAL_STATUS_LABEL)[item.status];
}

function getApprovalStatusTone(item: ChatApprovalMessage): ChatUiTone {
  return APPROVAL_STATUS_TONE[item.status];
}

function getApprovalSummary(item: ChatApprovalMessage): string {
  if (item.error) {
    return truncateSingleLine(item.error, 120);
  }

  if (item.previewText) {
    return truncateSingleLine(item.previewText, 120);
  }

  const summary =
    typeof item.mutation.summary === "string"
      ? item.mutation.summary
      : JSON.stringify(item.mutation);
  return truncateSingleLine(summary, 120) || getApprovalStatusLabel(item);
}

export type { ChatStatusMeta, ChatUiTone };
export {
  getApprovalStatusLabel,
  getApprovalStatusTone,
  getApprovalSummary,
  getSessionStatusMeta,
  getToolPreview,
  getToolStatusLabel,
  getToolStatusTone,
  truncateSingleLine,
};
