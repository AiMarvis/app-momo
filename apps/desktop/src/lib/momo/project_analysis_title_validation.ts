function isDeveloperOnlyTitle(value: string): boolean {
  return (
    hasSourceFileToken(value) ||
    hasFunctionIdentifierToken(value) ||
    /(?:^|\/)[^/\s]+\.(?:cts|go|js|jsx|json|md|mts|py|rs|ts|tsx)$/i.test(value) ||
    /\b(?:build error|compiler error|panic)\b.*\.(?:cts|go|js|jsx|mts|py|rs|ts|tsx)\b/i.test(
      value,
    ) ||
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\(\)$/.test(value) ||
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s+(?:cleanup|error|fix|refactor)$/i.test(value) ||
    /^[\w.-]+(?:[-/][\w.-]+)*\s+build error$/i.test(value) ||
    /^(?:clean\s*up|cleanup|fix|handle|patch|refactor|repair|update)\s+(?:[\w.-]+\s+){0,3}(?:adapter|build|command|component|config|configuration|endpoint|handler|module|provider|runtime|schema|store|updater)(?:\s+(?:bug|error|failure|issue))?$/i.test(
      value,
    ) ||
    /^(?:Error:|Internal error|Internal Server Error|RangeError|ReferenceError|SyntaxError|TypeError|Unhandled exception)/i.test(
      value,
    )
  );
}

function isGitMetadataTitle(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[a-f0-9]{7,40}$/i.test(trimmed) ||
    /\b[a-f0-9]{7,40}\b/i.test(trimmed) ||
    /^(?:git\s+diff\s+)?[A-Za-z0-9._/-]+\.{2,3}[A-Za-z0-9._/-]+$/i.test(trimmed) ||
    /^git\s+diff(?:\s+--[A-Za-z-]+)*\s+[A-Za-z0-9._/-]+(?:\.{2,3}[A-Za-z0-9._/-]+)?$/i.test(
      trimmed,
    )
  );
}

function isAbstractTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    ABSTRACT_TITLES.has(normalized) ||
    /^(?:improve|fix|update|enhance|optimize|refactor|clean\s*up|cleanup|review|handle|address|work on)\s+(?:the\s+)?(?:whole\s+|overall\s+|general\s+)?(?:project|app|application|system|codebase|workflow|quality|issues?|things?|stuff|it|this|that|everything)(?:\s+(?:later|soon|overall|generally))?$/.test(
      normalized,
    ) ||
    /^(?:project|app|application|system|codebase|workflow|quality)\s+(?:improvement|cleanup|refactor(?:ing)?|optimization|maintenance|fix(?:es)?|updates?)$/.test(
      normalized,
    ) ||
    /^(?:프로젝트|앱|어플|시스템|코드|코드베이스|전체|품질)\s*(?:개선|수정|정리|최적화|리팩토링|고도화)\s*(?:필요)?$/.test(
      normalized,
    ) ||
    /^(?:개선|수정|정리|최적화|리팩토링)\s*(?:필요|하기)?$/.test(normalized)
  );
}

function hasSourceFileToken(value: string): boolean {
  return /(?:^|[\s'"(])[\w./-]+\.(?:cts|go|js|jsx|json|md|mts|py|rs|ts|tsx)\b/i.test(value);
}

function hasFunctionIdentifierToken(value: string): boolean {
  return (
    /\b[A-Za-z_$][\w$]*\(\)/.test(value) ||
    /\b[a-z_$][a-z0-9_$]+(?:[A-Z][A-Za-z0-9_$]*){1,}\b/.test(value)
  );
}

const ABSTRACT_TITLES = new Set([
  "improve project",
  "needs refactoring",
  "project improvement",
  "refactoring needed",
  "리팩토링 필요",
  "프로젝트 개선",
]);

export { isAbstractTitle, isDeveloperOnlyTitle, isGitMetadataTitle };
