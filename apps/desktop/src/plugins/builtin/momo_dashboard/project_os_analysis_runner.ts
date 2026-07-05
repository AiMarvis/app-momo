import { scanProjectOsFolder, type ProjectOsManifest } from "~/lib/project_os_fs";
import { resolveLocale, type Locale } from "~/i18n";
import {
  parseProjectAnalysisPlanJson,
  type ProjectAnalysisPlan,
  type ProjectIssueCreate,
  type ProjectIssuePriority,
  type ProjectIssueStatus,
} from "~/lib/momo/project_analysis_plan";
import {
  projectAnalysisPlanToOperations,
  type ProjectIssueOperation,
} from "~/lib/momo/project_analysis_runtime";
import { settingsState } from "~/stores/settings";

import {
  createProjectOsIssue,
  recordProjectOsRunReceipt,
  updateProjectOsIssue,
  updateWorkProjectManualSync,
  workOsState,
  type ProjectOsRunReceipt,
  type WorkItem,
  type WorkProject,
} from "./work_os_store";

type ProjectOsAnalysisResult =
  | {
      readonly kind: "applied";
      readonly receipt: ProjectOsRunReceipt;
    }
  | {
      readonly kind: "failed";
      readonly error: string;
      readonly receipt: ProjectOsRunReceipt;
    };

type ProjectOsApplyResult =
  | {
      readonly kind: "applied";
      readonly createdIssueIds: readonly string[];
      readonly updatedIssueIds: readonly string[];
    }
  | {
      readonly kind: "failed";
      readonly error: string;
    };

type FinishProjectOsRunInput = {
  readonly projectId: string;
  readonly startedAt: string;
  readonly status: ProjectOsRunReceipt["status"];
  readonly summary: string;
  readonly createdIssueIds: readonly string[];
  readonly updatedIssueIds: readonly string[];
  readonly error: string;
};

async function runProjectOsAnalysis(project: WorkProject): Promise<ProjectOsAnalysisResult> {
  const startedAt = new Date().toISOString();
  updateWorkProjectManualSync(project.id, {
    status: "running",
    startedAt,
    finishedAt: null,
    error: "",
  });

  if (project.linkedFolder === null) {
    return failProjectOsRun(project.id, startedAt, "Link a project folder before analyzing.");
  }

  try {
    const manifest = await scanProjectOsFolder(project.linkedFolder.path);
    const generatedAt = new Date().toISOString();
    const issueLocale = resolveLocale(settingsState.general.projectIssueLanguage);
    const planJson = runManifestProjectAgent({
      projectId: project.id,
      projectName: project.name,
      issueLocale,
      manifest,
      existingIssues: existingIssueLines(project.id),
      nowIso: generatedAt,
    });
    const validation = parseProjectAnalysisPlanJson(planJson, project.id);
    if (validation.kind === "invalid") {
      return failProjectOsRun(project.id, startedAt, validation.errors.join("; "));
    }

    const runtime = projectAnalysisPlanToOperations(validation.plan, generatedAt);
    const applied = applyProjectOsOperations(project.id, runtime.operations);
    if (applied.kind === "failed") return failProjectOsRun(project.id, startedAt, applied.error);

    const receipt = finishProjectOsRun({
      projectId: project.id,
      startedAt,
      status: "applied",
      summary: runtime.receipt.summary,
      createdIssueIds: applied.createdIssueIds,
      updatedIssueIds: applied.updatedIssueIds,
      error: "",
    });
    return { kind: "applied", receipt };
  } catch (error) {
    return failProjectOsRun(project.id, startedAt, errorMessage(error));
  }
}

function applyProjectOsOperations(
  projectId: string,
  operations: readonly ProjectIssueOperation[],
): ProjectOsApplyResult {
  if (!workOsState.projects.some((project) => project.id === projectId)) {
    return { kind: "failed", error: "Project is no longer available." };
  }

  const existingIssueIds = new Set(
    workOsState.issues.filter((issue) => issue.projectId === projectId).map((issue) => issue.id),
  );
  for (const operation of operations) {
    const error = operationPreflightError(projectId, operation, existingIssueIds);
    if (error) return { kind: "failed", error };
  }

  const createdIssueIds: string[] = [];
  const updatedIssueIds: string[] = [];
  for (const operation of operations) {
    switch (operation.kind) {
      case "create_project_issue": {
        const created = createProjectOsIssue(projectId, {
          title: operation.issue.title,
          summary: operation.issue.summary,
          userOutcome: operation.issue.userOutcome,
          nextAction: operation.issue.nextAction,
          status: operation.issue.status,
          statusReason: operation.issue.statusReason,
          priority: operation.issue.priority,
          priorityReason: operation.issue.priorityReason,
          technicalDetails: operation.issue.technicalDetails,
          sourceEvidence: operation.issue.sourceEvidence,
        });
        if (created === null) return { kind: "failed", error: "Project is no longer available." };
        createdIssueIds.push(created.id);
        break;
      }
      case "update_project_issue":
        updateProjectOsIssue(projectId, operation.issueId, operation.update);
        updatedIssueIds.push(operation.issueId);
        break;
    }
  }

  return { kind: "applied", createdIssueIds, updatedIssueIds };
}

function operationPreflightError(
  projectId: string,
  operation: ProjectIssueOperation,
  existingIssueIds: ReadonlySet<string>,
): string {
  switch (operation.kind) {
    case "create_project_issue":
      return operation.projectId === projectId && operation.issue.projectId === projectId
        ? ""
        : "Project analysis returned work for another project.";
    case "update_project_issue":
      if (operation.projectId !== projectId || operation.update.projectId !== projectId) {
        return "Project analysis returned work for another project.";
      }
      if (operation.issueId !== operation.update.issueId) {
        return "Project analysis returned a mismatched issue update.";
      }
      return existingIssueIds.has(operation.issueId)
        ? ""
        : "Project analysis tried to update an issue that is not in this project.";
  }
}

function failProjectOsRun(
  projectId: string,
  startedAt: string,
  reason: string,
): Extract<ProjectOsAnalysisResult, { kind: "failed" }> {
  const receipt = finishProjectOsRun({
    projectId,
    startedAt,
    status: "failed",
    summary: `Project analysis stopped before changing issues: ${reason}`,
    createdIssueIds: [],
    updatedIssueIds: [],
    error: reason,
  });
  return { kind: "failed", error: reason, receipt };
}

function finishProjectOsRun(input: FinishProjectOsRunInput): ProjectOsRunReceipt {
  const finishedAt = new Date().toISOString();
  const receipt: ProjectOsRunReceipt = {
    runId: createProjectOsRunId(),
    status: input.status,
    summary: input.summary,
    createdIssueIds: input.createdIssueIds,
    updatedIssueIds: input.updatedIssueIds,
    finishedAt,
  };
  recordProjectOsRunReceipt(input.projectId, receipt);
  updateWorkProjectManualSync(input.projectId, {
    status: input.status === "applied" ? "succeeded" : "failed",
    startedAt: input.startedAt,
    finishedAt,
    error: input.error,
  });
  return receipt;
}

function existingIssueLines(projectId: string): readonly string[] {
  const issues = workOsState.issues.filter((issue) => issue.projectId === projectId);
  if (issues.length === 0) return ["No existing Project OS issues."];
  return issues.map(issueLine);
}

type ManifestProjectAgentInput = {
  readonly projectId: string;
  readonly projectName: string;
  readonly issueLocale: Locale;
  readonly manifest: ProjectOsManifest;
  readonly existingIssues: readonly string[];
  readonly nowIso: string;
};

type ProjectIssueCandidate = Omit<ProjectIssueCreate, "kind" | "projectId">;

function runManifestProjectAgent(input: ManifestProjectAgentInput): string {
  const existingTitles = new Set(
    input.existingIssues.flatMap((line) => {
      const title = /(?:^|;\s*)title=([^;]+)/.exec(line)?.[1];
      return title ? [normalizeIssueKey(title)] : [];
    }),
  );
  const allCandidates = projectIssueCandidates(input.manifest, input.issueLocale);
  const candidates = allCandidates.filter(
    (candidate) => !existingTitles.has(normalizeIssueKey(candidate.title)),
  );
  const creates = candidates.slice(0, 5).map((candidate) => ({
    kind: "project_issue" as const,
    projectId: input.projectId,
    ...candidate,
  }));
  const skippedCount = Math.max(0, allCandidates.length - creates.length);
  const summary = projectAnalysisSummary({
    createCount: creates.length,
    skippedCount,
    projectName: input.projectName,
    locale: input.issueLocale,
  });
  const plan: ProjectAnalysisPlan = {
    kind: "project_analysis",
    projectId: input.projectId,
    summary,
    creates,
    updates: [],
  };
  void input.nowIso;
  return JSON.stringify(plan);
}

function projectIssueCandidates(
  manifest: ProjectOsManifest,
  locale: Locale,
): readonly ProjectIssueCandidate[] {
  const candidates = new Map<string, ProjectIssueCandidate>();
  for (const file of manifest.files) {
    for (const candidate of candidatesForFile(file.path, file.snippet, locale)) {
      const key = normalizeIssueKey(candidate.title);
      const existing = candidates.get(key);
      candidates.set(key, existing ? mergeEvidence(existing, candidate) : candidate);
    }
  }
  if (candidates.size === 0 && manifest.files.length > 0) {
    const evidence = manifest.files[0]?.path ?? "project files";
    candidates.set(
      "clarify-next-project-decision",
      localizedIssueCandidate("clarify_decision", evidence, locale),
    );
  }
  return [...candidates.values()];
}

function candidatesForFile(
  path: string,
  snippet: string,
  locale: Locale,
): readonly ProjectIssueCandidate[] {
  const haystack = `${path}\n${snippet}`.toLowerCase();
  const candidates: ProjectIssueCandidate[] = [];
  if (/\b(payment|checkout|billing|purchase|invoice|결제|청구)\b/.test(haystack)) {
    candidates.push(localizedIssueCandidate("payment_recovery", path, locale));
  }
  if (/\b(onboarding|setup|first[-\s]?run|activation|getting started|온보딩|설정)\b/.test(haystack)) {
    candidates.push(localizedIssueCandidate("onboarding_setup", path, locale));
  }
  if (/\b(support|handoff|triage|help request|customer request|지원|문의|인계)\b/.test(haystack)) {
    candidates.push(localizedIssueCandidate("support_response", path, locale));
  }
  if (/\b(owner|ownership|approval|approver|decision|책임|승인|결정)\b/.test(haystack)) {
    candidates.push(localizedIssueCandidate("decision_owner", path, locale));
  }
  return candidates;
}

type ProjectAnalysisSummaryInput = {
  readonly createCount: number;
  readonly skippedCount: number;
  readonly projectName: string;
  readonly locale: Locale;
};

type ProjectIssueScenario =
  | "clarify_decision"
  | "payment_recovery"
  | "onboarding_setup"
  | "support_response"
  | "decision_owner";

function projectAnalysisSummary(input: ProjectAnalysisSummaryInput): string {
  if (input.createCount > 0) {
    if (input.locale === "ko") {
      return `연결된 폴더에서 프로젝트를 앞으로 움직일 작업 ${input.createCount}개를 찾았어요.`;
    }
    if (input.locale === "ja") {
      return `リンク済みフォルダーから、プロジェクトを前に進める作業を${input.createCount}件見つけました。`;
    }
    return `Found ${input.createCount} project-moving ${input.createCount === 1 ? "task" : "tasks"} from the linked folder.`;
  }

  if (input.skippedCount > 0) {
    if (input.locale === "ko") return "연결된 폴더가 기존 Project OS 작업과 일치해 새 이슈가 필요하지 않았어요.";
    if (input.locale === "ja") return "リンク済みフォルダーは既存のProject OS作業と一致しているため、新しい課題は不要でした。";
    return "The linked folder matches existing Project OS work; no new issues were needed.";
  }

  if (input.locale === "ko") return `${input.projectName}에서 아직 구체적인 Project OS 이슈를 찾지 못했어요.`;
  if (input.locale === "ja") return `${input.projectName}では、まだ具体的なProject OS課題は見つかりませんでした。`;
  return `No concrete Project OS issues were found in ${input.projectName} yet.`;
}

function localizedIssueCandidate(
  scenario: ProjectIssueScenario,
  path: string,
  locale: Locale,
): ProjectIssueCandidate {
  switch (locale) {
    case "ko":
      return localizedKoreanIssueCandidate(scenario, path);
    case "ja":
      return localizedJapaneseIssueCandidate(scenario, path);
    case "en":
      return localizedEnglishIssueCandidate(scenario, path);
  }
}

function localizedEnglishIssueCandidate(
  scenario: ProjectIssueScenario,
  path: string,
): ProjectIssueCandidate {
  switch (scenario) {
    case "clarify_decision":
      return issueCandidate({
        title: "Clarify the next project decision",
        summary: "The linked folder has project material, but the next owner decision is not explicit yet.",
        userOutcome: "The team can see the next decision needed to keep the project moving.",
        nextAction: "Pick the decision owner and write the next concrete decision in the project notes.",
        status: "backlog",
        priority: "medium",
        statusReason: "The work is identified but needs a project owner before execution starts.",
        priorityReason: "Clear ownership helps coordination, but no blocking customer flow was detected.",
        technicalDetails: `Fallback Project OS issue created from the manifest file ${path}.`,
        sourceEvidence: [path],
      });
    case "payment_recovery":
      return issueCandidate({
        title: "Give users a clear path after payment failure",
        summary: "The project material points to a payment recovery gap that can leave users unsure what happened.",
        userOutcome: "Users can recover from a failed payment without abandoning the purchase.",
        nextAction: "Choose the first recovery message and the owner who will approve it.",
        status: "todo",
        priority: "high",
        statusReason: "The affected flow and desired user outcome are clear enough to pick up.",
        priorityReason: "Payment recovery directly affects whether users can complete a purchase.",
        technicalDetails: `Project OS manifest evidence came from ${path}. Keep implementation details inside checkout or billing surfaces.`,
        sourceEvidence: [path],
      });
    case "onboarding_setup":
      return issueCandidate({
        title: "Make the first setup step clearly actionable",
        summary: "The project material suggests the first setup step may not clearly show what should happen next.",
        userOutcome: "New users understand the next step and reach the main workflow faster.",
        nextAction: "Define the exact next-step copy and owner action for the first setup screen.",
        status: "backlog",
        priority: "medium",
        statusReason: "The product decision should be confirmed before design or code work starts.",
        priorityReason: "Setup clarity improves activation, but it is not shown as blocking current users.",
        technicalDetails: `Project OS manifest evidence came from ${path}. Keep internal file or component details here only.`,
        sourceEvidence: [path],
      });
    case "support_response":
      return issueCandidate({
        title: "Assign the first support response clearly",
        summary: "The project material shows support requests can stall when no one owns the first reply.",
        userOutcome: "Users get a faster, clearer response when they ask for help.",
        nextAction: "Choose the first-response owner and write the first reply action in plain language.",
        status: "todo",
        priority: "medium",
        statusReason: "The ownership gap is clear and can be resolved without engineering discovery.",
        priorityReason: "Clear support ownership improves reliability and user trust.",
        technicalDetails: `Project OS manifest evidence came from ${path}. Use the source file only as implementation context.`,
        sourceEvidence: [path],
      });
    case "decision_owner":
      return issueCandidate({
        title: "Confirm who owns the next project decision",
        summary: "The project material mentions decisions or approvals without making ownership fully visible.",
        userOutcome: "The team knows who should make the next call and can avoid waiting in ambiguity.",
        nextAction: "Name the decision owner and the decision they must make this week.",
        status: "todo",
        priority: "medium",
        statusReason: "The decision gap is ready for coordination.",
        priorityReason: "Ownership reduces project delay before more delivery work starts.",
        technicalDetails: `Project OS manifest evidence came from ${path}.`,
        sourceEvidence: [path],
      });
  }
}

function localizedKoreanIssueCandidate(
  scenario: ProjectIssueScenario,
  path: string,
): ProjectIssueCandidate {
  switch (scenario) {
    case "clarify_decision":
      return issueCandidate({
        title: "다음 프로젝트 결정을 명확히 정하기",
        summary: "연결된 폴더에 프로젝트 자료가 있지만, 다음에 누가 어떤 결정을 내려야 하는지 아직 분명하지 않아요.",
        userOutcome: "팀이 프로젝트를 앞으로 움직이는 데 필요한 다음 결정을 바로 확인할 수 있어요.",
        nextAction: "이번 주 결정할 사람과 결정 내용을 프로젝트 노트에 짧게 적어 주세요.",
        status: "backlog",
        priority: "medium",
        statusReason: "해야 할 일은 보이지만 실행 전에 담당 결정자가 필요해요.",
        priorityReason: "명확한 책임자는 협업 지연을 줄이지만, 현재 고객 흐름을 막는 문제는 아니에요.",
        technicalDetails: `manifest 파일 ${path}에서 만든 fallback Project OS 이슈입니다.`,
        sourceEvidence: [path],
      });
    case "payment_recovery":
      return issueCandidate({
        title: "결제 실패 후 사용자가 다시 진행할 방법 보여주기",
        summary: "프로젝트 자료에서 결제 실패 후 사용자가 다음 행동을 알기 어려운 흐름이 보여요.",
        userOutcome: "사용자가 구매를 포기하지 않고 결제를 다시 시도하거나 복구할 수 있어요.",
        nextAction: "첫 복구 메시지와 승인할 담당자를 정해 주세요.",
        status: "todo",
        priority: "high",
        statusReason: "영향받는 흐름과 사용자 결과가 분명해서 바로 착수할 수 있어요.",
        priorityReason: "결제 복구는 사용자가 구매를 완료할 수 있는지에 직접 영향을 줘요.",
        technicalDetails: `Project OS manifest 근거는 ${path}에서 왔습니다. checkout 또는 billing 표면의 구현 세부사항은 여기에만 둡니다.`,
        sourceEvidence: [path],
      });
    case "onboarding_setup":
      return issueCandidate({
        title: "첫 설정 단계에서 다음 행동을 분명하게 보여주기",
        summary: "프로젝트 자료상 첫 설정 단계가 사용자에게 다음에 무엇을 해야 하는지 충분히 보여주지 못할 수 있어요.",
        userOutcome: "새 사용자가 다음 단계를 이해하고 주요 흐름에 더 빨리 도달해요.",
        nextAction: "첫 설정 화면의 다음 단계 문구와 담당자 행동을 정해 주세요.",
        status: "backlog",
        priority: "medium",
        statusReason: "디자인이나 코드 작업 전에 제품 결정을 확인해야 해요.",
        priorityReason: "설정 명확성은 활성화에 도움이 되지만, 현재 사용자를 막는 문제로 보이진 않아요.",
        technicalDetails: `Project OS manifest 근거는 ${path}에서 왔습니다. 내부 파일이나 컴포넌트 세부사항은 여기에만 둡니다.`,
        sourceEvidence: [path],
      });
    case "support_response":
      return issueCandidate({
        title: "첫 고객 응답 담당자를 명확히 정하기",
        summary: "프로젝트 자료에서 첫 응답 담당자가 분명하지 않을 때 지원 요청이 멈출 수 있어 보여요.",
        userOutcome: "사용자가 도움을 요청했을 때 더 빠르고 분명한 응답을 받아요.",
        nextAction: "첫 응답 담당자를 정하고 첫 답변 행동을 쉬운 문장으로 적어 주세요.",
        status: "todo",
        priority: "medium",
        statusReason: "책임 공백이 분명하고 추가 개발 조사 없이 정리할 수 있어요.",
        priorityReason: "지원 책임이 명확하면 신뢰도와 운영 안정성이 올라가요.",
        technicalDetails: `Project OS manifest 근거는 ${path}에서 왔습니다. source 파일은 구현 맥락으로만 사용합니다.`,
        sourceEvidence: [path],
      });
    case "decision_owner":
      return issueCandidate({
        title: "다음 프로젝트 결정을 맡을 사람 정하기",
        summary: "프로젝트 자료에 결정이나 승인 내용은 있지만, 누가 책임질지 충분히 보이지 않아요.",
        userOutcome: "팀이 다음 결정을 누가 해야 하는지 알고 기다림을 줄일 수 있어요.",
        nextAction: "결정 담당자와 이번 주에 내려야 할 결정을 적어 주세요.",
        status: "todo",
        priority: "medium",
        statusReason: "결정 공백이 분명해서 조율 작업으로 바로 진행할 수 있어요.",
        priorityReason: "책임자가 정해지면 이후 전달 작업의 지연을 줄일 수 있어요.",
        technicalDetails: `Project OS manifest 근거는 ${path}에서 왔습니다.`,
        sourceEvidence: [path],
      });
  }
}

function localizedJapaneseIssueCandidate(
  scenario: ProjectIssueScenario,
  path: string,
): ProjectIssueCandidate {
  switch (scenario) {
    case "clarify_decision":
      return issueCandidate({
        title: "次のプロジェクト判断を明確にする",
        summary: "リンク済みフォルダーにはプロジェクト資料がありますが、次に誰が何を判断するかがまだ明確ではありません。",
        userOutcome: "チームはプロジェクトを前に進めるために必要な次の判断を確認できます。",
        nextAction: "判断する担当者と具体的な判断内容をプロジェクトメモに短く書いてください。",
        status: "backlog",
        priority: "medium",
        statusReason: "作業は見えていますが、実行前に担当者の確認が必要です。",
        priorityReason: "責任者の明確化は調整を助けますが、顧客フローを止める問題ではありません。",
        technicalDetails: `manifestファイル${path}から作成したfallback Project OS課題です。`,
        sourceEvidence: [path],
      });
    case "payment_recovery":
      return issueCandidate({
        title: "支払い失敗後にユーザーが再開できる方法を示す",
        summary: "プロジェクト資料から、支払い失敗後にユーザーが次の行動を迷う可能性が見えます。",
        userOutcome: "ユーザーは購入を離脱せず、支払いの再試行や復旧ができます。",
        nextAction: "最初の復旧メッセージと承認する担当者を決めてください。",
        status: "todo",
        priority: "high",
        statusReason: "影響するフローと望ましい結果が明確で、着手できます。",
        priorityReason: "支払い復旧は、ユーザーが購入を完了できるかに直接影響します。",
        technicalDetails: `Project OS manifestの根拠は${path}です。checkoutやbilling周辺の実装詳細はここだけに残します。`,
        sourceEvidence: [path],
      });
    case "onboarding_setup":
      return issueCandidate({
        title: "最初の設定ステップで次の行動を明確に示す",
        summary: "プロジェクト資料から、最初の設定ステップが次に何をすべきかを十分に示していない可能性があります。",
        userOutcome: "新しいユーザーが次のステップを理解し、主要な流れに早く進めます。",
        nextAction: "最初の設定画面で使う次ステップ文言と担当者の行動を決めてください。",
        status: "backlog",
        priority: "medium",
        statusReason: "デザインやコード作業の前にプロダクト判断を確認する必要があります。",
        priorityReason: "設定の明確さは活性化に役立ちますが、現時点でユーザーを止めているとは示されていません。",
        technicalDetails: `Project OS manifestの根拠は${path}です。内部ファイルやコンポーネント詳細はここだけに残します。`,
        sourceEvidence: [path],
      });
    case "support_response":
      return issueCandidate({
        title: "最初のサポート返信の担当者を明確にする",
        summary: "プロジェクト資料から、最初の返信担当が曖昧なときにサポート依頼が止まる可能性が見えます。",
        userOutcome: "ユーザーは助けを求めたとき、より早く明確な返信を受け取れます。",
        nextAction: "最初の返信担当者を決め、最初の返信アクションを平易な言葉で書いてください。",
        status: "todo",
        priority: "medium",
        statusReason: "責任の空白が明確で、追加の技術調査なしに整理できます。",
        priorityReason: "サポート責任が明確になると、信頼性と運用品質が上がります。",
        technicalDetails: `Project OS manifestの根拠は${path}です。sourceファイルは実装文脈としてのみ扱います。`,
        sourceEvidence: [path],
      });
    case "decision_owner":
      return issueCandidate({
        title: "次のプロジェクト判断の担当者を決める",
        summary: "プロジェクト資料には判断や承認が出ていますが、誰が責任を持つかが十分に見えていません。",
        userOutcome: "チームは誰が次の判断をするべきかを把握し、待ち時間を減らせます。",
        nextAction: "判断担当者と今週決めるべき内容を書いてください。",
        status: "todo",
        priority: "medium",
        statusReason: "判断の空白が明確で、調整作業としてすぐ進められます。",
        priorityReason: "責任者を決めることで、その後の進行遅れを減らせます。",
        technicalDetails: `Project OS manifestの根拠は${path}です。`,
        sourceEvidence: [path],
      });
  }
}

function issueCandidate(candidate: ProjectIssueCandidate): ProjectIssueCandidate {
  return candidate;
}

function mergeEvidence(
  existing: ProjectIssueCandidate,
  candidate: ProjectIssueCandidate,
): ProjectIssueCandidate {
  return {
    ...existing,
    sourceEvidence: [...new Set([...existing.sourceEvidence, ...candidate.sourceEvidence])],
    technicalDetails: `${existing.technicalDetails}\n${candidate.technicalDetails}`,
  };
}

function normalizeIssueKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
}

function issueLine(issue: WorkItem): string {
  return [
    `id=${issue.id}`,
    `title=${issue.title}`,
    `outcome=${issue.userOutcome || "none"}`,
    `next=${issue.nextAction || "none"}`,
    `status=${issue.status}`,
    `priority=${issue.priority}`,
    `summary=${issue.summary || "none"}`,
  ].join("; ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project analysis failed.";
}

function createProjectOsRunId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  return `project-os-${randomUuid ? randomUuid.call(globalThis.crypto) : Date.now()}`;
}

export { applyProjectOsOperations, runProjectOsAnalysis };
export type { ProjectOsAnalysisResult, ProjectOsApplyResult };
