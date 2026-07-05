import { describe, expect, it } from "vitest";

import { parseMomoDomainNote, queryMomoDomainNotes } from "./domain_frontmatter";

describe("momo domain frontmatter", () => {
  it("parses the operating domain note types needed by dashboard queries", () => {
    const samples = [
      ["Projects/life.md", "---\ntype: project\nproject_type: life\n---\n# Lecture\n", "project"],
      [
        "Tasks/followup.md",
        "---\ntype: task\nstatus: todo\nimportant: true\n---\n# Follow up\n",
        "task",
      ],
      [
        "Issues/bug.md",
        "---\ntype: issue\nstatus: doing\npriority: high\nblocked: true\n---\n# Bug\n",
        "issue",
      ],
      [
        "Calendar/lecture.md",
        "---\ntype: schedule_block\nstart: 2026-06-27T09:00:00\nend: 2026-06-27T10:00:00\n---\n",
        "schedule_block",
      ],
      ["Tasks/plan.md", "---\ntype: planning_candidate\n---\n# Plan\n", "planning_candidate"],
      ["Inbox/idea.md", "# lecture followup\n", "inbox_note"],
      [
        "Inbox/done.md",
        "---\nprocessed: true\nagent_run: run-1\n---\n# lecture followup\n",
        "processed_inbox_note",
      ],
      [".AgentRuns/run-1.md", "---\ntype: run_log\nstatus: applied\n---\n# Run\n", "run_log"],
    ] as const;

    expect(samples.map(([path, markdown]) => parseMomoDomainNote(path, markdown).kind)).toEqual(
      samples.map((sample) => sample[2]),
    );
  });

  it("flags unsupported task and issue enums without throwing", () => {
    const results = [
      parseMomoDomainNote("Tasks/bad.md", "---\ntype: task\nstatus: blocked\npriority: P0\n---\n"),
      parseMomoDomainNote(
        "Issues/bad.md",
        "---\ntype: issue\nstatus: blocked\npriority: urgent\n---\n",
      ),
      parseMomoDomainNote(
        "Issues/life.md",
        "---\ntype: issue\nstatus: todo\npriority: low\nproject_type: life\n---\n",
      ),
    ];

    expect(results).toEqual([
      {
        kind: "invalid",
        path: "Tasks/bad.md",
        issues: ["task status must be todo or done", "task cannot use issue priority"],
      },
      {
        kind: "invalid",
        path: "Issues/bad.md",
        issues: [
          "issue status must be backlog, todo, doing, or done",
          "issue priority must be low, medium, or high",
        ],
      },
      {
        kind: "invalid",
        path: "Issues/life.md",
        issues: ["issue cannot belong to a life project"],
      },
    ]);
  });

  it("returns invalid entries instead of crashing on malformed frontmatter", () => {
    const result = queryMomoDomainNotes([
      { path: "Tasks/bad.md", markdown: "---\ntype task\n---\n# Bad\n" },
      { path: "Tasks/good.md", markdown: "---\ntype: task\nstatus: done\n---\n# Good\n" },
    ]);

    expect(result.items.map((item) => item.kind)).toEqual(["task"]);
    expect(result.invalid).toEqual([
      {
        kind: "invalid",
        path: "Tasks/bad.md",
        issues: ["frontmatter line 1 is missing a ':' separator"],
      },
    ]);
  });
});
