import { invoke } from "@tauri-apps/api/core";

import type {
  ApplyDecisionDocumentRequest,
  ApplyDecisionDocumentResult,
  CreateDecisionDocumentRequest,
  CreateDecisionDocumentResult,
  KnowledgeCommandResult,
  KnowledgeContextRequest,
  KnowledgeContextResult,
  KnowledgeError,
  KnowledgeInitResult,
  KnowledgeStatusResult,
  MemoryContextRequest,
  MemoryContextResult,
  MemorySearchResult,
  ReadDecisionDocumentRequest,
  ReadDecisionDocumentResult,
  ReadMemoryRequest,
  ReadMemoryResult,
  ReadWikiPageRequest,
  ReadWikiPageResult,
  SearchMemoryRequest,
  SearchWikiRequest,
  WikiSearchResult,
  WikiProposePageRequest,
  WikiProposeUpdateRequest,
} from "./types";

interface KnowledgeService {
  status(): Promise<KnowledgeCommandResult<KnowledgeStatusResult>>;
  init(): Promise<KnowledgeCommandResult<KnowledgeInitResult>>;
  createDecisionDocument(
    request: CreateDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  proposeMemory(
    request: CreateDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  createWikiDecisionDocument(
    request: WikiProposePageRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  proposeWikiPage(
    request: WikiProposePageRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  proposeWikiUpdate(
    request: WikiProposeUpdateRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  readDecisionDocument(
    request: ReadDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<ReadDecisionDocumentResult>>;
  readMemory(request: ReadMemoryRequest): Promise<KnowledgeCommandResult<ReadMemoryResult>>;
  readWikiPage(request: ReadWikiPageRequest): Promise<KnowledgeCommandResult<ReadWikiPageResult>>;
  applyDecisionDocument(
    request: ApplyDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<ApplyDecisionDocumentResult>>;
  searchMemory(request: SearchMemoryRequest): Promise<KnowledgeCommandResult<MemorySearchResult>>;
  searchWiki(request: SearchWikiRequest): Promise<KnowledgeCommandResult<WikiSearchResult>>;
  memoryContext(
    request: MemoryContextRequest,
  ): Promise<KnowledgeCommandResult<MemoryContextResult>>;
  knowledgeContext(
    request: KnowledgeContextRequest,
  ): Promise<KnowledgeCommandResult<KnowledgeContextResult>>;
}

function transportError(error: unknown): KnowledgeError {
  return {
    code: "IO_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

async function invokeKnowledge<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<KnowledgeCommandResult<T>> {
  try {
    return await invoke<KnowledgeCommandResult<T>>(command, args);
  } catch (error) {
    return { ok: false, error: transportError(error) };
  }
}

function createKnowledgeService(): KnowledgeService {
  return {
    status() {
      return invokeKnowledge<KnowledgeStatusResult>("knowledge_status");
    },
    init() {
      return invokeKnowledge<KnowledgeInitResult>("knowledge_init");
    },
    createDecisionDocument(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("knowledge_create_decision_document", {
        request,
      });
    },
    proposeMemory(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("memory_propose", { request });
    },
    createWikiDecisionDocument(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>(
        "knowledge_create_wiki_decision_document",
        { request },
      );
    },
    proposeWikiPage(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("wiki_propose_page", { request });
    },
    proposeWikiUpdate(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("wiki_propose_update", { request });
    },
    readDecisionDocument(request) {
      return invokeKnowledge<ReadDecisionDocumentResult>("knowledge_read_decision_document", {
        request,
      });
    },
    readMemory(request) {
      return invokeKnowledge<ReadMemoryResult>("knowledge_read_memory", { request });
    },
    readWikiPage(request) {
      return invokeKnowledge<ReadWikiPageResult>("knowledge_read_wiki_page", { request });
    },
    applyDecisionDocument(request) {
      return invokeKnowledge<ApplyDecisionDocumentResult>("knowledge_apply_decision_document", {
        request,
      });
    },
    searchMemory(request) {
      return invokeKnowledge<MemorySearchResult>("knowledge_search_memory", { request });
    },
    searchWiki(request) {
      return invokeKnowledge<WikiSearchResult>("knowledge_search_wiki", { request });
    },
    memoryContext(request) {
      return invokeKnowledge<MemoryContextResult>("knowledge_memory_context", { request });
    },
    knowledgeContext(request) {
      return invokeKnowledge<KnowledgeContextResult>("knowledge_context", { request });
    },
  };
}

export { createKnowledgeService };
export type { KnowledgeService };
